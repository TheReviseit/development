"""
Billing Monitor — Background Worker for Subscription Lifecycle
================================================================

Celery periodic tasks that run every 10 minutes to:

1. Detect overdue subscriptions (period expired but still active)
2. Process pending payment retries (3-day recovery lifecycle)
3. Expire grace periods and suspend accounts
4. Sync stale subscriptions with Razorpay API
5. Clean up stale pending upgrades
6. Report billing health metrics

Schedule:
  billing_monitor.run_billing_cycle   — every 10 minutes
  billing_monitor.sync_razorpay_state — every 6 hours
  billing_monitor.generate_mrr_report — every 24 hours

Design:
  - Each task is idempotent (safe to run multiple times)
  - Each task acquires a distributed lock (prevents parallel execution)
  - All state changes go through SubscriptionLifecycleEngine
  - All actions are logged to billing_events
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from celery import shared_task

logger = logging.getLogger('reviseit.tasks.billing_monitor')


# =============================================================================
# DISTRIBUTED LOCK HELPER
# =============================================================================

def _acquire_monitor_lock(lock_name: str, ttl_seconds: int = 600) -> bool:
    """
    Acquire a Redis lock to prevent parallel monitor runs.

    Fail CLOSED: if Redis is down, skip the run. This prevents multiple
    workers from executing the billing cycle simultaneously, which could
    cause duplicate retries, duplicate suspensions, and duplicate events.
    The next scheduled run (10 min later) will succeed when Redis recovers.
    """
    try:
        import redis as redis_lib
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        r = redis_lib.from_url(redis_url, decode_responses=True)
        return bool(r.set(f"billing_monitor:{lock_name}", '1', nx=True, ex=ttl_seconds))
    except Exception as e:
        logger.error(f"monitor_lock_error lock={lock_name}: {e} — skipping run (fail closed)")
        return False  # Fail CLOSED: skip run if Redis unavailable


def _release_monitor_lock(lock_name: str):
    """Release a monitor lock."""
    try:
        import redis as redis_lib
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        r = redis_lib.from_url(redis_url, decode_responses=True)
        r.delete(f"billing_monitor:{lock_name}")
    except Exception:
        pass


# =============================================================================
# MAIN BILLING CYCLE (Every 10 minutes)
# =============================================================================

@shared_task(
    name='tasks.billing_monitor.run_billing_cycle',
    bind=True,
    max_retries=1,
    soft_time_limit=300,
    time_limit=600,
)
def run_billing_cycle(self) -> Dict[str, Any]:
    """
    Main billing monitor cycle. Runs every 10 minutes.

    Responsibilities:
    1. Detect overdue subscriptions
    2. Process pending payment retries
    3. Expire grace periods
    4. Cleanup stale upgrades

    Returns summary of all actions taken.
    """
    if not _acquire_monitor_lock('billing_cycle', ttl_seconds=540):
        logger.info("billing_cycle_skipped: another instance running")
        return {'status': 'skipped', 'reason': 'locked'}

    start_time = datetime.now(timezone.utc)
    summary = {
        'status': 'completed',
        'started_at': start_time.isoformat(),
        'overdue_detected': 0,
        'retries_processed': 0,
        'grace_periods_expired': 0,
        'stale_upgrades_cleaned': 0,
        'errors': [],
    }

    try:
        from services.subscription_lifecycle import get_lifecycle_engine
        lifecycle = get_lifecycle_engine()

        # 1. Detect overdue subscriptions
        try:
            overdue_count = _detect_overdue_subscriptions(lifecycle)
            summary['overdue_detected'] = overdue_count
        except Exception as e:
            summary['errors'].append(f"overdue_detection: {str(e)[:100]}")
            logger.error(f"overdue_detection_error: {e}", exc_info=True)

        # 2. Process pending payment retries
        try:
            retry_count = _process_pending_retries(lifecycle)
            summary['retries_processed'] = retry_count
        except Exception as e:
            summary['errors'].append(f"retry_processing: {str(e)[:100]}")
            logger.error(f"retry_processing_error: {e}", exc_info=True)

        # 3. Expire grace periods
        try:
            expired_count = _expire_grace_periods(lifecycle)
            summary['grace_periods_expired'] = expired_count
        except Exception as e:
            summary['errors'].append(f"grace_expiry: {str(e)[:100]}")
            logger.error(f"grace_expiry_error: {e}", exc_info=True)

        # 4. Cleanup stale upgrades
        try:
            cleaned_count = _cleanup_stale_upgrades()
            summary['stale_upgrades_cleaned'] = cleaned_count
        except Exception as e:
            summary['errors'].append(f"stale_cleanup: {str(e)[:100]}")
            logger.error(f"stale_cleanup_error: {e}", exc_info=True)

        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        summary['elapsed_ms'] = round(elapsed_ms, 2)

        logger.info(
            f"billing_cycle_complete overdue={summary['overdue_detected']} "
            f"retries={summary['retries_processed']} "
            f"grace_expired={summary['grace_periods_expired']} "
            f"stale_cleaned={summary['stale_upgrades_cleaned']} "
            f"errors={len(summary['errors'])} elapsed={summary['elapsed_ms']}ms"
        )

        return summary

    except Exception as e:
        logger.error(f"billing_cycle_fatal_error: {e}", exc_info=True)
        summary['status'] = 'error'
        summary['errors'].append(f"fatal: {str(e)[:200]}")
        return summary

    finally:
        _release_monitor_lock('billing_cycle')


# =============================================================================
# OVERDUE DETECTION
# =============================================================================

def _detect_overdue_subscriptions(lifecycle) -> int:
    """
    Find active subscriptions past their period_end and mark as past_due.

    This catches cases where Razorpay webhook was missed or delayed.
    """
    overdue_subs = lifecycle.get_overdue_subscriptions()
    count = 0

    for sub in overdue_subs:
        try:
            success = lifecycle.transition_state(
                subscription_id=sub['id'],
                expected_state=sub['status'],
                new_state='past_due',
                reason=f"Billing period expired ({sub.get('current_period_end')})",
                triggered_by='billing_monitor',
                idempotency_key=f"overdue:{sub['id']}:{sub.get('current_period_end')}",
            )
            if success:
                count += 1
                logger.warning(
                    f"overdue_detected sub={sub['id']} user={sub['user_id']} "
                    f"domain={sub.get('product_domain')} "
                    f"period_end={sub.get('current_period_end')}"
                )
        except Exception as e:
            logger.error(f"overdue_transition_error sub={sub['id']}: {e}")

    return count


# =============================================================================
# PAYMENT RETRY ENGINE
# =============================================================================

def _process_pending_retries(lifecycle) -> int:
    """
    Process pending payment retries based on scheduled time.

    3-day recovery lifecycle:
      Day 1: retry_payment   — Attempt to charge via Razorpay
      Day 2: send_warning    — Notify user about impending suspension
      Day 3: suspend_account — Disable account access
    """
    from supabase_client import get_supabase_client
    supabase = get_supabase_client()

    now = datetime.now(timezone.utc).isoformat()

    # Get all pending retries that are due
    result = supabase.table('payment_retries').select('*').eq(
        'status', 'pending'
    ).lte(
        'scheduled_at', now
    ).order('scheduled_at').limit(50).execute()

    retries = result.data or []
    count = 0

    for retry in retries:
        try:
            action = retry['next_action']
            sub_id = retry['subscription_id']
            retry_id = retry['id']

            # Mark as in_progress
            supabase.table('payment_retries').update({
                'status': 'in_progress',
                'executed_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('id', retry_id).execute()

            if action == 'retry_payment':
                success = _execute_payment_retry(retry, lifecycle, supabase)
            elif action == 'send_warning':
                success = _send_payment_warning(retry, lifecycle, supabase)
            elif action == 'suspend_account':
                success = _execute_suspension(retry, lifecycle, supabase)
            else:
                logger.warning(f"unknown_retry_action action={action} retry={retry_id}")
                success = False

            # Update retry status
            new_status = 'succeeded' if success else 'failed'
            supabase.table('payment_retries').update({
                'status': new_status,
                'retry_result': f'{action}: {"success" if success else "failed"}',
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('id', retry_id).execute()

            count += 1

            logger.info(
                f"retry_processed retry={retry_id} sub={sub_id} "
                f"action={action} success={success}"
            )

        except Exception as e:
            logger.error(f"retry_error retry={retry.get('id')}: {e}", exc_info=True)
            # Mark as failed
            try:
                supabase.table('payment_retries').update({
                    'status': 'failed',
                    'retry_result': f'error: {str(e)[:200]}',
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }).eq('id', retry.get('id')).execute()
            except Exception:
                pass

    return count


def _execute_payment_retry(retry: Dict, lifecycle, supabase) -> bool:
    """
    Day 1 Action: Attempt to charge the subscription via Razorpay.

    Razorpay subscriptions auto-retry, so we just verify the current state
    with Razorpay API and sync our DB accordingly.
    """
    rzp_sub_id = retry.get('razorpay_subscription_id')
    sub_id = retry['subscription_id']

    if not rzp_sub_id:
        logger.warning(f"retry_no_rzp_sub sub={sub_id}")
        return False

    try:
        from routes.payments import razorpay_client
        rzp_sub = razorpay_client.subscription.fetch(rzp_sub_id)
        rzp_status = rzp_sub.get('status', '')

        logger.info(f"retry_razorpay_check sub={sub_id} rzp_status={rzp_status}")

        if rzp_status in ('active', 'authenticated'):
            # Payment was recovered by Razorpay's own retry
            lifecycle.handle_payment_success(
                subscription_id=sub_id,
                period_start=_parse_ts(rzp_sub.get('current_start')),
                period_end=_parse_ts(rzp_sub.get('current_end')),
            )
            return True

        elif rzp_status == 'halted':
            lifecycle.handle_halt(subscription_id=sub_id)
            return True

        elif rzp_status == 'cancelled':
            lifecycle.handle_cancellation(subscription_id=sub_id)
            return True

        # Still pending/created — no change
        return False

    except Exception as e:
        logger.error(f"retry_razorpay_error sub={sub_id}: {e}")
        return False


def _send_payment_warning(retry: Dict, lifecycle, supabase) -> bool:
    """
    Day 2 Action: Send warning notification to user.

    Notifies via available channels:
    1. Database notification record (for in-app notification)
    2. Email (if notification service available)
    """
    sub_id = retry['subscription_id']
    user_id = retry['user_id']
    failure_reason = retry.get('failure_reason', 'Payment failed')

    try:
        # Record warning event
        from services.subscription_lifecycle import BillingEventType
        lifecycle._record_event(
            subscription_id=sub_id,
            event_type=BillingEventType.WARNING_SENT,
            event_source='retry_engine',
            payload={
                'user_id': str(user_id),
                'warning_type': 'payment_failure_suspension_warning',
                'message': (
                    'Your payment has failed. Please update your payment method '
                    'within 24 hours to avoid account suspension.'
                ),
                'failure_reason': failure_reason,
            },
        )

        # Create in-app notification
        try:
            supabase.table('notifications').insert({
                'user_id': user_id,
                'type': 'billing_warning',
                'title': 'Payment Failed - Action Required',
                'message': (
                    'Your subscription payment failed. Please update your payment '
                    'method to avoid account suspension. Your account will be '
                    'suspended in 24 hours if payment is not received.'
                ),
                'severity': 'critical',
                'action_url': '/dashboard/billing',
                'created_at': datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as e:
            # notifications table may not exist yet
            logger.warning(f"warning_notification_insert_error: {e}")

        # Update retry record with warning timestamp
        supabase.table('payment_retries').update({
            'warning_sent_at': datetime.now(timezone.utc).isoformat(),
            'warning_channel': 'in_app',
        }).eq('id', retry['id']).execute()

        logger.info(f"payment_warning_sent sub={sub_id} user={user_id}")
        return True

    except Exception as e:
        logger.error(f"send_warning_error sub={sub_id}: {e}")
        return False


def _execute_suspension(retry: Dict, lifecycle, supabase) -> bool:
    """
    Day 3 Action: Suspend the account.

    Before suspending, check one more time if payment was recovered.
    """
    sub_id = retry['subscription_id']

    # Final check: is the subscription still in a failed state?
    sub = supabase.table('subscriptions').select('status').eq(
        'id', sub_id
    ).single().execute()

    if not sub.data:
        return False

    current_status = sub.data['status']

    # If already active, payment was recovered — skip suspension
    if current_status == 'active':
        logger.info(f"suspension_skipped sub={sub_id} already_active")
        return True

    # If already suspended/cancelled, nothing to do
    if current_status in ('suspended', 'cancelled'):
        return True

    return lifecycle.suspend_subscription(
        subscription_id=sub_id,
        reason='Payment not received after 3-day recovery period',
        triggered_by='retry_engine',
    )


# =============================================================================
# GRACE PERIOD EXPIRY
# =============================================================================

def _expire_grace_periods(lifecycle) -> int:
    """Find and expire subscriptions past their grace_period_end."""
    expired_subs = lifecycle.get_expired_grace_periods()
    count = 0

    for sub in expired_subs:
        try:
            success = lifecycle.expire_grace_period(sub['id'])
            if success:
                count += 1
                logger.warning(
                    f"grace_period_expired sub={sub['id']} user={sub['user_id']}"
                )
        except Exception as e:
            logger.error(f"grace_expiry_error sub={sub['id']}: {e}")

    return count


# =============================================================================
# STALE UPGRADE CLEANUP
# =============================================================================

def _cleanup_stale_upgrades() -> int:
    """Delegate to UpgradeOrchestrator's cleanup."""
    try:
        from services.upgrade_orchestrator import get_upgrade_orchestrator
        orchestrator = get_upgrade_orchestrator()
        return orchestrator.cleanup_stale_upgrades()
    except Exception as e:
        logger.error(f"stale_upgrade_cleanup_error: {e}")
        return 0


# =============================================================================
# RAZORPAY STATE SYNC (Every 6 hours)
# =============================================================================

@shared_task(
    name='tasks.billing_monitor.sync_razorpay_state',
    bind=True,
    max_retries=1,
    soft_time_limit=600,
    time_limit=900,
)
def sync_razorpay_state(self) -> Dict[str, Any]:
    """
    Periodic sync: Verify subscription state with Razorpay API.

    Catches cases where webhooks were missed, delayed, or lost.
    Runs every 6 hours as a safety net.
    """
    if not _acquire_monitor_lock('razorpay_sync', ttl_seconds=900):
        return {'status': 'skipped', 'reason': 'locked'}

    summary = {'synced': 0, 'mismatches': 0, 'errors': 0}

    try:
        from supabase_client import get_supabase_client
        from services.subscription_lifecycle import get_lifecycle_engine
        from routes.payments import razorpay_client

        supabase = get_supabase_client()
        lifecycle = get_lifecycle_engine()

        # Get all active/past_due/grace_period subscriptions with Razorpay IDs
        result = supabase.table('subscriptions').select(
            'id, user_id, status, razorpay_subscription_id, product_domain'
        ).in_(
            'status', ['active', 'past_due', 'grace_period', 'trialing']
        ).not_.is_(
            'razorpay_subscription_id', 'null'
        ).limit(200).execute()

        for sub in (result.data or []):
            rzp_sub_id = sub['razorpay_subscription_id']
            try:
                rzp_sub = razorpay_client.subscription.fetch(rzp_sub_id)
                rzp_status = rzp_sub.get('status', '')

                our_status = sub['status']
                mismatch = False

                # Check for mismatches
                if rzp_status == 'halted' and our_status != 'halted':
                    lifecycle.handle_halt(sub['id'])
                    mismatch = True

                elif rzp_status == 'cancelled' and our_status not in ('cancelled', 'expired'):
                    lifecycle.handle_cancellation(sub['id'])
                    mismatch = True

                elif rzp_status in ('active', 'authenticated') and our_status in ('past_due', 'grace_period'):
                    lifecycle.handle_payment_success(
                        subscription_id=sub['id'],
                        period_start=_parse_ts(rzp_sub.get('current_start')),
                        period_end=_parse_ts(rzp_sub.get('current_end')),
                    )
                    mismatch = True

                elif rzp_status == 'paused' and our_status != 'paused':
                    lifecycle.handle_pause(sub['id'])
                    mismatch = True

                if mismatch:
                    summary['mismatches'] += 1
                    logger.warning(
                        f"razorpay_sync_mismatch sub={sub['id']} "
                        f"our={our_status} razorpay={rzp_status}"
                    )

                summary['synced'] += 1

            except Exception as e:
                summary['errors'] += 1
                logger.error(f"razorpay_sync_error sub={sub['id']}: {e}")

        logger.info(
            f"razorpay_sync_complete synced={summary['synced']} "
            f"mismatches={summary['mismatches']} errors={summary['errors']}"
        )

        return summary

    except Exception as e:
        logger.error(f"razorpay_sync_fatal: {e}", exc_info=True)
        return {'status': 'error', 'error': str(e)[:200]}

    finally:
        _release_monitor_lock('razorpay_sync')


# =============================================================================
# MRR REPORTING (Daily)
# =============================================================================

@shared_task(
    name='tasks.billing_monitor.generate_mrr_report',
    bind=True,
    max_retries=0,
    soft_time_limit=120,
    time_limit=300,
)
def generate_mrr_report(self) -> Dict[str, Any]:
    """
    Generate daily MRR (Monthly Recurring Revenue) report.

    Calculates:
    - Total active subscriptions by plan
    - MRR by plan
    - Failed payments count
    - Suspended accounts count
    - Churn rate
    """
    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()

        # Count subscriptions by status
        status_counts = {}
        for status in ['active', 'past_due', 'grace_period', 'suspended',
                       'cancelled', 'halted', 'paused', 'expired']:
            result = supabase.table('subscriptions').select(
                'id', count='exact'
            ).eq('status', status).execute()
            status_counts[status] = result.count or 0

        # Count by plan (active only)
        plan_counts = {}
        plans_result = supabase.table('subscriptions').select(
            'plan_name'
        ).eq('status', 'active').execute()

        for sub in (plans_result.data or []):
            plan = sub.get('plan_name', 'unknown')
            plan_counts[plan] = plan_counts.get(plan, 0) + 1

        # Get MRR from pricing_plans
        mrr_by_plan = {}
        for plan_slug, count in plan_counts.items():
            try:
                pricing = supabase.table('pricing_plans').select(
                    'amount_paise'
                ).eq('plan_slug', plan_slug).eq(
                    'is_active', True
                ).limit(1).execute()

                if pricing.data:
                    amount = pricing.data[0].get('amount_paise', 0)
                    mrr_by_plan[plan_slug] = {
                        'count': count,
                        'amount_paise': amount,
                        'mrr_paise': amount * count,
                    }
            except Exception:
                pass

        total_mrr = sum(p['mrr_paise'] for p in mrr_by_plan.values())

        # Recent failures (last 24h)
        yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        failures = supabase.table('billing_events').select(
            'id', count='exact'
        ).eq('event_type', 'payment.failed').gte(
            'created_at', yesterday
        ).execute()

        report = {
            'report_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            'status_counts': status_counts,
            'plan_counts': plan_counts,
            'mrr_by_plan': mrr_by_plan,
            'total_mrr_paise': total_mrr,
            'total_mrr_display': f"₹{total_mrr / 100:,.0f}",
            'payment_failures_24h': failures.count or 0,
            'total_active': status_counts.get('active', 0),
            'total_at_risk': (
                status_counts.get('past_due', 0) +
                status_counts.get('grace_period', 0)
            ),
            'total_suspended': status_counts.get('suspended', 0),
        }

        logger.info(
            f"mrr_report active={report['total_active']} "
            f"mrr={report['total_mrr_display']} "
            f"at_risk={report['total_at_risk']} "
            f"suspended={report['total_suspended']}"
        )

        return report

    except Exception as e:
        logger.error(f"mrr_report_error: {e}", exc_info=True)
        return {'status': 'error', 'error': str(e)[:200]}


# =============================================================================
# HELPER
# =============================================================================

def _parse_ts(ts) -> Optional[str]:
    """Convert Razorpay unix timestamp to ISO string."""
    if not ts:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        return str(ts)
    except Exception:
        return None
