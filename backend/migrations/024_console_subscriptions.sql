-- =============================================================================
-- Migration: xxx_console_subscriptions.sql
-- Description: Console billing and subscription management with entitlement levels
-- =============================================================================

-- =============================================================================
-- CONSOLE SUBSCRIPTIONS TABLE
-- Tracks billing status and entitlement level per organization
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_console_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES otp_organizations(id) ON DELETE CASCADE,

    -- Razorpay references
    razorpay_subscription_id TEXT UNIQUE,
    razorpay_customer_id TEXT,
    razorpay_order_id TEXT,

    -- Plan details
    plan_name VARCHAR(50) NOT NULL CHECK (plan_name IN ('starter', 'growth', 'enterprise')),
    
    -- Billing status with legacy_free for migration
    billing_status VARCHAR(50) NOT NULL DEFAULT 'created'
        CHECK (billing_status IN (
            'created',           -- Org created, no plan selected
            'plan_selected',     -- Plan selected, payment not started
            'payment_pending',   -- Razorpay order created, awaiting payment
            'active',            -- Paid and active
            'suspended',         -- Payment failed, service paused
            'cancelled',         -- User cancelled
            'legacy_free'        -- Existing users grandfathered in (sandbox only)
        )),

    -- Entitlement level (future-proofing for trials, sandbox-only, etc.)
    entitlement_level VARCHAR(20) NOT NULL DEFAULT 'sandbox'
        CHECK (entitlement_level IN (
            'sandbox',     -- Can create test keys only
            'live',        -- Can create live keys, send live OTPs
            'enterprise'   -- Full access + priority routing
        )),

    -- Billing period
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,

    -- Grace period for migrated users with existing live usage
    grace_period_end TIMESTAMPTZ,

    -- Idempotency for order creation
    idempotency_key VARCHAR(64) UNIQUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One active subscription per org
    UNIQUE(org_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_console_subs_org ON otp_console_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_console_subs_status ON otp_console_subscriptions(billing_status);
CREATE INDEX IF NOT EXISTS idx_console_subs_entitlement ON otp_console_subscriptions(entitlement_level);
CREATE INDEX IF NOT EXISTS idx_console_subs_razorpay ON otp_console_subscriptions(razorpay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_console_subs_grace ON otp_console_subscriptions(grace_period_end) 
    WHERE grace_period_end IS NOT NULL;

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_console_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_console_sub_updated_at ON otp_console_subscriptions;
CREATE TRIGGER trigger_console_sub_updated_at
    BEFORE UPDATE ON otp_console_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_console_subscription_timestamp();

-- =============================================================================
-- RLS POLICIES (Row Level Security)
-- =============================================================================
ALTER TABLE otp_console_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY console_subs_service_policy ON otp_console_subscriptions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- MIGRATION: Create legacy_free subscriptions for existing orgs
-- =============================================================================
-- This inserts a subscription record for each org that doesn't have one
INSERT INTO otp_console_subscriptions (org_id, plan_name, billing_status, entitlement_level)
SELECT 
    id as org_id,
    COALESCE(plan, 'starter') as plan_name,
    'legacy_free' as billing_status,
    'sandbox' as entitlement_level
FROM otp_organizations
WHERE id NOT IN (SELECT org_id FROM otp_console_subscriptions)
ON CONFLICT (org_id) DO NOTHING;

-- =============================================================================
-- MIGRATION: Add grace period for orgs with existing live API usage
-- =============================================================================
-- Find orgs that have created live API keys and give them 14-day grace
UPDATE otp_console_subscriptions sub
SET 
    grace_period_end = NOW() + INTERVAL '14 days',
    entitlement_level = 'live'  -- Temporarily allow live access during grace
FROM (
    SELECT DISTINCT p.org_id
    FROM otp_api_keys k
    JOIN otp_projects p ON k.project_id = p.id
    WHERE k.environment = 'live' AND k.is_active = true
) live_orgs
WHERE sub.org_id = live_orgs.org_id
  AND sub.billing_status = 'legacy_free';

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE otp_console_subscriptions IS 'Billing and entitlement tracking for console organizations';
COMMENT ON COLUMN otp_console_subscriptions.entitlement_level IS 'sandbox=test only, live=full access, enterprise=priority';
COMMENT ON COLUMN otp_console_subscriptions.billing_status IS 'State machine for subscription lifecycle. legacy_free=grandfathered existing users';
COMMENT ON COLUMN otp_console_subscriptions.grace_period_end IS 'For legacy users with live usage, grace period before sandbox-only';
