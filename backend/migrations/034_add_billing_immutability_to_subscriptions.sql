-- =============================================================================
-- Migration: 034_add_billing_immutability_to_subscriptions.sql
-- Description: Lock pricing_version + amount_paise at subscription creation
-- Date: 2026-02-14
-- =============================================================================
-- 
-- Enterprise billing immutability:
--   When a subscription is created, the pricing_version and amount_paise
--   are captured from pricing_plans and NEVER recalculated.
--   If prices change later (version 1 → 2), existing subscribers keep v1 pricing.
--

-- Add pricing_version: which version of pricing was active at subscription time
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS pricing_version INTEGER;

-- Add amount_paise: the exact amount locked at subscription creation
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS amount_paise INTEGER;

-- Add currency: locked at creation time
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';

-- Add pricing_plan_id: FK reference to the exact pricing_plans row used
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS pricing_plan_id UUID;

-- Rename old 'domain' to 'product_domain' for consistency with pricing_plans
-- (keeps backward compat via default)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'domain'
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'subscriptions' AND column_name = 'product_domain'
        )
    ) THEN
        ALTER TABLE subscriptions RENAME COLUMN domain TO product_domain;
    END IF;
END $$;

-- Ensure product_domain exists (in case rename didn't apply)
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS product_domain VARCHAR(50) DEFAULT 'dashboard';

-- Backfill existing subscriptions with default values
UPDATE subscriptions
SET pricing_version = 1,
    product_domain = COALESCE(product_domain, 'dashboard')
WHERE pricing_version IS NULL;

-- Index for version-based analytics
CREATE INDEX IF NOT EXISTS idx_subscriptions_pricing_version
    ON subscriptions(pricing_version);
