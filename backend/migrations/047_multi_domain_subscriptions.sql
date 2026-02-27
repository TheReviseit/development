-- =============================================================================
-- Migration 047: Multi-Domain Subscription Support
-- =============================================================================
-- Purpose: Add product_domain column to subscriptions table to support
--          separate subscriptions per domain (shop, marketing, api, etc.)
-- Critical: Includes UNIQUE constraint to prevent duplicate active subscriptions
-- =============================================================================

BEGIN;

-- Step 1: Add product_domain column (defaults to 'dashboard' for backfill)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS product_domain VARCHAR(50) DEFAULT 'dashboard';

-- Step 2: Backfill product_domain from pricing_plans lookup
-- This infers domain from the razorpay_plan_id → pricing_plans.product_domain
UPDATE subscriptions s
SET product_domain = pp.product_domain
FROM pricing_plans pp
WHERE s.plan_id = pp.razorpay_plan_id
  AND s.product_domain = 'dashboard';

-- Step 3: Add pricing_plan_id FK (direct link to pricing_plans.id)
-- This provides a direct foreign key instead of relying on razorpay_plan_id string matching
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS pricing_plan_id UUID REFERENCES pricing_plans(id);

-- Step 4: Populate pricing_plan_id from razorpay_plan_id lookup
UPDATE subscriptions s
SET pricing_plan_id = pp.id
FROM pricing_plans pp
WHERE s.plan_id = pp.razorpay_plan_id
  AND s.pricing_plan_id IS NULL;

-- Step 5: Create indexes for UpgradeEngine queries
-- These indexes optimize the common query: "Get subscription for user+domain"
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain
ON subscriptions(user_id, product_domain);

CREATE INDEX IF NOT EXISTS idx_subscriptions_pricing_plan_id
ON subscriptions(pricing_plan_id);

-- Step 6: NOT NULL constraint (after backfill completed)
ALTER TABLE subscriptions
ALTER COLUMN product_domain SET NOT NULL;

-- =============================================================================
-- CRITICAL: Prevent duplicate active subscriptions per user+domain
-- =============================================================================
-- Without this constraint, bugs can create:
-- - Two active subscriptions for same user+domain
-- - Double billing
-- - Conflicting entitlements
-- - Upgrade race conditions
--
-- This is a Stripe-level safety requirement.
-- =============================================================================

-- Step 7: Clean up any existing duplicates (keep most recent subscription)
-- This ensures the UNIQUE constraint can be added successfully
WITH ranked_subs AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, product_domain, status
               ORDER BY created_at DESC
           ) AS rn
    FROM subscriptions
    WHERE status IN ('active', 'trialing', 'pending_upgrade')
)
DELETE FROM subscriptions
WHERE id IN (
    SELECT id FROM ranked_subs WHERE rn > 1
);

-- Step 8: Add UNIQUE constraint via partial index
-- We use a partial index (WHERE clause) because:
-- - Cancelled/expired subscriptions CAN coexist (history)
-- - Only ACTIVE states must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_domain_active_unique
ON subscriptions(user_id, product_domain)
WHERE status IN ('active', 'trialing', 'pending_upgrade');

-- This prevents scenarios like:
-- INSERT INTO subscriptions (user_id, product_domain, status)
-- VALUES ('user123', 'shop', 'active')
-- when user123 already has an active 'shop' subscription
-- → ERROR: duplicate key value violates unique constraint

-- =============================================================================
-- Verification Queries
-- =============================================================================
-- Run these after migration to verify success:
--
-- 1. Check product_domain populated:
--    SELECT COUNT(*), product_domain FROM subscriptions GROUP BY product_domain;
--
-- 2. Check pricing_plan_id populated:
--    SELECT COUNT(*) FROM subscriptions WHERE pricing_plan_id IS NULL;
--    (Should return 0)
--
-- 3. Test UNIQUE constraint:
--    INSERT INTO subscriptions (user_id, product_domain, status)
--    VALUES ('test_user', 'shop', 'active');
--    (Second insert should fail with unique constraint violation)
-- =============================================================================

COMMIT;
