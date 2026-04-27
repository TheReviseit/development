-- =============================================================================
-- Migration 082: Fix Free Trials User ID Type
-- Description: Align free_trials table with unified Firebase UID system
-- =============================================================================

BEGIN;

-- 1. Drop dependent view to allow column alter
DROP VIEW IF EXISTS v_users_needing_onboarding CASCADE;

-- 2. Drop foreign key constraint to auth.users if it exists
ALTER TABLE free_trials DROP CONSTRAINT IF EXISTS free_trials_user_id_fkey;

-- 3. Alter column type from UUID to TEXT
ALTER TABLE free_trials ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- 4. Update the start_trial function signature to accept TEXT for user_id
DROP FUNCTION IF EXISTS start_trial(UUID, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

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
        trial_id := v_existing_trial.id;
        status := v_existing_trial.status;
        started_at := v_existing_trial.started_at;
        expires_at := v_existing_trial.expires_at;
        is_new := FALSE;
        error_message := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

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

-- 5. Drop the RLS policy that relied on auth.uid()
DROP POLICY IF EXISTS trials_select_own ON free_trials;

-- Recreate policy using true (Firebase UID logic is handled by backend)
CREATE POLICY trials_select_own ON free_trials
    FOR SELECT USING (true);

-- 6. Update onboarding trigger to use firebase_uid instead of id
CREATE OR REPLACE FUNCTION auto_complete_onboarding_on_trial()
RETURNS TRIGGER AS $$
DECLARE v_existing TIMESTAMPTZ; v_rows_updated INTEGER;
BEGIN
  SELECT onboarding_completed_at INTO v_existing FROM users WHERE firebase_uid = NEW.user_id;
  IF v_existing IS NOT NULL THEN
    RAISE LOG '[trigger] User % already onboarded', NEW.user_id;
    RETURN NEW;
  END IF;
  UPDATE users SET onboarding_completed_at = NOW(), onboarding_completed_reason = 'trial_start', 
      onboarding_completed_via = 'trigger', updated_at = NOW() WHERE firebase_uid = NEW.user_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated > 0 THEN
    RAISE LOG '[trigger:SUCCESS] onboarding_completed user_id=% trial_id=%', NEW.user_id, NEW.id;
  ELSE
    RAISE WARNING '[trigger:ERROR] Failed to update user %', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Recreate the health check view mapping to firebase_uid
CREATE OR REPLACE VIEW v_users_needing_onboarding AS
SELECT ft.id, ft.user_id, ft.status, ft.created_at
FROM free_trials ft JOIN users u ON ft.user_id = u.firebase_uid
WHERE ft.status IN ('active', 'expiring_soon') AND u.onboarding_completed_at IS NULL;

COMMIT;
