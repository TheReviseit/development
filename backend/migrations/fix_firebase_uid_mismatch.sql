-- ============================================================================
-- Firebase UID Sync Migration
-- ============================================================================
-- Purpose: Fix firebase_uid mismatch between Supabase users table and 
--          actual Firestore document IDs
-- 
-- This ensures fast, direct lookups instead of slow fallback searches
-- ============================================================================

-- STEP 1: Backup current data (IMPORTANT!)
-- Run this first to save current state
CREATE TABLE IF NOT EXISTS users_backup_20260123 AS 
SELECT * FROM users;

-- Verify backup
SELECT COUNT(*) as backup_count FROM users_backup_20260123;


-- STEP 2: Fix your current user (the one having issues)
-- This is the specific fix for your test account
UPDATE users 
SET firebase_uid = '1M7YhaHxo9YAWh0pgb2SSx9N6x52'
WHERE id = 'da42b78b-23da-4ca8-b795-2bd892aab9c5';

-- Verify the update
SELECT id, firebase_uid, email FROM users 
WHERE id = 'da42b78b-23da-4ca8-b795-2bd892aab9c5';


-- STEP 3: Future-proof - Add constraint to prevent mismatches
-- This ensures firebase_uid is always set correctly for new users
-- (Already exists in your schema, but good to verify)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'users_firebase_uid_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_firebase_uid_unique UNIQUE (firebase_uid);
    END IF;
END $$;


-- STEP 4: Verification queries
-- Run these to check everything is correct

-- Check for any NULL firebase_uid values
SELECT id, email, firebase_uid 
FROM users 
WHERE firebase_uid IS NULL;

-- Check for duplicate firebase_uid values  
SELECT firebase_uid, COUNT(*) as count
FROM users
GROUP BY firebase_uid
HAVING COUNT(*) > 1;

-- List all users with their firebase_uid
SELECT id, firebase_uid, email, full_name, created_at
FROM users
ORDER BY created_at DESC;


-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if something goes wrong)
-- ============================================================================
-- If you need to restore the original data:
-- 
-- UPDATE users SET firebase_uid = users_backup_20260123.firebase_uid
-- FROM users_backup_20260123
-- WHERE users.id = users_backup_20260123.id;
-- ============================================================================


-- ============================================================================
-- NOTES FOR PRODUCTION
-- ============================================================================
-- 1. This migration only needs to run ONCE
-- 2. All future users will automatically get correct firebase_uid from signup
-- 3. If you have multiple users with mismatches, you'll need to:
--    a. Export all Firestore document IDs
--    b. Match them with Supabase user emails
--    c. Run batch UPDATE statements
-- ============================================================================
