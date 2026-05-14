-- =============================================================================
-- Migration: 089_fix_start_trial_status_ambiguity.sql
-- Description: Fix ambiguous status references in the TEXT start_trial RPC.
-- =============================================================================
-
-- Root cause:
--   start_trial(...) returns a column named "status". Inside the PL/pgSQL body,
--   unqualified references like "status IN (...)" can refer either to that
--   output variable or to free_trials.status, causing PostgreSQL error 42702.
--
-- Fix:
--   Preserve the active TEXT user_id signature and qualify free_trials reads
--   with an alias. Keep start_trial_with_access(...) unchanged; it should keep
--   calling this function with p_user_id::TEXT from migration 088.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION start_trial(
    p_user_id TEXT,
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
    SELECT ft.*
    INTO v_existing_trial
    FROM free_trials ft
    WHERE ft.user_id = p_user_id
      AND ft.org_id = p_org_id
      AND ft.domain = p_domain
      AND ft.status IN ('active', 'expiring_soon');

    IF v_existing_trial IS NOT NULL THEN
        trial_id := v_existing_trial.id;
        v_status := v_existing_trial.status;
        status := v_status;
        started_at := v_existing_trial.started_at;
        expires_at := v_existing_trial.expires_at;
        is_new := FALSE;
        error_message := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT ft.*
        INTO v_existing_trial
        FROM free_trials ft
        WHERE ft.idempotency_key = p_idempotency_key;

        IF v_existing_trial IS NOT NULL THEN
            trial_id := v_existing_trial.id;
            v_status := v_existing_trial.status;
            status := v_status;
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

    v_started_at := NOW();
    v_expires_at := v_started_at + (p_trial_days || ' days')::INTERVAL;
    v_status := 'active';

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
        v_status,
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

    -- Return new trial
    trial_id := v_trial_id;
    status := v_status;
    started_at := v_started_at;
    expires_at := v_expires_at;
    is_new := TRUE;
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION start_trial(
    TEXT, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
