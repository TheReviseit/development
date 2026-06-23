"""
Backfill Script: Seed subscription.created Events for Existing Subscriptions
============================================================================
Creates subscription.created events for ALL existing subscriptions that do
not yet have one. This is required BEFORE the reconciliation engine goes
live — without it, the engine will see every subscription as having zero
events and auto-heal them incorrectly.

This script is idempotent and safe to re-run: it skips any subscription
that already has a subscription.created event.

Usage:
    python migrations/backfill_subscription_events.py           # dry run
    python migrations/backfill_subscription_events.py --apply   # live

Design:
  - Reads all subscriptions from the DB in chunks of 500
  - Checks if each subscription already has a subscription.created event
  - Inserts missing events with actor='backfill_script'
  - Adjusts event.created_at to match the original subscription.created_at
  - Writes a summary report to stdout
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
logger = logging.getLogger('backfill')

BATCH_SIZE = 500


def get_supabase():
    """Get supabase client (lazy import to avoid startup failures)."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__))))
    from supabase_client import get_supabase_client
    return get_supabase_client()


def get_db():
    """Get supabase client, handle dotenv early."""
    from dotenv import load_dotenv
    load_dotenv()
    return get_supabase()


def run_backfill(dry_run: bool = True) -> dict:
    """
    Backfill subscription.created events for existing subscriptions.

    Returns summary dict.
    """
    db = get_db()
    stats = {
        'total_subscriptions': 0,
        'already_have_event': 0,
        'missing_events': 0,
        'events_created': 0,
        'errors': 0,
    }

    # 1. Count all subscriptions
    count_result = db.table('subscriptions') \
        .select('id', count='exact') \
        .execute()

    total = count_result.count if hasattr(count_result, 'count') else 0
    if not total:
        logger.info("No subscriptions found. Nothing to backfill.")
        return stats

    stats['total_subscriptions'] = total
    logger.info(f"Found {total} subscriptions to process")

    # 2. Stream through all subscriptions
    offset = 0
    while offset < total:
        subs = db.table('subscriptions') \
            .select('id, user_id, product_domain, pricing_plan_id, plan_name, status, created_at') \
            .order('created_at') \
            .range(offset, offset + BATCH_SIZE - 1) \
            .execute()

        batch = subs.data or []
        if not batch:
            break

        for sub in batch:
            try:
                sub_id = sub['id']
                user_id = sub.get('user_id')
                domain = sub.get('product_domain')
                status = sub.get('status', 'unknown')
                created_at = sub.get('created_at')

                if not user_id or not domain:
                    stats['errors'] += 1
                    logger.warning(f"Skip sub={sub_id}: missing user_id or domain")
                    continue

                # Check if event already exists
                existing = db.table('subscription_events') \
                    .select('id') \
                    .eq('subscription_id', sub_id) \
                    .eq('event_type', 'subscription.created') \
                    .limit(1) \
                    .execute()

                if existing.data:
                    stats['already_have_event'] += 1
                    continue

                stats['missing_events'] += 1

                if dry_run:
                    logger.info(
                        f"[DRY RUN] Would create subscription.created "
                        f"sub={sub_id} user={user_id} domain={domain} "
                        f"status={status} created_at={created_at}"
                    )
                    continue

                # Insert the event
                event_data = {
                    'subscription_id': sub_id,
                    'user_id': user_id,
                    'product_domain': domain,
                    'event_type': 'subscription.created',
                    'previous_status': None,
                    'new_status': status,
                    'reason': 'backfill: existing subscription',
                    'triggered_by': 'backfill_script',
                    'actor': 'backfill_script',
                    'payload': {
                        'pricing_plan_id': sub.get('pricing_plan_id'),
                        'plan_name': sub.get('plan_name'),
                        'status': status,
                        'backfilled': True,
                    },
                    'created_at': created_at,
                }

                db.table('subscription_events').insert(event_data).execute()
                stats['events_created'] += 1

                if stats['events_created'] % 100 == 0:
                    logger.info(f"Progress: {stats['events_created']} events created")

            except Exception as e:
                stats['errors'] += 1
                logger.error(f"Error processing sub={sub.get('id')}: {e}")

        offset += BATCH_SIZE
        logger.info(f"Processed offset {offset}/{total}")

    # 3. Update projection checkpoint to include backfilled events
    if not dry_run and stats['events_created'] > 0:
        try:
            latest_event = db.table('subscription_events') \
                .select('id') \
                .order('id', desc=True) \
                .limit(1) \
                .execute()

            if latest_event.data:
                max_id = latest_event.data[0]['id']
                db.table('projection_checkpoints') \
                    .update({
                        'last_processed_event_id': max_id,
                        'last_processed_at': datetime.now(timezone.utc).isoformat(),
                    }) \
                    .eq('projector_name', 'subscription_status') \
                    .execute()
                logger.info(f"Projection checkpoint updated to event_id={max_id}")
        except Exception as e:
            logger.error(f"Failed to update projection checkpoint: {e}")

    return stats


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description='Backfill subscription.created events for existing subscriptions'
    )
    parser.add_argument('--apply', action='store_true', help='Apply backfill (default: dry run)')
    args = parser.parse_args()

    dry_run = not args.apply

    print("=" * 60)
    print("Backfill: Subscription Events for Existing Subscriptions")
    print("=" * 60)
    if dry_run:
        print("  MODE: DRY RUN (pass --apply to execute)")
    else:
        print("  MODE: LIVE")
    print("=" * 60)

    start = time.time()
    stats = run_backfill(dry_run=dry_run)
    elapsed = time.time() - start

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Total subscriptions found:   {stats['total_subscriptions']}")
    print(f"  Already have created event:  {stats['already_have_event']}")
    print(f"  Missing events (need backfill): {stats['missing_events']}")
    if not dry_run:
        print(f"  Events created:              {stats['events_created']}")
    print(f"  Errors:                      {stats['errors']}")
    print(f"  Duration:                    {elapsed:.1f}s")
    print("=" * 60)

    if dry_run and stats['missing_events'] > 0:
        print()
        print(f"Run with --apply to backfill {stats['missing_events']} events.")
        print("Backfill must be done AFTER the migration is applied.")
        print("Backfill must be done BEFORE the reconciliation engine runs.")


if __name__ == '__main__':
    main()
