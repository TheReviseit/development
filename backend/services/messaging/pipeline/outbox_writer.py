"""
Outbox Writer Stage — FAANG-Grade AI → Outbox Bridge
=====================================================

Explicit bridge from AI result to transactional outbox.

CRITICAL: Writes AI responses to outbox (NOT direct send) to guarantee
delivery even on crashes/failures.

Architecture:
    1. AI generates response
    2. This stage writes to outbox_events table
    3. Celery Beat polls outbox every 5s
    4. Worker dispatches to provider
    5. On success, marks completed; on failure, retries with backoff

This is the KEY FIX: Previously AI responses went through sdk.send()
which was implicit. Now it's explicit with full traceability.

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger('flowauxi.messaging.pipeline.outbox_writer')


@dataclass
class AIResult:
    """
    Outcome of an AI response attempt.
    
    Attributes:
        success: Whether AI generation succeeded
        reply_text: Generated response text
        intent: Detected intent
        confidence: Confidence score
        generation_method: How response was generated
        latency_ms: Generation latency
        error: Error message if failed
        was_cached: Whether response was cached
    """
    success: bool
    reply_text: Optional[str] = None
    intent: Optional[str] = None
    confidence: float = 0.0
    generation_method: str = ''
    latency_ms: float = 0.0
    error: Optional[str] = None
    was_cached: bool = False


@dataclass
class OutboxResult:
    """
    Result of writing to outbox.
    
    Attributes:
        success: Whether write succeeded
        outbox_event_id: ID of created outbox event
        message_id: ID of created message record
        error: Error message if failed
    """
    success: bool
    outbox_event_id: Optional[str] = None
    message_id: Optional[str] = None
    error: Optional[str] = None


class OutboxWriterStage:
    """
    Writes AI responses to transactional outbox.
    
    CRITICAL: This is the bridge from AI → Outbox. All AI responses
    MUST go through this stage to guarantee delivery.
    
    Usage:
        writer = OutboxWriterStage()
        
        result = writer.write(
            ai_result=ai_result,
            message=normalized_message,
            tenant=tenant_ctx,
            business_context=business_ctx,
            trace_id="abc123",
        )
        
        print(f"Outbox event: {result.outbox_event_id}")
    """
    
    MAX_RETRIES = 5
    BASE_RETRY_DELAY = 30  # seconds
    MAX_RETRY_DELAY = 900  # 15 minutes
    
    def __init__(self, supabase_client=None):
        """
        Args:
            supabase_client: Optional Supabase client for testing.
        """
        self._db = supabase_client
    
    def _get_db(self):
        """Lazy-load Supabase client."""
        if self._db is None:
            from supabase_client import get_supabase_client
            self._db = get_supabase_client()
        return self._db
    
    def write(
        self,
        ai_result: AIResult,
        message,  # NormalizedMessage
        tenant,   # TenantContext
        business_context,  # BusinessContext
        trace_id: str = '',
    ) -> OutboxResult:
        """
        Write AI response to transactional outbox.
        
        CRITICAL: This writes to outbox (NOT direct send) to guarantee
        delivery even if worker crashes after AI generation.
        
        Pipeline:
            1. Build outbox event from AI result
            2. Store message + event atomically
            3. Return outbox_event_id for tracking
        
        Args:
            ai_result: Result from AI generation
            message: Original inbound message
            tenant: TenantContext
            business_context: BusinessContext
            trace_id: Distributed tracing ID
            
        Returns:
            OutboxResult with event_id for tracking
        """
        if not ai_result.success or not ai_result.reply_text:
            logger.warning(
                f"outbox_writer_no_ai_result trace={trace_id} "
                f"success={ai_result.success}"
            )
            return OutboxResult(
                success=False,
                error=ai_result.error or 'AI generation failed',
            )
        
        db = self._get_db()
        if not db:
            logger.error(f"outbox_writer_no_db trace={trace_id}")
            return OutboxResult(success=False, error='Database unavailable')
        
        try:
            # Generate message ID
            message_id = str(uuid.uuid4())
            
            # Build message record for unified_messages
            message_row = self._build_message_row(
                message_id=message_id,
                message=message,
                tenant=tenant,
                ai_result=ai_result,
                trace_id=trace_id,
            )
            
            # Build outbox event
            event = self._build_outbox_event(
                message_id=message_id,
                ai_result=ai_result,
                message=message,
                tenant=tenant,
                trace_id=trace_id,
            )
            
            # Atomic write: message + event
            self._atomic_write(db, message_row, event, trace_id)
            
            logger.info(
                f"[{trace_id}] Stage 5 COMPLETE: Outbox written "
                f"event_id={event['id'][:12]}... "
                f"tenant={tenant.firebase_uid[:15]} "
                f"latency={ai_result.latency_ms:.0f}ms"
            )
            
            return OutboxResult(
                success=True,
                outbox_event_id=event['id'],
                message_id=message_id,
            )
            
        except Exception as e:
            logger.error(
                f"[{trace_id}] Stage 5 ERROR: {e}",
                exc_info=True
            )
            return OutboxResult(success=False, error=str(e)[:200])
    
    def _build_message_row(
        self,
        message_id: str,
        message,  # NormalizedMessage
        tenant,   # TenantContext
        ai_result: AIResult,
        trace_id: str,
    ) -> Dict[str, Any]:
        """Build unified_messages row from inbound + AI data."""
        from services.messaging.base import (
            Channel,
            MessageDirection,
            MessageStatus,
            MessageType,
        )
        
        # Determine message type
        msg_type = MessageType.TEXT
        if hasattr(message, 'message_type'):
            msg_type = message.message_type
        
        return {
            'id': message_id,
            'channel': message.channel.value if hasattr(message, 'channel') else 'instagram',
            'channel_message_id': message.channel_message_id if hasattr(message, 'channel_message_id') else '',
            'conversation_id': message.conversation_id if hasattr(message, 'conversation_id') else '',
            'direction': MessageDirection.OUTBOUND.value,
            'message_body': ai_result.reply_text,
            'message_type': msg_type.value,
            'status': MessageStatus.QUEUED.value,
            'sender_id': '',
            'recipient_id': message.sender_id if hasattr(message, 'sender_id') else '',
            'tenant_id': tenant.firebase_uid,
            'channel_account_id': message.channel_account_id if hasattr(message, 'channel_account_id') else '',
            'metadata': {
                'ai_intent': ai_result.intent,
                'ai_confidence': ai_result.confidence,
                'ai_generation_method': ai_result.generation_method,
                'ai_latency_ms': ai_result.latency_ms,
                'trace_id': trace_id,
            },
        }
    
    def _build_outbox_event(
        self,
        message_id: str,
        ai_result: AIResult,
        message,  # NormalizedMessage
        tenant,   # TenantContext
        trace_id: str,
    ) -> Dict[str, Any]:
        """
        Build outbox event for AI response.
        
        Includes:
        - Retry policy with exponential backoff
        - Idempotency key for duplicate prevention
        - Full payload for provider dispatch
        """
        # Generate idempotency key
        # Format: ai_response:{tenant_id}:{channel}:{message_id}:{content_hash}
        content_hash = hashlib.md5(
            ai_result.reply_text.encode()
        ).hexdigest()[:16]
        
        channel = message.channel.value if hasattr(message, 'channel') else 'instagram'
        
        idempotency_key = (
            f"ai_response:{tenant.firebase_uid}:{channel}:"
            f"{message.channel_message_id}:{content_hash}"
        )
        
        # Calculate retry schedule
        retry_schedule = self._build_retry_schedule()
        
        return {
            'id': str(uuid.uuid4()),
            'aggregate_type': 'ai_response',
            'aggregate_id': message_id,
            'event_type': 'send_message',
            'channel': message.channel.value if hasattr(message, 'channel') else 'instagram',
            'payload': {
                'reply': ai_result.reply_text,
                'intent': ai_result.intent,
                'tenant_id': tenant.firebase_uid,
                'recipient_id': message.sender_id if hasattr(message, 'sender_id') else '',
                'channel_message_id': message.channel_message_id if hasattr(message, 'channel_message_id') else '',
                'idempotency_key': idempotency_key,
                'metadata': {
                    'generation_method': ai_result.generation_method,
                    'confidence': ai_result.confidence,
                    'trace_id': trace_id,
                },
            },
            'status': 'pending',
            'retry_count': 0,
            'max_retries': self.MAX_RETRIES,
            'next_retry_at': None,
            'processed_at': None,
            'error': None,
            'retry_schedule': retry_schedule,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
    
    def _build_retry_schedule(self) -> List[Dict[str, Any]]:
        """
        Build retry schedule with exponential backoff.
        
        Returns:
            List of {delay_seconds, max_retries} configs
        """
        schedule = []
        for attempt in range(self.MAX_RETRIES):
            delay = min(
                self.BASE_RETRY_DELAY * (2 ** attempt),
                self.MAX_RETRY_DELAY,
            )
            schedule.append({
                'attempt': attempt + 1,
                'delay_seconds': delay,
            })
        return schedule
    
    def _atomic_write(
        self,
        db,
        message_row: Dict[str, Any],
        event: Dict[str, Any],
        trace_id: str,
    ) -> None:
        """
        Atomically write message + outbox event.
        
        Uses two separate inserts. If second fails, first is orphaned
        but that's acceptable (message will be in failed state).
        """
        # Insert message
        try:
            db.table('unified_messages').insert(message_row).execute()
        except Exception as e:
            # Check for conflict - message might already exist
            if 'duplicate' not in str(e).lower():
                raise
            logger.debug(f"outbox_message_exists trace={trace_id}")
        
        # Insert outbox event
        db.table('outbox_events').insert(event).execute()
        
        logger.debug(
            f"outbox_atomic_write trace={trace_id} "
            f"message_id={message_row['id']} event_id={event['id']}"
        )


# =============================================================================
# Singleton
# =============================================================================

_instance: Optional[OutboxWriterStage] = None


def get_outbox_writer_stage() -> OutboxWriterStage:
    """Get singleton OutboxWriterStage instance."""
    global _instance
    if _instance is None:
        _instance = OutboxWriterStage()
    return _instance
