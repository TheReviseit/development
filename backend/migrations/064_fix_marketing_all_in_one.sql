-- =============================================================================
-- Migration 064: ALL-IN-ONE fix for marketing domain
-- =============================================================================
-- Run this in Supabase SQL Editor. It does THREE things:
--   1. Deduplicates pricing_plans (keeps oldest row per plan_slug)
--   2. Seeds plan_features for all 3 marketing plans
--   3. Sets is_unlimited=true for boolean features on business/pro
-- =============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Deduplicate pricing_plans — keep only the OLDEST row per slug
-- ═══════════════════════════════════════════════════════════════════════════

-- First, update any subscriptions pointing to duplicate plan IDs
-- to point to the canonical (oldest) plan ID instead
UPDATE subscriptions
SET pricing_plan_id = keeper.id
FROM (
    SELECT DISTINCT ON (plan_slug) id, plan_slug
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND is_active = true
    ORDER BY plan_slug, created_at ASC
) keeper
WHERE subscriptions.pricing_plan_id IN (
    SELECT id FROM pricing_plans
    WHERE product_domain = 'marketing' AND is_active = true
      AND id != keeper.id
      AND plan_slug = keeper.plan_slug
);

-- Also update plan_metadata if any rows point to duplicates
UPDATE plan_metadata
SET plan_id = keeper.id
FROM (
    SELECT DISTINCT ON (plan_slug) id, plan_slug
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND is_active = true
    ORDER BY plan_slug, created_at ASC
) keeper
WHERE plan_metadata.plan_id IN (
    SELECT id FROM pricing_plans
    WHERE product_domain = 'marketing' AND is_active = true
      AND id != keeper.id
      AND plan_slug = keeper.plan_slug
);

-- Delete duplicate plan_features rows (if any exist for duplicates)
DELETE FROM plan_features
WHERE plan_id IN (
    SELECT dup.id
    FROM pricing_plans dup
    WHERE dup.product_domain = 'marketing' AND dup.is_active = true
      AND dup.id NOT IN (
          SELECT DISTINCT ON (plan_slug) id
          FROM pricing_plans
          WHERE product_domain = 'marketing' AND is_active = true
          ORDER BY plan_slug, created_at ASC
      )
);

-- Now soft-delete the duplicate pricing_plans rows
UPDATE pricing_plans
SET is_active = false
WHERE product_domain = 'marketing'
  AND is_active = true
  AND id NOT IN (
      SELECT DISTINCT ON (plan_slug) id
      FROM pricing_plans
      WHERE product_domain = 'marketing' AND is_active = true
      ORDER BY plan_slug, created_at ASC
  );

-- Verify: should show exactly 3 active marketing plans
DO $$
DECLARE
    cnt INTEGER;
BEGIN
    SELECT COUNT(*) INTO cnt
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND is_active = true;
    RAISE NOTICE '✅ STEP 1: % active marketing pricing_plans (expected 3)', cnt;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Seed plan_features for all 3 marketing plans
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    starter_id  UUID;
    business_id UUID;
    pro_id      UUID;
BEGIN
    SELECT id INTO starter_id
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND plan_slug = 'starter'
      AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    SELECT id INTO business_id
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND plan_slug = 'business'
      AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    SELECT id INTO pro_id
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND plan_slug = 'pro'
      AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    IF starter_id IS NULL OR business_id IS NULL OR pro_id IS NULL THEN
        RAISE EXCEPTION 'Marketing pricing plans not found! starter=%, business=%, pro=%',
            starter_id, business_id, pro_id;
    END IF;

    RAISE NOTICE 'Using plan IDs: starter=%, business=%, pro=%', starter_id, business_id, pro_id;

    -- ── STARTER ──────────────────────────────────────────────────────────
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
        (starter_id, 'ai_responses',       3000,   2400,  false),
        (starter_id, 'campaign_sends',      5,       4,   false),
        (starter_id, 'bulk_messaging',      500,    400,  false),
        (starter_id, 'custom_domain',       0,       0,   false),
        (starter_id, 'template_builder',    NULL,   NULL, true),   -- basic template builder ✓
        (starter_id, 'advanced_analytics',  0,       0,   false),  -- no advanced analytics
        (starter_id, 'api_access',          0,       0,   false),
        (starter_id, 'priority_support',    0,       0,   false),
        (starter_id, 'webhooks',            0,       0,   false),
        (starter_id, 'white_label',         0,       0,   false),
        (starter_id, 'message_inbox',       NULL,   NULL, true),
        (starter_id, 'contact_management',  NULL,   NULL, true),
        (starter_id, 'basic_analytics',     NULL,   NULL, true)
    ON CONFLICT (plan_id, feature_key) DO UPDATE SET
        hard_limit   = EXCLUDED.hard_limit,
        soft_limit   = EXCLUDED.soft_limit,
        is_unlimited = EXCLUDED.is_unlimited;

    -- ── BUSINESS ─────────────────────────────────────────────────────────
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
        (business_id, 'ai_responses',       10000,  8000,  false),
        (business_id, 'campaign_sends',      NULL,   NULL,  true),   -- unlimited campaigns
        (business_id, 'bulk_messaging',      5000,   4000,  false),
        (business_id, 'custom_domain',       NULL,   NULL,  true),   -- custom domain ✓
        (business_id, 'template_builder',    NULL,   NULL,  true),   -- advanced ✓
        (business_id, 'advanced_analytics',  NULL,   NULL,  true),   -- analytics ✓
        (business_id, 'api_access',          0,       0,   false),
        (business_id, 'priority_support',    NULL,   NULL,  true),   -- priority ✓
        (business_id, 'webhooks',            0,       0,   false),
        (business_id, 'white_label',         0,       0,   false),
        (business_id, 'message_inbox',       NULL,   NULL,  true),
        (business_id, 'contact_management',  NULL,   NULL,  true),
        (business_id, 'basic_analytics',     NULL,   NULL,  true)
    ON CONFLICT (plan_id, feature_key) DO UPDATE SET
        hard_limit   = EXCLUDED.hard_limit,
        soft_limit   = EXCLUDED.soft_limit,
        is_unlimited = EXCLUDED.is_unlimited;

    -- ── PRO ──────────────────────────────────────────────────────────────
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
        (pro_id, 'ai_responses',       30000,  24000,  false),
        (pro_id, 'campaign_sends',      NULL,   NULL,   true),
        (pro_id, 'bulk_messaging',      NULL,   NULL,   true),
        (pro_id, 'custom_domain',       NULL,   NULL,   true),
        (pro_id, 'template_builder',    NULL,   NULL,   true),
        (pro_id, 'advanced_analytics',  NULL,   NULL,   true),
        (pro_id, 'api_access',          NULL,   NULL,   true),
        (pro_id, 'priority_support',    NULL,   NULL,   true),
        (pro_id, 'webhooks',            NULL,   NULL,   true),
        (pro_id, 'white_label',         NULL,   NULL,   true),
        (pro_id, 'message_inbox',       NULL,   NULL,   true),
        (pro_id, 'contact_management',  NULL,   NULL,   true),
        (pro_id, 'basic_analytics',     NULL,   NULL,   true)
    ON CONFLICT (plan_id, feature_key) DO UPDATE SET
        hard_limit   = EXCLUDED.hard_limit,
        soft_limit   = EXCLUDED.soft_limit,
        is_unlimited = EXCLUDED.is_unlimited;

    RAISE NOTICE '✅ STEP 2: plan_features seeded for starter=%, business=%, pro=%',
        starter_id, business_id, pro_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Verify everything
-- ═══════════════════════════════════════════════════════════════════════════

-- Show plan_features count per plan
SELECT
    pp.plan_slug,
    pp.id AS plan_id,
    COUNT(pf.feature_key) AS feature_count
FROM pricing_plans pp
LEFT JOIN plan_features pf ON pf.plan_id = pp.id
WHERE pp.product_domain = 'marketing' AND pp.is_active = true
GROUP BY pp.plan_slug, pp.id
ORDER BY pp.plan_slug;

-- Show the advanced_analytics feature specifically (the one that was failing)
SELECT
    pp.plan_slug,
    pf.feature_key,
    pf.hard_limit,
    pf.soft_limit,
    pf.is_unlimited
FROM pricing_plans pp
JOIN plan_features pf ON pf.plan_id = pp.id
WHERE pp.product_domain = 'marketing'
  AND pp.is_active = true
  AND pf.feature_key = 'advanced_analytics'
ORDER BY pp.plan_slug;

COMMIT;
