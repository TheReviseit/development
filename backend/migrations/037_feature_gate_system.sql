-- =============================================================================
-- Migration: 037_feature_gate_system.sql
-- Description: Enterprise feature gate system — policy engine, plan versioning,
--              soft/hard limits, idempotent usage counters, audit trail.
-- Date: 2026-02-14
-- =============================================================================
--
-- ARCHITECTURE:
--   3-layer feature gate: Data Fetch → Pure Policy Eval → Side Effects
--   Tables: plan_features, usage_counters, feature_flags
--   RPC: check_and_increment_usage (atomic, idempotent)
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS check_and_increment_usage;
--   DROP TABLE IF EXISTS usage_counters;
--   DROP TABLE IF EXISTS plan_features;
--   DROP TABLE IF EXISTS feature_flags;
--   ALTER TABLE subscriptions DROP COLUMN IF EXISTS plan_version;
-- =============================================================================


-- =============================================================================
-- 1. PLAN FEATURES — Normalized feature matrix
-- =============================================================================
-- Replaces hardcoded PLAN_FEATURES dict in entitlement_service.py
-- and features_json/limits_json JSONB columns (those stay as display-only).
-- One row per plan+feature combination.

CREATE TABLE IF NOT EXISTS plan_features (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to pricing_plans.id (specific plan + version)
    plan_id         UUID NOT NULL REFERENCES pricing_plans(id) ON DELETE CASCADE,

    -- Feature identity
    feature_key     VARCHAR(100) NOT NULL,

    -- Limits
    -- NULL hard_limit = boolean feature (no counting, just on/off)
    -- hard_limit > 0 = counted feature with cap
    -- is_unlimited = true → no cap regardless of hard_limit
    hard_limit      INTEGER,
    soft_limit      INTEGER,
    is_unlimited    BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- One feature_key per plan
    UNIQUE(plan_id, feature_key),

    -- Soft limit must be less than hard limit when both set
    CONSTRAINT chk_soft_lt_hard
        CHECK (soft_limit IS NULL OR hard_limit IS NULL OR soft_limit <= hard_limit)
);

-- Fast lookup: plan_id → all features
CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id
    ON plan_features(plan_id);

-- Feature lookup across plans
CREATE INDEX IF NOT EXISTS idx_plan_features_feature_key
    ON plan_features(feature_key);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_plan_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_plan_features_updated_at ON plan_features;
CREATE TRIGGER trigger_plan_features_updated_at
    BEFORE UPDATE ON plan_features
    FOR EACH ROW
    EXECUTE FUNCTION update_plan_features_updated_at();


-- =============================================================================
-- 2. USAGE COUNTERS — Per-user, per-domain, per-feature
-- =============================================================================
-- Tracks how many times a user has consumed a counted feature.
-- Supports periodic reset (monthly) and idempotent increments.

CREATE TABLE IF NOT EXISTS usage_counters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    user_id             UUID NOT NULL,
    domain              VARCHAR(50) NOT NULL,
    feature_key         VARCHAR(100) NOT NULL,

    -- Current period usage
    current_value       INTEGER NOT NULL DEFAULT 0,

    -- Reset schedule (NULL = lifetime counter, never resets)
    period_start        TIMESTAMPTZ,
    reset_at            TIMESTAMPTZ,

    -- Idempotency — prevents double-increment on retries
    last_idempotency_key VARCHAR(100),
    last_idempotency_at  TIMESTAMPTZ,

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    -- One counter per user+domain+feature
    UNIQUE(user_id, domain, feature_key)
);

-- Primary lookup pattern
CREATE INDEX IF NOT EXISTS idx_usage_counters_lookup
    ON usage_counters(user_id, domain);

-- Reset job: find counters due for reset
CREATE INDEX IF NOT EXISTS idx_usage_counters_reset
    ON usage_counters(reset_at)
    WHERE reset_at IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_usage_counters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_usage_counters_updated_at ON usage_counters;
CREATE TRIGGER trigger_usage_counters_updated_at
    BEFORE UPDATE ON usage_counters
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_counters_updated_at();


-- =============================================================================
-- 3. FEATURE FLAGS — Global toggle table
-- =============================================================================
-- Kill switch for any feature. Checked BEFORE plan-level access.
-- If a flag is disabled globally, no plan can access it.

CREATE TABLE IF NOT EXISTS feature_flags (
    feature_key         VARCHAR(100) PRIMARY KEY,
    is_enabled_globally BOOLEAN NOT NULL DEFAULT true,
    description         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER trigger_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_feature_flags_updated_at();


-- =============================================================================
-- 4. PLAN VERSIONING on subscriptions
-- =============================================================================
-- Subscriptions are pinned to a plan_version. When plan limits change,
-- existing subscribers stay on their version until renewal/upgrade.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_version INTEGER NOT NULL DEFAULT 1;


-- =============================================================================
-- 5. ATOMIC RPC: check_and_increment_usage
-- =============================================================================
-- Called from FeatureGateEngine.increment_usage().
-- Single atomic operation: check limit + increment + idempotency guard.
--
-- Returns JSONB:
--   {
--     "allowed": true/false,
--     "current": <int>,
--     "new_value": <int>,
--     "hard_limit": <int or null>,
--     "soft_limit_exceeded": true/false,
--     "idempotent_hit": true/false
--   }

CREATE OR REPLACE FUNCTION check_and_increment_usage(
    p_user_id UUID,
    p_domain TEXT,
    p_feature_key TEXT,
    p_hard_limit INTEGER,
    p_soft_limit INTEGER,
    p_is_unlimited BOOLEAN,
    p_idempotency_key TEXT DEFAULT NULL,
    p_reset_interval INTERVAL DEFAULT INTERVAL '1 month'
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_counter usage_counters%ROWTYPE;
    v_current INTEGER;
    v_new_value INTEGER;
    v_allowed BOOLEAN;
    v_soft_exceeded BOOLEAN;
    v_idempotent_hit BOOLEAN := false;
BEGIN
    -- Upsert counter row (create if not exists)
    INSERT INTO usage_counters (user_id, domain, feature_key, current_value, period_start, reset_at)
    VALUES (
        p_user_id, p_domain, p_feature_key, 0,
        NOW(), NOW() + p_reset_interval
    )
    ON CONFLICT (user_id, domain, feature_key) DO NOTHING;

    -- Lock the row for atomic update
    SELECT * INTO v_counter
    FROM usage_counters
    WHERE user_id = p_user_id
      AND domain = p_domain
      AND feature_key = p_feature_key
    FOR UPDATE;

    -- Auto-reset if period expired
    IF v_counter.reset_at IS NOT NULL AND v_counter.reset_at <= NOW() THEN
        UPDATE usage_counters
        SET current_value = 0,
            period_start = NOW(),
            reset_at = NOW() + p_reset_interval,
            last_idempotency_key = NULL,
            last_idempotency_at = NULL
        WHERE id = v_counter.id;

        v_counter.current_value := 0;
        v_counter.last_idempotency_key := NULL;
    END IF;

    v_current := v_counter.current_value;

    -- Idempotency check: same key within 5 minutes = skip increment
    IF p_idempotency_key IS NOT NULL
       AND v_counter.last_idempotency_key = p_idempotency_key
       AND v_counter.last_idempotency_at > NOW() - INTERVAL '5 minutes'
    THEN
        v_idempotent_hit := true;
        v_new_value := v_current;
        v_allowed := p_is_unlimited OR p_hard_limit IS NULL OR v_current < p_hard_limit;
        v_soft_exceeded := NOT p_is_unlimited AND p_soft_limit IS NOT NULL AND v_current >= p_soft_limit;

        RETURN jsonb_build_object(
            'allowed', v_allowed,
            'current', v_current,
            'new_value', v_new_value,
            'hard_limit', p_hard_limit,
            'soft_limit', p_soft_limit,
            'soft_limit_exceeded', v_soft_exceeded,
            'idempotent_hit', v_idempotent_hit
        );
    END IF;

    -- Check limit BEFORE incrementing
    IF p_is_unlimited THEN
        v_allowed := true;
    ELSIF p_hard_limit IS NULL THEN
        -- Boolean feature, no count — always allowed
        v_allowed := true;
    ELSE
        v_allowed := v_current < p_hard_limit;
    END IF;

    IF NOT v_allowed THEN
        -- Limit exceeded, do NOT increment
        v_soft_exceeded := NOT p_is_unlimited AND p_soft_limit IS NOT NULL AND v_current >= p_soft_limit;
        RETURN jsonb_build_object(
            'allowed', false,
            'current', v_current,
            'new_value', v_current,
            'hard_limit', p_hard_limit,
            'soft_limit', p_soft_limit,
            'soft_limit_exceeded', v_soft_exceeded,
            'idempotent_hit', false
        );
    END IF;

    -- Increment
    v_new_value := v_current + 1;
    v_soft_exceeded := NOT p_is_unlimited AND p_soft_limit IS NOT NULL AND v_new_value >= p_soft_limit;

    UPDATE usage_counters
    SET current_value = v_new_value,
        last_idempotency_key = p_idempotency_key,
        last_idempotency_at = CASE WHEN p_idempotency_key IS NOT NULL THEN NOW() ELSE last_idempotency_at END
    WHERE id = v_counter.id;

    RETURN jsonb_build_object(
        'allowed', true,
        'current', v_new_value,
        'new_value', v_new_value,
        'hard_limit', p_hard_limit,
        'soft_limit', p_soft_limit,
        'soft_limit_exceeded', v_soft_exceeded,
        'idempotent_hit', false
    );
END;
$$;


-- =============================================================================
-- 6. RLS POLICIES
-- =============================================================================

ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Service role: full access (backend operations)
CREATE POLICY plan_features_service_policy ON plan_features
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY usage_counters_service_policy ON usage_counters
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY feature_flags_service_policy ON feature_flags
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can read their own usage counters
CREATE POLICY usage_counters_user_read ON usage_counters
    FOR SELECT USING (auth.uid() = user_id);

-- Public read for feature flags (needed for frontend display)
CREATE POLICY feature_flags_public_read ON feature_flags
    FOR SELECT USING (true);

-- Public read for plan_features (needed for pricing display)
CREATE POLICY plan_features_public_read ON plan_features
    FOR SELECT USING (true);


-- =============================================================================
-- 7. SEED INITIAL FEATURE FLAGS
-- =============================================================================
-- Register known features so they can be toggled globally.

INSERT INTO feature_flags (feature_key, is_enabled_globally, description) VALUES
    ('otp_send',           true, 'Send OTP via WhatsApp/SMS'),
    ('live_api_keys',      true, 'Access to live API keys'),
    ('sandbox_mode',       true, 'Sandbox/test mode access'),
    ('webhooks',           true, 'Webhook endpoint configuration'),
    ('priority_routing',   true, 'Priority message routing'),
    ('advanced_analytics', true, 'Advanced analytics dashboard'),
    ('custom_sla',         true, 'Custom SLA agreements'),
    ('white_label',        true, 'White-label branding'),
    ('ai_responses',       true, 'AI chatbot responses'),
    ('products',           true, 'Product catalog management'),
    ('create_product',     true, 'Create new products'),
    ('bulk_messaging',     true, 'Bulk message sending')
ON CONFLICT (feature_key) DO NOTHING;
