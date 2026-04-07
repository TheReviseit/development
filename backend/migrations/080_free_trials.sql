-- =============================================================================
-- Migration: XXX_free_trials.sql
-- Description: Production-grade Free Trial Engine schema
-- =============================================================================
-- Features:
--   - One trial per user/org per domain
--   - Full audit trail
--   - Idempotency keys for all operations
--   - Abuse detection fields
--   - Event sourcing for trial lifecycle
--   - Timezone-aware expiration
-- =============================================================================

BEGIN;

-- =============================================================================
-- TABLE: free_trials
-- Core trial tracking table
-- =============================================================================
CREATE TABLE IF NOT EXISTS free_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES otp_organizations(id) ON DELETE CASCADE,

    -- Plan configuration (references pricing_plans)
    plan_id UUID NOT NULL REFERENCES pricing_plans(id),
    plan_slug TEXT NOT NULL,  -- Denormalized for faster queries

    -- Product domain for multi-domain support
    domain VARCHAR(50) NOT NULL DEFAULT 'shop'
        CHECK (domain IN ('shop', 'marketing', 'api', 'showcase', 'dashboard')),

    -- Trial period configuration
    trial_days INTEGER NOT NULL DEFAULT 7,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Current status
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN (
            'active',          -- Trial is running, full access granted
            'expiring_soon',   -- Within grace period (3 days before expiry)
            'expired',         -- Trial ended, access restricted
            'converted',       -- User upgraded to paid plan
            'cancelled'        -- User voluntarily cancelled trial
        )),

    -- Source tracking for analytics
    source VARCHAR(50) DEFAULT 'organic'
        CHECK (source IN (
            'organic',         -- Direct signup
            'marketing',       -- Marketing campaign
            'referral',        -- Referred by user
            'api',             -- API signup
            'shop',            -- Shop domain signup
            'shop_onboarding', -- Shop domain signup during onboarding
            'admin_grant'      -- Admin manually granted
        )),

    -- Abuse detection fingerprints
    ip_address_hash TEXT,           -- SHA256 hash of signup IP
    email_domain_hash TEXT,          -- SHA256 hash of email domain
    device_fingerprint_hash TEXT,   -- Browser/device fingerprint
    user_agent_hash TEXT,            -- Hash of user agent string

    -- Abuse risk score (calculated)
    abuse_risk_score INTEGER DEFAULT 0
        CHECK (abuse_risk_score >= 0 AND abuse_risk_score <= 100),

    -- Conversion tracking
    converted_at TIMESTAMPTZ,
    converted_to_plan_slug TEXT,

    -- Idempotency
    idempotency_key VARCHAR(64) UNIQUE,

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    cancellation_reason TEXT,

    -- Constraints
    UNIQUE(user_id, org_id, domain),  -- One active trial per user/org/domain

    -- Check: expires_at must be after started_at
    CONSTRAINT valid_trial_period CHECK (expires_at > started_at),

    -- Check: trial_days must be positive
    CONSTRAINT valid_trial_days CHECK (trial_days > 0 AND trial_days <= 90)
);

-- =============================================================================
-- INDEXES: Optimize all query patterns
-- =============================================================================

-- Primary lookup: user's active trial
CREATE INDEX IF NOT EXISTS idx_trials_user_org_domain
ON free_trials(user_id, org_id, domain)
WHERE status IN ('active', 'expiring_soon');

-- Status-based queries for batch processing
CREATE INDEX IF NOT EXISTS idx_trials_status_expires
ON free_trials(status, expires_at)
WHERE status IN ('active', 'expiring_soon');

-- Org-level queries (admin view)
CREATE INDEX IF NOT EXISTS idx_trials_org_id
ON free_trials(org_id);

-- Abuse detection queries
CREATE INDEX IF NOT EXISTS idx_trials_ip_hash
ON free_trials(ip_address_hash)
WHERE ip_address_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trials_email_domain_hash
ON free_trials(email_domain_hash)
WHERE email_domain_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trials_device_hash
ON free_trials(device_fingerprint_hash)
WHERE device_fingerprint_hash IS NOT NULL;

-- Conversion analytics
CREATE INDEX IF NOT EXISTS idx_trials_converted
ON free_trials(converted_at)
WHERE converted_at IS NOT NULL;

-- Plan-level queries
CREATE INDEX IF NOT EXISTS idx_trials_plan_id
ON free_trials(plan_id);

CREATE INDEX IF NOT EXISTS idx_trials_domain_status
ON free_trials(domain, status);

-- =============================================================================
-- TABLE: trial_events (Event Store)
-- Immutable event log for trial lifecycle
-- =============================================================================
CREATE TABLE IF NOT EXISTS trial_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference to trial
    trial_id UUID NOT NULL REFERENCES free_trials(id) ON DELETE CASCADE,

    -- Event sourcing fields
    event_type VARCHAR(50) NOT NULL
        CHECK (event_type IN (
            'trial.started',
            'trial.extended',
            'trial.expiring_soon',
            'trial.expired',
            'trial.converted',
            'trial.cancelled',
            'trial.abuse_detected',
            'trial.abiuse_risk_updated'
        )),

    -- Event data (JSON for flexibility)
    event_data JSONB NOT NULL DEFAULT '{}',

    -- Context
    triggered_by VARCHAR(50) NOT NULL  -- 'system', 'user', 'admin', 'webhook'
        CHECK (triggered_by IN ('system', 'user', 'admin', 'webhook')),

    -- Idempotency
    idempotency_key VARCHAR(64) UNIQUE,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for event queries
CREATE INDEX IF NOT EXISTS idx_trial_events_trial_id
ON trial_events(trial_id);

CREATE INDEX IF NOT EXISTS idx_trial_events_type
ON trial_events(event_type);

CREATE INDEX IF NOT EXISTS idx_trial_events_created
ON trial_events(created_at);

-- Composite for looking up events by trial + type
CREATE INDEX IF NOT EXISTS idx_trial_events_trial_type
ON trial_events(trial_id, event_type);

-- =============================================================================
-- TABLE: trial_abuse_signals
-- Tracks potential abuse indicators
-- =============================================================================
CREATE TABLE IF NOT EXISTS trial_abuse_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity being tracked
    identifier_type VARCHAR(20) NOT NULL
        CHECK (identifier_type IN ('ip', 'email_domain', 'device_fingerprint', 'user_agent')),

    identifier_hash TEXT NOT NULL,

    -- Signal details
    signal_type VARCHAR(50) NOT NULL,
    severity INTEGER NOT NULL DEFAULT 1 CHECK (severity >= 1 AND severity <= 10),

    -- When this signal was first seen
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),

    -- Count of occurrences
    occurrence_count INTEGER DEFAULT 1,

    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT,

    -- Composite unique constraint
    UNIQUE(identifier_type, signal_type, identifier_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_abuse_signals_identifier
ON trial_abuse_signals(identifier_type, identifier_hash);

CREATE INDEX IF NOT EXISTS idx_abuse_signals_severity
ON trial_abuse_signals(severity DESC)
WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_abuse_signals_last_seen
ON trial_abuse_signals(last_seen_at DESC);

-- =============================================================================
-- TABLE: trial_converted_subscriptions
-- Maps trials to their converted paid subscriptions
-- =============================================================================
CREATE TABLE IF NOT EXISTS trial_converted_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trial_id UUID NOT NULL REFERENCES free_trials(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

    -- Conversion details
    converted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    conversion_latency_hours NUMERIC(10,2),  -- Hours from trial start to conversion

    -- Plan transition
    from_plan_slug TEXT NOT NULL,
    to_plan_slug TEXT NOT NULL,

    -- Idempotency
    idempotency_key VARCHAR(64) UNIQUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_converted_trial
ON trial_converted_subscriptions(trial_id);

CREATE INDEX IF NOT EXISTS idx_converted_subscription
ON trial_converted_subscriptions(subscription_id);

CREATE INDEX IF NOT EXISTS idx_converted_at
ON trial_converted_subscriptions(converted_at);

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_trial_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_trial_updated_at ON free_trials;
CREATE TRIGGER trigger_trial_updated_at
    BEFORE UPDATE ON free_trials
    FOR EACH ROW EXECUTE FUNCTION update_trial_updated_at();

-- =============================================================================
-- TRIGGER: Auto-update last_seen_at for abuse signals
-- =============================================================================
CREATE OR REPLACE FUNCTION update_abuse_signal_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen_at = NOW();
    NEW.occurrence_count = OLD.occurrence_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger is applied only on UPDATE, not INSERT
-- For new signals, occurrence_count starts at 1

-- =============================================================================
-- FUNCTION: Calculate trial abuse risk score
-- Returns 0-100 risk score based on multiple factors
-- =============================================================================
CREATE OR REPLACE FUNCTION calculate_trial_abuse_risk(
    p_ip_hash TEXT,
    p_email_domain_hash TEXT,
    p_device_hash TEXT,
    p_user_agent_hash TEXT
) RETURNS INTEGER AS $$
DECLARE
    v_risk_score INTEGER := 0;
    v_ip_count INTEGER;
    v_email_domain_count INTEGER;
    v_device_count INTEGER;
BEGIN
    -- Check IP address frequency (same IP = potential abuse)
    IF p_ip_hash IS NOT NULL THEN
        SELECT COUNT(*) INTO v_ip_count
        FROM free_trials
        WHERE ip_address_hash = p_ip_hash
        AND status IN ('active', 'converted');

        -- Risk increases with each trial from same IP
        v_risk_score := v_risk_score + LEAST(v_ip_count * 15, 45);
    END IF;

    -- Check email domain frequency (same domain = potential abuse)
    IF p_email_domain_hash IS NOT NULL THEN
        SELECT COUNT(*) INTO v_email_domain_count
        FROM free_trials
        WHERE email_domain_hash = p_email_domain_hash
        AND status IN ('active', 'converted');

        -- Higher weight for email domain (more suspicious)
        v_risk_score := v_risk_score + LEAST(v_email_domain_count * 20, 50);
    END IF;

    -- Check device fingerprint
    IF p_device_hash IS NOT NULL THEN
        SELECT COUNT(*) INTO v_device_count
        FROM free_trials
        WHERE device_fingerprint_hash = p_device_hash
        AND status IN ('active', 'converted');

        -- Device match is highly suspicious
        v_risk_score := v_risk_score + LEAST(v_device_count * 30, 60);
    END IF;

    -- Cap at 100
    RETURN LEAST(v_risk_score, 100);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Start a trial (idempotent)
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
        -- Return existing trial (idempotent behavior)
        trial_id := v_existing_trial.id;
        status := v_existing_trial.status;
        started_at := v_existing_trial.started_at;
        expires_at := v_existing_trial.expires_at;
        is_new := FALSE;
        error_message := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check if idempotency key was used (for different outcome)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_trial
        FROM free_trials
        WHERE idempotency_key = p_idempotency_key;

        IF v_existing_trial IS NOT NULL THEN
            -- Return the previously created trial
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
        'trial.started',
        jsonb_build_object(
            'trial_days', p_trial_days,
            'plan_slug', p_plan_slug,
            'domain', p_domain,
            'source', p_source,
            'abuse_risk_score', v_abuse_risk
        ),
        'system',
        p_idempotency_key
    );

    -- Record abuse signals if risk is elevated
    IF v_abuse_risk >= 30 THEN
        -- IP-based signal
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

        -- Email domain signal
        IF v_email_domain_hash IS NOT NULL THEN
            INSERT INTO trial_abuse_signals (
                identifier_type,
                identifier_hash,
                signal_type,
                severity
            ) VALUES (
                'email_domain',
                v_email_domain_hash,
                'multiple_trials_same_email_domain',
                LEAST(v_abuse_risk / 10, 10)
            )
            ON CONFLICT (identifier_type, signal_type, identifier_hash)
            DO UPDATE SET
                last_seen_at = NOW(),
                occurrence_count = trial_abuse_signals.occurrence_count + 1;
        END IF;

        -- Record abuse detected event
        INSERT INTO trial_events (
            trial_id,
            event_type,
            event_data,
            triggered_by
        ) VALUES (
            v_trial_id,
            'trial.abuse_detected',
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
-- FUNCTION: Expire a trial
-- =============================================================================
CREATE OR REPLACE FUNCTION expire_trial(
    p_trial_id UUID,
    p_cancellation_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_trial free_trials%ROWTYPE;
    v_new_status TEXT := 'expired';
BEGIN
    -- Get current trial
    SELECT * INTO v_trial
    FROM free_trials
    WHERE id = p_trial_id;

    IF v_trial IS NULL THEN
        success := FALSE;
        error_message := 'Trial not found';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM trial_events
            WHERE trial_id = p_trial_id
            AND idempotency_key = p_idempotency_key
        ) THEN
            success := TRUE;
            error_message := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- Update trial status
    UPDATE free_trials
    SET status = v_new_status,
        cancellation_reason = COALESCE(p_cancellation_reason, 'Trial period ended'),
        updated_at = NOW()
    WHERE id = p_trial_id;

    -- Record event
    INSERT INTO trial_events (
        trial_id,
        event_type,
        event_data,
        triggered_by,
        idempotency_key
    ) VALUES (
        p_trial_id,
        'trial.expired',
        jsonb_build_object(
            'previous_status', (SELECT status FROM free_trials WHERE id = p_trial_id),
            'reason', COALESCE(p_cancellation_reason, 'Trial period ended')
        ),
        'system',
        p_idempotency_key
    );

    success := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Convert trial to paid subscription
-- =============================================================================
CREATE OR REPLACE FUNCTION convert_trial_to_paid(
    p_trial_id UUID,
    p_subscription_id UUID,
    p_to_plan_slug TEXT,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_trial free_trials%ROWTYPE;
    v_conversion_latency_hours NUMERIC(10,2);
BEGIN
    -- Get current trial
    SELECT * INTO v_trial
    FROM free_trials
    WHERE id = p_trial_id;

    IF v_trial IS NULL THEN
        success := FALSE;
        error_message := 'Trial not found';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM trial_converted_subscriptions
            WHERE trial_id = p_trial_id
            AND idempotency_key = p_idempotency_key
        ) THEN
            success := TRUE;
            error_message := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- Calculate conversion latency
    v_conversion_latency_hours := EXTRACT(EPOCH FROM (NOW() - v_trial.started_at)) / 3600;

    -- Update trial status
    UPDATE free_trials
    SET status = 'converted',
        converted_at = NOW(),
        converted_to_plan_slug = p_to_plan_slug,
        updated_at = NOW()
    WHERE id = p_trial_id;

    -- Record conversion
    INSERT INTO trial_converted_subscriptions (
        trial_id,
        subscription_id,
        converted_at,
        conversion_latency_hours,
        from_plan_slug,
        to_plan_slug,
        idempotency_key
    ) VALUES (
        p_trial_id,
        p_subscription_id,
        NOW(),
        v_conversion_latency_hours,
        v_trial.plan_slug,
        p_to_plan_slug,
        p_idempotency_key
    );

    -- Record event
    INSERT INTO trial_events (
        trial_id,
        event_type,
        event_data,
        triggered_by,
        idempotency_key
    ) VALUES (
        p_trial_id,
        'trial.converted',
        jsonb_build_object(
            'subscription_id', p_subscription_id,
            'from_plan_slug', v_trial.plan_slug,
            'to_plan_slug', p_to_plan_slug,
            'conversion_latency_hours', v_conversion_latency_hours
        ),
        'user',
        p_idempotency_key
    );

    success := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================
ALTER TABLE free_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_abuse_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_converted_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own trials
CREATE POLICY trials_select_own ON free_trials
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY trials_service_policy ON free_trials
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Service role only for events (internal use)
CREATE POLICY trial_events_service_policy ON trial_events
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Service role only for abuse signals (internal use)
CREATE POLICY trial_abuse_signals_service_policy ON trial_abuse_signals
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Service role only for converted subscriptions (internal use)
CREATE POLICY trial_converted_service_policy ON trial_converted_subscriptions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE free_trials IS 'Free trial tracking with abuse detection';
COMMENT ON TABLE trial_events IS 'Immutable event log for trial lifecycle (event sourcing)';
COMMENT ON TABLE trial_abuse_signals IS 'Abuse indicator tracking for fraud prevention';
COMMENT ON TABLE trial_converted_subscriptions IS 'Maps trials to converted paid subscriptions';

COMMENT ON COLUMN free_trials.abuse_risk_score IS '0-100 risk score calculated at trial creation';
COMMENT ON COLUMN free_trials.idempotency_key IS 'Ensures idempotent trial creation operations';
COMMENT ON COLUMN free_trials.source IS 'Marketing attribution: organic, marketing, referral, etc.';

-- =============================================================================
-- VERIFICATION QUERIES (run after migration)
-- =============================================================================
-- SELECT * FROM free_trials LIMIT 1;
-- SELECT * FROM trial_events LIMIT 1;
-- SELECT calculate_trial_abuse_risk(NULL, NULL, NULL, NULL);

COMMIT;

-- =============================================================================
-- Migration: XXX_trial_defaults.sql
-- Update plan_metadata to set trial_days for shop domain
-- =============================================================================
BEGIN;

-- Update shop domain plans to have 7-day trials
UPDATE plan_metadata pm
SET trial_days = 7
FROM pricing_plans pp
WHERE pm.plan_id = pp.id
AND pp.product_domain = 'shop'
AND pp.plan_slug = 'starter'
AND pm.trial_days = 0;

-- Verify
-- SELECT pp.plan_slug, pp.product_domain, pm.trial_days
-- FROM pricing_plans pp
-- JOIN plan_metadata pm ON pm.plan_id = pp.id
-- WHERE pp.product_domain = 'shop';

COMMIT;
