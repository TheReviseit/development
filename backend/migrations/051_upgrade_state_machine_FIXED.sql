-- =============================================================================
-- Migration 051: Atomic Upgrade State Machine (FIXED VERSION)
-- =============================================================================
-- Purpose: Add columns for tracking pending upgrades atomically
-- Critical: Implements Stripe-level atomic upgrade flow
-- Fix: Properly handles existing subscription statuses before applying constraint
-- =============================================================================

BEGIN;

-- =============================================================================
-- Step 0: Identify and migrate incompatible statuses
-- =============================================================================

-- First, let's see what statuses currently exist
DO $$
DECLARE
    status_record RECORD;
BEGIN
    RAISE NOTICE 'Current subscription statuses:';
    FOR status_record IN
        SELECT status, COUNT(*) as count
        FROM subscriptions
        GROUP BY status
    LOOP
        RAISE NOTICE '  - %: % subscriptions', status_record.status, status_record.count;
    END LOOP;
END $$;

-- Migrate any non-standard statuses to standard ones
-- Add your specific migrations here based on what exists in your database

-- Common status migrations:
-- 'created' → 'pending'
UPDATE subscriptions SET status = 'pending' WHERE status = 'created';

-- 'completed' → 'active' (for fully paid subscriptions)
UPDATE subscriptions SET status = 'active' WHERE status = 'completed';

-- 'payment_pending' → 'pending'
UPDATE subscriptions SET status = 'pending' WHERE status = 'payment_pending';

-- 'suspended' → 'halted' (for payment failures)
UPDATE subscriptions SET status = 'halted' WHERE status = 'suspended';

-- 'legacy_free' → 'active' (if you have legacy free users)
UPDATE subscriptions SET status = 'active' WHERE status = 'legacy_free';

-- Log any remaining unmapped statuses
DO $$
DECLARE
    unmapped_statuses TEXT[];
BEGIN
    SELECT ARRAY_AGG(DISTINCT status) INTO unmapped_statuses
    FROM subscriptions
    WHERE status NOT IN (
        'pending', 'pending_upgrade', 'active', 'upgrade_failed',
        'trialing', 'grace_period', 'past_due', 'cancelled',
        'halted', 'paused', 'expired'
    );

    IF unmapped_statuses IS NOT NULL THEN
        RAISE WARNING 'Unmapped statuses found: %. Please migrate these manually.', unmapped_statuses;
    END IF;
END $$;

-- =============================================================================
-- Step 1: Drop old constraint (if exists)
-- =============================================================================

ALTER TABLE subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_status_check;

-- =============================================================================
-- Step 2: Add new constraint with all valid statuses
-- =============================================================================

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
-- Step 3: Add pending upgrade tracking columns
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
-- Step 4: Create indexes for pending upgrade queries
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
-- Step 5: Add audit columns for upgrade tracking
-- =============================================================================

-- Track which user/IP initiated the upgrade (for fraud detection)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS upgrade_initiated_by_user_id TEXT;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS upgrade_initiated_from_ip INET;

-- =============================================================================
-- Step 6: Create helper function for atomic upgrade
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
            SELECT COALESCE(razorpay_plan_id_production, razorpay_plan_id)
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
-- Step 7: Verification
-- =============================================================================

-- Check that all subscriptions now have valid statuses
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_count
    FROM subscriptions
    WHERE status NOT IN (
        'pending', 'pending_upgrade', 'active', 'upgrade_failed',
        'trialing', 'grace_period', 'past_due', 'cancelled',
        'halted', 'paused', 'expired'
    );

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Migration failed: % subscriptions still have invalid status values', invalid_count;
    ELSE
        RAISE NOTICE 'Migration successful: All subscription statuses are valid';
    END IF;
END $$;

COMMIT;
