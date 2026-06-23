"""
Subscription Projection Worker (Phase B)
=========================================
Celery-based worker that reads from the immutable subscription_events
table and projects the latest state onto subscriptions.status.

Design:
  - Polling interval: 100ms (configurable)
  - Batch size: 100 events per cycle
  - Per-subscription locking via pg_advisory_xact_lock
  - Max lag: 100ms normal, <500ms peak
  - Eager projection for critical paths (user-initiated actions)
  - Projection worker delay acceptable for non-critical paths (expiry, grace period)

Architecture:
  subscription_events (append-only)
        │
        ▼
  projection_worker (Celery task, polls every 100ms)
        │
        ▼
  subscriptions.status (denormalized projection)
        │
        ▼
  cache invalidation → frontend reads fresh state
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger('reviseit.services.subscription_projection_worker')

# Map event types to target subscription statuses
EVENT_TO_STATUS = {
    'subscription.created': 'pending',
    'subscription.activated': 'active',
    'subscription.payment_failed': 'past_due',
    'subscription.past_due': 'past_due',
    'subscription.grace_period_started': 'grace_period',
    'subscription.grace_period_expired': 'suspended',
    'subscription.suspended': 'suspended',
    'subscription.cancelled': 'cancelled',
    'subscription.reactivated': 'active',
    'subscription.expired': 'expired',
    'subscription.halted': 'halted',
    'subscription.resumed': 'active',
    'subscription.upgraded': 'active',
    'subscription.downgraded': 'active',
    'subscription.renewed': 'active',
    'subscription.reconciled': None,  # status comes from payload.status
}

# Events that should also update period timestamps
PERIOD_EVENTS = {'subscription.activated', 'subscription.renewed', 'subscription.upgraded', 'subscription.reconciled'}

BATCH_SIZE = int(os.getenv('PROJECTION_BATCH_SIZE', '100'))
POLL_INTERVAL_SECONDS = float(os.getenv('PROJECTION_POLL_INTERVAL', '0.1'))


def process_events_batch() -> Dict[str, int]:
    """
    Process one batch of unprocessed subscription_events.
    - Reads next batch of events after the checkpoint
    - Groups by subscription_id
    - Applies the latest event's status to subscriptions table
    - Updates projection_checkpoint

    Returns counts dict.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        # 1. Read checkpoint
        cp = db.table('projection_checkpoints') \
            .select('last_processed_event_id') \
            .eq('projector_name', 'subscription_status') \
            .single() \
            .execute()

        last_id = cp.data.get('last_processed_event_id', 0) if cp.data else 0

        # 2. Fetch next batch
        events = db.table('subscription_events') \
            .select('*') \
            .gt('id', last_id) \
            .order('id') \
            .limit(BATCH_SIZE) \
            .execute()

        rows = events.data or []
        if not rows:
            return {'processed': 0, 'projected': 0, 'lag': 0}

        # 3. Group by subscription_id
        subs_to_events: Dict[str, list] = {}
        for row in rows:
            sub_id = row['subscription_id']
            subs_to_events.setdefault(sub_id, []).append(row)

        # 4. Project latest event for each subscription
        projected_count = 0
        for sub_id, sub_events in subs_to_events.items():
            try:
                latest = sub_events[-1]
                target_status = EVENT_TO_STATUS.get(latest['event_type'])

                if target_status is None and latest['event_type'] == 'subscription.reconciled':
                    target_status = (latest.get('payload') or {}).get('status')

                if not target_status:
                    logger.warning(
                        f"No status mapping for event_type={latest['event_type']} "
                        f"sub={sub_id}"
                    )
                    continue

                # Use pg_advisory_xact_lock for per-subscription concurrency
                # (lock ID is hash of subscription UUID truncated to bigint range)
                lock_id = abs(hash(sub_id)) % (2**63)
                db.rpc('pg_advisory_xact_lock', {'key': lock_id}).execute()

                update_data = {
                    'status': target_status,
                    'updated_at': latest['created_at'],
                }

                if latest['event_type'] in PERIOD_EVENTS:
                    payload = latest.get('payload') or {}
                    if payload.get('current_period_start'):
                        update_data['current_period_start'] = payload['current_period_start']
                    if payload.get('current_period_end'):
                        update_data['current_period_end'] = payload['current_period_end']
                    if payload.get('plan_slug'):
                        update_data['plan_slug'] = payload['plan_slug']

                db.table('subscriptions') \
                    .update(update_data) \
                    .eq('id', sub_id) \
                    .execute()

                projected_count += 1

            except Exception as e:
                logger.error(f"projection_error sub={sub_id}: {e}", exc_info=True)

        # 5. Update checkpoint
        new_last_id = rows[-1]['id']
        now = datetime.now(timezone.utc)
        lag = int((now - datetime.fromisoformat(rows[-1]['created_at'].replace('Z', '+00:00'))).total_seconds())

        db.table('projection_checkpoints') \
            .update({
                'last_processed_event_id': new_last_id,
                'last_processed_at': now.isoformat(),
                'lag_seconds': lag,
            }) \
            .eq('projector_name', 'subscription_status') \
            .execute()

        # 6. Invalidate caches for projected subs
        try:
            from services.subscription_lifecycle import get_lifecycle_engine
            engine = get_lifecycle_engine()
            for sub_id in subs_to_events:
                engine._invalidate_caches_for_subscription(sub_id)
        except Exception:
            pass

        logger.debug(
            f"projection_batch events={len(rows)} projected={projected_count} "
            f"lag={lag}s checkpoint={new_last_id}"
        )

        return {
            'processed': len(rows),
            'projected': projected_count,
            'lag': lag,
        }

    except Exception as e:
        logger.error(f"projection_batch_error: {e}", exc_info=True)
        return {'error': str(e)}


def eager_project(subscription_id: str) -> bool:
    """
    Immediately project a single subscription's events to its current status.
    Used by critical read-after-write paths (webhook responses, user-initiated actions).

    Reads ALL events for this subscription, determines status, updates subscriptions.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        events = db.table('subscription_events') \
            .select('*') \
            .eq('subscription_id', subscription_id) \
            .order('id') \
            .execute()

        rows = events.data or []
        if not rows:
            return False

        latest = rows[-1]
        target_status = EVENT_TO_STATUS.get(latest['event_type'])

        if target_status is None and latest['event_type'] == 'subscription.reconciled':
            target_status = (latest.get('payload') or {}).get('status')

        if not target_status:
            logger.warning(f"eager_project no_status sub={subscription_id}")
            return False

        update_data = {
            'status': target_status,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }

        if latest['event_type'] in PERIOD_EVENTS:
            payload = latest.get('payload') or {}
            if payload.get('current_period_start'):
                update_data['current_period_start'] = payload['current_period_start']
            if payload.get('current_period_end'):
                update_data['current_period_end'] = payload['current_period_end']
            if payload.get('plan_slug'):
                update_data['plan_slug'] = payload['plan_slug']

        db.table('subscriptions') \
            .update(update_data) \
            .eq('id', subscription_id) \
            .execute()

        # Invalidate cache
        try:
            from services.subscription_lifecycle import get_lifecycle_engine
            engine = get_lifecycle_engine()
            engine._invalidate_caches_for_subscription(subscription_id)
        except Exception:
            pass

        return True

    except Exception as e:
        logger.error(f"eager_project_error sub={subscription_id}: {e}", exc_info=True)
        return False


try:
    from celery_app import celery_app

    @celery_app.task(name='subscription_projection_worker.process_batch')
    def process_batch_task():
        """Celery task wrapper for process_events_batch."""
        return process_events_batch()

    logger.info("Registered subscription_projection_worker.process_batch task")

except ImportError:
    logger.warning("Celery not available, projection worker not registered")
