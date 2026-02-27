-- =============================================================================
-- Migration 040: Fix Stale Usage Counters (CRITICAL BUG FIX)
-- =============================================================================
-- Problem: Users with 0 products show "You've reached your limit"
--
-- Root Cause (from migration 039):
--   INNER JOIN products → excludes users with 0 products
--   INSERT ... ON CONFLICT never executes for users with 0 products
--   Stale usage_counters.current_value persists (e.g., still shows 10)
--
-- Fix:
--   Use LEFT JOIN → includes users with 0 products
--   COALESCE → explicitly set count to 0 for users with no products
--
-- Safety:
--   - UPSERT (INSERT ... ON CONFLICT): safe to re-run (idempotent)
--   - Only affects feature_key = 'create_product', domain = 'shop'
--   - Products table uses Firebase UID; usage_counters uses Supabase UUID
--   - Join through users table to resolve mapping
--
-- Deploy:
--   1. Test on staging first
--   2. Run on production during off-peak hours
--   3. Execution time: <1 minute
-- =============================================================================

DO $$
DECLARE
    rows_updated INTEGER;
BEGIN
    -- Backfill: for ALL users (including those with 0 products)
    -- Count their active products and upsert into usage_counters
    INSERT INTO usage_counters (user_id, domain, feature_key, current_value, period_start, reset_at)
    SELECT
        u.id AS user_id,                          -- Supabase UUID
        'shop' AS domain,
        'create_product' AS feature_key,
        COALESCE(COUNT(p.id), 0)::INTEGER AS current_value,  -- ← EXPLICIT 0 for no products
        NOW() AS period_start,
        NULL AS reset_at                          -- Lifetime counter (products don't reset monthly)
    FROM users u
    LEFT JOIN products p ON p.user_id = u.firebase_uid AND p.is_deleted = false  -- ← LEFT JOIN (was INNER JOIN)
    GROUP BY u.id
    ON CONFLICT (user_id, domain, feature_key) DO UPDATE
    SET
        current_value = EXCLUDED.current_value,   -- Overwrite with correct count
        updated_at = NOW();

    -- Log how many rows were affected
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RAISE NOTICE 'Migration 040: Updated usage_counters for % users (create_product, shop)', rows_updated;

    -- Verify: count users with 0 products that now have correct counters
    DECLARE
        users_with_zero_products INTEGER;
    BEGIN
        SELECT COUNT(*) INTO users_with_zero_products
        FROM users u
        LEFT JOIN products p ON p.user_id = u.firebase_uid AND p.is_deleted = false
        GROUP BY u.id
        HAVING COUNT(p.id) = 0;

        RAISE NOTICE 'Migration 040: % users have 0 products (should all have usage_counter = 0)', users_with_zero_products;
    END;
END $$;
