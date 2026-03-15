-- =============================================================================
-- Migration 063: Seed Plan Metadata for Marketing Domain
-- =============================================================================
-- Root cause fix: Migration 048 (seed_plan_metadata) was run BEFORE migration
-- 062 (seed_marketing_pricing_plans), so no plan_metadata rows exist for
-- the marketing domain.  Without tier_level metadata, the UpgradeEngine's
-- _get_plan_metadata() fallback returns tier_level=0 for ALL plans, making
-- every upgrade look like "same tier" → blocked_downgrade.
--
-- This migration re-seeds plan_metadata for marketing plans using the same
-- tier ladder as shop: starter=0 → business=1 → pro=2 → enterprise=3.
-- Uses ON CONFLICT so it's idempotent (safe to re-run).
-- =============================================================================

BEGIN;

INSERT INTO plan_metadata (plan_id, tier_level, tagline, requires_sales_call, trial_days)
SELECT
    id,
    CASE plan_slug
        WHEN 'starter'    THEN 0
        WHEN 'business'   THEN 1
        WHEN 'pro'        THEN 2
        WHEN 'enterprise' THEN 3
    END,
    CASE plan_slug
        WHEN 'starter'    THEN 'Best for small campaigns'
        WHEN 'business'   THEN 'Most Popular'
        WHEN 'pro'        THEN 'Unlimited reach'
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

-- ─── Verification ───────────────────────────────────────────────────────
DO $$
DECLARE
    meta_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO meta_count
    FROM plan_metadata pm
    JOIN pricing_plans pp ON pp.id = pm.plan_id
    WHERE pp.product_domain = 'marketing' AND pp.is_active = true;

    IF meta_count < 3 THEN
        RAISE WARNING '⚠ Expected ≥ 3 marketing plan_metadata rows, found %. Re-run 062 first.', meta_count;
    ELSE
        RAISE NOTICE '✅ Marketing plan_metadata: % rows seeded (starter=0, business=1, pro=2)', meta_count;
    END IF;
END $$;

SELECT
    pp.plan_slug,
    pp.product_domain,
    pm.tier_level,
    pm.tagline,
    pm.requires_sales_call
FROM pricing_plans pp
JOIN plan_metadata pm ON pp.id = pm.plan_id
WHERE pp.product_domain = 'marketing' AND pp.is_active = true
ORDER BY pm.tier_level;

COMMIT;
