-- =============================================================================
-- Migration 042: Database-Driven Plan Configuration
-- =============================================================================
-- Problem: Plan configuration hardcoded in Python (console_billing.py, etc.)
--   - CONSOLE_TIER_META dict in console_billing.py:77-83
--   - PLAN_TIER_ORDER list in console_billing.py:55
--   - Cannot change plan tiers without code deployment
--   - Marketing cannot A/B test plans
--
-- Solution: Database-driven configuration
--   - plan_metadata table: tier levels, upgrade paths, sales requirements
--   - plan_overrides table: per-tenant feature boosts (customer success tool)
--
-- Deploy:
--   1. Run this migration (zero downtime, creates new tables)
--   2. Run data migration script: backend/scripts/migrate_plan_config_to_db.py
--   3. Update code to read from database instead of hardcoded dicts
--
-- Safety: Idempotent (IF NOT EXISTS checks)
-- =============================================================================

-- =============================================================================
-- Table: plan_metadata
-- =============================================================================
-- Purpose: Store plan tier information and marketing metadata
-- Used by: console_billing.py, admin dashboard
-- =============================================================================
CREATE TABLE IF NOT EXISTS plan_metadata (
    plan_id UUID PRIMARY KEY REFERENCES pricing_plans(id) ON DELETE CASCADE,

    -- Tier hierarchy (for upgrade/downgrade logic)
    tier_level INTEGER NOT NULL CHECK (tier_level >= 0 AND tier_level <= 10),

    -- Upgrade path (next tier in sequence)
    upgrade_to_plan_id UUID REFERENCES pricing_plans(id),

    -- Marketing metadata
    tagline TEXT,                               -- "Most Popular", "Best Value", etc.
    requires_sales_call BOOLEAN DEFAULT false,  -- Enterprise plans require sales contact
    trial_days INTEGER DEFAULT 0,              -- Free trial period (0 = no trial)

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for plan_metadata
CREATE INDEX IF NOT EXISTS idx_plan_metadata_tier_level ON plan_metadata(tier_level);

-- =============================================================================
-- Table: plan_overrides
-- =============================================================================
-- Purpose: Per-tenant feature limit overrides (customer success tool)
-- Use Cases:
--   - Grant enterprise trial (boost product limit from 10 → 100)
--   - Temporary feature access (expires_at)
--   - Custom contracts (permanent overrides)
-- Used by: FeatureGateEngine, admin API
-- =============================================================================
CREATE TABLE IF NOT EXISTS plan_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant identification
    user_id TEXT NOT NULL,                     -- Firebase UID (after migration 041)
    domain VARCHAR(50) NOT NULL,                -- 'shop', 'dashboard', 'api', etc.
    feature_key VARCHAR(100) NOT NULL,          -- 'create_product', 'custom_domain', etc.

    -- Override configuration (only set ONE of these)
    override_hard_limit INTEGER,                -- Override numeric limit (e.g., 100 instead of 10)
    override_is_unlimited BOOLEAN DEFAULT false,-- Override to unlimited (e.g., unlimited products)
    override_enabled BOOLEAN,                   -- Override boolean feature (e.g., force enable webhooks)

    -- Audit trail
    reason VARCHAR(200) NOT NULL,               -- Required: "Support ticket #1234", "Enterprise trial"
    created_by TEXT,                            -- Admin user ID who created override

    -- Expiration (NULL = permanent)
    expires_at TIMESTAMPTZ,                     -- Auto-expire override (e.g., 30-day trial)

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(user_id, domain, feature_key),       -- One override per user+domain+feature

    -- Validation: ensure at least one override field is set
    CONSTRAINT check_override_set CHECK (
        override_hard_limit IS NOT NULL OR
        override_is_unlimited = true OR
        override_enabled IS NOT NULL
    )
);

-- Indexes for plan_overrides
CREATE INDEX IF NOT EXISTS idx_plan_overrides_lookup ON plan_overrides(user_id, domain, feature_key);
CREATE INDEX IF NOT EXISTS idx_plan_overrides_expires_at ON plan_overrides(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_overrides_created_at ON plan_overrides(created_at);

-- =============================================================================
-- Trigger: Update updated_at timestamp
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to plan_metadata
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_plan_metadata_updated_at'
    ) THEN
        CREATE TRIGGER update_plan_metadata_updated_at
        BEFORE UPDATE ON plan_metadata
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Apply to plan_overrides
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_plan_overrides_updated_at'
    ) THEN
        CREATE TRIGGER update_plan_overrides_updated_at
        BEFORE UPDATE ON plan_overrides
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 042 complete:';
    RAISE NOTICE '   - plan_metadata table created';
    RAISE NOTICE '   - plan_overrides table created';
    RAISE NOTICE '   - Indexes and triggers configured';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '   1. Run: python backend/scripts/migrate_plan_config_to_db.py';
    RAISE NOTICE '   2. Update console_billing.py to read from plan_metadata';
    RAISE NOTICE '   3. Update FeatureGateEngine to check plan_overrides';
END $$;
