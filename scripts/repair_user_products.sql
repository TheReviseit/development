-- One-time repair: backfill missing Option B product memberships
-- ============================================================
-- Use when you have users in `public.users` but missing rows in `public.user_products`,
-- causing slow/failed logins and PRODUCT_NOT_ENABLED drift.
--
-- Run with:
--   psql "$DATABASE_URL" -f scripts/repair_user_products.sql
--
-- Safe properties:
-- - Idempotent via ON CONFLICT DO NOTHING / EXISTS checks
-- - Does not modify Firebase Auth
-- - Only inserts missing rows

BEGIN;

-- 1) Ensure every user has dashboard access (required invariant)
INSERT INTO public.user_products (user_id, product, status, activated_by, activated_at)
SELECT u.id, 'dashboard', 'active', 'system', NOW()
FROM public.users u
LEFT JOIN public.user_products up
  ON up.user_id = u.id AND up.product = 'dashboard'
WHERE up.user_id IS NULL;

-- 2) Backfill from legacy product_subscriptions → user_products (best-effort)
-- Notes:
-- - product_subscriptions.user_id is TEXT and historically stored public.users.id (UUID as string)
-- - user_products.product uses the Option B enum values (shop/marketing/showcase/api)
-- - For legacy trial rows without expires_at, we default to a 14-day window from subscribed_at.
INSERT INTO public.user_products (
  user_id,
  product,
  status,
  activated_by,
  activated_at,
  trial_ends_at,
  trial_days
)
SELECT
  u.id AS user_id,
  ps.product_domain AS product,
  CASE
    WHEN ps.status = 'active' THEN 'active'
    ELSE 'trial'
  END AS status,
  'migration' AS activated_by,
  COALESCE(ps.subscribed_at, NOW()) AS activated_at,
  CASE
    WHEN ps.status = 'active' THEN NULL
    ELSE COALESCE(ps.expires_at, COALESCE(ps.subscribed_at, NOW()) + INTERVAL '14 days')
  END AS trial_ends_at,
  CASE
    WHEN ps.status = 'active' THEN NULL
    ELSE 14
  END AS trial_days
FROM public.product_subscriptions ps
JOIN public.users u ON u.id::text = ps.user_id
LEFT JOIN public.user_products up
  ON up.user_id = u.id AND up.product = ps.product_domain
WHERE ps.product_domain IN ('shop', 'marketing', 'showcase', 'api')
  AND ps.status IN ('active', 'trial')
  AND up.user_id IS NULL;

COMMIT;

