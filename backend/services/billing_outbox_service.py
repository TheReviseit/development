"""
Billing Outbox Service (Phase C)
=================================
Transactional outbox for webhook-triggered reconciliation.

Every successfully processed Razorpay webhook writes an outbox row
scheduled 60 seconds in the future (allowing Razorpay to settle).
A background Celery worker dequeues pending rows and calls the
reconciliation engine.

Design (follows messaging/outbox.py pattern):
  - Write is synchronous (same transaction as webhook processing)
  - Dequeue uses SELECT FOR UPDATE SKIP LOCKED for concurrent workers
  - Failed rows are retried up to max_retries, then sent to DLQ
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from uuid import uuid4

logger = logging.getLogger('reviseit.billing_outbox')

RECONCILIATION_DELAY_SECONDS = int(os.getenv('RECONCILIATION_DELAY_SECONDS', '60'))
MAX_RETRIES = int(os.getenv('BILLING_OUTBOX_MAX_RETRIES', '3'))
LOCK_SECONDS = int(os.getenv('BILLING_OUTBOX_LOCK_SECONDS', '300'))
BATCH_SIZE = int(os.getenv('BILLING_OUTBOX_BATCH_SIZE', '10'))
WORKER_ID = os.getenv('BILLING_OUTBOX_WORKER_ID', f'worker_{uuid4().hex[:8]}')


def write_outbox(
    event_id: str,
    event_type: str,
    razorpay_subscription_id: Optional[str] = None,
    razorpay_payment_id: Optional[str] = None,
    subscription_id: Optional[str] = None,
    user_id: Optional[str] = None,
    product_domain: Optional[str] = None,
    payload: Optional[Dict] = None,
    scheduled_at: Optional[datetime] = None,
) -> Optional[str]:
    """
    Write an outbox entry for a processed webhook event.

    The event will be picked up by the background worker after
    scheduled_at (default: NOW + 60s delay for Razorpay settlement).

    Returns the outbox row ID, or None on failure.
    Idempotent: if an entry with the same event_id exists, it is a no-op.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        if scheduled_at is None:
            scheduled_at = datetime.now(timezone.utc) + timedelta(seconds=RECONCILIATION_DELAY_SECONDS)

        row = {
            'event_id': event_id,
            'event_type': event_type,
            'razorpay_subscription_id': razorpay_subscription_id,
            'razorpay_payment_id': razorpay_payment_id,
            'subscription_id': subscription_id,
            'user_id': user_id,
            'product_domain': product_domain,
            'payload': payload or {},
            'scheduled_at': scheduled_at.isoformat(),
            'status': 'pending',
        }

        result = db.table('billing_outbox') \
            .insert(row, on_conflict='event_id') \
            .execute()

        inserted = result.data[0] if result.data else None
        if inserted:
            return inserted.get('id')

        # On conflict (already exists), fetch existing
        existing = db.table('billing_outbox') \
            .select('id') \
            .eq('event_id', event_id) \
            .single() \
            .execute()

        return existing.data.get('id') if existing.data else None

    except Exception as e:
        logger.error(f"billing_outbox_write_error event_id={event_id}: {e}", exc_info=True)
        return None


def dequeue_batch() -> list:
    """
    Atomically claim the next batch of pending outbox rows for processing.

    Uses the dequeue_billing_outbox() PostgreSQL function which handles
    SKIP LOCKED concurrency across multiple workers.

    Returns list of dicts, one per claimed row.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        result = db.rpc('dequeue_billing_outbox', {
            'worker_id': WORKER_ID,
            'batch_size': BATCH_SIZE,
            'lock_seconds': LOCK_SECONDS,
        }).execute()

        return result.data or []

    except Exception as e:
        logger.error(f"billing_outbox_dequeue_error: {e}", exc_info=True)
        return []


def process_row(row: Dict) -> Dict[str, Any]:
    """
    Process a single outbox row: trigger reconciliation.

    Called by the worker after dequeueing.
    Returns stats dict.
    """
    result = {
        'outbox_id': row.get('id'),
        'event_id': row.get('event_id'),
        'event_type': row.get('event_type'),
        'success': False,
        'action': 'none',
    }

    try:
        event_type = row.get("event_type") or ""

        if event_type == "webhook.deferred.subscription_not_found":
            payload = row.get("payload") or {}
            webhook_payload = payload.get("webhook_payload")
            if webhook_payload:
                from services.webhook_processor import WebhookProcessor

                processor = WebhookProcessor()
                outcome = processor.process_event(webhook_payload)
                result["action"] = outcome.get("action", "deferred_replay")
                result["success"] = bool(outcome.get("processed"))
                if result["success"]:
                    _mark_completed(row["id"])
                else:
                    _handle_failure(row)
                return result
            result["action"] = "skipped_no_payload"
            result["success"] = True
            _mark_completed(row["id"])
            return result

        razorpay_sub_id = row.get('razorpay_subscription_id')
        subscription_id = row.get('subscription_id')

        if not razorpay_sub_id and not subscription_id:
            result['action'] = 'skipped_no_reference'
            result['success'] = True  # Not an error, nothing to reconcile
            _mark_completed(row['id'])
            return result

        if subscription_id and razorpay_sub_id:
            from services.reconciliation_engine import reconcile_subscription
            outcome = reconcile_subscription(
                subscription_id=subscription_id,
                razorpay_subscription_id=razorpay_sub_id,
            )
            result['action'] = 'reconciled'
            result['drift_detected'] = outcome.get('drift_detected', False)
            result['auto_healed'] = outcome.get('auto_healed', False)
            result['success'] = True
            _mark_completed(row['id'])

        elif razorpay_sub_id and not subscription_id:
            # Try to resolve subscription from razorpay_subscription_id
            from supabase_client import get_supabase_client
            db = get_supabase_client()
            sub = db.table('subscriptions') \
                .select('id') \
                .eq('razorpay_subscription_id', razorpay_sub_id) \
                .limit(1) \
                .execute()

            if sub.data:
                resolved_id = sub.data[0]['id']
                from services.reconciliation_engine import reconcile_subscription
                outcome = reconcile_subscription(
                    subscription_id=resolved_id,
                    razorpay_subscription_id=razorpay_sub_id,
                )
                result['action'] = 'reconciled_after_resolve'
                result['success'] = True
                _mark_completed(row['id'])
            else:
                result['action'] = 'subscription_not_found'
                result['success'] = True  # Nothing to reconcile
                _mark_completed(row['id'])

        return result

    except Exception as e:
        logger.error(
            f"billing_outbox_process_error outbox_id={row.get('id')} "
            f"event_id={row.get('event_id')}: {e}",
            exc_info=True
        )
        result['action'] = f'error: {str(e)[:200]}'
        _handle_failure(row)
        return result


def _mark_completed(outbox_id: str):
    """Mark an outbox row as completed."""
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        db.table('billing_outbox') \
            .update({
                'status': 'completed',
                'completed_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }) \
            .eq('id', outbox_id) \
            .execute()
    except Exception as e:
        logger.error(f"billing_outbox_mark_completed_error outbox_id={outbox_id}: {e}")


def _handle_failure(row: Dict):
    """
    Handle a processing failure. Increment retry count and either
    re-queue for retry or send to DLQ.
    """
    outbox_id = row.get('id')
    current_retry = (row.get('retry_count') or 0) + 1

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        if current_retry >= MAX_RETRIES:
            # Exhausted retries — move to DLQ
            from services.webhook_dlq_service import send_to_dlq
            send_to_dlq(
                event_id=row.get('event_id'),
                event_type=row.get('event_type'),
                razorpay_subscription_id=row.get('razorpay_subscription_id'),
                razorpay_payment_id=row.get('razorpay_payment_id'),
                raw_payload=row.get('payload', {}),
                error_message=f'Outbox retries exhausted after {current_retry} attempts',
                source='outbox_worker',
                outbox_id=outbox_id,
            )

            db.table('billing_outbox') \
                .update({
                    'status': 'failed',
                    'retry_count': current_retry,
                    'last_error': 'Retries exhausted, sent to DLQ',
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }) \
                .eq('id', outbox_id) \
                .execute()
        else:
            # Re-queue with exponential backoff
            backoff_seconds = min(60 * (2 ** (current_retry - 1)), 3600)
            db.table('billing_outbox') \
                .update({
                    'status': 'pending',
                    'retry_count': current_retry,
                    'last_error': f'Retry {current_retry}/{MAX_RETRIES}',
                    'scheduled_at': (datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)).isoformat(),
                    'locked_until': None,
                    'locked_by': None,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }) \
                .eq('id', outbox_id) \
                .execute()

        logger.info(
            f"billing_outbox_failure outbox_id={outbox_id} "
            f"retry={current_retry}/{MAX_RETRIES} "
            f"outcome={'dlq' if current_retry >= MAX_RETRIES else 'requeue'}"
        )

    except Exception as e:
        logger.error(
            f"billing_outbox_failure_handler_error outbox_id={outbox_id}: {e}",
            exc_info=True
        )


def process_pending_batch() -> Dict[str, int]:
    """
    Dequeue and process one batch of pending outbox rows.

    Called by the Celery task every POLL_INTERVAL.
    Returns aggregate stats.
    """
    rows = dequeue_batch()
    if not rows:
        return {'dequeued': 0, 'completed': 0, 'failed': 0}

    stats = {'dequeued': len(rows), 'completed': 0, 'failed': 0}
    for row in rows:
        result = process_row(row)
        if result.get('success'):
            stats['completed'] += 1
        else:
            stats['failed'] += 1

        logger.debug(
            f"billing_outbox_processed outbox_id={result.get('outbox_id')} "
            f"event_id={result.get('event_id')} action={result.get('action')} "
            f"success={result.get('success')}"
        )

    return stats


def enqueue_deferred_webhook(
    event_id: str,
    event_type: str,
    razorpay_subscription_id: str,
    payload: Dict,
    retry_after_seconds: int = 30,
) -> Optional[str]:
    """
    Defer webhook processing when subscription row does not exist yet.
    Returns 200 to Razorpay immediately; outbox worker retries later.
    """
    scheduled_at = datetime.now(timezone.utc) + timedelta(seconds=retry_after_seconds)
    deferred_id = f"deferred:{event_id}"
    return write_outbox(
        event_id=deferred_id,
        event_type="webhook.deferred.subscription_not_found",
        razorpay_subscription_id=razorpay_subscription_id,
        payload={
            "original_event_id": event_id,
            "original_event_type": event_type,
            "webhook_payload": payload,
        },
        scheduled_at=scheduled_at,
    )


def get_outbox_stats() -> Dict[str, Any]:
    """Get aggregate stats for monitoring."""
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        status_count = db.table('billing_outbox') \
            .select('status', count='exact') \
            .execute()

        stats = {'total': 0, 'pending': 0, 'processing': 0, 'completed': 0, 'failed': 0}
        if hasattr(status_count, 'count'):
            stats['total'] = status_count.count

        return stats

    except Exception as e:
        logger.error(f"billing_outbox_stats_error: {e}")
        return {'error': str(e)}
