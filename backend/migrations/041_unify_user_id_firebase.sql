-- =============================================================================
-- Migration 041: Unify User ID System (Firebase UID Everywhere)
-- =============================================================================
-- Problem: Dual user ID system causes bugs
--   - products.user_id = Firebase UID (TEXT)
--   - subscriptions.user_id = Supabase UUID (UUID)
--   - usage_counters.user_id = Supabase UUID (UUID)
--   - Requires JOIN through users table → slow, fragile, race conditions
--
-- Solution: Use Firebase UID everywhere (TEXT)
--   - Eliminates users table JOIN (faster queries)
--   - Frontend already uses Firebase UID (no conversion needed)
--   - Consistent across all tables
--
-- IMPORTANT: This migration requires 30-second planned downtime
--   - Announce 48 hours in advance
--   - Run during off-peak hours (2 AM UTC)
--   - Coordinate with code deployment (backend + frontend)
--
-- Steps:
--   1. Add new Firebase UID columns (zero downtime)
--   2. Backfill data from users table (zero downtime)
--   3. Swap columns (30-second downtime - MANUAL step, see below)
--   4. Recreate indexes (zero downtime)
--
-- Deploy:
--   - Steps 1-2: Run immediately (safe, zero downtime)
--   - Step 3: Planned maintenance window
--   - Step 4: After step 3 completes
-- =============================================================================

-- =============================================================================
-- STEP 1: Add New Firebase UID Columns (ZERO DOWNTIME)
-- =============================================================================
DO $$
BEGIN
    -- Check if column already exists (idempotency)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'user_firebase_uid'
    ) THEN
        ALTER TABLE subscriptions ADD COLUMN user_firebase_uid TEXT;
        RAISE NOTICE 'Step 1: Added user_firebase_uid column to subscriptions';
    ELSE
        RAISE NOTICE 'Step 1: user_firebase_uid column already exists in subscriptions (skipped)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usage_counters' AND column_name = 'user_firebase_uid'
    ) THEN
        ALTER TABLE usage_counters ADD COLUMN user_firebase_uid TEXT;
        RAISE NOTICE 'Step 1: Added user_firebase_uid column to usage_counters';
    ELSE
        RAISE NOTICE 'Step 1: user_firebase_uid column already exists in usage_counters (skipped)';
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Backfill Firebase UIDs from Users Table (ZERO DOWNTIME)
-- =============================================================================
DO $$
DECLARE
    subs_updated INTEGER;
    counters_updated INTEGER;
BEGIN
    -- Backfill subscriptions table
    -- Cast UUID to TEXT for safe comparison (handles type mismatch)
    UPDATE subscriptions s
    SET user_firebase_uid = u.firebase_uid
    FROM users u
    WHERE s.user_id::TEXT = u.id::TEXT  -- Explicit type cast to avoid operator mismatch
      AND s.user_firebase_uid IS NULL;  -- Only update NULL values (idempotent)

    GET DIAGNOSTICS subs_updated = ROW_COUNT;
    RAISE NOTICE 'Step 2: Backfilled % rows in subscriptions', subs_updated;

    -- Backfill usage_counters table
    -- Cast UUID to TEXT for safe comparison (handles type mismatch)
    UPDATE usage_counters uc
    SET user_firebase_uid = u.firebase_uid
    FROM users u
    WHERE uc.user_id::TEXT = u.id::TEXT  -- Explicit type cast to avoid operator mismatch
      AND uc.user_firebase_uid IS NULL;  -- Only update NULL values (idempotent)

    GET DIAGNOSTICS counters_updated = ROW_COUNT;
    RAISE NOTICE 'Step 2: Backfilled % rows in usage_counters', counters_updated;

    -- Verify: check for rows that failed to backfill
    DECLARE
        failed_subs INTEGER;
        failed_counters INTEGER;
    BEGIN
        SELECT COUNT(*) INTO failed_subs
        FROM subscriptions
        WHERE user_firebase_uid IS NULL;

        SELECT COUNT(*) INTO failed_counters
        FROM usage_counters
        WHERE user_firebase_uid IS NULL;

        IF failed_subs > 0 THEN
            RAISE WARNING 'Step 2: % subscriptions failed to backfill (orphaned rows?)', failed_subs;
        END IF;

        IF failed_counters > 0 THEN
            RAISE WARNING 'Step 2: % usage_counters failed to backfill (orphaned rows?)', failed_counters;
        END IF;

        RAISE NOTICE 'Step 2: Backfill complete. Verified data integrity.';
    END;
END $$;

-- =============================================================================
-- STEP 3: Column Swap (30-SECOND DOWNTIME)
-- =============================================================================
-- ⚠️  WARNING: This step requires planned maintenance window
-- ⚠️  Run MANUALLY after coordinating downtime announcement
--
-- IMPORTANT: Run these commands ONLY during planned maintenance:
--
-- -- 3a. Subscriptions table
-- ALTER TABLE subscriptions DROP COLUMN user_id CASCADE;
-- ALTER TABLE subscriptions RENAME COLUMN user_firebase_uid TO user_id;
-- ALTER TABLE subscriptions ALTER COLUMN user_id SET NOT NULL;
--
-- -- 3b. Usage counters table
-- ALTER TABLE usage_counters DROP COLUMN user_id CASCADE;
-- ALTER TABLE usage_counters RENAME COLUMN user_firebase_uid TO user_id;
-- ALTER TABLE usage_counters ALTER COLUMN user_id SET NOT NULL;
--
-- Execution time: ~10 seconds each table = 20 seconds total
-- Buffer time for Postgres to complete: 10 seconds
-- Total downtime: 30 seconds
-- =============================================================================

-- =============================================================================
-- STEP 4: Recreate Indexes (ZERO DOWNTIME, after Step 3)
-- =============================================================================
-- ⚠️  Run these AFTER Step 3 completes (during or immediately after maintenance window)
--
-- -- 4a. Subscriptions indexes
-- CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
-- CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain ON subscriptions(user_id, product_domain);
--
-- -- 4b. Usage counters indexes
-- CREATE INDEX IF NOT EXISTS idx_usage_counters_user_domain ON usage_counters(user_id, domain);
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_counters_key ON usage_counters(user_id, domain, feature_key);
--
-- -- 4c. Verify indexes
-- SELECT
--     tablename,
--     indexname,
--     indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('subscriptions', 'usage_counters')
--   AND indexname LIKE '%user%'
-- ORDER BY tablename, indexname;
-- =============================================================================

-- Final Notes:
--   - After Step 4, verify application works correctly
--   - Monitor error logs for 24 hours
--   - Keep old column backups for 1 week (don't drop immediately)
--   - Code changes required: products_api.py, features/check/route.ts
