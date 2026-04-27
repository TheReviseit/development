-- Auth Sync “Final 5%” Hardening
-- - Lock-safe idempotency (claim-first)
-- - Production-grade background_jobs (retries + dead-letter + locks)
-- - Provisioning RPC returns full payload (user + membership + has_access)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) Lock-safe idempotency: auth_sync_idempotency
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_sync_idempotency (
  idempotency_key text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  response_body jsonb NULL,
  status_code integer NULL,
  error_code text NULL,
  locked_by uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sync_idempotency_expires_at
  ON auth_sync_idempotency (expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sync_idempotency_status
  ON auth_sync_idempotency (status);

CREATE OR REPLACE FUNCTION auth_sync_claim(
  p_idempotency_key text,
  p_locked_by uuid,
  p_ttl_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_claimed boolean := false;
  v_row auth_sync_idempotency%rowtype;
BEGIN
  -- Atomic upsert: insert new row OR reclaim an expired lock.
  -- The DO UPDATE only fires when the existing row's lock has expired
  -- (status='processing' AND expires_at < now()).  Completed/failed rows
  -- are never overwritten because the WHERE guard excludes them.
  INSERT INTO auth_sync_idempotency (
    idempotency_key, status, locked_by, locked_at, expires_at
  ) VALUES (
    p_idempotency_key, 'processing', p_locked_by, now(),
    now() + make_interval(secs => p_ttl_seconds)
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET
    status     = 'processing',
    locked_by  = p_locked_by,
    locked_at  = now(),
    expires_at = now() + make_interval(secs => p_ttl_seconds),
    updated_at = now()
  WHERE
    auth_sync_idempotency.status = 'processing'
    AND auth_sync_idempotency.expires_at < now()
  RETURNING * INTO v_row;

  -- If RETURNING populated v_row, we are the owner (either fresh insert
  -- or successful reclaim of an expired lock).
  IF v_row.idempotency_key IS NOT NULL
     AND v_row.locked_by = p_locked_by THEN
    v_claimed := true;
  ELSE
    -- Row existed but was NOT reclaimed (active lock or completed).
    -- Read the current state for the caller to decide (poll / return cached).
    SELECT * INTO v_row
    FROM auth_sync_idempotency
    WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object(
    'claimed', v_claimed,
    'status', v_row.status,
    'response_body', v_row.response_body,
    'status_code', v_row.status_code,
    'error_code', v_row.error_code,
    'expires_at', v_row.expires_at,
    'locked_by', v_row.locked_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION auth_sync_get(
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row auth_sync_idempotency%rowtype;
BEGIN
  SELECT * INTO v_row
  FROM auth_sync_idempotency
  WHERE idempotency_key = p_idempotency_key;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', v_row.status,
    'response_body', v_row.response_body,
    'status_code', v_row.status_code,
    'error_code', v_row.error_code,
    'expires_at', v_row.expires_at,
    'locked_by', v_row.locked_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION auth_sync_complete(
  p_idempotency_key text,
  p_locked_by uuid,
  p_status text,
  p_response_body jsonb,
  p_status_code integer,
  p_error_code text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE auth_sync_idempotency
  SET
    status = p_status,
    response_body = p_response_body,
    status_code = p_status_code,
    error_code = p_error_code,
    updated_at = now()
  WHERE
    idempotency_key = p_idempotency_key
    AND locked_by = p_locked_by
    AND status = 'processing'
    AND expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN (v_updated = 1);
END;
$$;

-- ============================================================================
-- 2) Durable background_jobs with retries + dead-letter + locking
-- ============================================================================

CREATE TABLE IF NOT EXISTS background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_lettered')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid NULL,
  locked_until timestamptz NULL,
  last_error text NULL,
  traceparent text NULL,
  request_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_pickup
  ON background_jobs (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_background_jobs_locked_until
  ON background_jobs (locked_until)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS background_jobs_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL,
  max_attempts integer NOT NULL,
  last_error text NULL,
  traceparent text NULL,
  request_id text NULL,
  dead_lettered_at timestamptz NOT NULL DEFAULT now(),
  final_error text NULL
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_dead_letter_job_id
  ON background_jobs_dead_letter (job_id);

-- ============================================================================
-- 3) Provisioning RPC: return full payload (user + membership + has_access)
-- ============================================================================

CREATE OR REPLACE FUNCTION provision_user_with_membership(
  p_firebase_uid text,
  p_email text,
  p_full_name text,
  p_phone text,
  p_product text,
  p_allow_create boolean,
  p_is_self_service boolean,
  p_trial_days integer DEFAULT 14,
  p_request_id text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_traceparent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%rowtype;
  v_created boolean := false;
  v_membership user_products%rowtype;
  v_has_access boolean := false;
  v_trial_ends_at timestamptz;
  v_now timestamptz := now();
  v_action text;
BEGIN
  -- 1) Load user by firebase_uid (primary identity key)
  SELECT * INTO v_user
  FROM users
  WHERE firebase_uid = p_firebase_uid
  LIMIT 1;

  -- 2) Email-based migration (Firebase project switch)
  IF NOT FOUND AND COALESCE(p_email, '') <> '' THEN
    SELECT * INTO v_user
    FROM users
    WHERE lower(email) = lower(p_email)
    LIMIT 1;

    IF FOUND THEN
      UPDATE users
      SET firebase_uid = p_firebase_uid, updated_at = v_now
      WHERE id = v_user.id
      RETURNING * INTO v_user;
    END IF;
  END IF;

  -- 3) Create user if missing and allowed
  IF NOT FOUND THEN
    IF NOT p_allow_create THEN
      RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO users (firebase_uid, full_name, email, phone, role)
    VALUES (p_firebase_uid, p_full_name, lower(p_email), p_phone, 'user')
    RETURNING * INTO v_user;
    v_created := true;
  END IF;

  -- 4) Ensure baseline dashboard membership (always accessible)
  INSERT INTO user_products (user_id, product, status, activated_by)
  VALUES (v_user.id, 'dashboard', 'active', 'system')
  ON CONFLICT (user_id, product) DO NOTHING;

  -- 5) Ensure current product membership where applicable
  IF COALESCE(p_product, '') = '' OR p_product = 'dashboard' THEN
    v_has_access := true;
    SELECT * INTO v_membership
    FROM user_products
    WHERE user_id = v_user.id AND product = 'dashboard'
    LIMIT 1;
  ELSE
    -- Load current membership (if any)
    SELECT * INTO v_membership
    FROM user_products
    WHERE user_id = v_user.id AND product = p_product
    LIMIT 1;

    -- Create trial membership when allowed and self-service
    IF NOT FOUND AND p_allow_create AND p_is_self_service THEN
      v_trial_ends_at := v_now + make_interval(days => p_trial_days);

      INSERT INTO user_products (
        user_id, product, status, activated_by, trial_ends_at, trial_days
      ) VALUES (
        v_user.id, p_product, 'trial', 'signup', v_trial_ends_at, p_trial_days
      )
      ON CONFLICT (user_id, product) DO UPDATE
      SET updated_at = v_now
      RETURNING * INTO v_membership;

      v_action := 'trial_started';
      BEGIN
        INSERT INTO product_activation_logs (
          user_id, product, action, new_status, initiated_by,
          request_id, ip_address, user_agent,
          metadata
        ) VALUES (
          v_user.id, p_product, v_action, 'trial', 'signup',
          p_request_id, NULLIF(p_ip_address, '')::inet, p_user_agent,
          jsonb_build_object('traceparent', p_traceparent)
        );
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END;
    END IF;

    -- Fallback: subscription exists, but membership missing
    IF COALESCE(v_membership.id::text, '') = '' THEN
      IF EXISTS (
        SELECT 1
        FROM subscriptions
        WHERE user_id = v_user.id
          AND product_domain = p_product
          AND status IN ('active', 'pending_upgrade')
        LIMIT 1
      ) THEN
        INSERT INTO user_products (user_id, product, status, activated_by)
        VALUES (v_user.id, p_product, 'active', 'system')
        ON CONFLICT (user_id, product) DO UPDATE
        SET status = 'active', activated_by = 'system', updated_at = v_now
        RETURNING * INTO v_membership;

        v_action := 'activated';
        BEGIN
          INSERT INTO product_activation_logs (
            user_id, product, action, new_status, initiated_by,
            request_id, ip_address, user_agent,
            metadata
          ) VALUES (
            v_user.id, p_product, v_action, 'active', 'system',
            p_request_id, NULLIF(p_ip_address, '')::inet, p_user_agent,
            jsonb_build_object('traceparent', p_traceparent)
          );
        EXCEPTION WHEN undefined_table THEN
          NULL;
        END;
      END IF;
    END IF;

    -- Access decision
    IF COALESCE(v_membership.id::text, '') <> '' THEN
      IF v_membership.status IN ('active', 'trial') THEN
        IF v_membership.status = 'trial'
           AND v_membership.trial_ends_at IS NOT NULL
           AND v_membership.trial_ends_at < v_now THEN
          v_has_access := false;
        ELSE
          v_has_access := true;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user', to_jsonb(v_user),
    'membership', CASE WHEN COALESCE(v_membership.id::text, '') = '' THEN NULL ELSE to_jsonb(v_membership) END,
    'created', v_created,
    'has_access', v_has_access
  );
END;
$$;
