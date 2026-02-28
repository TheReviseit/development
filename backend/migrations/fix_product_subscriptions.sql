-- =============================================================================
-- FIX: Drop and recreate product_subscriptions table
-- =============================================================================
-- The original table had UUID FK references to otp_console_users, but the
-- frontend uses the `users` table (Firebase auth) with different IDs.
-- This fix drops the old table and recreates with TEXT columns (no FK).
-- =============================================================================

-- Drop old table (if exists from previous migration)
DROP TABLE IF EXISTS product_subscriptions CASCADE;

-- Drop old trigger function
DROP FUNCTION IF EXISTS update_product_subs_updated_at() CASCADE;
