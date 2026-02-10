-- Migration: Create razorpay_customers table
-- Purpose: Store Razorpay customer IDs separately to enable customer reuse
-- Date: 2026-02-10
-- 
-- This prevents duplicate customer creation in Razorpay when users retry payment
-- or create multiple subscriptions.

-- =============================================================================
-- Create razorpay_customers table
-- =============================================================================

CREATE TABLE IF NOT EXISTS razorpay_customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_customer_id TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- One customer per user (prevents duplicate API calls)
  CONSTRAINT unique_customer_per_user UNIQUE(user_id)
);

-- Index for fast lookup by user_id (most common query)
CREATE INDEX IF NOT EXISTS idx_razorpay_customers_user_id 
ON razorpay_customers(user_id);

-- Index for lookup by razorpay_customer_id (for verification)
CREATE INDEX IF NOT EXISTS idx_razorpay_customers_razorpay_id 
ON razorpay_customers(razorpay_customer_id);

-- =============================================================================
-- Migrate existing customer data from subscriptions table
-- =============================================================================

-- Insert existing customer IDs from subscriptions into razorpay_customers
-- Use DISTINCT ON to get the first customer_id per user (in case of duplicates)
INSERT INTO razorpay_customers (user_id, razorpay_customer_id, customer_email, created_at)
SELECT DISTINCT ON (user_id)
  user_id::uuid,  -- Explicit cast to UUID
  razorpay_customer_id,
  'migrated@flowauxi.com' as customer_email, -- Placeholder, can be updated later
  created_at
FROM subscriptions
WHERE razorpay_customer_id IS NOT NULL
  AND razorpay_customer_id != ''
  AND user_id IS NOT NULL  -- Safety check
ORDER BY user_id, created_at ASC -- Take oldest customer per user
ON CONFLICT (user_id) DO NOTHING; -- Skip if already exists

-- =============================================================================
-- Add updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_razorpay_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_razorpay_customers_updated_at
  BEFORE UPDATE ON razorpay_customers
  FOR EACH ROW
  EXECUTE FUNCTION update_razorpay_customers_updated_at();

-- =============================================================================
-- Rollback script (save for reference)
-- =============================================================================

-- To rollback this migration, run:
-- DROP TRIGGER IF EXISTS trigger_razorpay_customers_updated_at ON razorpay_customers;
-- DROP FUNCTION IF EXISTS update_razorpay_customers_updated_at();
-- DROP TABLE IF EXISTS razorpay_customers CASCADE;

-- =============================================================================
-- Verification queries
-- =============================================================================

-- Check migration success:
-- SELECT COUNT(*) FROM razorpay_customers;
-- SELECT COUNT(DISTINCT user_id) FROM subscriptions WHERE razorpay_customer_id IS NOT NULL;
-- These should match

-- Check for users with multiple customers (should be 0):
-- SELECT user_id, COUNT(*) FROM razorpay_customers GROUP BY user_id HAVING COUNT(*) > 1;
