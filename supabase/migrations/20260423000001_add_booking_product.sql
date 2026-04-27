-- ============================================================================
-- MIGRATION: Add 'booking' to user_products.product CHECK constraint
-- and add 'signup' to product_activation_logs.initiated_by CHECK constraint
-- ============================================================================
-- Root cause: user_products was created with a hardcoded allow-list that
-- predates the booking product launch.  product_activation_logs.initiated_by
-- was also missing 'signup', which the provisioning RPC uses.
-- Safety: IDEMPOTENT, ZERO-DOWNTIME
-- ============================================================================

-- 1) Drop + recreate the product CHECK on user_products
--    Postgres does not support ALTER CONSTRAINT, so we drop and re-add.
ALTER TABLE public.user_products
  DROP CONSTRAINT IF EXISTS user_products_product_check;

ALTER TABLE public.user_products
  ADD CONSTRAINT user_products_product_check
  CHECK (product IN ('shop', 'marketing', 'showcase', 'dashboard', 'api', 'booking'));

-- 2) Drop + recreate the initiated_by CHECK on product_activation_logs
--    Add 'signup' which the provisioning RPC uses for new-user trial logging.
ALTER TABLE public.product_activation_logs
  DROP CONSTRAINT IF EXISTS product_activation_logs_initiated_by_check;

ALTER TABLE public.product_activation_logs
  ADD CONSTRAINT product_activation_logs_initiated_by_check
  CHECK (initiated_by IN ('user', 'admin', 'system', 'cron', 'migration', 'signup'));
