-- =============================================================================
-- Migration 040: Fix Business Table Duplicates
-- =============================================================================
-- One-time cleanup to remove duplicate business entries and enforce single
-- business record per user.
--
-- Context:
--   The businesses table has user_id as UNIQUE, but there may be edge cases
--   where duplicates were created (e.g., race conditions, migration issues).
--   This migration ensures exactly one business record per user_id.
--
-- Safety:
--   - Identifies duplicate user_id entries
--   - Keeps the most recently updated record
--   - Deletes older duplicates
--   - Safe to re-run (idempotent)
-- =============================================================================

-- Step 1: Identify and log duplicate user_ids
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT user_id
        FROM businesses
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % user_ids with duplicate business records', duplicate_count;
    ELSE
        RAISE NOTICE 'No duplicate business records found';
    END IF;
END $$;

-- Step 2: Delete duplicate records, keeping only the most recent one
DELETE FROM businesses
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            user_id,
            updated_at,
            ROW_NUMBER() OVER (
                PARTITION BY user_id 
                ORDER BY updated_at DESC, created_at DESC, id DESC
            ) as row_num
        FROM businesses
    ) ranked
    WHERE row_num > 1
);

-- Step 3: Verify cleanup was successful
DO $$
DECLARE
    remaining_duplicates INTEGER;
    total_businesses INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_duplicates
    FROM (
        SELECT user_id
        FROM businesses
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) duplicates;
    
    SELECT COUNT(*) INTO total_businesses
    FROM businesses;
    
    IF remaining_duplicates > 0 THEN
        RAISE EXCEPTION 'Cleanup failed: % duplicate entries still exist', remaining_duplicates;
    ELSE
        RAISE NOTICE '✅ Cleanup successful: % unique business records, 0 duplicates', total_businesses;
    END IF;
END $$;

-- Step 4: Add index to ensure fast lookups and prevent future duplicates
-- (UNIQUE constraint already exists, but let's ensure it's present)
DO $$
BEGIN
    -- Drop existing index if it exists
    DROP INDEX IF EXISTS idx_businesses_user_id;
    
    -- Recreate as UNIQUE index for extra safety
    CREATE UNIQUE INDEX idx_businesses_user_id ON businesses(user_id);
    
    RAISE NOTICE '✅ UNIQUE index created on businesses.user_id';
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists';
END $$;

-- Step 5: Add comment documenting the fix
COMMENT ON COLUMN businesses.user_id IS 
    'Firebase UID (string format) - UNIQUE constraint enforced. Migration 040 cleaned up duplicates.';
