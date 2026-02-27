-- =============================================================================
-- Migration 048: Seed Plan Metadata (Tier Levels + Marketing)
-- =============================================================================
-- Purpose: Populate plan_metadata table with tier levels, taglines, and
--          sales requirements for all domains
-- Eliminates: Hardcoded CONSOLE_TIER_META dict from console_billing.py
-- =============================================================================

BEGIN;

-- =============================================================================
-- Shop Domain Plans
-- =============================================================================
INSERT INTO plan_metadata (plan_id, tier_level, tagline, requires_sales_call, trial_days)
SELECT
    id,
    CASE plan_slug
        WHEN 'starter' THEN 0
        WHEN 'business' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 3
    END,
    CASE plan_slug
        WHEN 'starter' THEN 'Best for getting started'
        WHEN 'business' THEN 'Most Popular'
        WHEN 'pro' THEN 'Full power'
        WHEN 'enterprise' THEN 'Custom solution'
    END,
    CASE plan_slug
        WHEN 'enterprise' THEN true
        ELSE false
    END,
    0
FROM pricing_plans
WHERE product_domain = 'shop' AND is_active = true
ON CONFLICT (plan_id) DO UPDATE SET
    tier_level = EXCLUDED.tier_level,
    tagline = EXCLUDED.tagline,
    requires_sales_call = EXCLUDED.requires_sales_call;

-- =============================================================================
-- Marketing Domain Plans
-- =============================================================================
INSERT INTO plan_metadata (plan_id, tier_level, tagline, requires_sales_call, trial_days)
SELECT
    id,
    CASE plan_slug
        WHEN 'starter' THEN 0
        WHEN 'business' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 3
    END,
    CASE plan_slug
        WHEN 'starter' THEN 'Best for small campaigns'
        WHEN 'business' THEN 'Most Popular'
        WHEN 'pro' THEN 'Unlimited reach'
        WHEN 'enterprise' THEN 'White-label solution'
    END,
    CASE plan_slug
        WHEN 'enterprise' THEN true
        ELSE false
    END,
    0
FROM pricing_plans
WHERE product_domain = 'marketing' AND is_active = true
ON CONFLICT (plan_id) DO UPDATE SET
    tier_level = EXCLUDED.tier_level,
    tagline = EXCLUDED.tagline,
    requires_sales_call = EXCLUDED.requires_sales_call;

-- =============================================================================
-- API Domain Plans (Console)
-- =============================================================================
INSERT INTO plan_metadata (plan_id, tier_level, tagline, requires_sales_call, trial_days)
SELECT
    id,
    CASE plan_slug
        WHEN 'starter' THEN 0
        WHEN 'developer' THEN 0  -- Alias for starter
        WHEN 'growth' THEN 1
        WHEN 'business' THEN 1    -- Alias for growth
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 3
    END,
    CASE plan_slug
        WHEN 'starter' THEN 'For testing'
        WHEN 'developer' THEN 'For testing'
        WHEN 'growth' THEN 'Most Popular'
        WHEN 'business' THEN 'Most Popular'
        WHEN 'pro' THEN 'For scale'
        WHEN 'enterprise' THEN 'Contact sales'
    END,
    CASE plan_slug
        WHEN 'enterprise' THEN true
        ELSE false
    END,
    0
FROM pricing_plans
WHERE product_domain = 'api' AND is_active = true
ON CONFLICT (plan_id) DO UPDATE SET
    tier_level = EXCLUDED.tier_level,
    tagline = EXCLUDED.tagline,
    requires_sales_call = EXCLUDED.requires_sales_call;

-- =============================================================================
-- Dashboard Domain Plans
-- =============================================================================
INSERT INTO plan_metadata (plan_id, tier_level, tagline, requires_sales_call, trial_days)
SELECT
    id,
    CASE plan_slug
        WHEN 'starter' THEN 0
        WHEN 'business' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 3
    END,
    CASE plan_slug
        WHEN 'starter' THEN 'All essentials'
        WHEN 'business' THEN 'Most Popular'
        WHEN 'pro' THEN 'Advanced features'
        WHEN 'enterprise' THEN 'Custom solution'
    END,
    CASE plan_slug
        WHEN 'enterprise' THEN true
        ELSE false
    END,
    0
FROM pricing_plans
WHERE product_domain = 'dashboard' AND is_active = true
ON CONFLICT (plan_id) DO UPDATE SET
    tier_level = EXCLUDED.tier_level,
    tagline = EXCLUDED.tagline,
    requires_sales_call = EXCLUDED.requires_sales_call;

-- =============================================================================
-- Showcase Domain Plans
-- =============================================================================
INSERT INTO plan_metadata (plan_id, tier_level, tagline, requires_sales_call, trial_days)
SELECT
    id,
    CASE plan_slug
        WHEN 'starter' THEN 0
        WHEN 'business' THEN 1
        WHEN 'pro' THEN 2
    END,
    CASE plan_slug
        WHEN 'starter' THEN 'Simple portfolio'
        WHEN 'business' THEN 'Professional look'
        WHEN 'pro' THEN 'Custom branding'
    END,
    false,
    0
FROM pricing_plans
WHERE product_domain = 'showcase' AND is_active = true
ON CONFLICT (plan_id) DO UPDATE SET
    tier_level = EXCLUDED.tier_level,
    tagline = EXCLUDED.tagline,
    requires_sales_call = EXCLUDED.requires_sales_call;

-- =============================================================================
-- Verification Query
-- =============================================================================
-- Run after migration to verify:
-- SELECT
--     pp.product_domain,
--     pp.plan_slug,
--     pm.tier_level,
--     pm.tagline,
--     pm.requires_sales_call
-- FROM pricing_plans pp
-- LEFT JOIN plan_metadata pm ON pp.id = pm.plan_id
-- WHERE pp.is_active = true
-- ORDER BY pp.product_domain, pm.tier_level;
--
-- Expected: All active plans have tier_level assigned
-- =============================================================================

COMMIT;
