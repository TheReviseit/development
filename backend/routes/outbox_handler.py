"""
Outbox Pattern Handler
======================
Guaranteed event delivery for metering and webhooks.

Pattern:
1. Write event to outbox table (within main transaction)
2. Background processor polls and delivers
3. At-least-once delivery guarantee

@version 1.0.0
@securityLevel FAANG-Production
"""

import json
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

from supabase_client import get_supabase_client

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
    
    def __init__(self):
        self.db = get_supabase_client()
    
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
        
        Args:
            event_type: Type of event (e.g., 'checkout.created')
            payload: Event data
            aggregate_type: Entity type (e.g., 'order')
            aggregate_id: Entity ID
            transaction: Optional transaction context
            
        Returns:
            Event ID
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
    Background processor that delivers outbox events.
    """
    
    BACKOFF_SECONDS = [1, 5, 30, 60, 300]  # 1s, 5s, 30s, 1m, 5m
    MAX_RETRIES = 5
    BATCH_SIZE = 100
    
    def __init__(self):
        self.db = get_supabase_client()
        self.handlers: Dict[str, callable] = {}
    
    def register_handler(self, event_type: str, handler: callable):
        """Register handler for event type."""
        self.handlers[event_type] = handler
    
    def process(self) -> Dict[str, int]:
        """
        Process pending outbox events.
        
        Returns:
            Stats: {delivered: int, failed: int, retried: int}
        """
        stats = {'delivered': 0, 'failed': 0, 'retried': 0}
        
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
                    # Get handler
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
                    self._retry_event(event, str(e))
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
    
    def _retry_event(self, event: OutboxEvent, error: str) -> None:
        """Schedule event for retry with alerting on DLQ growth."""
        new_retry_count = event.retry_count + 1
        
        if new_retry_count >= self.MAX_RETRIES:
            # Move to Dead Letter Queue
            self._mark_failed(event.id, f"Max retries exceeded: {error}")
            
            # CRITICAL: Alert when DLQ grows
            self._alert_dlq_growth(event)
            
            logger.error(f"[Outbox] DLQ: {event.type} → {event.id} (max retries)")
            return
        
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
    
    def _alert_dlq_growth(self, event: OutboxEvent) -> None:
        """Alert when events fail permanently (DLQ growth)."""
        # Count recent DLQ events
        recent_dlq = self.db.table('events_outbox')\
            .select('id', count='exact')\
            .eq('status', OutboxStatus.FAILED.value)\
            .gte('created_at', (datetime.utcnow() - timedelta(hours=1)).isoformat())\
            .execute()
        
        dlq_count = recent_dlq.count if hasattr(recent_dlq, 'count') else 0
        
        # Alert thresholds
        if dlq_count >= 10:  # 10+ events in last hour
            logger.critical(f"[Outbox] DLQ ALERT: {dlq_count} events failed in last hour!")
            # TODO: Send to PagerDuty/Slack
            # pagerduty.trigger_incident(
            #     title=f"Outbox DLQ Growth: {dlq_count} events",
            #     severity='critical' if dlq_count >= 50 else 'warning'
            # )
        
        # Alert for specific critical events
        if event.type in ['checkout.created', 'subscription.renewed']:
            logger.critical(
                f"[Outbox] CRITICAL EVENT FAILED: {event.type} → {event.id}\n"
                f"Payload: {json.dumps(event.payload)[:500]}"
            )
    
    def monitor_dlq(self) -> Dict[str, Any]:
        """
        Monitor DLQ health. Call this from a scheduled job every 5 minutes.
        
        Returns:
            DLQ statistics for dashboard/monitoring
        """
        # Count by time window
        now = datetime.utcnow()
        
        stats = {
            'last_hour': self._count_dlq_events(now - timedelta(hours=1)),
            'last_24h': self._count_dlq_events(now - timedelta(days=1)),
            'total_pending': self._count_pending_events(),
            'oldest_pending': self._get_oldest_pending(),
        }
        
        # Alert if pending queue is growing
        if stats['total_pending'] > 1000:
            logger.critical(f"[Outbox] QUEUE BACKLOG: {stats['total_pending']} pending events!")
        
        return stats
    
    def _count_dlq_events(self, since: datetime) -> int:
        """Count failed events since timestamp."""
        result = self.db.table('events_outbox')\
            .select('id', count='exact')\
            .eq('status', OutboxStatus.FAILED.value)\
            .gte('created_at', since.isoformat())\
            .execute()
        return result.count if hasattr(result, 'count') else 0
    
    def _count_pending_events(self) -> int:
        """Count pending events."""
        result = self.db.table('events_outbox')\
            .select('id', count='exact')\
            .eq('status', OutboxStatus.PENDING.value)\
            .execute()
        return result.count if hasattr(result, 'count') else 0
    
    def _get_oldest_pending(self) -> Optional[datetime]:
        """Get timestamp of oldest pending event."""
        result = self.db.table('events_outbox')\
            .select('created_at')\
            .eq('status', OutboxStatus.PENDING.value)\
            .order('created_at')\
            .limit(1)\
            .maybe_single()\
            .execute()
        
        if result.data:
            return datetime.fromisoformat(result.data['created_at'].replace('Z', '+00:00'))
        return None
    
    def process
            # Max retries exceeded
            self._mark_failed(event.id, f"Max retries exceeded: {error}")
            logger.error(f"[Outbox] Max retries exceeded for {event.id}")
        else:
            # Schedule retry
            backoff = self.BACKOFF_SECONDS[min(event.retry_count, len(self.BACKOFF_SECONDS) - 1)]
            next_retry = datetime.utcnow() + timedelta(seconds=backoff)
            
            self.db.table('events_outbox').update({
                'retry_count': new_retry_count,
                'error_message': error[:500]
            }).eq('id', event.id).execute()
            
            logger.info(f"[Outbox] Retry {new_retry_count}/{self.MAX_RETRIES} for {event.id} in {backoff}s")
    
    def get_dead_letter_events(self, limit: int = 100) -> List[OutboxEvent]:
        """Get events that failed permanently."""
        result = self.db.table('events_outbox')\
            .select('*')\
            .eq('status', OutboxStatus.FAILED.value)\
            .order('created_at', desc=True)\
            .limit(limit)\
            .execute()
        
        return [self._deserialize_event(d) for d in (result.data or [])]


# =============================================================================
# SINGLETON INSTANCES
# =============================================================================

outbox_publisher = OutboxPublisher()
outbox_processor = OutboxProcessor()
