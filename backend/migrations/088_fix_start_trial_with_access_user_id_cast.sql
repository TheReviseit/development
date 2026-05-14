-- =============================================================================
-- Migration: 088_fix_start_trial_with_access_user_id_cast.sql
-- Description: Fix trial start RPC signature mismatch after free_trials.user_id
--              was changed from UUID to TEXT.
-- =============================================================================
--
-- Root cause:
--   082_fix_free_trials_user_id changes start_trial(p_user_id) to TEXT.
--   085_start_trial_with_access kept p_user_id as UUID and called:
--     start_trial(p_user_id, ...)
--   Postgres therefore looked for start_trial(uuid, uuid, ...) and failed.
--
-- Fix:
--   Keep start_trial_with_access(p_user_id UUID) so user_products can still be
--   written with the UUID user id, but cast p_user_id::TEXT for the inner
--   free_trials/start_trial call.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION start_trial_with_access(
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
    access_granted BOOLEAN,
    abuse_risk_score INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_trial_id UUID;
    v_status TEXT;
    v_started_at TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_is_new BOOLEAN;
    v_error_message TEXT;
    v_access_granted BOOLEAN := FALSE;
    v_abuse_risk INTEGER := 0;
BEGIN
    SELECT
        t.trial_id,
        t.status,
        t.started_at,
        t.expires_at,
        t.is_new,
        t.error_message
    INTO
        v_trial_id,
        v_status,
        v_started_at,
        v_expires_at,
        v_is_new,
        v_error_message
    FROM start_trial(
        p_user_id::TEXT,
        p_org_id,
        p_plan_id,
        p_plan_slug,
        p_domain,
        p_trial_days,
        p_source,
        p_ip_address,
        p_email_domain,
        p_device_fingerprint,
        p_user_agent,
        p_idempotency_key
    ) t;

    IF v_error_message IS NOT NULL THEN
        trial_id := v_trial_id;
        status := v_status;
        started_at := v_started_at;
        expires_at := v_expires_at;
        is_new := v_is_new;
        access_granted := FALSE;
        abuse_risk_score := 0;
        error_message := v_error_message;
        RETURN NEXT;
        RETURN;
    END IF;

    INSERT INTO user_products (
        user_id,
        product,
        status,
        activated_by,
        trial_ends_at,
        trial_days
    ) VALUES (
        p_user_id,
        p_domain,
        'trial',
        'system',
        v_expires_at,
        p_trial_days
    )
    ON CONFLICT (user_id, product) DO UPDATE SET
        status = CASE
            WHEN user_products.status = 'active' THEN 'active'
            WHEN user_products.status IN ('suspended', 'cancelled') THEN 'trial'
            ELSE user_products.status
        END,
        trial_ends_at = CASE
            WHEN user_products.status = 'active' THEN user_products.trial_ends_at
            ELSE COALESCE(EXCLUDED.trial_ends_at, user_products.trial_ends_at)
        END,
        trial_days = CASE
            WHEN user_products.status = 'active' THEN user_products.trial_days
            ELSE EXCLUDED.trial_days
        END,
        updated_at = NOW();

    v_access_granted := TRUE;

    SELECT ft.abuse_risk_score INTO v_abuse_risk
    FROM free_trials ft
    WHERE ft.id = v_trial_id;

    trial_id := v_trial_id;
    status := v_status;
    started_at := v_started_at;
    expires_at := v_expires_at;
    is_new := v_is_new;
    access_granted := v_access_granted;
    abuse_risk_score := COALESCE(v_abuse_risk, 0);
    error_message := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION start_trial_with_access(
    UUID, UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- free_trials.user_id is TEXT, while users.id is UUID. Compare via text so
-- onboarding completion still works after this trial RPC starts succeeding.
CREATE OR REPLACE FUNCTION auto_complete_onboarding_on_trial()
RETURNS TRIGGER AS $$
DECLARE
    v_existing TIMESTAMPTZ;
    v_rows_updated INTEGER;
BEGIN
    SELECT onboarding_completed_at
    INTO v_existing
    FROM users
    WHERE id::TEXT = NEW.user_id;

    IF v_existing IS NOT NULL THEN
        RAISE LOG '[trigger] User % already onboarded', NEW.user_id;
        RETURN NEW;
    END IF;

    UPDATE users
    SET onboarding_completed_at = NOW(),
        onboarding_completed_reason = 'trial_start',
        onboarding_completed_via = 'trigger',
        updated_at = NOW()
    WHERE id::TEXT = NEW.user_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated > 0 THEN
        RAISE LOG '[trigger:SUCCESS] onboarding_completed user_id=% trial_id=%', NEW.user_id, NEW.id;
    ELSE
        RAISE WARNING '[trigger:ERROR] Failed to update user %', NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP VIEW IF EXISTS v_users_needing_onboarding CASCADE;
CREATE VIEW v_users_needing_onboarding AS
SELECT ft.id, ft.user_id, ft.status, ft.created_at
FROM free_trials ft
JOIN users u ON u.id::TEXT = ft.user_id
WHERE ft.status IN ('active', 'expiring_soon')
  AND u.onboarding_completed_at IS NULL;

COMMIT;
