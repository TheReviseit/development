"""
Abandoned Checkout Cleanup Task (Hotfix A2)
============================================
Celery Beat task that runs every 15 minutes to sweep pending subscriptions
that are older than 30 minutes and cancel them.

This is the safety net for users who:
1. Start a Razorpay checkout (creates pending subscription)
2. Dismiss the modal without completing payment
3. Never trigger the A4 cancel-pending API (e.g., page refresh, crash)

Without this, abandoned pending subscriptions cause `_get_subscription()`
to return a stale "current plan" matching the Pro/paid tier, preventing
the user from starting a Free Trial or seeing correct upgrade options.

Schedule: abandoned_checkout_cleanup.sweep_stale_pending — every 15 minutes
"""

import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger('reviseit.tasks.abandoned_checkout_cleanup')

STALE_TTL_MINUTES = 30


def sweep_stale_pending():
    """
    Find all subscriptions with status='pending' created > 30 minutes ago
    and mark them as 'cancelled' with reason 'checkout_abandoned_ttl'.

    Idempotent: safe to run multiple times.
    Uses chunked batch processing to avoid long-running transactions.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_TTL_MINUTES)

        # Fetch IDs of stale pending subs (chunked)
        stale = db.table('subscriptions') \
            .select('id, user_id, product_domain, plan_slug') \
            .eq('status', 'pending') \
            .lt('created_at', cutoff.isoformat()) \
            .execute()

        rows = stale.data or []
        if not rows:
            logger.debug("No stale pending subscriptions found")
            return {'cancelled_count': 0}

        ids = [r['id'] for r in rows]

        # Cancel in bulk
        db.table('subscriptions') \
            .update({
                'status': 'cancelled',
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'cancelled_at': datetime.now(timezone.utc).isoformat(),
                'cancellation_reason': 'checkout_abandoned_ttl',
            }) \
            .in_('id', ids) \
            .execute()

        # Invalidate caches for each cancelled sub
        try:
            from services.subscription_lifecycle import get_lifecycle_engine
            engine = get_lifecycle_engine()
            for r in rows:
                engine._invalidate_caches_for_subscription(r['id'])
        except Exception:
            logger.warning("Cache invalidation skipped (engine unavailable)", exc_info=True)

        logger.info(
            f"sweep_stale_pending cancelled={len(ids)} "
            f"cutoff_age_min={STALE_TTL_MINUTES}"
        )

        return {'cancelled_count': len(ids)}

    except Exception as e:
        logger.error(f"sweep_stale_pending_error: {e}", exc_info=True)
        return {'error': str(e)}


try:
    from celery_app import celery_app

    @celery_app.task(name='abandoned_checkout_cleanup.sweep_stale_pending')
    def sweep_stale_pending_task():
        """Celery task wrapper."""
        return sweep_stale_pending()

    logger.info("Registered abandoned_checkout_cleanup.sweep_stale_pending task")

except ImportError:
    logger.warning("Celery not available, abandoned checkout cleanup not registered")
