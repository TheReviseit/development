-- =============================================================================
-- COMPLETE FIX: Free Trial Functions
-- Fix for: column reference "status" is ambiguous
-- Run this entire script in Supabase SQL Editor
-- =============================================================================

-- Fix start_trial function - use table qualified column reference
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
    AND free_trials.status IN ('active', 'expiring_soon');

    IF v_existing_trial IS NOT NULL THEN
        trial_id := v_existing_trial.id;
        v_status := v_existing_trial.status;
        started_at := v_existing_trial.started_at;
        expires_at := v_existing_trial.expires_at;
        is_new := FALSE;
        error_message := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check if idempotency key was used
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_trial
        FROM free_trials
        WHERE idempotency_key = p_idempotency_key;

        IF v_existing_trial IS NOT NULL THEN
            trial_id := v_existing_trial.id;
            v_status := v_existing_trial.status;
            started_at := v_existing_trial.started_at;
            expires_at := v_existing_trial.expires_at;
            is_new := FALSE;
            error_message := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- Hash identifiers
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

    -- Calculate abuse risk
    v_abuse_risk := calculate_trial_abuse_risk(
        v_ip_hash, v_email_domain_hash, v_device_hash, v_user_agent_hash
    );

    -- Create trial
    v_started_at := NOW();
    v_expires_at := v_started_at + (p_trial_days || ' days')::INTERVAL;

    INSERT INTO free_trials (
        user_id, org_id, plan_id, plan_slug, domain, trial_days,
        started_at, expires_at, status, source,
        ip_address_hash, email_domain_hash, device_fingerprint_hash,
        user_agent_hash, abuse_risk_score, idempotency_key
    ) VALUES (
        p_user_id, p_org_id, p_plan_id, p_plan_slug, p_domain, p_trial_days,
        v_started_at, v_expires_at, 'active', p_source,
        v_ip_hash, v_email_domain_hash, v_device_hash,
        v_user_agent_hash, v_abuse_risk, p_idempotency_key
    )
    RETURNING id INTO v_trial_id;

    -- Record event
    INSERT INTO trial_events (trial_id, event_type, event_data, triggered_by, idempotency_key)
    VALUES (v_trial_id, 'trial.started',
        jsonb_build_object(
            'trial_days', p_trial_days, 'plan_slug', p_plan_slug,
            'domain', p_domain, 'source', p_source, 'abuse_risk_score', v_abuse_risk
        ), 'system', p_idempotency_key);

    -- Return new trial
    trial_id := v_trial_id;
    v_status := 'active';
    started_at := v_started_at;
    expires_at := v_expires_at;
    is_new := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Fix expire_trial function
CREATE OR REPLACE FUNCTION expire_trial(
    p_trial_id UUID,
    p_cancellation_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (success BOOLEAN, error_message TEXT) AS $$
DECLARE
    v_trial free_trials%ROWTYPE;
    v_new_status TEXT := 'expired';
    v_previous_status TEXT;
BEGIN
    SELECT * INTO v_trial FROM free_trials WHERE id = p_trial_id;

    IF v_trial IS NULL THEN
        success := FALSE;
        error_message := 'Trial not found';
        RETURN NEXT;
        RETURN;
    END IF;
    
    v_previous_status := v_trial.status;

    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM trial_events
            WHERE trial_id = p_trial_id AND idempotency_key = p_idempotency_key
        ) THEN
            success := TRUE;
            error_message := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    UPDATE free_trials
    SET status = v_new_status,
        cancellation_reason = COALESCE(p_cancellation_reason, 'Trial period ended'),
        updated_at = NOW()
    WHERE id = p_trial_id;

    INSERT INTO trial_events (trial_id, event_type, event_data, triggered_by, idempotency_key)
    VALUES (p_trial_id, 'trial.expired',
        jsonb_build_object('previous_status', v_previous_status,
            'reason', COALESCE(p_cancellation_reason, 'Trial period ended')),
        'system', p_idempotency_key);

    success := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Fix convert_trial_to_paid function
CREATE OR REPLACE FUNCTION convert_trial_to_paid(
    p_trial_id UUID,
    p_subscription_id UUID,
    p_to_plan_slug TEXT,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (success BOOLEAN, error_message TEXT) AS $$
DECLARE
    v_trial free_trials%ROWTYPE;
    v_conversion_latency_hours NUMERIC(10,2);
BEGIN
    SELECT * INTO v_trial FROM free_trials WHERE id = p_trial_id;

    IF v_trial IS NULL THEN
        success := FALSE;
        error_message := 'Trial not found';
        RETURN NEXT;
        RETURN;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM trial_converted_subscriptions
            WHERE trial_id = p_trial_id AND idempotency_key = p_idempotency_key
        ) THEN
            success := TRUE;
            error_message := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    v_conversion_latency_hours := EXTRACT(EPOCH FROM (NOW() - v_trial.started_at)) / 3600;

    UPDATE free_trials
    SET status = 'converted', converted_at = NOW(),
        converted_to_plan_slug = p_to_plan_slug, updated_at = NOW()
    WHERE id = p_trial_id;

    INSERT INTO trial_converted_subscriptions (
        trial_id, subscription_id, converted_at, conversion_latency_hours,
        from_plan_slug, to_plan_slug, idempotency_key
    ) VALUES (
        p_trial_id, p_subscription_id, NOW(), v_conversion_latency_hours,
        v_trial.plan_slug, p_to_plan_slug, p_idempotency_key
    );

    INSERT INTO trial_events (trial_id, event_type, event_data, triggered_by, idempotency_key)
    VALUES (p_trial_id, 'trial.converted',
        jsonb_build_object('subscription_id', p_subscription_id,
            'from_plan_slug', v_trial.plan_slug, 'to_plan_slug', p_to_plan_slug,
            'conversion_latency_hours', v_conversion_latency_hours),
        'user', p_idempotency_key);

    success := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Verify functions are created
SELECT 'Functions recreated successfully' as result;