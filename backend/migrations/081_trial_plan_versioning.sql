-- =============================================================================
-- Migration: XXX_trial_plan_versioning.sql
-- Description: Add plan versioning for trial stability
-- =============================================================================
-- Problem: If plan changes, old trials break
-- Solution: Snapshot plan configuration at trial start
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE: trial_plan_snapshots
-- Stores frozen plan configuration at trial start
-- =============================================================================
CREATE TABLE IF NOT EXISTS trial_plan_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference to plan at time of trial
    plan_id UUID NOT NULL REFERENCES pricing_plans(id),
    plan_slug TEXT NOT NULL,
    plan_version INTEGER NOT NULL DEFAULT 1,  -- Version number for this plan

    -- Frozen configuration (JSON snapshot)
    features JSONB NOT NULL DEFAULT '{}',
    limits JSONB NOT NULL DEFAULT '{}',
    pricing JSONB NOT NULL DEFAULT '{}',

    -- Marketing metadata
    tagline TEXT,
    description TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- When this snapshot becomes obsolete

    -- Ensure unique plan + version
    UNIQUE(plan_id, plan_version)
);

COMMENT ON TABLE trial_plan_snapshots IS 'Frozen plan configuration at point in time';

-- =============================================================================
-- Add snapshot_id to free_trials
-- =============================================================================
ALTER TABLE free_trials
ADD COLUMN IF NOT EXISTS plan_snapshot_id UUID REFERENCES trial_plan_snapshots(id);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_plan_snapshots_plan_id
ON trial_plan_snapshots(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_snapshots_version
ON trial_plan_snapshots(plan_id, plan_version);

CREATE INDEX IF NOT EXISTS idx_trials_snapshot_id
ON free_trials(plan_snapshot_id)
WHERE plan_snapshot_id IS NOT NULL;

-- =============================================================================
-- FUNCTION: Create plan snapshot
-- =============================================================================
CREATE OR REPLACE FUNCTION create_plan_snapshot(
    p_plan_id UUID,
    p_plan_slug TEXT
) RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
    v_max_version INTEGER;
    v_new_version INTEGER;
    v_features JSONB;
    v_limits JSONB;
    v_pricing JSONB;
BEGIN
    -- Get current max version
    SELECT COALESCE(MAX(plan_version), 0) INTO v_max_version
    FROM trial_plan_snapshots
    WHERE plan_id = p_plan_id;

    v_new_version := v_max_version + 1;

    -- Get plan features from plan_features table
    SELECT jsonb_agg(jsonb_build_object(
        'feature_key', feature_key,
        'hard_limit', hard_limit,
        'soft_limit', soft_limit,
        'is_unlimited', is_unlimited
    )) INTO v_features
    FROM plan_features
    WHERE plan_id = p_plan_id;

    -- Get limits from plan_metadata
    SELECT jsonb_build_object(
        'trial_days', trial_days,
        'tier_level', tier_level
    ) INTO v_limits
    FROM plan_metadata
    WHERE plan_id = p_plan_id;

    -- Get pricing
    SELECT jsonb_build_object(
        'monthly_amount', razorpay_plan_id,
        'currency', 'INR'
    ) INTO v_pricing
    FROM pricing_plans
    WHERE id = p_plan_id;

    -- Insert snapshot
    INSERT INTO trial_plan_snapshots (
        plan_id,
        plan_slug,
        plan_version,
        features,
        limits,
        pricing
    ) VALUES (
        p_plan_id,
        p_plan_slug,
        v_new_version,
        COALESCE(v_features, '{}'),
        COALESCE(v_limits, '{}'),
        COALESCE(v_pricing, '{}')
    )
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Get plan snapshot (creates if not exists)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_or_create_plan_snapshot(
    p_plan_id UUID,
    p_plan_slug TEXT
) RETURNS UUID AS $$
DECLARE
    v_existing_id UUID;
BEGIN
    -- Check for recent snapshot (within 24 hours)
    SELECT id INTO v_existing_id
    FROM trial_plan_snapshots
    WHERE plan_id = p_plan_id
    AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY plan_version DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    -- Create new snapshot
    RETURN create_plan_snapshot(p_plan_id, p_plan_slug);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Update start_trial procedure to include plan snapshot
-- =============================================================================
CREATE OR REPLACE FUNCTION start_trial(
    p_user_id UUID,
    p_org_id UUID,
    p_plan_id UUID,
    p_plan_slug TEXT,
    p_domain TEXT,
    p_trial_days INTEGER DEFAULT 7,
    p_source TEXT DEFAULT 'organic',
    p_ip_address TEXT DEFAULT NULL,
    p_email_domain TEXT DEFAULT NULL,
    p_device_fingerprint TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
    trial_id UUID,
    status TEXT,
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_new BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_trial_id UUID;
    v_started_at TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_status TEXT;
    v_is_new BOOLEAN := FALSE;
    v_ip_hash TEXT;
    v_email_domain_hash TEXT;
    v_device_hash TEXT;
    v_user_agent_hash TEXT;
    v_abuse_risk INTEGER;
    v_plan_snapshot_id UUID;
    v_existing_trial RECORD;
BEGIN
    -- Normalize inputs
    p_domain := COALESCE(p_domain, 'shop');
    p_source := COALESCE(p_source, 'organic');

    -- Check for existing active trial (idempotency)
    SELECT * INTO v_existing_trial
    FROM free_trials
    WHERE user_id = p_user_id
    AND org_id = p_org_id
    AND domain = p_domain
    AND status IN ('active', 'expiring_soon');

    IF v_existing_trial IS NOT NULL THEN
        trial_id := v_existing_trial.id;
        status := v_existing_trial.status;
        started_at := v_existing_trial.started_at;
        expires_at := v_existing_trial.expires_at;
        is_new := FALSE;
        error_message := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_trial
        FROM free_trials
        WHERE idempotency_key = p_idempotency_key;

        IF v_existing_trial IS NOT NULL THEN
            trial_id := v_existing_trial.id;
            status := v_existing_trial.status;
            started_at := v_existing_trial.started_at;
            expires_at := v_existing_trial.expires_at;
            is_new := FALSE;
            error_message := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- Get or create plan snapshot
    v_plan_snapshot_id := get_or_create_plan_snapshot(p_plan_id, p_plan_slug);

    -- Hash identifiers for abuse detection
    IF p_ip_address IS NOT NULL THEN
        v_ip_hash := encode(sha256(p_ip_address::bytea), 'hex');
    END IF;

    IF p_email_domain IS NOT NULL THEN
        v_email_domain_hash := encode(sha256(p_email_domain::bytea), 'hex');
    END IF;

    IF p_device_fingerprint IS NOT NULL THEN
        v_device_hash := encode(sha256(p_device_fingerprint::bytea), 'hex');
    END IF;

    IF p_user_agent IS NOT NULL THEN
        v_user_agent_hash := encode(sha256(p_user_agent::bytea), 'hex');
    END IF;

    -- Calculate abuse risk score
    v_abuse_risk := calculate_trial_abuse_risk(
        v_ip_hash,
        v_email_domain_hash,
        v_device_hash,
        v_user_agent_hash
    );

    -- Create trial
    v_started_at := NOW();
    v_expires_at := v_started_at + (p_trial_days || ' days')::INTERVAL;

    INSERT INTO free_trials (
        user_id,
        org_id,
        plan_id,
        plan_slug,
        plan_snapshot_id,  -- NEW: Store plan snapshot
        domain,
        trial_days,
        started_at,
        expires_at,
        status,
        source,
        ip_address_hash,
        email_domain_hash,
        device_fingerprint_hash,
        user_agent_hash,
        abuse_risk_score,
        idempotency_key
    ) VALUES (
        p_user_id,
        p_org_id,
        p_plan_id,
        p_plan_slug,
        v_plan_snapshot_id,  -- NEW: Store plan snapshot
        p_domain,
        p_trial_days,
        v_started_at,
        v_expires_at,
        'active',
        p_source,
        v_ip_hash,
        v_email_domain_hash,
        v_device_hash,
        v_user_agent_hash,
        v_abuse_risk,
        p_idempotency_key
    )
    RETURNING id INTO v_trial_id;

    -- Record event
    INSERT INTO trial_events (
        trial_id,
        event_type,
        event_data,
        triggered_by,
        idempotency_key
    ) VALUES (
        v_trial_id,
        'trial.started.v1',
        jsonb_build_object(
            'trial_days', p_trial_days,
            'plan_slug', p_plan_slug,
            'domain', p_domain,
            'source', p_source,
            'abuse_risk_score', v_abuse_risk,
            'plan_snapshot_id', v_plan_snapshot_id  -- NEW: Include snapshot
        ),
        'system',
        p_idempotency_key
    );

    -- Record abuse signals if elevated risk
    IF v_abuse_risk >= 30 THEN
        IF v_ip_hash IS NOT NULL THEN
            INSERT INTO trial_abuse_signals (
                identifier_type,
                identifier_hash,
                signal_type,
                severity
            ) VALUES (
                'ip',
                v_ip_hash,
                'multiple_trials_same_ip',
                LEAST(v_abuse_risk / 10, 10)
            )
            ON CONFLICT (identifier_type, signal_type, identifier_hash)
            DO UPDATE SET
                last_seen_at = NOW(),
                occurrence_count = trial_abuse_signals.occurrence_count + 1;
        END IF;

        INSERT INTO trial_events (
            trial_id,
            event_type,
            event_data,
            triggered_by
        ) VALUES (
            v_trial_id,
            'trial.abuse_detected.v1',
            jsonb_build_object(
                'abuse_risk_score', v_abuse_risk
            ),
            'system'
        );
    END IF;

    -- Return new trial
    trial_id := v_trial_id;
    status := 'active';
    started_at := v_started_at;
    expires_at := v_expires_at;
    is_new := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE trial_plan_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role only
CREATE POLICY trial_plan_snapshots_service_policy ON trial_plan_snapshots
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

COMMIT;
