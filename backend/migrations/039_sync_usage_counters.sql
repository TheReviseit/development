-- =============================================================================
-- Migration 039: Backfill usage_counters from products table
-- =============================================================================
-- One-time sync to bring usage_counters in line with actual product counts.
--
-- Context:
--   Before this migration, the frontend POST /api/products route created
--   products WITHOUT incrementing usage_counters. The backend FeatureGateEngine
--   (used by showcase_items) DID increment usage_counters. This created
--   split-brain: usage_counters was always under-counted.
--
--   After this migration:
--     1. usage_counters.current_value = actual product count per user
--     2. All product creation flows through Flask @require_limit (atomic)
--     3. usage_counters is the single source of truth — never count rows again
--
-- Safety:
--   - UPSERT (INSERT ... ON CONFLICT): safe to re-run
--   - Only affects feature_key = 'create_product', domain = 'shop'
--   - Products table uses Firebase UID as user_id; usage_counters uses Supabase UUID.
--     We join through the users table to resolve.
-- =============================================================================

-- Backfill: for each user, count their active products, upsert into usage_counters
INSERT INTO usage_counters (user_id, domain, feature_key, current_value, period_start, reset_at)
SELECT
    u.id AS user_id,           -- Supabase UUID
    'shop' AS domain,
    'create_product' AS feature_key,
    COUNT(p.id)::INTEGER AS current_value,
    NOW() AS period_start,
    NULL AS reset_at           -- Lifetime counter (products don't reset monthly)
FROM users u
JOIN products p ON p.user_id = u.firebase_uid
WHERE p.is_deleted = false
GROUP BY u.id
ON CONFLICT (user_id, domain, feature_key) DO UPDATE
SET
    current_value = EXCLUDED.current_value,
    updated_at = NOW();

-- Log how many users were backfilled
DO $$
DECLARE
    backfilled_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO backfilled_count
    FROM usage_counters
    WHERE domain = 'shop' AND feature_key = 'create_product';

    RAISE NOTICE 'Backfilled usage_counters for % users (create_product, shop)', backfilled_count;
END $$;
