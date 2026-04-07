-- Remove foreign key constraint from free_trials to auth.users
-- The trial system should work even without the FK since we use our users table
-- Run in Supabase SQL Editor

-- First check if constraint exists
SELECT conname FROM pg_constraint WHERE conname = 'free_trials_user_id_fkey';

-- Drop the foreign key constraint
ALTER TABLE free_trials DROP CONSTRAINT IF EXISTS free_trials_user_id_fkey;

-- Also drop org_id constraint if exists
ALTER TABLE free_trials DROP CONSTRAINT IF EXISTS free_trials_org_id_fkey;

SELECT 'FK constraints removed from free_trials' as result;