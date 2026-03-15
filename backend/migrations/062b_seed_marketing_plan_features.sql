-- =============================================================================
-- Migration 062b: Seed Marketing Domain Plan Features
-- =============================================================================
-- Populates plan_features for marketing domain plans.
-- Run AFTER 062_seed_marketing_pricing_plans.sql.
--
-- Feature key reference:
--   ai_responses      — metered, monthly cap
--   campaign_sends    — metered, monthly cap
--   bulk_messaging    — metered, monthly cap
--   custom_domain     — boolean
--   template_builder  — boolean
--   advanced_analytics— boolean
--   api_access        — boolean (Pro only)
--   priority_support  — boolean (Business+)
-- =============================================================================

DO $$
DECLARE
    starter_id  UUID;
    business_id UUID;
    pro_id      UUID;
BEGIN
    SELECT id INTO starter_id
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND plan_slug = 'starter'
      AND billing_cycle = 'monthly' AND is_active = true
    LIMIT 1;

    SELECT id INTO business_id
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND plan_slug = 'business'
      AND billing_cycle = 'monthly' AND is_active = true
    LIMIT 1;

    SELECT id INTO pro_id
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND plan_slug = 'pro'
      AND billing_cycle = 'monthly' AND is_active = true
    LIMIT 1;

    IF starter_id IS NULL OR business_id IS NULL OR pro_id IS NULL THEN
        RAISE EXCEPTION 'Marketing pricing plans not found. Run 062_seed_marketing_pricing_plans.sql first.';
    END IF;

    -- ── STARTER ──────────────────────────────────────────────────────────
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
        (starter_id, 'ai_responses',       3000,   2400,  false),
        (starter_id, 'campaign_sends',      5,       4,   false),  -- 5 campaigns/month
        (starter_id, 'bulk_messaging',      500,    400,  false),  -- 500 recipients
        (starter_id, 'custom_domain',       0,       0,   false),  -- no custom domain
        (starter_id, 'template_builder',    NULL,   NULL, false),  -- basic template builder ✓
        (starter_id, 'advanced_analytics',  0,       0,   false),  -- no advanced analytics
        (starter_id, 'api_access',          0,       0,   false),  -- no API access
        (starter_id, 'priority_support',    0,       0,   false),  -- email only
        (starter_id, 'webhooks',            0,       0,   false),
        (starter_id, 'white_label',         0,       0,   false),
        -- Shared baseline
        (starter_id, 'message_inbox',       NULL,   NULL, false),
        (starter_id, 'contact_management',  NULL,   NULL, false),
        (starter_id, 'basic_analytics',     NULL,   NULL, false)
    ON CONFLICT (plan_id, feature_key) DO UPDATE SET
        hard_limit   = EXCLUDED.hard_limit,
        soft_limit   = EXCLUDED.soft_limit,
        is_unlimited = EXCLUDED.is_unlimited;

    -- ── BUSINESS ─────────────────────────────────────────────────────────
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
        (business_id, 'ai_responses',       10000,  8000,  false),
        (business_id, 'campaign_sends',      NULL,   NULL,  true),   -- unlimited campaigns
        (business_id, 'bulk_messaging',      5000,   4000,  false),  -- 5000 recipients/campaign
        (business_id, 'custom_domain',       NULL,   NULL,  false),  -- custom domain ✓
        (business_id, 'template_builder',    NULL,   NULL,  false),  -- advanced ✓
        (business_id, 'advanced_analytics',  NULL,   NULL,  false),  -- analytics ✓
        (business_id, 'api_access',          0,       0,   false),   -- no API access
        (business_id, 'priority_support',    NULL,   NULL,  false),  -- priority ✓
        (business_id, 'webhooks',            0,       0,   false),
        (business_id, 'white_label',         0,       0,   false),
        (business_id, 'message_inbox',       NULL,   NULL,  false),
        (business_id, 'contact_management',  NULL,   NULL,  false),
        (business_id, 'basic_analytics',     NULL,   NULL,  false)
    ON CONFLICT (plan_id, feature_key) DO UPDATE SET
        hard_limit   = EXCLUDED.hard_limit,
        soft_limit   = EXCLUDED.soft_limit,
        is_unlimited = EXCLUDED.is_unlimited;

    -- ── PRO ──────────────────────────────────────────────────────────────
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
        (pro_id, 'ai_responses',       30000,  24000,  false),
        (pro_id, 'campaign_sends',      NULL,   NULL,   true),    -- unlimited
        (pro_id, 'bulk_messaging',      NULL,   NULL,   true),    -- unlimited recipients
        (pro_id, 'custom_domain',       NULL,   NULL,   true),
        (pro_id, 'template_builder',    NULL,   NULL,   true),
        (pro_id, 'advanced_analytics',  NULL,   NULL,   true),
        (pro_id, 'api_access',          NULL,   NULL,   true),    -- API ✓
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

    RAISE NOTICE '✅ Marketing plan_features seeded: starter=%, business=%, pro=%',
        starter_id, business_id, pro_id;
END $$;
