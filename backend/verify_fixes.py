#!/usr/bin/env python3
"""
Diagnostic script to verify business and product limit fixes.
Checks for:
1. Duplicate business records
2. Usage counter sync with actual product counts
3. Cache state for usage counters

Run this script after applying the fixes to verify everything is working correctly.
"""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_supabase_client
from services.feature_gate_engine import get_feature_gate_engine
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def check_business_duplicates():
    """Check for duplicate business records."""
    logger.info("=" * 60)
    logger.info("1. Checking for duplicate business records...")
    logger.info("=" * 60)
    
    db = get_supabase_client()
    
    # Query for duplicates
    result = db.rpc('execute_sql', {
        'query': """
            SELECT user_id, COUNT(*) as count
            FROM businesses
            GROUP BY user_id
            HAVING COUNT(*) > 1
        """
    }).execute()
    
    if result.data and len(result.data) > 0:
        logger.error(f"❌ FOUND {len(result.data)} DUPLICATE USER_IDS:")
        for row in result.data:
            logger.error(f"   - user_id: {row['user_id']}, count: {row['count']}")
        return False
    else:
        logger.info("✅ No duplicate business records found")
        return True


def check_usage_counter_sync():
    """Check if usage counters are in sync with actual product counts."""
    logger.info("\n" + "=" * 60)
    logger.info("2. Checking usage counter sync...")
    logger.info("=" * 60)
    
    db = get_supabase_client()
    
    # Get all users with products
    result = db.rpc('execute_sql', {
        'query': """
            SELECT 
                u.firebase_uid,
                u.id as supabase_uuid,
                uc.current_value as counter_value,
                COUNT(p.id) as actual_product_count,
                (COALESCE(uc.current_value, 0) = COUNT(p.id)) as is_in_sync
            FROM users u
            LEFT JOIN usage_counters uc ON uc.user_id = u.id 
                AND uc.domain = 'shop' 
                AND uc.feature_key = 'create_product'
            LEFT JOIN products p ON p.user_id = u.firebase_uid AND p.is_deleted = false
            GROUP BY u.id, u.firebase_uid, uc.current_value
            HAVING COUNT(p.id) > 0
        """
    }).execute()
    
    if not result.data:
        logger.info("✅ No users with products found (or all counters in sync)")
        return True
    
    out_of_sync = [row for row in result.data if not row.get('is_in_sync', True)]
    
    if out_of_sync:
        logger.error(f"❌ FOUND {len(out_of_sync)} OUT-OF-SYNC COUNTERS:")
        for row in out_of_sync[:5]:  # Show first 5
            logger.error(
                f"   - User {row['firebase_uid'][:8]}...: "
                f"counter={row['counter_value']}, actual={row['actual_product_count']}"
            )
        if len(out_of_sync) > 5:
            logger.error(f"   ... and {len(out_of_sync) - 5} more")
        return False
    else:
        logger.info(f"✅ All {len(result.data)} usage counters are in sync with product counts")
        return True


def check_cache_state():
    """Check Redis cache state for usage counters."""
    logger.info("\n" + "=" * 60)
    logger.info("3. Checking cache configuration...")
    logger.info("=" * 60)
    
    try:
        from cache import get_cache
        cache = get_cache()
        
        if cache and cache._redis_available:
            logger.info("✅ Redis cache is available and connected")
            
            # Get cache stats
            stats = cache.get_stats()
            logger.info(f"   L1 hits: {stats['l1_hits']}, misses: {stats['l1_misses']}")
            logger.info(f"   L2 hits: {stats['l2_hits']}, misses: {stats['l2_misses']}")
            logger.info(f"   Hit rate: {stats['hit_rate'] * 100:.1f}%")
        else:
            logger.warning("⚠️ Redis cache is not available (using L1 only)")
        
        return True
    except Exception as e:
        logger.error(f"❌ Cache check failed: {e}")
        return False


def verify_feature_gate_engine():
    """Verify feature gate engine has cache invalidation method."""
    logger.info("\n" + "=" * 60)
    logger.info("4. Verifying feature gate engine...")
    logger.info("=" * 60)
    
    try:
        engine = get_feature_gate_engine()
        
        # Check if invalidate_usage_counter_cache method exists
        if hasattr(engine, 'invalidate_usage_counter_cache'):
            logger.info("✅ FeatureGateEngine has invalidate_usage_counter_cache method")
        else:
            logger.error("❌ FeatureGateEngine missing invalidate_usage_counter_cache method")
            return False
        
        # Check cache property
        if hasattr(engine, 'cache'):
            logger.info("✅ FeatureGateEngine has cache property")
        else:
            logger.warning("⚠️ FeatureGateEngine missing cache property")
        
        return True
    except Exception as e:
        logger.error(f"❌ Feature gate engine check failed: {e}")
        return False


def main():
    """Run all diagnostic checks."""
    logger.info("\n🔍 RUNNING DIAGNOSTIC CHECKS FOR BUSINESS AND PRODUCT LIMIT FIXES\n")
    
    results = {
        "business_duplicates": check_business_duplicates(),
        "usage_counter_sync": check_usage_counter_sync(),
        "cache_state": check_cache_state(),
        "feature_gate_engine": verify_feature_gate_engine(),
    }
    
    logger.info("\n" + "=" * 60)
    logger.info("SUMMARY")
    logger.info("=" * 60)
    
    all_passed = all(results.values())
    
    for check_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        logger.info(f"{status}: {check_name}")
    
    logger.info("=" * 60)
    
    if all_passed:
        logger.info("🎉 ALL CHECKS PASSED!")
        logger.info("\nNext steps:")
        logger.info("1. Run the migration: 040_fix_business_duplicates.sql")
        logger.info("2. Test business update in the UI")
        logger.info("3. Test product creation with limit checking")
        return 0
    else:
        logger.error("❌ SOME CHECKS FAILED - Review the output above")
        return 1


if __name__ == "__main__":
    sys.exit(main())
