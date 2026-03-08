#!/usr/bin/env python3
"""
Standalone Billing Cycle Runner
================================

Runs the full billing lifecycle check synchronously, without requiring
Celery or Redis. Designed for:

  1. Manual testing: simulate expiry → run this → verify suspension
  2. OS-level cron: schedule as a Celery-free fallback
  3. Emergency repair: force-process all overdue subscriptions

Usage:
    # Run full billing cycle
    python scripts/run_billing_cycle.py

    # Dry-run (detect but don't transition)
    python scripts/run_billing_cycle.py --dry-run

    # Verbose logging
    python scripts/run_billing_cycle.py --verbose

Cron example (every 10 minutes):
    */10 * * * * cd /app/backend && python scripts/run_billing_cycle.py >> /var/log/billing.log 2>&1
"""

import os
import sys
import argparse
import logging
from datetime import datetime, timezone, timedelta

# Add backend to path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, '.env'))


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )


def run_billing_cycle(dry_run: bool = False):
    """
    Execute the full billing cycle synchronously.

    Steps:
      1. Detect overdue subscriptions (period_end < now - 60min, still active)
      2. Transition overdue subscriptions to past_due
      3. Process pending payment retries (retry/warn/suspend)
      4. Expire grace periods → suspend
      5. Report summary

    Args:
        dry_run: If True, detect issues but don't change any data.
    """
    logger = logging.getLogger('billing_cycle')
    start = datetime.now(timezone.utc)
    mode = "DRY RUN" if dry_run else "LIVE"

    logger.info(f"{'=' * 60}")
    logger.info(f"  Billing Cycle Runner ({mode})")
    logger.info(f"  Started: {start.isoformat()}")
    logger.info(f"{'=' * 60}")

    from supabase_client import get_supabase_client
    supabase = get_supabase_client()

    summary = {
        'overdue_detected': 0,
        'overdue_transitioned': 0,
        'grace_expired': 0,
        'retries_processed': 0,
        'errors': [],
    }

    # =========================================================================
    # Step 1: Detect overdue subscriptions
    # =========================================================================
    logger.info("\n--- Step 1: Detecting overdue subscriptions ---")

    threshold = (datetime.now(timezone.utc) - timedelta(minutes=60)).isoformat()

    result = supabase.table('subscriptions').select(
        'id, user_id, product_domain, status, plan_name, '
        'current_period_end, razorpay_subscription_id'
    ).in_(
        'status', ['active', 'trialing']
    ).lt(
        'current_period_end', threshold
    ).not_.is_(
        'current_period_end', 'null'
    ).execute()

    overdue_subs = result.data or []
    summary['overdue_detected'] = len(overdue_subs)

    if not overdue_subs:
        logger.info("  ✅ No overdue subscriptions found.")
    else:
        logger.warning(f"  🚨 Found {len(overdue_subs)} overdue subscription(s):")

        for sub in overdue_subs:
            logger.warning(
                f"    - sub={sub['id'][:12]}... user={sub['user_id'][:12]}... "
                f"domain={sub.get('product_domain')} plan={sub.get('plan_name')} "
                f"period_end={sub.get('current_period_end')}"
            )

            if not dry_run:
                try:
                    from services.subscription_lifecycle import get_lifecycle_engine
                    lifecycle = get_lifecycle_engine()

                    success = lifecycle.transition_state(
                        subscription_id=sub['id'],
                        expected_state=sub['status'],
                        new_state='past_due',
                        reason=f"Billing period expired ({sub.get('current_period_end')})",
                        triggered_by='billing_cycle_script',
                        idempotency_key=f"script_overdue:{sub['id']}:{sub.get('current_period_end')}",
                    )
                    if success:
                        summary['overdue_transitioned'] += 1
                        logger.info(f"      → Transitioned to past_due ✅")
                    else:
                        logger.info(f"      → Already transitioned (idempotent)")
                except Exception as e:
                    logger.error(f"      → ERROR: {e}")
                    summary['errors'].append(str(e)[:100])

    # =========================================================================
    # Step 2: Expire grace periods
    # =========================================================================
    logger.info("\n--- Step 2: Checking expired grace periods ---")

    now_iso = datetime.now(timezone.utc).isoformat()

    grace_result = supabase.table('subscriptions').select(
        'id, user_id, product_domain, status, grace_period_end, plan_name'
    ).eq(
        'status', 'grace_period'
    ).lt(
        'grace_period_end', now_iso
    ).not_.is_(
        'grace_period_end', 'null'
    ).execute()

    expired_grace = grace_result.data or []

    if not expired_grace:
        logger.info("  ✅ No expired grace periods.")
    else:
        logger.warning(f"  🚨 Found {len(expired_grace)} expired grace period(s):")

        for sub in expired_grace:
            logger.warning(
                f"    - sub={sub['id'][:12]}... user={sub['user_id'][:12]}... "
                f"grace_end={sub.get('grace_period_end')}"
            )

            if not dry_run:
                try:
                    from services.subscription_lifecycle import get_lifecycle_engine
                    lifecycle = get_lifecycle_engine()

                    success = lifecycle.expire_grace_period(sub['id'])
                    if success:
                        summary['grace_expired'] += 1
                        logger.info(f"      → Suspended ✅")
                except Exception as e:
                    logger.error(f"      → ERROR: {e}")
                    summary['errors'].append(str(e)[:100])

    # =========================================================================
    # Step 3: Process pending retries
    # =========================================================================
    logger.info("\n--- Step 3: Processing pending payment retries ---")

    retry_result = supabase.table('payment_retries').select(
        'id, subscription_id, next_action, scheduled_at'
    ).eq(
        'status', 'pending'
    ).lte(
        'scheduled_at', now_iso
    ).order('scheduled_at').limit(50).execute()

    pending_retries = retry_result.data or []

    if not pending_retries:
        logger.info("  ✅ No pending retries due.")
    else:
        logger.info(f"  Found {len(pending_retries)} pending retry action(s):")
        for r in pending_retries:
            logger.info(
                f"    - retry={r['id'][:12]}... action={r['next_action']} "
                f"scheduled={r['scheduled_at']}"
            )

        if not dry_run:
            # Delegate to the billing monitor's retry processing
            try:
                from services.subscription_lifecycle import get_lifecycle_engine
                lifecycle = get_lifecycle_engine()

                from tasks.billing_monitor import _process_pending_retries
                count = _process_pending_retries(lifecycle)
                summary['retries_processed'] = count
                logger.info(f"  → Processed {count} retries ✅")
            except Exception as e:
                logger.error(f"  → ERROR processing retries: {e}")
                summary['errors'].append(str(e)[:100])

    # =========================================================================
    # Summary
    # =========================================================================
    elapsed = (datetime.now(timezone.utc) - start).total_seconds()

    logger.info(f"\n{'=' * 60}")
    logger.info(f"  Billing Cycle Complete ({mode})")
    logger.info(f"  Elapsed: {elapsed:.2f}s")
    logger.info(f"  Overdue detected: {summary['overdue_detected']}")
    logger.info(f"  Overdue transitioned: {summary['overdue_transitioned']}")
    logger.info(f"  Grace periods expired: {summary['grace_expired']}")
    logger.info(f"  Retries processed: {summary['retries_processed']}")
    logger.info(f"  Errors: {len(summary['errors'])}")
    if summary['errors']:
        for err in summary['errors']:
            logger.error(f"    - {err}")
    logger.info(f"{'=' * 60}")

    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run billing cycle manually')
    parser.add_argument('--dry-run', action='store_true',
                        help='Detect issues without making changes')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Enable debug logging')
    args = parser.parse_args()

    setup_logging(verbose=args.verbose)
    run_billing_cycle(dry_run=args.dry_run)
