-- =============================================================================
-- Migration 051: Atomic Upgrade State Machine
-- =============================================================================
-- Purpose: Add columns for tracking pending upgrades atomically
-- Critical: Implements Stripe-level atomic upgrade flow
--           NEVER trust client checkout success - only webhook confirmation
-- =============================================================================

BEGIN;

-- =============================================================================
-- Step 1: Extend subscription status enum
-- =============================================================================
-- Add granular states for upgrade tracking
-- Current flow: pending → pending_upgrade → active (on webhook)
-- Failure flow: pending → pending_upgrade → upgrade_failed
-- =============================================================================

ALTER TABLE subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_status_check
CHECK (status IN (
    'pending',           -- Initial subscription creation (pre-payment)
    'pending_upgrade',   -- Upgrade initiated, waiting for Razorpay webhook ← NEW
    'active',            -- Fully active subscription
    'upgrade_failed',    -- Upgrade payment failed ← NEW
    'trialing',          -- Trial period
    'grace_period',      -- Payment failed but user still has access
    'past_due',          -- Payment overdue
    'cancelled',         -- User cancelled
    'halted',            -- Razorpay halted due to payment failure
    'paused',            -- Temporarily paused
    'expired'            -- Subscription expired
));

-- =============================================================================
-- Step 2: Add pending upgrade tracking columns
-- =============================================================================
-- These columns store the "pending" state before webhook confirms payment
-- =============================================================================

-- Target plan for pending upgrade
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS pending_upgrade_to_plan_id UUID REFERENCES pricing_plans(id);

-- Razorpay subscription ID for the new subscription (before activation)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS pending_upgrade_razorpay_subscription_id TEXT;

-- Timestamp when upgrade was initiated (for stale cleanup)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS upgrade_initiated_at TIMESTAMPTZ;

-- Timestamp when upgrade completed (webhook confirmed)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS upgrade_completed_at TIMESTAMPTZ;

-- Reason if upgrade failed (from payment.failed webhook)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS upgrade_failure_reason TEXT;

-- =============================================================================
-- Step 3: Create indexes for pending upgrade queries
-- =============================================================================

-- Index for cleanup job (find stale pending upgrades > 30 min old)
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_upgrade
ON subscriptions(status, upgrade_initiated_at)
WHERE status = 'pending_upgrade';

-- Index for webhook lookup (find subscription by pending razorpay ID)
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_razorpay_id
ON subscriptions(pending_upgrade_razorpay_subscription_id)
WHERE pending_upgrade_razorpay_subscription_id IS NOT NULL;

-- =============================================================================
-- Step 4: Add audit columns for upgrade tracking
-- =============================================================================

-- Track which user/IP initiated the upgrade (for fraud detection)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS upgrade_initiated_by_user_id TEXT;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS upgrade_initiated_from_ip INET;

-- =============================================================================
-- Atomic Upgrade Flow Documentation
-- =============================================================================
--
-- Step 1: User clicks "Upgrade to Business"
--   → Backend creates Razorpay subscription
--   → Sets: status = 'pending_upgrade'
--           pending_upgrade_to_plan_id = business_plan_id
--           pending_upgrade_razorpay_subscription_id = new_razorpay_sub_id
--           upgrade_initiated_at = NOW()
--   → Returns Razorpay details to frontend
--
-- Step 2: User completes Razorpay payment
--   → Razorpay sends webhook: subscription.authenticated
--   → Backend finds subscription by pending_upgrade_razorpay_subscription_id
--   → Atomically updates:
--       - pricing_plan_id = pending_upgrade_to_plan_id
--       - razorpay_subscription_id = pending_upgrade_razorpay_subscription_id
--       - status = 'active'
--       - upgrade_completed_at = NOW()
--       - pending_* = NULL (clear pending state)
--   → Invalidates caches (versioned keys)
--
-- Step 3 (Failure): Payment fails
--   → Razorpay sends webhook: payment.failed
--   → Backend updates:
--       - status = 'upgrade_failed'
--       - upgrade_failure_reason = error message
--       - pending_* = NULL
--   → User sees error, retains old plan
--
-- Step 4 (Timeout): Payment abandoned (30min+ no webhook)
--   → Cleanup job runs every 10 minutes
--   → Finds subscriptions with:
--       - status = 'pending_upgrade'
--       - upgrade_initiated_at < NOW() - INTERVAL '30 minutes'
--   → Resets: status = 'active' (old plan)
--             pending_* = NULL
--             upgrade_failure_reason = 'Payment abandoned'
--
-- =============================================================================

-- =============================================================================
-- Step 5: Create helper function for atomic upgrade
-- =============================================================================

CREATE OR REPLACE FUNCTION apply_pending_upgrade_atomic(
    p_subscription_id UUID,
    p_event_id TEXT,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Atomically apply pending upgrade
    -- Uses optimistic locking (WHERE status = 'pending_upgrade')
    UPDATE subscriptions
    SET
        status = 'active',
        pricing_plan_id = pending_upgrade_to_plan_id,
        plan_id = (
            SELECT razorpay_plan_id_production
            FROM pricing_plans
            WHERE id = pending_upgrade_to_plan_id
        ),
        razorpay_subscription_id = pending_upgrade_razorpay_subscription_id,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        upgrade_completed_at = NOW(),

        -- Clear pending state
        pending_upgrade_to_plan_id = NULL,
        pending_upgrade_razorpay_subscription_id = NULL,

        updated_at = NOW()
    WHERE
        id = p_subscription_id
        AND status = 'pending_upgrade'  -- Optimistic lock
        AND pending_upgrade_to_plan_id IS NOT NULL;  -- Safety check

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Return true if upgrade was applied
    RETURN v_updated_count > 0;
END;
$$;

-- =============================================================================
-- Step 6: Verification Queries
-- =============================================================================
--
-- 1. Check pending upgrades:
-- SELECT
--     user_id,
--     product_domain,
--     status,
--     pending_upgrade_to_plan_id,
--     upgrade_initiated_at,
--     NOW() - upgrade_initiated_at AS pending_duration
-- FROM subscriptions
-- WHERE status = 'pending_upgrade'
-- ORDER BY upgrade_initiated_at;
--
-- 2. Check upgrade history:
-- SELECT
--     user_id,
--     product_domain,
--     status,
--     upgrade_completed_at,
--     upgrade_failure_reason
-- FROM subscriptions
-- WHERE upgrade_completed_at IS NOT NULL
--    OR upgrade_failure_reason IS NOT NULL
-- ORDER BY upgrade_completed_at DESC
-- LIMIT 10;
--
-- 3. Test atomic upgrade function:
-- SELECT apply_pending_upgrade_atomic(
--     '<subscription_id>',
--     'test_event_123',
--     NOW(),
--     NOW() + INTERVAL '1 month'
-- );
-- (Should return true if subscription was in pending_upgrade state)
-- =============================================================================

COMMIT;
