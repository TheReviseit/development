-- ═══════════════════════════════════════════════════════════════════════════════
-- Plan-aware store slug correction for Starter/trial users
--
-- Fixes businesses/users rows where url_slug was auto-generated from business_name
-- (DB trigger) instead of firebase_uid[:8] for users without custom_domain access.
-- Uses free_trials (not trials) and subscriptions.plan_name per actual schema.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  affected_businesses INT;
  affected_users INT;
BEGIN
  UPDATE public.businesses b
  SET
    url_slug = LOWER(SUBSTRING(b.user_id FROM 1 FOR 8)),
    url_slug_lower = LOWER(SUBSTRING(b.user_id FROM 1 FOR 8)),
    updated_at = NOW()
  WHERE
    b.business_name IS NOT NULL
    AND TRIM(b.business_name) != ''
    AND b.url_slug IS DISTINCT FROM LOWER(SUBSTRING(b.user_id FROM 1 FOR 8))
    -- Skip users on Business/Pro trial (shop domain)
    AND NOT EXISTS (
      SELECT 1
      FROM public.free_trials ft
      WHERE ft.user_id = b.user_id
        AND ft.domain = 'shop'
        AND ft.status IN ('active', 'expiring_soon')
        AND ft.expires_at > NOW()
        AND LOWER(ft.plan_slug) IN ('business', 'pro')
    )
    -- Skip users on Business/Pro paid subscription
    AND NOT EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.subscriptions s
        ON s.user_id = u.id::text OR s.user_id = u.firebase_uid
      WHERE u.firebase_uid = b.user_id
        AND (s.product_domain = 'shop' OR s.product_domain IS NULL)
        AND s.deleted_at IS NULL
        AND s.status IN (
          'active', 'trialing', 'completed', 'past_due',
          'grace_period', 'pending_upgrade'
        )
        AND LOWER(COALESCE(s.plan_name, '')) IN ('business', 'pro')
    );

  GET DIAGNOSTICS affected_businesses = ROW_COUNT;

  UPDATE public.users u
  SET
    ai_settings_configured = TRUE,
    store_slug = LOWER(SUBSTRING(u.firebase_uid FROM 1 FOR 8)),
    updated_at = NOW()
  FROM public.businesses b
  WHERE
    u.firebase_uid = b.user_id
    AND b.business_name IS NOT NULL
    AND TRIM(b.business_name) != ''
    AND (
      u.ai_settings_configured IS DISTINCT FROM TRUE
      OR u.store_slug IS DISTINCT FROM LOWER(SUBSTRING(u.firebase_uid FROM 1 FOR 8))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.free_trials ft
      WHERE ft.user_id = u.firebase_uid
        AND ft.domain = 'shop'
        AND ft.status IN ('active', 'expiring_soon')
        AND ft.expires_at > NOW()
        AND LOWER(ft.plan_slug) IN ('business', 'pro')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE (s.user_id = u.id::text OR s.user_id = u.firebase_uid)
        AND (s.product_domain = 'shop' OR s.product_domain IS NULL)
        AND s.deleted_at IS NULL
        AND s.status IN (
          'active', 'trialing', 'completed', 'past_due',
          'grace_period', 'pending_upgrade'
        )
        AND LOWER(COALESCE(s.plan_name, '')) IN ('business', 'pro')
    );

  GET DIAGNOSTICS affected_users = ROW_COUNT;
  RAISE NOTICE 'Corrected % businesses, % users to plan-aware uid[:8] slugs', affected_businesses, affected_users;
END $$;

COMMIT;
