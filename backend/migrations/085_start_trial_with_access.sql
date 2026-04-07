-- =============================================================================
-- Migration: 085_start_trial_with_access.sql
-- Description: Atomic RPC for trial creation + product access grant
-- =============================================================================
--
-- PURPOSE:
--   Bridges the architectural gap between the Trial Engine (free_trials table)
--   and the Auth Sync system (user_products table). Previously, starting a
--   trial only wrote to free_trials, leaving user_products empty — causing
--   auth sync to return PRODUCT_NOT_ENABLED → infinite redirect loop.
--
-- DESIGN:
--   Single Postgres transaction wrapping:
--   1. Existing start_trial() RPC (idempotent, abuse-aware)
--   2. user_products UPSERT (idempotent, downgrade-safe)
--
-- CROSS-SERVICE WRITE ANNOTATION:
--   This RPC writes to user_products, which is conceptually owned by the
--   Next.js auth sync layer. This is the correct pragmatic fix for atomicity.
--   Long-term TODO: Replace with event/webhook so auth-sync owns its table.
--
-- Author: Staff+ Engineering
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
    -- Individual variables for set-returning function output
    -- (Cannot use SELECT * INTO RECORD for RETURNS TABLE functions)
    v_trial_id UUID;
    v_status TEXT;
    v_started_at TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_is_new BOOLEAN;
    v_error_message TEXT;
    v_access_granted BOOLEAN := FALSE;
    v_abuse_risk INTEGER := 0;
BEGIN
    -- =========================================================================
    -- Step 1: Call existing start_trial (handles idempotency, abuse detection)
    -- This is a set-returning function — capture output into discrete variables
    -- =========================================================================
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
        p_user_id, p_org_id, p_plan_id, p_plan_slug, p_domain,
        p_trial_days, p_source, p_ip_address, p_email_domain,
        p_device_fingerprint, p_user_agent, p_idempotency_key
    ) t;

    -- Check if start_trial returned an error
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

    -- =========================================================================
    -- Step 2: Atomically grant product access (same transaction as step 1)
    -- Uses UPSERT with ON CONFLICT to be idempotent
    -- CRITICAL: Does NOT downgrade active → trial (protects paid users)
    -- =========================================================================
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
            -- Don't downgrade: if user already has 'active' (paid), keep it
            WHEN user_products.status = 'active' THEN 'active'
            -- Reactivate suspended/cancelled users with trial
            WHEN user_products.status IN ('suspended', 'cancelled') THEN 'trial'
            -- Keep existing trial status if already trial
            ELSE user_products.status
        END,
        trial_ends_at = CASE
            -- Don't overwrite if user is active (paid)
            WHEN user_products.status = 'active' THEN user_products.trial_ends_at
            ELSE COALESCE(EXCLUDED.trial_ends_at, user_products.trial_ends_at)
        END,
        trial_days = CASE
            WHEN user_products.status = 'active' THEN user_products.trial_days
            ELSE EXCLUDED.trial_days
        END,
        updated_at = NOW();

    v_access_granted := TRUE;

    -- =========================================================================
    -- Step 3: Retrieve abuse risk score for observability
    -- =========================================================================
    SELECT ft.abuse_risk_score INTO v_abuse_risk
    FROM free_trials ft
    WHERE ft.id = v_trial_id;

    -- =========================================================================
    -- Return combined result
    -- =========================================================================
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

-- =============================================================================
-- VERIFICATION
-- =============================================================================
SELECT 'start_trial_with_access function created successfully' AS result;

-- Verify function signature
SELECT
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
WHERE p.proname = 'start_trial_with_access';

COMMIT;
