-- ============================================================================
-- WhatsApp Connection Management Engine v2
-- ============================================================================
-- Additive, rollback-safe schema for canonical WhatsApp account validation,
-- tenant mapping, connection attempts, state transitions, audit, and webhook
-- replay protection. Existing connected_* tables remain live during rollout.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Tenant mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  firebase_uid text NOT NULL,
  product_domain text NOT NULL DEFAULT 'dashboard',
  org_id uuid NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'merged')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_mappings_user_product_active
  ON public.tenant_mappings(user_id, product_domain)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_mappings_tenant_active
  ON public.tenant_mappings(tenant_id)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_mappings_firebase_uid
  ON public.tenant_mappings(firebase_uid)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- Canonical WhatsApp connection tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_domain text NOT NULL DEFAULT 'dashboard',
  provider text NOT NULL DEFAULT 'meta_cloud_api'
    CHECK (provider IN ('meta_cloud_api', 'qr_device')),
  waba_id text NOT NULL,
  waba_name text NULL,
  business_id text NULL,
  business_name text NULL,
  phone_number_id text NULL,
  normalized_e164 text NULL,
  display_phone_number text NULL,
  verified_name text NULL,
  account_review_status text NULL,
  business_verification_status text NULL,
  quality_rating text NULL,
  messaging_limit_tier text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'active',
      'reconnecting',
      'needs_user_action',
      'stale',
      'expired',
      'disconnected',
      'revoked',
      'failed'
    )),
  connection_error text NULL,
  meta_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version integer NOT NULL DEFAULT 1,
  created_by_attempt_id uuid NULL,
  connected_at timestamptz NULL,
  last_validated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_accounts_active_waba
  ON public.whatsapp_accounts(waba_id)
  WHERE deleted_at IS NULL AND status IN ('active', 'pending', 'reconnecting');

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_accounts_active_phone
  ON public.whatsapp_accounts(normalized_e164)
  WHERE deleted_at IS NULL
    AND normalized_e164 IS NOT NULL
    AND status IN ('active', 'pending', 'reconnecting');

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_tenant_status
  ON public.whatsapp_accounts(tenant_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone_number_id
  ON public.whatsapp_accounts(phone_number_id)
  WHERE phone_number_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_device_id text NULL,
  fingerprint_hash text NULL,
  device_type text NOT NULL DEFAULT 'cloud_api'
    CHECK (device_type IN ('cloud_api', 'qr_device', 'unknown')),
  platform text NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'stale', 'disconnected', 'blocked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_devices_provider_device
  ON public.whatsapp_devices(tenant_id, provider_device_id)
  WHERE provider_device_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_devices_fingerprint
  ON public.whatsapp_devices(tenant_id, fingerprint_hash)
  WHERE fingerprint_hash IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES public.whatsapp_devices(id) ON DELETE SET NULL,
  session_type text NOT NULL DEFAULT 'cloud_api'
    CHECK (session_type IN ('cloud_api', 'qr_device')),
  phone_number_id text NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending',
      'linking',
      'active',
      'needs_user_action',
      'stale',
      'expired',
      'disconnected',
      'revoked',
      'failed'
    )),
  state_reason text NULL,
  session_fingerprint_hash text NULL,
  provider_session_id text NULL,
  expires_at timestamptz NULL,
  last_validated_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_account_state
  ON public.whatsapp_sessions(account_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_tenant_state
  ON public.whatsapp_sessions(tenant_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- Attempts, locks, validation, security, audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_connection_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  firebase_uid text NOT NULL,
  product_domain text NOT NULL DEFAULT 'dashboard',
  provider text NOT NULL DEFAULT 'meta_cloud_api',
  idempotency_key text NOT NULL,
  resource_key text NOT NULL,
  waba_id text NULL,
  phone_number_id text NULL,
  normalized_e164 text NULL,
  state text NOT NULL DEFAULT 'initiated'
    CHECK (state IN (
      'initiated',
      'validating',
      'locked',
      'meta_authorized',
      'ownership_checked',
      'webhook_subscribed',
      'phone_registered',
      'finalizing',
      'active',
      'cancelled',
      'conflict',
      'expired',
      'failed',
      'needs_user_action',
      'disconnected'
    )),
  attempt_token_hash text NULL,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_body jsonb NULL,
  failure_code text NULL,
  failure_message text NULL,
  request_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_by uuid NULL,
  locked_until timestamptz NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_connection_attempt_idempotency
  ON public.whatsapp_connection_attempts(tenant_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_connection_attempt_active_resource
  ON public.whatsapp_connection_attempts(resource_key)
  WHERE state IN ('initiated', 'validating', 'locked', 'meta_authorized', 'finalizing');

CREATE INDEX IF NOT EXISTS idx_connection_attempts_user_created
  ON public.whatsapp_connection_attempts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connection_attempts_expiry
  ON public.whatsapp_connection_attempts(expires_at)
  WHERE state IN ('initiated', 'validating', 'locked', 'meta_authorized', 'finalizing');

CREATE TABLE IF NOT EXISTS public.whatsapp_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  attempt_id uuid NULL REFERENCES public.whatsapp_connection_attempts(id) ON DELETE SET NULL,
  check_name text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('pass', 'fail', 'warn', 'skip')),
  reason text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_validation_logs_attempt
  ON public.whatsapp_validation_logs(attempt_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  attempt_id uuid NULL REFERENCES public.whatsapp_connection_attempts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resource_key text NULL,
  ip_address inet NULL,
  user_agent text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_security_events_tenant
  ON public.whatsapp_security_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_security_events_type
  ON public.whatsapp_security_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  account_id uuid NULL REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  session_id uuid NULL REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  attempt_id uuid NULL REFERENCES public.whatsapp_connection_attempts(id) ON DELETE SET NULL,
  from_state text NULL,
  to_state text NOT NULL,
  reason text NULL,
  actor_type text NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'user', 'meta', 'worker', 'admin')),
  actor_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_state_transitions_account
  ON public.whatsapp_state_transitions(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_locks (
  resource_key text PRIMARY KEY,
  owner_id uuid NOT NULL,
  tenant_id uuid NULL,
  attempt_id uuid NULL,
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_locks_expires_at
  ON public.whatsapp_locks(expires_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_reconnect_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  previous_session_id uuid NULL,
  new_session_id uuid NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  account_id uuid NULL REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  session_id uuid NULL REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  attempt_id uuid NULL REFERENCES public.whatsapp_connection_attempts(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_audit_logs_tenant
  ON public.whatsapp_audit_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'meta',
  provider_event_id text NOT NULL,
  tenant_id uuid NULL,
  account_id uuid NULL REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  phone_number_id text NULL,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed', 'duplicate')),
  processing_error text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_dedupe
  ON public.whatsapp_webhook_events(provider_event_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_status
  ON public.whatsapp_webhook_events(status, received_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  sync_kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'healthy', 'degraded', 'failed')),
  cursor_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NULL,
  next_sync_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, sync_kind)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_message_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  account_id uuid NULL REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  queue_name text NOT NULL DEFAULT 'default',
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_queues_pickup
  ON public.whatsapp_message_queues(status, next_retry_at, created_at)
  WHERE status IN ('pending', 'failed');

-- ============================================================================
-- Updated-at trigger shared by the new tables
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'tenant_mappings',
    'whatsapp_accounts',
    'whatsapp_devices',
    'whatsapp_sessions',
    'whatsapp_connection_attempts',
    'whatsapp_locks',
    'whatsapp_sync_state',
    'whatsapp_message_queues'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_touch_updated_at ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      v_table,
      v_table
    );
  END LOOP;
END $$;

-- ============================================================================
-- Tenant resolver RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_tenant_mapping(
  p_user_id uuid,
  p_firebase_uid text,
  p_product_domain text DEFAULT 'dashboard'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mapping public.tenant_mappings%rowtype;
  v_product text := COALESCE(NULLIF(p_product_domain, ''), 'dashboard');
BEGIN
  SELECT *
  INTO v_mapping
  FROM public.tenant_mappings
  WHERE user_id = p_user_id
    AND product_domain = v_product
    AND status = 'active'
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.tenant_mappings(user_id, firebase_uid, product_domain)
      VALUES (p_user_id, p_firebase_uid, v_product)
      RETURNING * INTO v_mapping;
    EXCEPTION WHEN unique_violation THEN
      SELECT *
      INTO v_mapping
      FROM public.tenant_mappings
      WHERE user_id = p_user_id
        AND product_domain = v_product
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1;
    END;
  END IF;

  RETURN jsonb_build_object(
    'tenantId', v_mapping.tenant_id,
    'mappingId', v_mapping.id,
    'userId', v_mapping.user_id,
    'firebaseUid', v_mapping.firebase_uid,
    'productDomain', v_mapping.product_domain
  );
END;
$$;

-- ============================================================================
-- Finalize RPC: canonical writes + legacy compatibility writes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_whatsapp_connection(
  p_tenant_id uuid,
  p_user_id uuid,
  p_attempt_id uuid,
  p_waba_id text,
  p_phone_number_id text,
  p_normalized_e164 text,
  p_meta_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_attempt public.whatsapp_connection_attempts%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_session public.whatsapp_sessions%rowtype;
  v_device public.whatsapp_devices%rowtype;
  v_conflict_account public.whatsapp_accounts%rowtype;
  v_conflict_user uuid;
  v_status text;
  v_session_state text;
  v_phone_registered boolean;
  v_webhook_subscribed boolean;
  v_business_id text;
  v_business_name text;
  v_waba_name text;
  v_display_phone text;
  v_verified_name text;
  v_encrypted_token text;
  v_facebook_user_id text;
  v_facebook_user_name text;
  v_facebook_email text;
  v_expires_at timestamptz;
  v_fb_id uuid;
  v_bm_id uuid;
  v_legacy_waba_id uuid;
  v_legacy_phone_id uuid;
  v_response jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Missing required identity values';
  END IF;

  IF COALESCE(NULLIF(p_waba_id, ''), NULLIF(p_phone_number_id, '')) IS NULL THEN
    RAISE EXCEPTION 'Missing WhatsApp resource identifiers';
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.whatsapp_connection_attempts
  WHERE id = p_attempt_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection attempt not found';
  END IF;

  IF v_attempt.state = 'active' AND v_attempt.response_body IS NOT NULL THEN
    RETURN v_attempt.response_body;
  END IF;

  UPDATE public.whatsapp_connection_attempts
  SET state = 'finalizing',
      waba_id = p_waba_id,
      phone_number_id = p_phone_number_id,
      normalized_e164 = p_normalized_e164,
      meta_payload = COALESCE(p_meta_payload, '{}'::jsonb),
      updated_at = v_now
  WHERE id = p_attempt_id
  RETURNING * INTO v_attempt;

  v_phone_registered := COALESCE((p_meta_payload->>'phoneRegistered')::boolean, true);
  v_webhook_subscribed := COALESCE((p_meta_payload->>'webhookSubscribed')::boolean, true);
  v_status := CASE WHEN v_phone_registered THEN 'active' ELSE 'needs_user_action' END;
  v_session_state := CASE WHEN v_phone_registered THEN 'active' ELSE 'needs_user_action' END;

  v_business_id := NULLIF(p_meta_payload->>'businessId', '');
  v_business_name := COALESCE(NULLIF(p_meta_payload->>'businessName', ''), 'WhatsApp Business');
  v_waba_name := COALESCE(NULLIF(p_meta_payload->>'wabaName', ''), 'WhatsApp Business');
  v_display_phone := NULLIF(p_meta_payload->>'displayPhoneNumber', '');
  v_verified_name := NULLIF(p_meta_payload->>'verifiedName', '');
  v_encrypted_token := NULLIF(p_meta_payload->>'encryptedAccessToken', '');
  v_facebook_user_id := NULLIF(p_meta_payload->>'facebookUserId', '');
  v_facebook_user_name := NULLIF(p_meta_payload->>'facebookUserName', '');
  v_facebook_email := NULLIF(p_meta_payload->>'facebookEmail', '');
  v_expires_at := NULLIF(p_meta_payload->>'tokenExpiresAt', '')::timestamptz;

  SELECT *
  INTO v_conflict_account
  FROM public.whatsapp_accounts
  WHERE deleted_at IS NULL
    AND status IN ('active', 'pending', 'reconnecting')
    AND tenant_id <> p_tenant_id
    AND (
      (p_waba_id IS NOT NULL AND waba_id = p_waba_id)
      OR (
        p_normalized_e164 IS NOT NULL
        AND normalized_e164 IS NOT NULL
        AND normalized_e164 = p_normalized_e164
      )
      OR (
        p_phone_number_id IS NOT NULL
        AND phone_number_id IS NOT NULL
        AND phone_number_id = p_phone_number_id
      )
    )
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.whatsapp_security_events(
      tenant_id, user_id, attempt_id, event_type, severity, resource_key, details
    ) VALUES (
      p_tenant_id,
      p_user_id,
      p_attempt_id,
      'whatsapp_connection_conflict',
      'high',
      v_attempt.resource_key,
      jsonb_build_object('wabaId', p_waba_id, 'phoneNumberId', p_phone_number_id)
    );

    v_response := jsonb_build_object(
      'success', false,
      'code', 'ALREADY_CONNECTED',
      'status', 'conflict',
      'message', 'This WhatsApp number is already connected to another workspace.'
    );

    UPDATE public.whatsapp_connection_attempts
    SET state = 'conflict',
        response_body = v_response,
        failure_code = 'ALREADY_CONNECTED',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = p_attempt_id;

    RETURN v_response;
  END IF;

  BEGIN
    SELECT cwa.user_id
    INTO v_conflict_user
    FROM public.connected_whatsapp_accounts cwa
    WHERE cwa.waba_id = p_waba_id
      AND cwa.user_id <> p_user_id
      AND cwa.deleted_at IS NULL
      AND cwa.is_active = true
    LIMIT 1;

    IF v_conflict_user IS NULL THEN
      SELECT cpn.user_id
      INTO v_conflict_user
      FROM public.connected_phone_numbers cpn
      WHERE cpn.phone_number_id = p_phone_number_id
        AND cpn.user_id <> p_user_id
        AND cpn.deleted_at IS NULL
        AND cpn.is_active = true
      LIMIT 1;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    v_conflict_user := NULL;
  END;

  IF v_conflict_user IS NOT NULL THEN
    INSERT INTO public.whatsapp_security_events(
      tenant_id, user_id, attempt_id, event_type, severity, resource_key, details
    ) VALUES (
      p_tenant_id,
      p_user_id,
      p_attempt_id,
      'legacy_whatsapp_connection_conflict',
      'high',
      v_attempt.resource_key,
      jsonb_build_object('wabaId', p_waba_id, 'phoneNumberId', p_phone_number_id)
    );

    v_response := jsonb_build_object(
      'success', false,
      'code', 'ALREADY_CONNECTED',
      'status', 'conflict',
      'message', 'This WhatsApp number is already connected to another workspace.'
    );

    UPDATE public.whatsapp_connection_attempts
    SET state = 'conflict',
        response_body = v_response,
        failure_code = 'ALREADY_CONNECTED',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = p_attempt_id;

    RETURN v_response;
  END IF;

  SELECT *
  INTO v_account
  FROM public.whatsapp_accounts
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
    AND (
      waba_id = p_waba_id
      OR (p_phone_number_id IS NOT NULL AND phone_number_id = p_phone_number_id)
    )
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.whatsapp_accounts
    SET waba_name = v_waba_name,
        business_id = COALESCE(v_business_id, business_id),
        business_name = COALESCE(v_business_name, business_name),
        phone_number_id = COALESCE(p_phone_number_id, phone_number_id),
        normalized_e164 = COALESCE(p_normalized_e164, normalized_e164),
        display_phone_number = COALESCE(v_display_phone, display_phone_number),
        verified_name = COALESCE(v_verified_name, verified_name),
        account_review_status = COALESCE(NULLIF(p_meta_payload->>'accountReviewStatus', ''), account_review_status),
        business_verification_status = COALESCE(NULLIF(p_meta_payload->>'businessVerificationStatus', ''), business_verification_status),
        quality_rating = COALESCE(NULLIF(p_meta_payload->>'qualityRating', ''), quality_rating),
        messaging_limit_tier = COALESCE(NULLIF(p_meta_payload->>'messagingLimitTier', ''), messaging_limit_tier),
        status = v_status,
        connection_error = CASE WHEN v_status = 'active' THEN NULL ELSE connection_error END,
        meta_payload = COALESCE(p_meta_payload, '{}'::jsonb),
        row_version = row_version + 1,
        created_by_attempt_id = COALESCE(created_by_attempt_id, p_attempt_id),
        connected_at = CASE WHEN v_status = 'active' THEN COALESCE(connected_at, v_now) ELSE connected_at END,
        last_validated_at = v_now,
        updated_at = v_now
    WHERE id = v_account.id
    RETURNING * INTO v_account;
  ELSE
    INSERT INTO public.whatsapp_accounts(
      tenant_id,
      user_id,
      product_domain,
      provider,
      waba_id,
      waba_name,
      business_id,
      business_name,
      phone_number_id,
      normalized_e164,
      display_phone_number,
      verified_name,
      account_review_status,
      business_verification_status,
      quality_rating,
      messaging_limit_tier,
      status,
      meta_payload,
      created_by_attempt_id,
      connected_at,
      last_validated_at
    ) VALUES (
      p_tenant_id,
      p_user_id,
      v_attempt.product_domain,
      'meta_cloud_api',
      p_waba_id,
      v_waba_name,
      v_business_id,
      v_business_name,
      p_phone_number_id,
      p_normalized_e164,
      v_display_phone,
      v_verified_name,
      NULLIF(p_meta_payload->>'accountReviewStatus', ''),
      NULLIF(p_meta_payload->>'businessVerificationStatus', ''),
      NULLIF(p_meta_payload->>'qualityRating', ''),
      NULLIF(p_meta_payload->>'messagingLimitTier', ''),
      v_status,
      COALESCE(p_meta_payload, '{}'::jsonb),
      p_attempt_id,
      CASE WHEN v_status = 'active' THEN v_now ELSE NULL END,
      v_now
    )
    RETURNING * INTO v_account;
  END IF;

  INSERT INTO public.whatsapp_devices(
    account_id,
    tenant_id,
    user_id,
    provider_device_id,
    fingerprint_hash,
    device_type,
    platform,
    status,
    metadata,
    last_seen_at
  ) VALUES (
    v_account.id,
    p_tenant_id,
    p_user_id,
    NULLIF(p_meta_payload->>'providerDeviceId', ''),
    NULLIF(p_meta_payload->>'deviceFingerprintHash', ''),
    'cloud_api',
    COALESCE(NULLIF(p_meta_payload->>'platformType', ''), 'CLOUD_API'),
    'active',
    jsonb_build_object('source', 'meta_cloud_api', 'phoneNumberId', p_phone_number_id),
    v_now
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_device;

  INSERT INTO public.whatsapp_sessions(
    account_id,
    tenant_id,
    user_id,
    device_id,
    session_type,
    phone_number_id,
    state,
    state_reason,
    session_fingerprint_hash,
    provider_session_id,
    last_validated_at,
    metadata
  ) VALUES (
    v_account.id,
    p_tenant_id,
    p_user_id,
    v_device.id,
    'cloud_api',
    p_phone_number_id,
    v_session_state,
    CASE WHEN v_session_state = 'active' THEN NULL ELSE 'phone_registration_required' END,
    NULLIF(p_meta_payload->>'deviceFingerprintHash', ''),
    p_phone_number_id,
    v_now,
    jsonb_build_object(
      'webhookSubscribed', v_webhook_subscribed,
      'phoneRegistered', v_phone_registered,
      'alreadyRegistered', COALESCE((p_meta_payload->>'alreadyRegistered')::boolean, false)
    )
  )
  RETURNING * INTO v_session;

  -- Legacy compatibility writes. These keep existing dashboards, credential
  -- lookup, and webhook paths alive while v2 is rolled out.
  BEGIN
    IF v_encrypted_token IS NOT NULL AND v_facebook_user_id IS NOT NULL THEN
      SELECT id
      INTO v_fb_id
      FROM public.connected_facebook_accounts
      WHERE user_id = p_user_id
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_fb_id IS NULL THEN
        INSERT INTO public.connected_facebook_accounts(
          user_id,
          facebook_user_id,
          facebook_user_name,
          facebook_email,
          access_token,
          token_type,
          expires_at,
          granted_permissions,
          status
        ) VALUES (
          p_user_id,
          v_facebook_user_id,
          v_facebook_user_name,
          v_facebook_email,
          v_encrypted_token,
          'Bearer',
          v_expires_at,
          ARRAY['whatsapp_business_management', 'whatsapp_business_messaging'],
          'active'
        )
        ON CONFLICT (user_id, facebook_user_id) DO UPDATE
        SET access_token = EXCLUDED.access_token,
            expires_at = EXCLUDED.expires_at,
            granted_permissions = EXCLUDED.granted_permissions,
            status = 'active',
            deleted_at = NULL,
            updated_at = v_now
        RETURNING id INTO v_fb_id;
      END IF;
    END IF;

    IF v_fb_id IS NOT NULL THEN
      INSERT INTO public.connected_business_managers(
        facebook_account_id,
        user_id,
        business_id,
        business_name,
        business_email,
        business_vertical,
        permitted_roles,
        is_active
      ) VALUES (
        v_fb_id,
        p_user_id,
        COALESCE(v_business_id, 'waba_' || p_waba_id),
        v_business_name,
        NULL,
        NULL,
        ARRAY['ADMIN'],
        true
      )
      ON CONFLICT (facebook_account_id, business_id) DO UPDATE
      SET business_name = EXCLUDED.business_name,
          is_active = true,
          deleted_at = NULL,
          updated_at = v_now
      RETURNING id INTO v_bm_id;

      INSERT INTO public.connected_whatsapp_accounts(
        business_manager_id,
        user_id,
        waba_id,
        waba_name,
        account_review_status,
        business_verification_status,
        quality_rating,
        messaging_limit_tier,
        is_active
      ) VALUES (
        v_bm_id,
        p_user_id,
        p_waba_id,
        v_waba_name,
        NULLIF(p_meta_payload->>'accountReviewStatus', ''),
        NULLIF(p_meta_payload->>'businessVerificationStatus', ''),
        NULLIF(p_meta_payload->>'qualityRating', ''),
        NULLIF(p_meta_payload->>'messagingLimitTier', ''),
        v_status = 'active'
      )
      ON CONFLICT (waba_id) DO UPDATE
      SET waba_name = EXCLUDED.waba_name,
          account_review_status = EXCLUDED.account_review_status,
          business_verification_status = EXCLUDED.business_verification_status,
          quality_rating = EXCLUDED.quality_rating,
          messaging_limit_tier = EXCLUDED.messaging_limit_tier,
          is_active = EXCLUDED.is_active,
          deleted_at = NULL,
          updated_at = v_now
      WHERE public.connected_whatsapp_accounts.user_id = p_user_id
      RETURNING id INTO v_legacy_waba_id;

      IF v_legacy_waba_id IS NOT NULL AND p_phone_number_id IS NOT NULL THEN
        UPDATE public.connected_phone_numbers
        SET is_primary = false
        WHERE user_id = p_user_id
          AND is_primary = true
          AND deleted_at IS NULL
          AND phone_number_id <> p_phone_number_id;

        INSERT INTO public.connected_phone_numbers(
          whatsapp_account_id,
          user_id,
          phone_number_id,
          display_phone_number,
          verified_name,
          quality_rating,
          code_verification_status,
          is_official_business_account,
          webhook_url,
          webhook_verified,
          webhook_verify_token,
          is_active,
          is_primary
        ) VALUES (
          v_legacy_waba_id,
          p_user_id,
          p_phone_number_id,
          COALESCE(v_display_phone, p_normalized_e164, p_phone_number_id),
          v_verified_name,
          NULLIF(p_meta_payload->>'qualityRating', ''),
          NULLIF(p_meta_payload->>'codeVerificationStatus', ''),
          COALESCE((p_meta_payload->>'isOfficialBusinessAccount')::boolean, false),
          NULLIF(p_meta_payload->>'webhookUrl', ''),
          v_webhook_subscribed,
          NULL,
          v_status = 'active',
          true
        )
        ON CONFLICT (phone_number_id) DO UPDATE
        SET whatsapp_account_id = EXCLUDED.whatsapp_account_id,
            display_phone_number = EXCLUDED.display_phone_number,
            verified_name = EXCLUDED.verified_name,
            quality_rating = EXCLUDED.quality_rating,
            code_verification_status = EXCLUDED.code_verification_status,
            webhook_verified = EXCLUDED.webhook_verified,
            is_active = EXCLUDED.is_active,
            is_primary = true,
            deleted_at = NULL,
            updated_at = v_now
        WHERE public.connected_phone_numbers.user_id = p_user_id
        RETURNING id INTO v_legacy_phone_id;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR unique_violation THEN
    INSERT INTO public.whatsapp_validation_logs(
      tenant_id, user_id, attempt_id, check_name, outcome, reason, details
    ) VALUES (
      p_tenant_id,
      p_user_id,
      p_attempt_id,
      'legacy_compatibility_write',
      'warn',
      SQLERRM,
      jsonb_build_object('sqlstate', SQLSTATE)
    );
  END;

  INSERT INTO public.whatsapp_state_transitions(
    tenant_id, account_id, session_id, attempt_id, from_state, to_state, reason, actor_type, metadata
  ) VALUES (
    p_tenant_id,
    v_account.id,
    v_session.id,
    p_attempt_id,
    v_attempt.state,
    v_status,
    'finalize_whatsapp_connection',
    'system',
    jsonb_build_object('idempotencyKey', p_idempotency_key)
  );

  INSERT INTO public.whatsapp_audit_logs(
    tenant_id, user_id, account_id, session_id, attempt_id, action, summary, details
  ) VALUES (
    p_tenant_id,
    p_user_id,
    v_account.id,
    v_session.id,
    p_attempt_id,
    'whatsapp_connection_finalized',
    CASE WHEN v_status = 'active'
      THEN 'WhatsApp connection finalized successfully'
      ELSE 'WhatsApp connection finalized with required user action'
    END,
    jsonb_build_object(
      'wabaId', p_waba_id,
      'phoneNumberId', p_phone_number_id,
      'normalizedE164', p_normalized_e164,
      'webhookSubscribed', v_webhook_subscribed,
      'phoneRegistered', v_phone_registered
    )
  );

  BEGIN
    INSERT INTO public.outbox_events(
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      channel,
      status
    ) VALUES (
      'whatsapp_account',
      v_account.id,
      'WHATSAPP_CONNECTION_FINALIZED',
      jsonb_build_object(
        'tenantId', p_tenant_id,
        'accountId', v_account.id,
        'sessionId', v_session.id,
        'attemptId', p_attempt_id,
        'status', v_status
      ),
      'whatsapp',
      'pending'
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  UPDATE public.users
  SET onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
      onboarding_completed_reason = COALESCE(onboarding_completed_reason, 'whatsapp_connect'),
      onboarding_completed_via = COALESCE(onboarding_completed_via, 'api'),
      updated_at = v_now
  WHERE id = p_user_id
    AND onboarding_completed_at IS NULL;

  v_response := jsonb_build_object(
    'success', true,
    'status', v_status,
    'accountId', v_account.id,
    'sessionId', v_session.id,
    'attemptId', p_attempt_id,
    'whatsappAccount', jsonb_build_object(
      'id', COALESCE(v_legacy_waba_id, v_account.id),
      'waba_id', p_waba_id,
      'waba_name', v_waba_name,
      'account_review_status', NULLIF(p_meta_payload->>'accountReviewStatus', ''),
      'business_verification_status', NULLIF(p_meta_payload->>'businessVerificationStatus', ''),
      'quality_rating', NULLIF(p_meta_payload->>'qualityRating', ''),
      'has_system_user_token', false,
      'token_expires_at', v_expires_at
    ),
    'phoneNumbers', jsonb_build_array(
      jsonb_build_object(
        'id', COALESCE(v_legacy_phone_id, v_session.id),
        'phone_number_id', p_phone_number_id,
        'display_phone_number', COALESCE(v_display_phone, p_normalized_e164, p_phone_number_id),
        'verified_name', v_verified_name,
        'is_active', v_status = 'active',
        'is_primary', true
      )
    ),
    'validation', jsonb_build_object(
      'webhookSubscribed', v_webhook_subscribed,
      'phoneRegistered', v_phone_registered,
      'alreadyRegistered', COALESCE((p_meta_payload->>'alreadyRegistered')::boolean, false)
    )
  );

  UPDATE public.whatsapp_connection_attempts
  SET state = CASE WHEN v_status = 'active' THEN 'active' ELSE 'needs_user_action' END,
      response_body = v_response,
      validation_result = jsonb_build_object(
        'webhookSubscribed', v_webhook_subscribed,
        'phoneRegistered', v_phone_registered,
        'finalizedAt', v_now
      ),
      completed_at = v_now,
      updated_at = v_now
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_tenant_mapping(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_whatsapp_connection(uuid, uuid, uuid, text, text, text, jsonb, text) TO service_role;
