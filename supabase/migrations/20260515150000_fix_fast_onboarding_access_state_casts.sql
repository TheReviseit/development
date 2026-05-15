-- ============================================================================
-- Fix fast onboarding access state UUID/text comparison
-- ============================================================================
-- subscriptions.user_id is TEXT in the live billing schema. The previous RPC
-- compared it to users.id UUID directly, which caused:
--   operator does not exist: text = uuid
-- This replacement keeps the fast path enabled and avoids falling back to the
-- slow legacy multi-query onboarding check.

CREATE OR REPLACE FUNCTION public.get_onboarding_access_state(
  p_firebase_uid text,
  p_product text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%rowtype;
  v_now timestamptz := now();
  v_product text := COALESCE(NULLIF(p_product, ''), 'dashboard');
  v_membership record;
  v_has_membership boolean := false;
  v_whatsapp_connected boolean := false;
  v_has_active_subscription boolean := false;
  v_has_active_trial boolean := false;
  v_is_trial_expired boolean := false;
  v_trial_details jsonb := NULL;
  v_trial record;
BEGIN
  SELECT *
  INTO v_user
  FROM public.users
  WHERE firebase_uid = p_firebase_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'userExists', false,
      'userId', NULL,
      'onboardingCompleted', false,
      'whatsappConnected', false,
      'hasActiveSubscription', false,
      'hasActiveTrial', false,
      'isTrialExpired', false,
      'trialDetails', NULL
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.connected_whatsapp_accounts cwa
    WHERE cwa.user_id = v_user.id
      AND cwa.is_active = true
      AND cwa.deleted_at IS NULL
    LIMIT 1
  )
  INTO v_whatsapp_connected;

  SELECT up.id, up.status, up.activated_at, up.trial_ends_at, up.trial_days
  INTO v_membership
  FROM public.user_products up
  WHERE up.user_id = v_user.id
    AND up.product = v_product
  LIMIT 1;

  v_has_membership := FOUND;

  IF v_product <> 'dashboard' AND v_has_membership THEN
    IF v_membership.status = 'active' THEN
      v_has_active_subscription := true;
    ELSIF v_membership.status = 'trial' THEN
      IF v_membership.trial_ends_at IS NULL OR v_membership.trial_ends_at > v_now THEN
        v_has_active_trial := true;
        v_trial_details := jsonb_build_object(
          'startedAt', v_membership.activated_at,
          'expiresAt', v_membership.trial_ends_at,
          'planSlug', v_product || '_starter'
        );
      ELSE
        v_is_trial_expired := true;
        v_trial_details := jsonb_build_object(
          'startedAt', v_membership.activated_at,
          'expiresAt', v_membership.trial_ends_at,
          'planSlug', v_product || '_starter'
        );
      END IF;
    END IF;
  END IF;

  IF NOT v_has_active_subscription THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = v_user.id::text
        AND s.status IN (
          'active',
          'completed',
          'processing',
          'pending_upgrade',
          'upgrade_failed'
        )
        AND (
          v_product = 'dashboard'
          OR s.product_domain = v_product
          OR s.product_domain IS NULL
        )
      LIMIT 1
    )
    INTO v_has_active_subscription;
  END IF;

  IF NOT v_has_active_trial THEN
    SELECT ft.started_at, ft.expires_at, ft.plan_slug
    INTO v_trial
    FROM public.free_trials ft
    WHERE (ft.user_id = v_user.id::text OR ft.user_id = v_user.firebase_uid)
      AND ft.status IN ('active', 'expiring_soon')
      AND ft.expires_at > v_now
      AND (v_product = 'dashboard' OR ft.domain = v_product)
    ORDER BY ft.expires_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_has_active_trial := true;
      v_trial_details := jsonb_build_object(
        'startedAt', v_trial.started_at,
        'expiresAt', v_trial.expires_at,
        'planSlug', v_trial.plan_slug
      );
    END IF;
  END IF;

  IF NOT v_has_active_trial AND NOT v_is_trial_expired THEN
    SELECT ft.started_at, ft.expires_at, ft.plan_slug
    INTO v_trial
    FROM public.free_trials ft
    WHERE (ft.user_id = v_user.id::text OR ft.user_id = v_user.firebase_uid)
      AND ft.status IN ('expired', 'active', 'expiring_soon')
      AND (v_product = 'dashboard' OR ft.domain = v_product)
    ORDER BY ft.expires_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_is_trial_expired := true;
      v_trial_details := jsonb_build_object(
        'startedAt', v_trial.started_at,
        'expiresAt', v_trial.expires_at,
        'planSlug', v_trial.plan_slug
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'userExists', true,
    'userId', v_user.id,
    'onboardingCompleted',
      v_user.onboarding_completed_at IS NOT NULL
      OR v_has_active_subscription
      OR v_has_active_trial
      OR v_whatsapp_connected,
    'whatsappConnected', v_whatsapp_connected,
    'hasActiveSubscription', v_has_active_subscription,
    'hasActiveTrial', v_has_active_trial,
    'isTrialExpired', v_is_trial_expired AND NOT v_has_active_trial,
    'trialDetails', v_trial_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_access_state(text, text)
  TO service_role;
