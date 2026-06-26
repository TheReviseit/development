-- ===================================================================
-- Migration 20260625000000: Email verification performance + security
-- ===================================================================
-- Hardened verify_email_code RPC, audit SLA table, OTP hash columns,
-- composite index, auth sync warm cache, and pg_cron maintenance jobs.
-- ===================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. verification_codes schema extensions (dual-read hash migration)
-- =============================================================================
ALTER TABLE verification_codes
  ADD COLUMN IF NOT EXISTS code_hash TEXT,
  ADD COLUMN IF NOT EXISTS hash_version INTEGER;

CREATE INDEX IF NOT EXISTS idx_verification_codes_active
  ON verification_codes (user_id, created_at DESC)
  WHERE verified = false;

COMMENT ON COLUMN verification_codes.expires_at IS
  'Code expiration timestamp (30 minutes from creation; no grace window)';

-- =============================================================================
-- 2. Mandatory SLA audit table
-- =============================================================================
CREATE TABLE IF NOT EXISTS verify_email_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid_suffix TEXT NOT NULL,
  outcome TEXT NOT NULL,
  duration_ms NUMERIC NOT NULL,
  cache_hit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verify_email_audit_created_at
  ON verify_email_audit (created_at DESC);

ALTER TABLE verify_email_audit ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Auth sync warm cache (60s success fast path)
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth_sync_warm_cache (
  cache_key TEXT PRIMARY KEY,
  response_body JSONB NOT NULL,
  status_code INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sync_warm_cache_expires_at
  ON auth_sync_warm_cache (expires_at);

CREATE OR REPLACE FUNCTION auth_sync_warm_get(
  p_cache_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row auth_sync_warm_cache%ROWTYPE;
BEGIN
  IF p_cache_key IS NULL OR length(p_cache_key) < 8 OR length(p_cache_key) > 128 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM auth_sync_warm_cache
  WHERE cache_key = p_cache_key
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'status_code', v_row.status_code,
    'response_body', v_row.response_body
  );
END;
$$;

CREATE OR REPLACE FUNCTION auth_sync_warm_put(
  p_cache_key TEXT,
  p_response_body JSONB,
  p_status_code INTEGER,
  p_ttl_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_cache_key IS NULL OR length(p_cache_key) < 8 OR length(p_cache_key) > 128 THEN
    RETURN false;
  END IF;

  IF p_status_code IS NULL OR p_status_code < 200 OR p_status_code >= 300 THEN
    RETURN false;
  END IF;

  INSERT INTO auth_sync_warm_cache (
    cache_key,
    response_body,
    status_code,
    expires_at
  ) VALUES (
    p_cache_key,
    p_response_body,
    p_status_code,
    now() + make_interval(secs => GREATEST(1, LEAST(p_ttl_seconds, 300)))
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    response_body = EXCLUDED.response_body,
    status_code = EXCLUDED.status_code,
    expires_at = EXCLUDED.expires_at,
    created_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION auth_sync_warm_get(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_sync_warm_put(TEXT, JSONB, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_sync_warm_get(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION auth_sync_warm_put(TEXT, JSONB, INTEGER, INTEGER) TO service_role;

-- =============================================================================
-- 4. OTP hash helper (reads secret from app setting when configured)
-- =============================================================================
CREATE OR REPLACE FUNCTION private_otp_hmac_secret()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(current_setting('app.verify_otp_hmac_secret', true), '');
$$;

CREATE OR REPLACE FUNCTION compute_verification_code_hash(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN NULL;
  END IF;

  v_secret := private_otp_hmac_secret();
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN NULL;
  END IF;

  RETURN encode(hmac(p_code::bytea, v_secret::bytea, 'sha256'), 'hex');
END;
$$;

-- =============================================================================
-- 5. Transactional send: invalidate old codes + insert new code
-- =============================================================================
CREATE OR REPLACE FUNCTION issue_verification_code(
  p_user_id TEXT,
  p_code TEXT,
  p_code_hash TEXT,
  p_hash_version INTEGER,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL OR length(p_user_id) < 10 OR length(p_user_id) > 128 THEN
    RAISE EXCEPTION 'invalid_user_id';
  END IF;

  IF p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_expires_at';
  END IF;

  UPDATE verification_codes
  SET verified = true
  WHERE user_id = p_user_id
    AND verified = false;

  INSERT INTO verification_codes (
    user_id,
    code,
    code_hash,
    hash_version,
    expires_at,
    verified,
    attempts
  ) VALUES (
    p_user_id,
    CASE
      WHEN current_setting('app.verify_otp_hash_only', true) = 'true' THEN '000000'
      ELSE p_code
    END,
    COALESCE(p_code_hash, compute_verification_code_hash(p_code)),
    COALESCE(p_hash_version, CASE WHEN p_code_hash IS NOT NULL THEN 1 ELSE NULL END),
    p_expires_at,
    false,
    0
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION issue_verification_code(TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue_verification_code(TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ) TO service_role;

-- =============================================================================
-- 6. Hardened verify_email_code RPC + audit write
-- =============================================================================
CREATE OR REPLACE FUNCTION verify_email_code(
  p_firebase_uid TEXT,
  p_code TEXT,
  p_cache_hit BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_started TIMESTAMPTZ := clock_timestamp();
  v_duration_ms NUMERIC;
  v_uid_suffix TEXT;
  v_row verification_codes%ROWTYPE;
  v_next_attempts INTEGER;
  v_hash_only BOOLEAN;
  v_expected_hash TEXT;
  v_code_matches BOOLEAN := false;
  v_outcome TEXT;
  v_result JSONB;
BEGIN
  IF p_firebase_uid IS NULL OR length(p_firebase_uid) < 10 OR length(p_firebase_uid) > 128 THEN
    RAISE EXCEPTION 'invalid_uid';
  END IF;

  IF p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  v_uid_suffix := right(p_firebase_uid, 6);
  v_hash_only := coalesce(nullif(current_setting('app.verify_otp_hash_only', true), ''), 'false') = 'true';
  v_expected_hash := compute_verification_code_hash(p_code);

  -- Idempotent success when already verified
  IF EXISTS (
    SELECT 1 FROM users
    WHERE firebase_uid = p_firebase_uid
      AND email_verified = true
  ) THEN
    v_duration_ms := extract(epoch FROM (clock_timestamp() - v_started)) * 1000;
    v_outcome := 'success';
    INSERT INTO verify_email_audit (firebase_uid_suffix, outcome, duration_ms, cache_hit)
    VALUES (v_uid_suffix, v_outcome, v_duration_ms, p_cache_hit);
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Email is already verified',
      'already_verified', true,
      'duration_ms', v_duration_ms
    );
  END IF;

  SELECT * INTO v_row
  FROM verification_codes
  WHERE user_id = p_firebase_uid
    AND verified = false
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_duration_ms := extract(epoch FROM (clock_timestamp() - v_started)) * 1000;
    v_outcome := 'invalid_code';
    INSERT INTO verify_email_audit (firebase_uid_suffix, outcome, duration_ms, cache_hit)
    VALUES (v_uid_suffix, v_outcome, v_duration_ms, p_cache_hit);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'The verification code is incorrect or expired.',
      'outcome', v_outcome,
      'duration_ms', v_duration_ms
    );
  END IF;

  IF now() > v_row.expires_at THEN
    UPDATE verification_codes
    SET verified = true
    WHERE id = v_row.id
      AND verified = false;

    v_duration_ms := extract(epoch FROM (clock_timestamp() - v_started)) * 1000;
    v_outcome := 'expired';
    INSERT INTO verify_email_audit (firebase_uid_suffix, outcome, duration_ms, cache_hit)
    VALUES (v_uid_suffix, v_outcome, v_duration_ms, p_cache_hit);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Verification code has expired. Please request a new one.',
      'outcome', v_outcome,
      'duration_ms', v_duration_ms
    );
  END IF;

  IF coalesce(v_row.attempts, 0) >= 3 THEN
    v_duration_ms := extract(epoch FROM (clock_timestamp() - v_started)) * 1000;
    v_outcome := 'invalid_code';
    INSERT INTO verify_email_audit (firebase_uid_suffix, outcome, duration_ms, cache_hit)
    VALUES (v_uid_suffix, v_outcome, v_duration_ms, p_cache_hit);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Too many failed attempts. Please request a new code.',
      'outcome', v_outcome,
      'duration_ms', v_duration_ms
    );
  END IF;

  IF v_hash_only THEN
    v_code_matches := v_row.code_hash IS NOT NULL AND v_row.code_hash = v_expected_hash;
  ELSE
    v_code_matches :=
      (v_row.code_hash IS NOT NULL AND v_expected_hash IS NOT NULL AND v_row.code_hash = v_expected_hash)
      OR (v_row.code = p_code);
  END IF;

  IF NOT v_code_matches THEN
    v_next_attempts := coalesce(v_row.attempts, 0) + 1;

    UPDATE verification_codes
    SET attempts = v_next_attempts,
        verified = CASE WHEN v_next_attempts >= 3 THEN true ELSE verified END
    WHERE id = v_row.id
      AND verified = false;

    v_duration_ms := extract(epoch FROM (clock_timestamp() - v_started)) * 1000;
    v_outcome := 'invalid_code';
    INSERT INTO verify_email_audit (firebase_uid_suffix, outcome, duration_ms, cache_hit)
    VALUES (v_uid_suffix, v_outcome, v_duration_ms, p_cache_hit);

    IF v_next_attempts >= 3 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Too many failed attempts. Please request a new code.',
        'outcome', v_outcome,
        'duration_ms', v_duration_ms
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'The verification code is incorrect. Please check the code and try again.',
      'attempts_remaining', GREATEST(3 - v_next_attempts, 0),
      'outcome', v_outcome,
      'duration_ms', v_duration_ms
    );
  END IF;

  UPDATE verification_codes
  SET verified = true
  WHERE id = v_row.id
    AND verified = false;

  IF NOT FOUND THEN
    v_duration_ms := extract(epoch FROM (clock_timestamp() - v_started)) * 1000;
    v_outcome := 'error';
    INSERT INTO verify_email_audit (firebase_uid_suffix, outcome, duration_ms, cache_hit)
    VALUES (v_uid_suffix, v_outcome, v_duration_ms, p_cache_hit);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This verification code has already been used.',
      'outcome', v_outcome,
      'duration_ms', v_duration_ms
    );
  END IF;

  UPDATE users
  SET email_verified = true
  WHERE firebase_uid = p_firebase_uid;

  DELETE FROM verification_codes
  WHERE user_id = p_firebase_uid
    AND id <> v_row.id;

  v_duration_ms := extract(epoch FROM (clock_timestamp() - v_started)) * 1000;
  v_outcome := 'success';
  INSERT INTO verify_email_audit (firebase_uid_suffix, outcome, duration_ms, cache_hit)
  VALUES (v_uid_suffix, v_outcome, v_duration_ms, p_cache_hit);

  RAISE LOG 'verify_email_code uid_suffix=% outcome=% duration_ms=%',
    v_uid_suffix, v_outcome, v_duration_ms;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Email verified successfully',
    'welcome_email_deferred', true,
    'outcome', v_outcome,
    'duration_ms', v_duration_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION verify_email_code(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_email_code(TEXT, TEXT, BOOLEAN) TO service_role;

-- =============================================================================
-- 7. SLA maintenance + alert helpers
-- =============================================================================
CREATE OR REPLACE FUNCTION purge_verify_email_audit()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM verify_email_audit
    WHERE created_at < now() - interval '90 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION check_verify_email_sla()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p95 NUMERIC;
  v_count BIGINT;
  v_threshold NUMERIC := 200;
BEGIN
  SELECT
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms),
    COUNT(*)
  INTO v_p95, v_count
  FROM verify_email_audit
  WHERE created_at > now() - interval '7 days';

  RETURN jsonb_build_object(
    'p95_ms', v_p95,
    'sample_count', v_count,
    'threshold_ms', v_threshold,
    'breach', CASE WHEN v_p95 IS NOT NULL AND v_p95 > v_threshold THEN true ELSE false END,
    'checked_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION purge_auth_sync_warm_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM auth_sync_warm_cache
    WHERE expires_at < now()
    RETURNING cache_key
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION purge_verify_email_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION check_verify_email_sla() FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_auth_sync_warm_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_verify_email_audit() TO service_role;
GRANT EXECUTE ON FUNCTION check_verify_email_sla() TO service_role;
GRANT EXECUTE ON FUNCTION purge_auth_sync_warm_cache() TO service_role;

-- =============================================================================
-- 8. pg_cron schedules (safe to re-run with jobname guard)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-verify-email-audit') THEN
      PERFORM cron.schedule(
        'purge-verify-email-audit',
        '15 3 * * *',
        'SELECT purge_verify_email_audit()'
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-verify-email-sla') THEN
      PERFORM cron.schedule(
        'check-verify-email-sla',
        '0 9 * * 1',
        'SELECT check_verify_email_sla()'
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-auth-sync-warm-cache') THEN
      PERFORM cron.schedule(
        'purge-auth-sync-warm-cache',
        '*/30 * * * *',
        'SELECT purge_auth_sync_warm_cache()'
      );
    END IF;
  END IF;
END $$;
