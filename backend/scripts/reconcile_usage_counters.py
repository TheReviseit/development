"""
Usage Counter Reconciliation Script
====================================
Fixes usage_counters.current_value drift by counting actual non-deleted
products per user and resetting the counter to match.

Run this script to fix existing counter drift caused by:
- Failed product inserts (counter incremented but insert failed)
- Product deletions (counter not decremented)
- UID type mismatches (counters keyed by wrong user_id)

Usage:
    cd backend
    python scripts/reconcile_usage_counters.py
    python scripts/reconcile_usage_counters.py --dry-run  # Preview only
"""

import argparse
import logging
import sys
from supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger('reconcile_counters')


def reconcile_product_counters(dry_run: bool = False):
    """
    For each usage_counter row where feature_key='create_product':
    1. Find the user's Supabase UUID
    2. Count actual non-deleted products for that user
    3. If counter != actual count, update the counter
    """
    db = get_supabase_client()

    # 1. Get all create_product usage counters
    counters = db.table('usage_counters').select(
        'id, user_id, domain, feature_key, current_value'
    ).eq('feature_key', 'create_product').execute()

    if not counters.data:
        logger.info("No create_product usage counters found.")
        return

    logger.info(f"Found {len(counters.data)} create_product counter(s)")

    fixed = 0
    correct = 0
    errors = 0

    for counter in counters.data:
        user_id = counter['user_id']
        counter_value = counter['current_value'] or 0
        domain = counter.get('domain', 'shop')

        try:
            # 2. Resolve user ID to Firebase UID for product count
            # products.user_id stores Firebase UID
            user_result = db.table('users').select(
                'firebase_uid'
            ).eq('id', user_id).limit(1).execute()

            if user_result.data:
                firebase_uid = user_result.data[0]['firebase_uid']
            else:
                # user_id might already be a Firebase UID (legacy)
                firebase_uid = user_id

            # 3. Count actual non-deleted products
            products_result = db.table('products').select(
                'id', count='exact'
            ).eq('user_id', firebase_uid).execute()

            actual_count = products_result.count if products_result.count is not None else len(products_result.data or [])

            if counter_value != actual_count:
                logger.warning(
                    f"  DRIFT: user={user_id} | counter={counter_value} | actual={actual_count} | delta={counter_value - actual_count}"
                )

                if not dry_run:
                    db.table('usage_counters').update({
                        'current_value': actual_count
                    }).eq('id', counter['id']).execute()
                    logger.info(f"  ✅ Fixed: {counter_value} → {actual_count}")

                fixed += 1
            else:
                logger.info(f"  OK: user={user_id} | counter={counter_value} == actual={actual_count}")
                correct += 1

        except Exception as e:
            logger.error(f"  ❌ Error for user={user_id}: {e}")
            errors += 1

    logger.info(f"\n{'='*60}")
    logger.info(f"RECONCILIATION {'(DRY RUN) ' if dry_run else ''}COMPLETE")
    logger.info(f"  Correct: {correct}")
    logger.info(f"  Fixed:   {fixed}")
    logger.info(f"  Errors:  {errors}")
    logger.info(f"{'='*60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reconcile usage counters with actual product counts")
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without applying')
    args = parser.parse_args()

    reconcile_product_counters(dry_run=args.dry_run)
