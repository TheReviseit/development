-- =============================================================================
-- Migration 050: Yearly Pricing Calculations
-- =============================================================================
-- Purpose: Add database function and view for automatic yearly pricing calculations
--          with discount (default 20% savings)
-- Benefit: Frontend can display "Save 20% with yearly billing" dynamically
-- =============================================================================

BEGIN;

-- =============================================================================
-- Function: calculate_yearly_amount
-- =============================================================================
-- Calculates yearly amount from monthly price with discount
-- Formula: yearly = monthly * 12 * (1 - discount%)
-- Uses integer arithmetic (paise) to avoid floating point errors
-- =============================================================================
CREATE OR REPLACE FUNCTION calculate_yearly_amount(
    monthly_amount_paise INTEGER,
    discount_percent INTEGER DEFAULT 20
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE  -- Result depends only on inputs, safe for indexing
AS $$
BEGIN
    -- Validate inputs
    IF monthly_amount_paise IS NULL OR monthly_amount_paise < 0 THEN
        RAISE EXCEPTION 'monthly_amount_paise must be non-negative';
    END IF;

    IF discount_percent < 0 OR discount_percent > 100 THEN
        RAISE EXCEPTION 'discount_percent must be between 0 and 100';
    END IF;

    -- Calculate yearly with discount
    -- yearly = monthly * 12 * (100 - discount%) / 100
    -- Use FLOOR to ensure integer result (paise precision)
    RETURN FLOOR((monthly_amount_paise * 12 * (100 - discount_percent)) / 100.0);
END;
$$;

-- Test the function
-- SELECT calculate_yearly_amount(199900, 20);  -- ₹1,999/mo → ₹19,190.40/yr (20% off)
-- Expected: 1919040 paise

-- =============================================================================
-- View: pricing_plans_with_yearly
-- =============================================================================
-- Enriches pricing_plans with calculated yearly pricing and savings
-- Used by GET /api/upgrade/options to show yearly toggle with "Save X%"
-- =============================================================================
CREATE OR REPLACE VIEW pricing_plans_with_yearly AS
SELECT
    p.*,

    -- Yearly amount (if monthly plan, calculate; if yearly, use as-is)
    CASE
        WHEN p.billing_cycle = 'monthly' THEN calculate_yearly_amount(p.amount_paise, 20)
        ELSE p.amount_paise
    END AS amount_yearly_paise,

    -- Savings amount (monthly * 12 - yearly)
    CASE
        WHEN p.billing_cycle = 'monthly' THEN (p.amount_paise * 12) - calculate_yearly_amount(p.amount_paise, 20)
        ELSE 0
    END AS yearly_savings_paise,

    -- Savings percentage
    CASE
        WHEN p.billing_cycle = 'monthly' THEN 20
        ELSE 0
    END AS yearly_savings_percent,

    -- Display strings (for frontend convenience)
    CASE
        WHEN p.billing_cycle = 'monthly' THEN
            '₹' || TRIM(TO_CHAR(p.amount_paise / 100.0, '999,999,990')) || '/month'
        ELSE
            '₹' || TRIM(TO_CHAR(p.amount_paise / 100.0, '999,999,990')) || '/year'
    END AS amount_display,

    CASE
        WHEN p.billing_cycle = 'monthly' THEN
            '₹' || TRIM(TO_CHAR(calculate_yearly_amount(p.amount_paise, 20) / 100.0, '999,999,990')) || '/year'
        ELSE NULL
    END AS amount_yearly_display

FROM pricing_plans p
WHERE p.is_active = true;

-- Grant SELECT permission to application role (if using RBAC)
-- GRANT SELECT ON pricing_plans_with_yearly TO app_user;

-- =============================================================================
-- Example Queries
-- =============================================================================

-- 1. Get all plans with yearly pricing for shop domain:
-- SELECT
--     plan_slug,
--     billing_cycle,
--     amount_paise,
--     amount_yearly_paise,
--     yearly_savings_paise,
--     yearly_savings_percent,
--     amount_display,
--     amount_yearly_display
-- FROM pricing_plans_with_yearly
-- WHERE product_domain = 'shop'
-- ORDER BY tier_level;

-- Expected output (example for Starter plan):
-- plan_slug   | billing_cycle | amount_paise | amount_yearly_paise | yearly_savings_paise | yearly_savings_percent
-- ------------|---------------|--------------|---------------------|----------------------|----------------------
-- starter     | monthly       | 199900       | 1919040             | 470760               | 20

-- 2. Frontend usage in GET /api/upgrade/options:
-- SELECT * FROM pricing_plans_with_yearly
-- WHERE product_domain = :domain
-- ORDER BY tier_level;

-- =============================================================================
-- Verification Tests
-- =============================================================================

-- Test 1: Verify calculation accuracy
DO $$
DECLARE
    monthly_price INTEGER := 199900;  -- ₹1,999
    yearly_price INTEGER;
    expected_yearly INTEGER := 1919040;  -- ₹1,999 * 12 * 0.8
BEGIN
    yearly_price := calculate_yearly_amount(monthly_price, 20);

    IF yearly_price != expected_yearly THEN
        RAISE EXCEPTION 'Yearly calculation failed: expected %, got %', expected_yearly, yearly_price;
    END IF;

    RAISE NOTICE 'Test 1 PASSED: Yearly calculation correct (₹1,999/mo → ₹19,190.40/yr)';
END;
$$;

-- Test 2: Verify view returns data
DO $$
DECLARE
    plan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO plan_count
    FROM pricing_plans_with_yearly
    WHERE product_domain = 'shop';

    IF plan_count = 0 THEN
        RAISE WARNING 'No shop plans found in pricing_plans_with_yearly view';
    ELSE
        RAISE NOTICE 'Test 2 PASSED: Found % shop plans with yearly pricing', plan_count;
    END IF;
END;
$$;

-- =============================================================================
-- Notes for Frontend Integration
-- =============================================================================
--
-- When rendering the billing cycle toggle:
--
-- <BillingCycleToggle
--   monthly={plan.amount_paise / 100}  // ₹1,999
--   yearly={plan.amount_yearly_paise / 100}  // ₹19,190.40
--   savings={plan.yearly_savings_percent}  // 20%
-- />
--
-- Display: "Save 20% - Pay ₹19,190 instead of ₹23,988 per year"
-- =============================================================================

COMMIT;
