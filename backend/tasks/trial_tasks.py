"""
Trial Cron Tasks — Background Jobs for Trial Lifecycle Management
================================================================

Celery tasks that run periodically to:
1. Mark expiring-soon trials (3 days before expiry)
2. Expire stale trials (past expiry date)
3. Send expiry notifications (via event emitter)
4. Generate trial analytics

Schedule:
    trial_tasks.mark_expiring_soon    — every hour
    trial_tasks.expire_stale_trials   — every 10 minutes
    trial_tasks.sync_trial_conversions — every hour

Design:
    - Idempotent (safe to run multiple times)
    - Distributed locking (prevents parallel execution)
    - All state changes go through TrialEngine
    - All actions emit events
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from celery import shared_task

logger = logging.getLogger('reviseit.tasks.trial_tasks')


# =============================================================================
# DISTRIBUTED LOCK HELPER
# =============================================================================

def _acquire_trial_lock(lock_name: str, ttl_seconds: int = 600) -> bool:
    """
    Acquire a Redis lock to prevent parallel task runs.

    Fail CLOSED: if Redis is down, skip the run.
    """
    try:
        import redis
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        r = redis.from_url(redis_url, decode_responses=True)
        return bool(r.set(f"trial_tasks:{lock_name}", '1', nx=True, ex=ttl_seconds))
    except Exception as e:
        logger.error(f"trial_lock_error lock={lock_name}: {e} — skipping run (fail closed)")
        return False


def _release_trial_lock(lock_name: str):
    """Release a task lock."""
    try:
        import redis
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        r = redis.from_url(redis_url, decode_responses=True)
        r.delete(f"trial_tasks:{lock_name}")
    except Exception:
        pass


# =============================================================================
# MARK EXPIRING SOON (Every Hour)
# =============================================================================

@shared_task(
    name='trial_tasks.mark_expiring_soon',
    bind=True,
    max_retries=1,
    soft_time_limit=120,
    time_limit=180,
)
def mark_expiring_soon(self) -> Dict[str, Any]:
    """
    Mark trials that are expiring within 3 days.

    These trials will:
    - Show warning banners in UI
    - Receive reminder emails
    - Be tracked for analytics

    Returns summary of trials marked.
    """
    if not _acquire_trial_lock('expiring_soon', ttl_seconds=3540):
        logger.info("trial_expiring_soon_skipped: locked")
        return {'status': 'skipped', 'reason': 'locked'}

    start_time = datetime.now(timezone.utc)
    summary = {
        'status': 'completed',
        'started_at': start_time.isoformat(),
        'marked_count': 0,
        'errors': [],
    }

    try:
        from services.trial_engine import get_trial_engine
        engine = get_trial_engine()

        count = engine.mark_expiring_soon(threshold_days=3)
        summary['marked_count'] = count

        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        summary['elapsed_ms'] = round(elapsed_ms, 2)

        logger.info(
            f"trial_expiring_soon_complete marked={count} "
            f"elapsed={summary['elapsed_ms']}ms"
        )

        return summary

    except Exception as e:
        logger.error(f"trial_expiring_soon_error: {e}", exc_info=True)
        summary['status'] = 'error'
        summary['errors'].append(str(e)[:200])
        return summary

    finally:
        _release_trial_lock('expiring_soon')


# =============================================================================
# EXPIRE STALE TRIALS (Every 10 Minutes)
# =============================================================================

@shared_task(
    name='trial_tasks.expire_stale_trials',
    bind=True,
    max_retries=1,
    soft_time_limit=300,
    time_limit=600,
)
def expire_stale_trials(self) -> Dict[str, Any]:
    """
    Expire trials that have passed their expiry date.

    This catches:
    - Trials where automatic expiry webhook was missed
    - Edge cases with clock drift
    - Manual interventions

    Returns summary of trials expired.
    """
    if not _acquire_trial_lock('expire_stale', ttl_seconds=540):
        logger.info("trial_expire_stale_skipped: locked")
        return {'status': 'skipped', 'reason': 'locked'}

    start_time = datetime.now(timezone.utc)
    summary = {
        'status': 'completed',
        'started_at': start_time.isoformat(),
        'expired_count': 0,
        'errors': [],
    }

    try:
        from services.trial_engine import get_trial_engine
        engine = get_trial_engine()

        count = engine.expire_stale_trials()
        summary['expired_count'] = count

        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        summary['elapsed_ms'] = round(elapsed_ms, 2)

        logger.info(
            f"trial_expire_stale_complete expired={count} "
            f"elapsed={summary['elapsed_ms']}ms"
        )

        return summary

    except Exception as e:
        logger.error(f"trial_expire_stale_error: {e}", exc_info=True)
        summary['status'] = 'error'
        summary['errors'].append(str(e)[:200])
        return summary

    finally:
        _release_trial_lock('expire_stale')


# =============================================================================
# SYNC TRIAL CONVERSIONS (Every Hour)
# =============================================================================

@shared_task(
    name='trial_tasks.sync_trial_conversions',
    bind=True,
    max_retries=2,
    soft_time_limit=180,
    time_limit=300,
)
def sync_trial_conversions(self) -> Dict[str, Any]:
    """
    Sync trial conversions with subscription table.

    This handles edge cases where:
    - User upgraded but trial conversion event wasn't recorded
    - Webhook was missed
    - Manual subscription creation

    Returns summary of syncs performed.
    """
    if not _acquire_trial_lock('sync_conversions', ttl_seconds=3540):
        logger.info("trial_sync_skipped: locked")
        return {'status': 'skipped', 'reason': 'locked'}

    start_time = datetime.now(timezone.utc)
    summary = {
        'status': 'completed',
        'started_at': start_time.isoformat(),
        'synced_count': 0,
        'errors': [],
    }

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        # Find active trials where user now has a paid subscription
        result = db.table('free_trials').select(
            'free_trials.id, free_trials.user_id, free_trials.org_id, '
            'free_trials.plan_slug, free_trials.domain, free_trials.started_at'
        ).eq(
            'free_trials.status', 'active'
        ).execute()

        trials = result.data or []
        synced = 0

        for trial in trials:
            # Check if user has a paid subscription
            sub_result = db.table('subscriptions').select('id, plan_slug').eq(
                'user_id', trial['user_id']
            ).eq(
                'status', 'active'
            ).execute()

            if sub_result.data:
                subscription = sub_result.data[0]

                # Convert the trial
                try:
                    from services.trial_engine import get_trial_engine
                    engine = get_trial_engine()

                    success = engine.convert_to_paid(
                        trial_id=trial['id'],
                        subscription_id=subscription['id'],
                        to_plan_slug=subscription['plan_slug'],
                    )

                    if success:
                        synced += 1
                        logger.info(
                            f"trial_sync_converted trial_id={trial['id']} "
                            f"subscription_id={subscription['id']}"
                        )

                except Exception as e:
                    logger.error(
                        f"trial_sync_error trial_id={trial['id']}: {e}"
                    )
                    summary['errors'].append(f"trial {trial['id']}: {str(e)[:100]}")

        summary['synced_count'] = synced

        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        summary['elapsed_ms'] = round(elapsed_ms, 2)

        logger.info(
            f"trial_sync_complete synced={synced} "
            f"elapsed={summary['elapsed_ms']}ms"
        )

        return summary

    except Exception as e:
        logger.error(f"trial_sync_error: {e}", exc_info=True)
        summary['status'] = 'error'
        summary['errors'].append(str(e)[:200])
        return summary

    finally:
        _release_trial_lock('sync_conversions')


# =============================================================================
# GENERATE TRIAL ANALYTICS (Daily)
# =============================================================================

@shared_task(
    name='trial_tasks.generate_trial_analytics',
    bind=True,
    max_retries=1,
    soft_time_limit=300,
    time_limit=600,
)
def generate_trial_analytics(self) -> Dict[str, Any]:
    """
    Generate daily trial analytics for reporting.

    Calculates:
    - Trial start rate
    - Conversion rate
    - Churn rate
    - Average trial duration
    - Abuse detection stats

    Stores results in analytics table.
    """
    if not _acquire_trial_lock('analytics', ttl_seconds=3600):
        logger.info("trial_analytics_skipped: locked")
        return {'status': 'skipped', 'reason': 'locked'}

    start_time = datetime.now(timezone.utc)
    yesterday = start_time - timedelta(days=1)

    summary = {
        'status': 'completed',
        'date': yesterday.strftime('%Y-%m-%d'),
        'metrics': {},
        'errors': [],
    }

    try:
        from services.trial_engine import get_trial_engine

        engine = get_trial_engine()

        # Get metrics for each domain
        for domain in ['shop', 'marketing', 'api', 'showcase']:
            try:
                metrics = engine.get_trial_metrics(
                    domain=domain,
                    start_date=yesterday.replace(hour=0, minute=0, second=0),
                    end_date=yesterday.replace(hour=23, minute=59, second=59),
                )
                summary['metrics'][domain] = metrics
            except Exception as e:
                logger.error(f"analytics_error domain={domain}: {e}")
                summary['errors'].append(f"{domain}: {str(e)[:100]}")

        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        summary['elapsed_ms'] = round(elapsed_ms, 2)

        logger.info(f"trial_analytics_complete date={summary['date']}")

        return summary

    except Exception as e:
        logger.error(f"trial_analytics_error: {e}", exc_info=True)
        summary['status'] = 'error'
        summary['errors'].append(str(e)[:200])
        return summary

    finally:
        _release_trial_lock('analytics')


# =============================================================================
# CELERY BEAT SCHEDULE (Add to celerybeat schedule)
# =============================================================================

# Add these to your Celery beat schedule:
#
# 'trial-tasks-mark-expiring-soon': {
#     'task': 'trial_tasks.mark_expiring_soon',
#     'schedule': crontab(minute=0),  # Every hour
# },
# 'trial-tasks-expire-stale': {
#     'task': 'trial_tasks.expire_stale_trials',
#     'schedule': crontab(minute='*/10'),  # Every 10 minutes
# },
# 'trial-tasks-sync-conversions': {
#     'task': 'trial_tasks.sync_trial_conversions',
#     'schedule': crontab(minute=30),  # Every hour at :30
# },
# 'trial-tasks-analytics': {
#     'task': 'trial_tasks.generate_trial_analytics',
#     'schedule': crontab(hour=1, minute=0),  # Daily at 1 AM
# },
