-- ===================================================================
-- Migration 20260620001000: Fix razorpay_customers.user_id type
-- ===================================================================
-- Problem: razorpay_customers.user_id is UUID REFERENCES auth.users(id),
-- but the subscription_worker passes Firebase UIDs (e.g. "SwxC0s0...")
-- instead of Supabase UUIDs. This causes PostgreSQL error 22P02
-- ("invalid input syntax for type uuid") on every create-subscription call.
--
-- Fix: Change user_id to TEXT so both Firebase UIDs and Supabase UUIDs
-- can be stored. This table is a cache/mapping table, not a core
-- referential entity — the FK constraint is unnecessary overhead.
--
-- Rollback:
--   ALTER TABLE razorpay_customers DROP CONSTRAINT unique_customer_per_user;
--   ALTER TABLE razorpay_customers ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
--   ALTER TABLE razorpay_customers ADD CONSTRAINT unique_customer_per_user UNIQUE(user_id);
-- ===================================================================

-- Drop the FK constraint referencing auth.users(id)
ALTER TABLE razorpay_customers DROP CONSTRAINT IF EXISTS razorpay_customers_user_id_fkey;

-- Drop the UNIQUE constraint (type must change before re-adding)
ALTER TABLE razorpay_customers DROP CONSTRAINT IF EXISTS unique_customer_per_user;

-- Change user_id column from UUID to TEXT
-- Using USING to cast existing UUID values to text
ALTER TABLE razorpay_customers ALTER COLUMN user_id TYPE TEXT;

-- Re-add unique constraint on TEXT column
ALTER TABLE razorpay_customers ADD CONSTRAINT unique_customer_per_user UNIQUE(user_id);

-- Recreate index on the new TEXT column
DROP INDEX IF EXISTS idx_razorpay_customers_user_id;
CREATE INDEX IF NOT EXISTS idx_razorpay_customers_user_id ON razorpay_customers(user_id);
