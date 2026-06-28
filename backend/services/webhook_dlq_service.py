"""
Webhook Dead Letter Queue Service (Phase C)
============================================
Captures webhook events that failed processing after exhausting all retries.
DLQ entries require operator review and manual replay via the admin API.

Events land in the DLQ from:
  1. Webhook processor (signature failure, unknown event type)
  2. Outbox worker (retry budget exhausted)
  3. Reconciliation engine (unrecoverable drift detected)

Each DLQ entry tracks source, error detail, retry count, and resolution.
Operators can review, replay, or dismiss entries via the admin API.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from uuid import uuid4

logger = logging.getLogger('reviseit.webhook_dlq')

# Prometheus counter — fail loud on startup
try:
    from prometheus_client import Counter
    billing_dlq_events_total = Counter(
        "billing_dlq_events_total",
        "Total webhook DLQ entries created (by source)",
        ["source"],
    )
except ImportError:
    billing_dlq_events_total = None


def send_to_dlq(
    event_id: Optional[str] = None,
    event_type: Optional[str] = None,
    razorpay_subscription_id: Optional[str] = None,
    razorpay_payment_id: Optional[str] = None,
    raw_payload: Optional[Dict] = None,
    error_message: str = 'Unknown error',
    error_detail: Optional[str] = None,
    source: str = 'webhook_processor',
    outbox_id: Optional[str] = None,
) -> Optional[str]:
    """
    Insert an event into the DLQ.

    Returns the DLQ entry ID, or None on failure.
    Idempotent: calling multiple times for the same event creates
    separate entries (each represents a distinct failure occurrence).
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        row = {
            'event_id': event_id,
            'event_type': event_type or 'unknown',
            'razorpay_subscription_id': razorpay_subscription_id,
            'razorpay_payment_id': razorpay_payment_id,
            'raw_payload': raw_payload or {},
            'error_message': error_message[:500],
            'error_detail': error_detail[:5000] if error_detail else None,
            'source': source,
            'status': 'new',
            'outbox_id': outbox_id,
        }

        result = db.table('webhook_dlq').insert(row).execute()
        dlq_id = result.data[0]['id'] if result.data else None

        if dlq_id:
            logger.warning(
                f"webhook_dlq_insert dlq_id={dlq_id} "
                f"event_id={event_id} source={source} "
                f"error={error_message[:100]}"
            )
            if billing_dlq_events_total is not None:
                billing_dlq_events_total.labels(source=source).inc()

        return dlq_id

    except Exception as e:
        logger.error(f"webhook_dlq_insert_error event_id={event_id}: {e}", exc_info=True)
        return None


def get_dlq_entries(
    status: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """
    Fetch DLQ entries with optional filtering.

    Returns dict with 'entries' list and 'total' count.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        query = db.table('webhook_dlq') \
            .select('*', count='exact')

        if status:
            query = query.eq('status', status)
        if source:
            query = query.eq('source', source)

        query = query.order('created_at', desc=True) \
            .range(offset, offset + limit - 1)

        result = query.execute()
        total = result.count if hasattr(result, 'count') else 0

        return {
            'entries': result.data or [],
            'total': total,
            'limit': limit,
            'offset': offset,
        }

    except Exception as e:
        logger.error(f"webhook_dlq_list_error: {e}", exc_info=True)
        return {'entries': [], 'total': 0, 'limit': limit, 'offset': offset, 'error': str(e)}


def get_dlq_entry(dlq_id: str) -> Optional[Dict]:
    """Fetch a single DLQ entry by ID."""
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        result = db.table('webhook_dlq') \
            .select('*') \
            .eq('id', dlq_id) \
            .single() \
            .execute()

        return result.data

    except Exception as e:
        logger.error(f"webhook_dlq_get_error dlq_id={dlq_id}: {e}")
        return None


def replay_entry(dlq_id: str, reviewed_by: str) -> Dict[str, Any]:
    """
    Replay a DLQ entry back to the billing outbox for re-processing.

    Uses the replay_dlq_entry() PostgreSQL function which:
      1. Validates the DLQ entry exists
      2. Marks it as 'replaying'
      3. Creates a billing_outbox row with status='pending', scheduled_at=NOW

    Returns dict with success flag and any error message.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        # Mark as reviewing
        db.table('webhook_dlq') \
            .update({
                'status': 'reviewing',
                'reviewed_by': reviewed_by,
                'reviewed_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }) \
            .eq('id', dlq_id) \
            .execute()

        # Call the replay function
        result = db.rpc('replay_dlq_entry', {'p_dlq_id': dlq_id}).execute()
        rpc_result = result.data[0] if result.data else {}

        if rpc_result.get('success'):
            logger.info(
                f"webhook_dlq_replayed dlq_id={dlq_id} reviewed_by={reviewed_by}"
            )
            return {'success': True, 'dlq_id': dlq_id}

        error_msg = rpc_result.get('error_message', 'Unknown error')
        logger.error(f"webhook_dlq_replay_failed dlq_id={dlq_id}: {error_msg}")
        return {'success': False, 'error': error_msg}

    except Exception as e:
        logger.error(f"webhook_dlq_replay_error dlq_id={dlq_id}: {e}", exc_info=True)
        return {'success': False, 'error': str(e)}


def resolve_entry(dlq_id: str, reviewed_by: str, resolution_note: str) -> bool:
    """
    Mark a DLQ entry as resolved without replaying.

    Used when the operator determines the issue is benign or
    has been fixed through other means.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        db.table('webhook_dlq') \
            .update({
                'status': 'resolved',
                'reviewed_by': reviewed_by,
                'reviewed_at': datetime.now(timezone.utc).isoformat(),
                'resolution_note': resolution_note[:1000],
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }) \
            .eq('id', dlq_id) \
            .execute()

        logger.info(
            f"webhook_dlq_resolved dlq_id={dlq_id} reviewed_by={reviewed_by}"
        )
        return True

    except Exception as e:
        logger.error(f"webhook_dlq_resolve_error dlq_id={dlq_id}: {e}", exc_info=True)
        return False


def dismiss_entry(dlq_id: str, reviewed_by: str, resolution_note: str) -> bool:
    """
    Mark a DLQ entry as dismissed (benign, no action needed).
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        db.table('webhook_dlq') \
            .update({
                'status': 'dismissed',
                'reviewed_by': reviewed_by,
                'reviewed_at': datetime.now(timezone.utc).isoformat(),
                'resolution_note': resolution_note[:1000],
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }) \
            .eq('id', dlq_id) \
            .execute()

        logger.info(
            f"webhook_dlq_dismissed dlq_id={dlq_id} reviewed_by={reviewed_by}"
        )
        return True

    except Exception as e:
        logger.error(f"webhook_dlq_dismiss_error dlq_id={dlq_id}: {e}", exc_info=True)
        return False


def get_dlq_stats() -> Dict[str, Any]:
    """Get aggregate DLQ statistics for monitoring dashboard."""
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        stats = {
            'new': 0, 'reviewing': 0, 'replaying': 0,
            'resolved': 0, 'dismissed': 0, 'total': 0,
        }

        for status_key in stats:
            count_result = db.table('webhook_dlq') \
                .select('id', count='exact') \
                .eq('status', status_key) \
                .execute()
            stats[status_key] = count_result.count if hasattr(count_result, 'count') else 0

        stats['total'] = sum(v for k, v in stats.items() if k != 'total')

        return stats

    except Exception as e:
        logger.error(f"webhook_dlq_stats_error: {e}")
        return {'error': str(e)}
