-- =============================================================================
-- Migration: 036_add_environment_plan_ids.sql
-- Description: Add sandbox/production Razorpay plan ID columns for
--              environment-safe billing. Zero-config deploy safety.
-- Date: 2026-02-14
-- =============================================================================
--
-- ARCHITECTURE:
--   Option 2 (Dual Columns) — one row per plan, two plan ID slots.
--   Environment resolution happens at the service layer, not the database.
--
-- WHY:
--   - Single source of truth: one row = one plan, no duplication
--   - Zero consumer changes: PricingService resolves the correct ID
--   - Future-proof naming: sandbox/production (not test/live)
--   - Supports staging, multi-currency, provider-switching later
--
-- ROLLBACK:
--   ALTER TABLE pricing_plans DROP COLUMN razorpay_plan_id_sandbox;
--   ALTER TABLE pricing_plans DROP COLUMN razorpay_plan_id_production;
-- =============================================================================

-- Step 1: Add environment-specific plan ID columns
ALTER TABLE pricing_plans
    ADD COLUMN IF NOT EXISTS razorpay_plan_id_sandbox VARCHAR(100),
    ADD COLUMN IF NOT EXISTS razorpay_plan_id_production VARCHAR(100);

-- Step 2: Migrate existing data
-- Current razorpay_plan_id values are TEST plan IDs → copy to sandbox column
UPDATE pricing_plans
SET razorpay_plan_id_sandbox = razorpay_plan_id
WHERE razorpay_plan_id IS NOT NULL
  AND razorpay_plan_id_sandbox IS NULL;

-- Step 3: Add comments for schema documentation
COMMENT ON COLUMN pricing_plans.razorpay_plan_id IS
    'DEPRECATED — Use razorpay_plan_id_sandbox / razorpay_plan_id_production. '
    'Kept for backwards compatibility during migration period.';

COMMENT ON COLUMN pricing_plans.razorpay_plan_id_sandbox IS
    'Razorpay plan ID for sandbox/test environment (rzp_test_* keys). '
    'Required for development and staging.';

COMMENT ON COLUMN pricing_plans.razorpay_plan_id_production IS
    'Razorpay plan ID for production/live environment (rzp_live_* keys). '
    'MUST be set before production deploy — app will crash on startup if NULL.';

-- Step 4: Add partial index for environment-aware lookups
-- Ensures fast queries when filtering for plans with production IDs configured
CREATE INDEX IF NOT EXISTS idx_pricing_production_configured
    ON pricing_plans(product_domain, plan_slug, billing_cycle)
    WHERE razorpay_plan_id_production IS NOT NULL
      AND is_active = true
      AND effective_to IS NULL;
