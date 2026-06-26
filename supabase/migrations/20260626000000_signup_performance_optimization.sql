-- Signup Performance Optimization
--
-- 1. Functional index on lower(email) — the provision RPC uses lower(email)
--    for email-based firebase_uid migration. Without this index, every signup
--    triggers a sequential scan on users.
--
-- 2. Remove ::text casts from provision_user_with_membership so indexes on
--    subscriptions.user_id are actually used.
--
-- 3. Composite index on user_products(user_id, product) for provision lookups.
--
-- 4. Composite index on subscriptions(user_id, product_domain, status) for
--    the backfill check in the RPC.
--
-- 5. Lightweight index on auth_sync_idempotency for idempotency cleanup.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Functional index for lower(email) lookups
-- ═════════════════════════════════════════════════════════════════════════════
-- The provision RPC searches users by lower(email) for firebase_uid migration.
-- Without this, every signup scans the users table sequentially.
CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (lower(email));

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Optimize provision_user_with_membership — remove ::text casts
-- ═════════════════════════════════════════════════════════════════════════════
-- The subscription backfill check casts both sides to text, defeating the index.
-- Fixed by casting the INPUT parameter (v_user.id) instead of the column.

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

    -- Auth sync is identity-only. It never creates trials. Existing paid
    -- subscriptions may still backfill product access for returning users.
    -- NOTE: Cast v_user.id::text (the variable), not s.user_id (the column),
    -- so the index on subscriptions.user_id is used.
    IF COALESCE(v_membership.id::text, '') = '' THEN
      IF EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.user_id = v_user.id::text
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

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Composite index for user_products lookups (used by provision function)
-- ═════════════════════════════════════════════════════════════════════════════
-- The provision function does SELECT ... FROM user_products WHERE user_id = X AND product = Y
-- This requires an index on (user_id, product). The ON CONFLICT clause already
-- implies a unique constraint, which creates this index automatically, but we
-- make it explicit for environments where the constraint may vary.
CREATE INDEX IF NOT EXISTS idx_user_products_user_product
  ON public.user_products (user_id, product);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Composite index for subscription backfill checks
-- ═════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_product_status
  ON public.subscriptions (user_id, product_domain, status);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Index for auth_sync_idempotency cleanup (used by idempotency layer)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_auth_sync_idempotency_key
  ON public.auth_sync_idempotency (idempotency_key, status);
