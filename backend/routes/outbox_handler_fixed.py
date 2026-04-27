"""
Outbox Pattern Handler
======================
Guaranteed event delivery for metering and webhooks.

Pattern:
1. Write event to outbox table (within main transaction)
2. Background processor polls and delivers
3. At-least-once delivery guarantee

@version 1.1.0
@securityLevel FAANG-Production
"""

import json
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger('reviseit.billing.outbox')


class OutboxStatus(Enum):
    PENDING = 'PENDING'
    DELIVERED = 'DELIVERED'
    FAILED = 'FAILED'


@dataclass
class OutboxEvent:
    id: str
    type: str
    aggregate_type: Optional[str]
    aggregate_id: Optional[str]
    payload: Dict[str, Any]
    status: str
    retry_count: int
    created_at: datetime
    processed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class OutboxPublisher:
    """
    Publishes events to outbox table (within transaction).
    """
    
    def __init__(self, db):
        self.db = db
    
    def publish(
        self,
        event_type: str,
        payload: Dict[str, Any],
        aggregate_type: Optional[str] = None,
        aggregate_id: Optional[str] = None,
        transaction=None
    ) -> str:
        """
        Publish event to outbox.
        """
        event_id = f"evt_{int(time.time() * 1000)}_{hash(str(payload)) & 0xFFFFFF:06x}"
        
        db = transaction or self.db
        
        db.table('events_outbox').insert({
            'id': event_id,
            'type': event_type,
            'aggregate_type': aggregate_type,
            'aggregate_id': aggregate_id,
            'payload': json.dumps(payload, default=str),
            'status': OutboxStatus.PENDING.value,
            'retry_count': 0,
            'created_at': datetime.utcnow().isoformat()
        }).execute()
        
        logger.debug(f"[Outbox] Published {event_type} → {event_id}")
        return event_id


class OutboxProcessor:
    """
    Background processor that delivers outbox events with DLQ monitoring.
    """
    
    BACKOFF_SECONDS = [1, 5, 30, 60, 300]  # 1s, 5s, 30s, 1m, 5m
    MAX_RETRIES = 5
    BATCH_SIZE = 100
    
    def __init__(self, db):
        self.db = db
        self.handlers: Dict[str, callable] = {}
    
    def register_handler(self, event_type: str, handler: callable):
        """Register handler for event type."""
        self.handlers[event_type] = handler
    
    def process(self) -> Dict[str, int]:
        """Process pending outbox events."""
        stats = {'delivered': 0, 'failed': 0, 'retried': 0, 'dlq_added': 0}
        
        try:
            # Get pending events
            result = self.db.table('events_outbox')\
                .select('*')\
                .eq('status', OutboxStatus.PENDING.value)\
                .lt('retry_count', self.MAX_RETRIES)\
                .order('created_at')\
                .limit(self.BATCH_SIZE)\
                .execute()
            
            events = result.data if hasattr(result, 'data') else []
            
            for event_data in events:
                event = self._deserialize_event(event_data)
                
                try:
                    handler = self.handlers.get(event.type)
                    if not handler:
                        logger.warning(f"[Outbox] No handler for {event.type}")
                        self._mark_failed(event.id, "No handler registered")
                        stats['failed'] += 1
                        continue
                    
                    # Deliver
                    handler(event.payload)
                    
                    # Mark delivered
                    self._mark_delivered(event.id)
                    stats['delivered'] += 1
                    
                    logger.info(f"[Outbox] Delivered {event.type} → {event.id}")
                    
                except Exception as e:
                    # Retry with backoff
                    is_dlq = self._retry_event(event, str(e))
                    if is_dlq:
                        stats['dlq_added'] += 1
                    else:
                        stats['retried'] += 1
                    
        except Exception as e:
            logger.error(f"[Outbox] Processing error: {e}")
        
        return stats
    
    def _deserialize_event(self, data: Dict) -> OutboxEvent:
        """Deserialize event from database."""
        return OutboxEvent(
            id=data['id'],
            type=data['type'],
            aggregate_type=data.get('aggregate_type'),
            aggregate_id=data.get('aggregate_id'),
            payload=json.loads(data['payload']),
            status=data['status'],
            retry_count=data['retry_count'],
            created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
            processed_at=datetime.fromisoformat(data['processed_at'].replace('Z', '+00:00')) if data.get('processed_at') else None,
            error_message=data.get('error_message')
        )
    
    def _mark_delivered(self, event_id: str) -> None:
        """Mark event as delivered."""
        self.db.table('events_outbox').update({
            'status': OutboxStatus.DELIVERED.value,
            'processed_at': datetime.utcnow().isoformat()
        }).eq('id', event_id).execute()
    
    def _mark_failed(self, event_id: str, error: str) -> None:
        """Mark event as failed."""
        self.db.table('events_outbox').update({
            'status': OutboxStatus.FAILED.value,
            'error_message': error[:500],
            'processed_at': datetime.utcnow().isoformat()
        }).eq('id', event_id).execute()
    
    def _retry_event(self, event: OutboxEvent, error: str) -> bool:
        """
        Schedule event for retry. Returns True if moved to DLQ.
        """
        new_retry_count = event.retry_count + 1
        
        if new_retry_count >= self.MAX_RETRIES:
            # Move to Dead Letter Queue
            self._mark_failed(event.id, f"Max retries exceeded: {error}")
            
            # CRITICAL: Alert when DLQ grows
            self._alert_dlq_growth(event)
            
            logger.error(f"[Outbox] DLQ: {event.type} → {event.id} (max retries)")
            return True
        
        # Calculate backoff
        backoff = self.BACKOFF_SECONDS[min(event.retry_count, len(self.BACKOFF_SECONDS) - 1)]
        next_retry = datetime.utcnow() + timedelta(seconds=backoff)
        
        # Update retry count
        self.db.table('events_outbox').update({
            'retry_count': new_retry_count,
            'error_message': error[:500],
            'next_retry_at': next_retry.isoformat()
        }).eq('id', event.id).execute()
        
        logger.info(f"[Outbox] Retry {new_retry_count}/{self.MAX_RETRIES} for {event.id} in {backoff}s")
        return False
    
    def _alert_dlq_growth(self, event: OutboxEvent) -> None:
        """Alert when events fail permanently (DLQ growth)."""
        try:
            # Count recent DLQ events
            one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat()
            result = self.db.table('events_outbox')\
                .select('*')\
                .eq('status', OutboxStatus.FAILED.value)\
                .gte('created_at', one_hour_ago)\
                .execute()
            
            dlq_count = len(result.data) if hasattr(result, 'data') else 0
            
            # Alert thresholds
            if dlq_count >= 10:  # 10+ events in last hour
                logger.critical(f"[Outbox] DLQ ALERT: {dlq_count} events failed in last hour!")
                # TODO: Send to PagerDuty/Slack
            
            # Alert for specific critical events
            if event.type in ['checkout.created', 'subscription.renewed']:
                logger.critical(
                    f"[Outbox] CRITICAL EVENT FAILED: {event.type} → {event.id}\n"
                    f"Payload: {json.dumps(event.payload)[:500]}"
                )
        except Exception as e:
            logger.error(f"[Outbox] Failed to check DLQ: {e}")
    
    def monitor_dlq(self) -> Dict[str, Any]:
        """
        Monitor DLQ health. Call this from a scheduled job every 5 minutes.
        """
        try:
            now = datetime.utcnow()
            
            # Count failed events in last hour
            one_hour_ago = (now - timedelta(hours=1)).isoformat()
            result = self.db.table('events_outbox')\
                .select('*')\
                .eq('status', OutboxStatus.FAILED.value)\
                .gte('created_at', one_hour_ago)\
                .execute()
            last_hour = len(result.data) if hasattr(result, 'data') else 0
            
            # Count failed events in last 24h
            one_day_ago = (now - timedelta(days=1)).isoformat()
            result = self.db.table('events_outbox')\
                .select('*')\
                .eq('status', OutboxStatus.FAILED.value)\
                .gte('created_at', one_day_ago)\
                .execute()
            last_24h = len(result.data) if hasattr(result, 'data') else 0
            
            # Count pending events
            result = self.db.table('events_outbox')\
                .select('*')\
                .eq('status', OutboxStatus.PENDING.value)\
                .execute()
            total_pending = len(result.data) if hasattr(result, 'data') else 0
            
            stats = {
                'last_hour': last_hour,
                'last_24h': last_24h,
                'total_pending': total_pending,
                'oldest_pending': None,
            }
            
            # Alert if pending queue is growing
            if total_pending > 1000:
                logger.critical(f"[Outbox] QUEUE BACKLOG: {total_pending} pending events!")
            
            return stats
            
        except Exception as e:
            logger.error(f"[Outbox] Monitor error: {e}")
            return {'error': str(e)}
    
    def get_dead_letter_events(self, limit: int = 100) -> List[OutboxEvent]:
        """Get events that failed permanently."""
        try:
            result = self.db.table('events_outbox')\
                .select('*')\
                .eq('status', OutboxStatus.FAILED.value)\
                .order('created_at', desc=True)\
                .limit(limit)\
                .execute()
            
            return [self._deserialize_event(d) for d in (result.data or [])]
        except Exception as e:
            logger.error(f"[Outbox] Failed to get DLQ events: {e}")
            return []
