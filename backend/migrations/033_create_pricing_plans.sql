-- =============================================================================
-- Migration: 033_create_pricing_plans.sql
-- Description: Enterprise pricing_plans table — single source of truth
-- Date: 2026-02-14
-- =============================================================================

-- pricing_plans: Versioned, per-domain pricing with audit trail
CREATE TABLE IF NOT EXISTS pricing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Domain + Plan identity
    product_domain VARCHAR(50) NOT NULL,           -- 'shop', 'dashboard', 'marketing', etc.
    plan_slug VARCHAR(50) NOT NULL,                -- 'starter', 'business', 'pro'
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',

    -- Pricing
    amount_paise INTEGER NOT NULL,                 -- ₹3,999 = 399900
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    razorpay_plan_id VARCHAR(100) NOT NULL,        -- Mandatory — no silent production failures

    -- Display
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    features_json JSONB,                           -- ["Feature 1", "Feature 2", ...]
    limits_json JSONB,                             -- {"ai_responses": 5000, "products": 50, ...}

    -- Versioning & Audit (enterprise billing immutability)
    pricing_version INTEGER NOT NULL DEFAULT 1,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,                      -- NULL = currently active version

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Primary lookup index: domain + slug + cycle + active (covers 99% of queries)
CREATE INDEX IF NOT EXISTS idx_pricing_lookup
    ON pricing_plans(product_domain, plan_slug, billing_cycle, is_active);

-- Active-only partial index for fast scans
CREATE INDEX IF NOT EXISTS idx_pricing_active
    ON pricing_plans(product_domain) WHERE is_active = true AND effective_to IS NULL;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_pricing_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pricing_plans_updated_at ON pricing_plans;
CREATE TRIGGER trigger_pricing_plans_updated_at
    BEFORE UPDATE ON pricing_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_pricing_plans_updated_at();

-- RLS: Service role can do everything, users cannot access directly
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY pricing_plans_service_policy ON pricing_plans
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Public read access for pricing display (no auth required)
CREATE POLICY pricing_plans_public_read ON pricing_plans
    FOR SELECT USING (is_active = true AND effective_to IS NULL);
