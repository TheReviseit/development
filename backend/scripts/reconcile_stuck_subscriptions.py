#!/usr/bin/env python3
"""
Reconcile stuck subscriptions — cross-check Razorpay vs local DB.

Usage:
  python backend/scripts/reconcile_stuck_subscriptions.py --dry-run
  python backend/scripts/reconcile_stuck_subscriptions.py --apply
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
logger = logging.getLogger('reconcile_stuck_subscriptions')

STUCK_STATUSES = ('pending', 'created', 'initiated')
CHECKOUT_STUCK_STATUSES = ('initiated', 'processing')
RAZORPAY_PAID_STATUSES = ('active', 'authenticated', 'completed')


def fetch_stuck_checkout_requests(db, min_age_minutes: int):
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=min_age_minutes)).isoformat()
    result = db.table('checkout_requests').select(
        'id, checkout_token, user_id, domain, status, razorpay_subscription_id, updated_at'
    ).in_('status', list(CHECKOUT_STUCK_STATUSES)).lt('updated_at', cutoff).execute()
    return result.data or []


def fetch_stuck_subscriptions(db, min_age_minutes: int):
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=min_age_minutes)).isoformat()
    result = db.table('subscriptions').select(
        'id, user_id, product_domain, status, razorpay_subscription_id, plan_name, updated_at'
    ).in_('status', list(STUCK_STATUSES)).not_.is_(
        'razorpay_subscription_id', 'null'
    ).lt('updated_at', cutoff).execute()
    return result.data or []


def fetch_razorpay_status(rzp_sub_id: str) -> str | None:
    try:
        from routes.payments import get_razorpay_client
        client = get_razorpay_client()
        if not client:
            return None
        sub = client.subscription.fetch(rzp_sub_id)
        return (sub or {}).get('status')
    except Exception as e:
        logger.warning(f"razorpay_fetch_failed sub={rzp_sub_id}: {e}")
        return None


def activate_subscription(sub: dict, dry_run: bool) -> bool:
    if dry_run:
        logger.info(
            f"[DRY-RUN] Would activate sub={sub['id']} "
            f"rzp={sub.get('razorpay_subscription_id')} domain={sub.get('product_domain')}"
        )
        return True
    try:
        from services.subscription_lifecycle import get_lifecycle_engine
        engine = get_lifecycle_engine()
        engine.handle_payment_success(
            subscription_id=sub['id'],
            razorpay_payment_id=None,
            razorpay_event_id=f"backfill_{sub['id'][:8]}",
        )
        db = __import__('supabase_client', fromlist=['get_supabase_client']).get_supabase_client()
        db.table('billing_events').insert({
            'event_type': 'reconciliation_backfill',
            'user_id': sub.get('user_id'),
            'tenant_id': sub.get('product_domain'),
            'metadata': {
                'subscription_id': sub['id'],
                'razorpay_subscription_id': sub.get('razorpay_subscription_id'),
                'actor': 'reconciliation_backfill',
            },
        }).execute()
        logger.info(f"activated sub={sub['id']}")
        return True
    except Exception as e:
        logger.error(f"activation_failed sub={sub['id']}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Reconcile stuck subscriptions against Razorpay')
    parser.add_argument('--dry-run', action='store_true', default=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--min-age-minutes', type=int, default=30)
    args = parser.parse_args()
    dry_run = not args.apply

    from supabase_client import get_supabase_client
    db = get_supabase_client()

    stuck = fetch_stuck_subscriptions(db, args.min_age_minutes)
    logger.info(f"Found {len(stuck)} stuck subscriptions (age > {args.min_age_minutes}m)")

    stuck_checkouts = fetch_stuck_checkout_requests(db, args.min_age_minutes)
    logger.info(
        f"Found {len(stuck_checkouts)} stuck checkout_requests in "
        f"{CHECKOUT_STUCK_STATUSES} (age > {args.min_age_minutes}m)"
    )

    activated = 0
    skipped = 0
    for sub in stuck:
        rzp_id = sub.get('razorpay_subscription_id')
        if not rzp_id:
            skipped += 1
            continue
        rzp_status = fetch_razorpay_status(rzp_id)
        if rzp_status in RAZORPAY_PAID_STATUSES:
            if activate_subscription(sub, dry_run):
                activated += 1
        else:
            logger.info(
                f"skip sub={sub['id']} local={sub.get('status')} razorpay={rzp_status}"
            )
            skipped += 1

    for checkout in stuck_checkouts:
        token = checkout.get('checkout_token', '')[:12]
        logger.info(
            f"[{'DRY-RUN' if dry_run else 'APPLY'}] stuck checkout token={token}... "
            f"status={checkout.get('status')} domain={checkout.get('domain')}"
        )

    logger.info(f"Done: activated={activated} skipped={skipped} dry_run={dry_run}")


if __name__ == '__main__':
    main()
