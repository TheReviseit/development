-- ============================================================================
-- ROLLBACK SCRIPT FOR MIGRATION 032
-- ============================================================================
-- Purpose: Emergency rollback if critical issues found after deployment
-- WARNING: USE ONLY IF AUTHENTICATION IS BROKEN
-- Safety: This will DELETE all product membership data
-- 
-- WHEN TO USE:
-- - Auth failure rate >5% after migration
-- - Existing users locked out
-- - Critical bugs in product validation logic
-- 
-- WHEN NOT TO USE:
-- - Minor bugs in activation UI (fix forward instead)
-- - Performance issues (optimize instead)
-- - Individual user issues (manual fix instead)
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: BACKUP DATA BEFORE ROLLBACK
-- ============================================================================

-- Create backup tables (in case rollback was premature)
CREATE TABLE IF NOT EXISTS public.user_products_backup_032 AS
SELECT *, NOW() AS backup_created_at
FROM public.user_products;

CREATE TABLE IF NOT EXISTS public.product_activation_logs_backup_032 AS
SELECT *, NOW() AS backup_created_at
FROM public.product_activation_logs;

RAISE NOTICE '✅ Backup created: user_products_backup_032 and product_activation_logs_backup_032';

-- ============================================================================
-- SECTION 2: DROP NEW TABLES
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_user_products_updated_at ON public.user_products;

-- Drop functions
DROP FUNCTION IF EXISTS update_user_products_timestamp();

-- Drop tables (cascades to foreign keys)
DROP TABLE IF EXISTS public.product_activation_logs CASCADE;
DROP TABLE IF EXISTS public.user_products CASCADE;

RAISE NOTICE '✅ Dropped user_products and product_activation_logs tables';

-- ============================================================================
-- SECTION 3: RESTORE AI_CAPABILITIES COLUMNS (IF DROPPED)
-- ============================================================================

-- Note: Only needed if migration included dropping ai_capabilities columns
-- This migration 032 does NOT drop them, so this is future-proofing

-- Re-add order_booking_enabled if dropped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'ai_capabilities' 
      AND column_name = 'order_booking_enabled'
  ) THEN
    ALTER TABLE public.ai_capabilities 
      ADD COLUMN order_booking_enabled BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✅ Restored ai_capabilities.order_booking_enabled column';
  END IF;
END $$;

-- Re-add products_enabled if dropped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'ai_capabilities' 
      AND column_name = 'products_enabled'
  ) THEN
    ALTER TABLE public.ai_capabilities 
      ADD COLUMN products_enabled BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✅ Restored ai_capabilities.products_enabled column';
  END IF;
END $$;

-- Re-add showcase_enabled if dropped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'ai_capabilities' 
      AND column_name = 'showcase_enabled'
  ) THEN
    ALTER TABLE public.ai_capabilities 
      ADD COLUMN showcase_enabled BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '✅ Restored ai_capabilities.showcase_enabled column';
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: VERIFICATION
-- ============================================================================

DO $$
DECLARE
  user_products_exists BOOLEAN;
  backup_row_count INTEGER;
BEGIN
  -- Verify tables are dropped
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'user_products'
  ) INTO user_products_exists;
  
  IF user_products_exists THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: user_products table still exists';
  END IF;
  
  -- Verify backup was created
  SELECT COUNT(*) INTO backup_row_count FROM public.user_products_backup_032;
  
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ROLLBACK VERIFICATION';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'user_products table dropped: YES';
  RAISE NOTICE 'Backup row count: %', backup_row_count;
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ROLLBACK COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Redeploy previous frontend version';
  RAISE NOTICE '2. Redeploy previous backend API routes';
  RAISE NOTICE '3. Verify authentication working';
  RAISE NOTICE '4. Investigate root cause in backup tables';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;

-- ============================================================================
-- POST-ROLLBACK: RESTORE FROM BACKUP (IF NEEDED)
-- ============================================================================

-- If you need to restore the data after investigation:
-- 
-- INSERT INTO public.user_products 
-- SELECT * EXCEPT(backup_created_at) FROM public.user_products_backup_032;
--
-- INSERT INTO public.product_activation_logs
-- SELECT * EXCEPT(backup_created_at) FROM public.product_activation_logs_backup_032;

-- ============================================================================
-- CLEANUP BACKUP TABLES (AFTER 30 DAYS)
-- ============================================================================

-- After confirming rollback was successful and system is stable:
-- DROP TABLE public.user_products_backup_032;
-- DROP TABLE public.product_activation_logs_backup_032;

-- ============================================================================
-- END OF ROLLBACK SCRIPT
-- ============================================================================
