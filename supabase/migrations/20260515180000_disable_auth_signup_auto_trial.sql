-- Disable auth-time trial creation.
--
-- Signup/auth sync must be identity-only. Product access is granted only after
-- explicit onboarding plan selection, and no-card trials are limited to the
-- Starter plan via the trial engine.

CREATE OR REPLACE FUNCTION public.provision_user_with_membership(
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
  v_now timestamptz := now();
  v_action text;
BEGIN
  SELECT * INTO v_user
  FROM users
  WHERE firebase_uid = p_firebase_uid
  LIMIT 1;

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

  IF NOT FOUND THEN
    IF NOT p_allow_create THEN
      RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO users (firebase_uid, full_name, email, phone, role)
    VALUES (p_firebase_uid, p_full_name, lower(p_email), p_phone, 'user')
    RETURNING * INTO v_user;
    v_created := true;
  END IF;

  INSERT INTO user_products (user_id, product, status, activated_by)
  VALUES (v_user.id, 'dashboard', 'active', 'system')
  ON CONFLICT (user_id, product) DO NOTHING;

  IF COALESCE(p_product, '') = '' OR p_product = 'dashboard' THEN
    v_has_access := true;
    SELECT * INTO v_membership
    FROM user_products
    WHERE user_id = v_user.id AND product = 'dashboard'
    LIMIT 1;
  ELSE
    SELECT * INTO v_membership
    FROM user_products
    WHERE user_id = v_user.id AND product = p_product
    LIMIT 1;

    -- Auth sync no longer creates trial membership. Existing membership is
    -- honored, and paid subscription rows may still backfill access.
    IF COALESCE(v_membership.id::text, '') = '' THEN
      IF EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.user_id::text = v_user.id::text
          AND s.product_domain = p_product
          AND s.status IN ('active', 'pending_upgrade')
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
            request_id, ip_address, user_agent, metadata
          ) VALUES (
            v_user.id, p_product, v_action, 'active', 'system',
            p_request_id, NULLIF(p_ip_address, '')::inet, p_user_agent,
            jsonb_build_object(
              'traceparent', p_traceparent,
              'source', 'auth_sync_subscription_backfill'
            )
          );
        EXCEPTION WHEN undefined_table THEN
          NULL;
        END;
      END IF;
    END IF;

    IF COALESCE(v_membership.id::text, '') <> '' THEN
      IF v_membership.status = 'active' THEN
        v_has_access := true;
      ELSIF v_membership.status = 'trial' THEN
        v_has_access :=
          v_membership.trial_ends_at IS NULL OR v_membership.trial_ends_at > v_now;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user', to_jsonb(v_user),
    'membership',
      CASE
        WHEN COALESCE(v_membership.id::text, '') = '' THEN NULL
        ELSE to_jsonb(v_membership)
      END,
    'created', v_created,
    'has_access', v_has_access
  );
END;
$$;

-- Revoke trial memberships that were created by auth/signup without an
-- explicit trial row. This corrects users who were incorrectly treated as trial
-- users immediately after signup. Trial-engine-created memberships use
-- activated_by='system' and have a corresponding free_trials row, so they are
-- intentionally left untouched.
UPDATE public.user_products up
SET
  status = 'cancelled',
  cancelled_at = COALESCE(up.cancelled_at, now()),
  updated_at = now()
WHERE up.status = 'trial'
  AND up.activated_by = 'signup'
  AND NOT EXISTS (
    SELECT 1
    FROM public.free_trials ft
    WHERE ft.user_id = up.user_id::text
      AND ft.domain = up.product
      AND ft.status IN ('active', 'expiring_soon')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id::text = up.user_id::text
      AND s.product_domain = up.product
      AND s.status IN ('active', 'trialing', 'pending_upgrade')
  );
