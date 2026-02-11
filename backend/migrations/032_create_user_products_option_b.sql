-- ============================================================================
-- MIGRATION 032: ENTERPRISE PRODUCT MEMBERSHIP MODEL (OPTION B)
-- ============================================================================
-- Purpose: Transform from soft feature flags to explicit product memberships
-- Standard: Google Workspace / Zoho One level architecture
-- Safety: IDEMPOTENT, ZERO-DOWNTIME, ROLLBACK-SAFE
-- Author: Principal SaaS Architect
-- Date: 2026-02-11
-- 
-- CRITICAL REQUIREMENTS:
-- 1. Every user MUST have at least one product membership (dashboard default)
-- 2. Migration backfills from ai_capabilities flags (shop, showcase)
-- 3. All operations are idempotent (safe to run multiple times)
-- 4. Includes comprehensive audit trail
-- 5. Performance optimized with strategic indexes
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: CREATE USER_PRODUCTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_products (
  -- Primary Key (UUID v4 for distributed systems)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Foreign Key (CASCADE delete to clean up orphaned memberships)
  user_id UUID NOT NULL,
  
  -- Product Identifier (enum enforced at DB level)
  product TEXT NOT NULL 
    CHECK (product IN ('shop', 'marketing', 'showcase', 'dashboard', 'api')),
  
  -- Membership Status (state machine at DB level)
  status TEXT NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  
  -- Activation Metadata
  activated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  activated_by TEXT NOT NULL DEFAULT 'migration'
    CHECK (activated_by IN ('signup', 'activation', 'admin', 'migration', 'system')),
  
  -- Trial Management
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  trial_days INTEGER DEFAULT 14,
  
  -- Lifecycle Timestamps
  suspended_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  reactivated_at TIMESTAMP WITH TIME ZONE,
  
  -- Admin Controls
  admin_notes TEXT,
  internal_notes JSONB DEFAULT '{}'::jsonb,
  
  -- Standard Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT user_products_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Unique constraint: One membership per (user, product) pair
  CONSTRAINT user_products_user_product_unique 
    UNIQUE (user_id, product),
  
  -- Business rule: trial_ends_at required if status is 'trial'
  CONSTRAINT user_products_trial_consistency 
    CHECK (
      (status = 'trial' AND trial_ends_at IS NOT NULL) OR
      (status != 'trial')
    ),
    
  -- Business rule: cancelled_at required if status is 'cancelled'
  CONSTRAINT user_products_cancelled_consistency
    CHECK (
      (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
      (status != 'cancelled')
    )
);

-- ============================================================================
-- SECTION 2: PERFORMANCE INDEXES
-- ============================================================================

-- Primary lookup: Get all products for a user (HOT PATH)
CREATE INDEX IF NOT EXISTS idx_user_products_user_id 
  ON public.user_products(user_id)
  INCLUDE (product, status);

-- Lookup: Get all users for a product (analytics)
CREATE INDEX IF NOT EXISTS idx_user_products_product 
  ON public.user_products(product)
  WHERE status IN ('trial', 'active');

-- Lookup: Active memberships only (most common filter)
CREATE INDEX IF NOT EXISTS idx_user_products_status 
  ON public.user_products(status, user_id)
  WHERE status IN ('trial', 'active');

-- Cron job: Find expiring trials (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_user_products_trial_expiry 
  ON public.user_products(trial_ends_at, user_id, product)
  WHERE status = 'trial' AND trial_ends_at IS NOT NULL;

-- Composite: User + product lookup (auth hot path)
CREATE INDEX IF NOT EXISTS idx_user_products_user_product 
  ON public.user_products(user_id, product, status);

-- Analytics: Activation tracking
CREATE INDEX IF NOT EXISTS idx_user_products_activated_at 
  ON public.user_products(activated_at DESC)
  WHERE activated_by != 'migration';

-- ============================================================================
-- SECTION 3: AUTOMATIC TIMESTAMP TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_products_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_products_updated_at ON public.user_products;

CREATE TRIGGER trigger_user_products_updated_at
  BEFORE UPDATE ON public.user_products
  FOR EACH ROW
  EXECUTE FUNCTION update_user_products_timestamp();

-- ============================================================================
-- SECTION 4: ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.user_products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running migration
DROP POLICY IF EXISTS user_products_select_own ON public.user_products;
DROP POLICY IF EXISTS user_products_service_role ON public.user_products;
DROP POLICY IF EXISTS user_products_anon_none ON public.user_products;

-- Policy 1: Users can SELECT their own product memberships
CREATE POLICY user_products_select_own 
  ON public.user_products
  FOR SELECT
  USING (
    auth.uid()::uuid = user_id
  );

-- Policy 2: Service role has full access (for backend APIs)
CREATE POLICY user_products_service_role 
  ON public.user_products
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy 3: Anonymous users have no access
CREATE POLICY user_products_anon_none 
  ON public.user_products
  FOR ALL
  TO anon
  USING (false);

-- ============================================================================
-- SECTION 5: PRODUCT ACTIVATION AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_activation_logs (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_product_id UUID REFERENCES public.user_products(id) ON DELETE SET NULL,
  
  -- Event Data
  product TEXT NOT NULL,
  action TEXT NOT NULL 
    CHECK (action IN (
      'activated', 'trial_started', 'trial_extended', 'trial_expired',
      'upgraded', 'downgraded', 'suspended', 'cancelled', 'reactivated'
    )),
  
  -- State Transition
  previous_status TEXT,
  new_status TEXT,
  
  -- Attribution
  initiated_by TEXT NOT NULL
    CHECK (initiated_by IN ('user', 'admin', 'system', 'cron', 'migration')),
  actor_id UUID,  -- Firebase UID of admin if manually changed
  
  -- Request Context (for security audit)
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,  -- Correlation ID for debugging
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_activation_logs_user_id 
  ON public.product_activation_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activation_logs_product 
  ON public.product_activation_logs(product, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activation_logs_action 
  ON public.product_activation_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activation_logs_created_at 
  ON public.product_activation_logs(created_at DESC);

-- RLS for audit log
ALTER TABLE public.product_activation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activation_logs_select_own ON public.product_activation_logs;
DROP POLICY IF EXISTS activation_logs_service_role ON public.product_activation_logs;

CREATE POLICY activation_logs_select_own 
  ON public.product_activation_logs
  FOR SELECT
  USING (auth.uid()::uuid = user_id);

CREATE POLICY activation_logs_service_role 
  ON public.product_activation_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SECTION 6: DATA MIGRATION (BACKFILL)
-- ============================================================================

-- Step 6.1: Grant dashboard access to ALL users (free tier)
-- IDEMPOTENT: Uses ON CONFLICT DO NOTHING
INSERT INTO public.user_products (user_id, product, status, activated_by, activated_at, trial_ends_at)
SELECT 
  id AS user_id,
  'dashboard' AS product,
  'active' AS status,
  'migration' AS activated_by,
  created_at AS activated_at,
  NULL AS trial_ends_at  -- Dashboard is always free
FROM public.users
ON CONFLICT (user_id, product) DO NOTHING;

-- Step 6.2: Migrate shop product from ai_capabilities.order_booking_enabled
-- Existing users get 'active' status (grandfathered), not trial
INSERT INTO public.user_products (user_id, product, status, activated_by, activated_at, trial_ends_at, admin_notes)
SELECT 
  u.id AS user_id,
  'shop' AS product,
  'active' AS status,  -- Existing users are grandfathered
  'migration' AS activated_by,
  u.created_at AS activated_at,
  NULL AS trial_ends_at,
  'Migrated from ai_capabilities.order_booking_enabled=true' AS admin_notes
FROM public.users u
INNER JOIN public.ai_capabilities ac ON ac.user_id::uuid = u.id
WHERE ac.order_booking_enabled = TRUE
ON CONFLICT (user_id, product) DO NOTHING;

-- Step 6.3: Migrate showcase product from ai_capabilities.showcase_enabled
INSERT INTO public.user_products (user_id, product, status, activated_by, activated_at, trial_ends_at, admin_notes)
SELECT 
  u.id AS user_id,
  'showcase' AS product,
  'active' AS status,
  'migration' AS activated_by,
  u.created_at AS activated_at,
  NULL AS trial_ends_at,
  'Migrated from ai_capabilities.showcase_enabled=true' AS admin_notes
FROM public.users u
INNER JOIN public.ai_capabilities ac ON ac.user_id::uuid = u.id
WHERE ac.showcase_enabled = TRUE
ON CONFLICT (user_id, product) DO NOTHING;

-- Step 6.4: Check for users with products_enabled but no shop membership
-- Grant shop if they had products_enabled (likely shop users)
INSERT INTO public.user_products (user_id, product, status, activated_by, activated_at, trial_ends_at, admin_notes)
SELECT 
  u.id AS user_id,
  'shop' AS product,
  'active' AS status,
  'migration' AS activated_by,
  u.created_at AS activated_at,
  NULL AS trial_ends_at,
  'Migrated from ai_capabilities.products_enabled=true (inferred shop)' AS admin_notes
FROM public.users u
INNER JOIN public.ai_capabilities ac ON ac.user_id::uuid = u.id
WHERE ac.products_enabled = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.user_products up 
    WHERE up.user_id = u.id AND up.product = 'shop'
  )
ON CONFLICT (user_id, product) DO NOTHING;

-- ============================================================================
-- SECTION 7: AUDIT LOG BACKFILL
-- ============================================================================

-- Log all migrated memberships for compliance
INSERT INTO public.product_activation_logs (
  user_id, 
  user_product_id,
  product, 
  action, 
  new_status, 
  initiated_by,
  metadata,
  created_at
)
SELECT 
  up.user_id,
  up.id AS user_product_id,
  up.product,
  'activated' AS action,
  up.status AS new_status,
  'migration' AS initiated_by,
  jsonb_build_object(
    'migration_version', '032',
    'migration_date', NOW()::text,
    'notes', up.admin_notes
  ) AS metadata,
  up.created_at
FROM public.user_products up
WHERE up.activated_by = 'migration'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_activation_logs pal
    WHERE pal.user_id = up.user_id 
      AND pal.product = up.product
      AND pal.action = 'activated'
      AND pal.initiated_by = 'migration'
  );

-- ============================================================================
-- SECTION 8: VERIFICATION QUERIES
-- ============================================================================

-- These queries will be run automatically after migration to verify success
-- Results are logged for audit purposes

DO $$
DECLARE
  total_users INTEGER;
  users_with_dashboard INTEGER;
  users_with_shop INTEGER;
  users_with_showcase INTEGER;
  orphaned_users INTEGER;
  total_memberships INTEGER;
BEGIN
  -- Count total users
  SELECT COUNT(*) INTO total_users FROM public.users;
  
  -- Count users with each product
  SELECT COUNT(DISTINCT user_id) INTO users_with_dashboard 
    FROM public.user_products WHERE product = 'dashboard';
  
  SELECT COUNT(DISTINCT user_id) INTO users_with_shop 
    FROM public.user_products WHERE product = 'shop';
  
  SELECT COUNT(DISTINCT user_id) INTO users_with_showcase 
    FROM public.user_products WHERE product = 'showcase';
  
  -- Check for orphaned users (critical: should be ZERO)
  SELECT COUNT(*) INTO orphaned_users
  FROM public.users u
  LEFT JOIN public.user_products up ON up.user_id = u.id
  WHERE up.id IS NULL;
  
  -- Total memberships
  SELECT COUNT(*) INTO total_memberships FROM public.user_products;
  
  -- Log verification results
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MIGRATION 032 VERIFICATION RESULTS';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Total Users: %', total_users;
  RAISE NOTICE 'Users with Dashboard: % (should equal total)', users_with_dashboard;
  RAISE NOTICE 'Users with Shop: %', users_with_shop;
  RAISE NOTICE 'Users with Showcase: %', users_with_showcase;
  RAISE NOTICE 'Orphaned Users: % (MUST BE ZERO)', orphaned_users;
  RAISE NOTICE 'Total Memberships: %', total_memberships;
  RAISE NOTICE '============================================================';
  
  -- CRITICAL CHECK: Fail migration if orphaned users found
  IF orphaned_users > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: Found % orphaned users without any product membership. All users must have at least dashboard access.', orphaned_users;
  END IF;
  
  -- Warning if dashboard coverage is not 100%
  IF users_with_dashboard != total_users THEN
    RAISE WARNING 'Dashboard coverage is not 100 percent: % out of %', users_with_dashboard, total_users;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION MANUAL VERIFICATION
-- ============================================================================

-- Run these queries manually after migration to verify:

-- 1. Check orphaned users (should return 0 rows)
-- SELECT u.id, u.email 
-- FROM public.users u
-- LEFT JOIN public.user_products up ON up.user_id = u.id
-- WHERE up.id IS NULL;

-- 2. Check product distribution
-- SELECT product, COUNT(*) AS user_count
-- FROM public.user_products
-- GROUP BY product
-- ORDER BY user_count DESC;

-- 3. Check status distribution
-- SELECT status, COUNT(*) AS count
-- FROM public.user_products
-- GROUP BY status;

-- 4. Check users with multiple products
-- SELECT user_id, array_agg(product ORDER BY product) AS products, COUNT(*) AS product_count
-- FROM public.user_products
-- GROUP BY user_id
-- ORDER BY product_count DESC
-- LIMIT 20;

-- 5. Verify audit log entries
-- SELECT COUNT(*) AS migration_log_count
-- FROM public.product_activation_logs
-- WHERE initiated_by = 'migration';

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (EMERGENCY ONLY)
-- ============================================================================

-- IF CRITICAL ISSUES FOUND WITHIN 24H, run rollback script:
-- \i backend/migrations/032_rollback_user_products.sql

-- CAUTION: Rollback will DELETE user_products and product_activation_logs tables
-- Only use if migration caused authentication failures

-- ============================================================================
-- END OF MIGRATION 032
-- ============================================================================
