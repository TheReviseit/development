-- =============================================================================
-- Seed: Plan Features for Feature Gate Engine
-- =============================================================================
-- Source of truth: frontend/lib/pricing/pricing-config.ts
-- Domain: SHOP (product_domain = 'shop')
--
-- This file is IDEMPOTENT — safe to re-run at any time.
-- Uses ON CONFLICT DO UPDATE to overwrite stale values.
--
-- FEATURE TYPES (from 037_feature_gate_system.sql):
--   Metered:   hard_limit > 0, soft_limit = 80% of hard (warning threshold)
--   Boolean:   hard_limit = NULL → ACCESS GRANTED
--              hard_limit = 0   → ACCESS DENIED
--   Unlimited: is_unlimited = true → no cap
--
-- SOFT LIMIT STRATEGY:
--   soft_limit = floor(hard_limit * 0.8)
--   When user crosses soft_limit → show "approaching limit" warning
--   Only hard_limit actually blocks. Soft limits are advisory.
--
-- Run: psql -f seed_plan_features.sql
-- Or:  Supabase SQL Editor → paste → Run
-- =============================================================================

DO $$
DECLARE
    starter_id   UUID;
    business_id  UUID;
    pro_id       UUID;
    plan_rec     RECORD;
    feat         TEXT;
BEGIN
    -- =========================================================================
    -- RESOLVE PLAN IDs (shop domain only)
    -- =========================================================================
    -- pricing_plans has product_domain column — we only target 'shop' here.
    -- Other domains (dashboard, marketing, showcase, api) get their own seed.
    --
    -- NOTE: Each slug may have MULTIPLE plan UUIDs (monthly + yearly).
    -- We seed features for ONE representative plan first, then copy to all
    -- sibling plans at the end (see "COPY TO ALL BILLING CYCLES" section).

    SELECT id INTO starter_id
      FROM pricing_plans
     WHERE plan_slug = 'starter'
       AND product_domain = 'shop'
       AND is_active = true
     LIMIT 1;

    SELECT id INTO business_id
      FROM pricing_plans
     WHERE plan_slug = 'business'
       AND product_domain = 'shop'
       AND is_active = true
     LIMIT 1;

    SELECT id INTO pro_id
      FROM pricing_plans
     WHERE plan_slug = 'pro'
       AND product_domain = 'shop'
       AND is_active = true
     LIMIT 1;

    -- Fallback: if product_domain filter yields nothing, try without it
    -- (backward compat for DBs that don't have product_domain yet)
    IF starter_id IS NULL THEN
        SELECT id INTO starter_id FROM pricing_plans WHERE plan_slug = 'starter' LIMIT 1;
    END IF;
    IF business_id IS NULL THEN
        SELECT id INTO business_id FROM pricing_plans WHERE plan_slug = 'business' LIMIT 1;
    END IF;
    IF pro_id IS NULL THEN
        SELECT id INTO pro_id FROM pricing_plans WHERE plan_slug = 'pro' LIMIT 1;
    END IF;

    -- =========================================================================
    -- STARTER — Basic Plan (₹1,999/mo)
    -- =========================================================================
    -- Source: pricing-config.ts lines 162-187 (SHOP_PRICING.plans[0])
    --
    -- Card promises:
    --   ✓ 10 products (incl. variants)
    --   ✓ Random domain name (store-abc1234)
    --   ✓ Standard invoice
    --   ✓ 10 email invoices
    --   ✓ 10 live order updates via email
    --   ✓ Normal Dashboard
    --   ✓ Message inbox
    --   ✓ Up to 10 days message history
    --   ✓ Email support
    -- =========================================================================
    IF starter_id IS NOT NULL THEN
        INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
            -- ── Metered features ──────────────────────────────────────────
            (starter_id, 'create_product',       10,    8,     false),  -- "10 products (incl. variants)"
            (starter_id, 'ai_responses',         1000,  800,   false),  -- limits.aiResponses = 1000
            (starter_id, 'email_invoices',       10,    8,     false),  -- "10 email invoices"
            (starter_id, 'live_order_updates',   10,    8,     false),  -- "10 live order updates via email"
            (starter_id, 'message_history_days', 10,    8,     false),  -- "Up to 10 days message history"
            (starter_id, 'faqs',                 30,    24,    false),  -- limits.faqs = 30

            -- ── Boolean features: DENIED ──────────────────────────────────
            (starter_id, 'custom_domain',        0,     0,     false),  -- "Random domain name" = NO custom
            (starter_id, 'invoice_customization',0,     0,     false),  -- "Standard invoice" = NO custom
            (starter_id, 'advanced_analytics',   0,     0,     false),  -- "Normal Dashboard" = NO analytics
            (starter_id, 'google_sheets_sync',   0,     0,     false),  -- Not included in Basic
            (starter_id, 'template_builder',     0,     0,     false),  -- Not included in Basic
            (starter_id, 'webhooks',             0,     0,     false),  -- Not included
            (starter_id, 'white_label',          0,     0,     false),  -- Not included
            (starter_id, 'priority_support',     0,     0,     false),  -- "Email support" only
            (starter_id, 'api_access',           0,     0,     false),  -- Not included
            (starter_id, 'multi_staff',          0,     0,     false),  -- Not included

            -- ── Metered features: BLOCKED (0 = denied) ───────────────────
            (starter_id, 'campaign_sends',       0,     0,     false),  -- No campaigns on Basic
            (starter_id, 'bulk_messaging',       0,     0,     false)   -- No bulk on Basic

        ON CONFLICT (plan_id, feature_key) DO UPDATE SET
            hard_limit   = EXCLUDED.hard_limit,
            soft_limit   = EXCLUDED.soft_limit,
            is_unlimited = EXCLUDED.is_unlimited;
    END IF;

    -- =========================================================================
    -- BUSINESS — Business Plan (₹3,999/mo)
    -- =========================================================================
    -- Source: pricing-config.ts lines 189-215 (SHOP_PRICING.plans[1])
    --
    -- Card promises:
    --   ✓ Custom domain name (store/yourstorename)
    --   ✓ 50 products (incl. variants)
    --   ✓ 50 live order updates (Email & WhatsApp)
    --   ✓ Get order updates in Google Sheets (up to 50 orders)
    --   ✓ Invoice customization
    --   ✓ Analytics dashboard
    --   ✓ Message inbox
    --   ✓ Up to 50 days message history
    --   ✓ Email and call support
    -- =========================================================================
    IF business_id IS NOT NULL THEN
        INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
            -- ── Metered features ──────────────────────────────────────────
            (business_id, 'create_product',       50,    40,    false),  -- "50 products (incl. variants)"
            (business_id, 'ai_responses',         5000,  4000,  false),  -- limits.aiResponses = 5000
            (business_id, 'email_invoices',       50,    40,    false),  -- 50 (matches order updates)
            (business_id, 'live_order_updates',   50,    40,    false),  -- "50 live order updates"
            (business_id, 'message_history_days', 50,    40,    false),  -- "Up to 50 days message history"
            (business_id, 'faqs',                 100,   80,    false),  -- limits.faqs = 100
            (business_id, 'google_sheets_sync',   50,    40,    false),  -- "Google Sheets (up to 50 orders)"
            (business_id, 'campaign_sends',       1000,  800,   false),  -- Campaigns unlocked
            (business_id, 'bulk_messaging',       1000,  800,   false),  -- Bulk unlocked

            -- ── Boolean features: GRANTED ─────────────────────────────────
            (business_id, 'custom_domain',        NULL,  NULL,  false),  -- "Custom domain name"
            (business_id, 'invoice_customization',NULL,  NULL,  false),  -- "Invoice customization"
            (business_id, 'advanced_analytics',   NULL,  NULL,  false),  -- "Analytics dashboard"
            (business_id, 'template_builder',     NULL,  NULL,  false),  -- Template builder unlocked

            -- ── Boolean features: DENIED (Pro only) ──────────────────────
            (business_id, 'webhooks',             0,     0,     false),  -- Pro only
            (business_id, 'white_label',          0,     0,     false),  -- Pro only
            (business_id, 'priority_support',     0,     0,     false),  -- "Email and call" but not priority
            (business_id, 'api_access',           0,     0,     false),  -- Pro only
            (business_id, 'multi_staff',          0,     0,     false)   -- Pro only

        ON CONFLICT (plan_id, feature_key) DO UPDATE SET
            hard_limit   = EXCLUDED.hard_limit,
            soft_limit   = EXCLUDED.soft_limit,
            is_unlimited = EXCLUDED.is_unlimited;
    END IF;

    -- =========================================================================
    -- PRO — Enterprise Plan (₹6,999/mo)
    -- =========================================================================
    -- Source: pricing-config.ts lines 217-243 (SHOP_PRICING.plans[2])
    --
    -- Card promises:
    --   ✓ Custom domain name (store/yourstorename)
    --   ✓ 100 products
    --   ✓ 100 live order updates (Email & WhatsApp)
    --   ✓ Get order updates in Google Sheets (unlimited)
    --   ✓ Invoice customization
    --   ✓ Analytics dashboard
    --   ✓ Message inbox
    --   ✓ No limit message history
    --   ✓ Email and call support
    -- =========================================================================
    IF pro_id IS NOT NULL THEN
        INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited) VALUES
            -- ── Metered features (generous, NOT unlimited) ────────────────
            (pro_id, 'create_product',       100,   80,    false),  -- "100 products"
            (pro_id, 'ai_responses',         15000, 12000, false),  -- limits.aiResponses = 15000
            (pro_id, 'email_invoices',       100,   80,    false),  -- 100 (matches order updates)
            (pro_id, 'live_order_updates',   100,   80,    false),  -- "100 live order updates"
            (pro_id, 'faqs',                 NULL,  NULL,  true),   -- limits.faqs = -1 (unlimited)
            (pro_id, 'campaign_sends',       NULL,  NULL,  true),   -- Unlimited campaigns
            (pro_id, 'bulk_messaging',       NULL,  NULL,  true),   -- Unlimited bulk

            -- ── Unlimited features ────────────────────────────────────────
            (pro_id, 'message_history_days', NULL,  NULL,  true),   -- "No limit message history"
            (pro_id, 'google_sheets_sync',   NULL,  NULL,  true),   -- Unlimited Sheets sync

            -- ── Boolean features: ALL GRANTED ─────────────────────────────
            (pro_id, 'custom_domain',        NULL,  NULL,  true),   -- Custom domain
            (pro_id, 'invoice_customization',NULL,  NULL,  true),   -- Invoice customization
            (pro_id, 'advanced_analytics',   NULL,  NULL,  true),   -- Analytics dashboard
            (pro_id, 'template_builder',     NULL,  NULL,  true),   -- Template builder
            (pro_id, 'webhooks',             NULL,  NULL,  true),   -- Webhooks (Enterprise exclusive)
            (pro_id, 'white_label',          NULL,  NULL,  true),   -- White label (Enterprise exclusive)
            (pro_id, 'priority_support',     NULL,  NULL,  true),   -- Priority support
            (pro_id, 'api_access',           NULL,  NULL,  true),   -- API access (Enterprise exclusive)
            (pro_id, 'multi_staff',          NULL,  NULL,  true)    -- Multi-staff (Enterprise exclusive)

        ON CONFLICT (plan_id, feature_key) DO UPDATE SET
            hard_limit   = EXCLUDED.hard_limit,
            soft_limit   = EXCLUDED.soft_limit,
            is_unlimited = EXCLUDED.is_unlimited;
    END IF;

    -- =========================================================================
    -- SHARED FEATURES — Core platform capabilities (ALL plans)
    -- =========================================================================
    -- These are enabled for every plan with boolean access (NULL = granted).
    -- They represent the base platform that every paying customer gets.

    FOREACH feat IN ARRAY ARRAY[
        'otp_send',              -- WhatsApp OTP authentication
        'sandbox_mode',          -- Testing/sandbox environment
        'live_api_keys',         -- WhatsApp Business API keys
        'basic_analytics',       -- Simple view counts (not advanced)
        'contact_management',    -- Basic CRM / contact list
        'order_management',      -- View and process orders
        'message_inbox',         -- "Message inbox" (all plans)
        'store_preview'          -- Preview bot / store preview
    ] LOOP
        IF starter_id IS NOT NULL THEN
            INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited)
            VALUES (starter_id, feat, NULL, NULL, false) ON CONFLICT DO NOTHING;
        END IF;
        IF business_id IS NOT NULL THEN
            INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited)
            VALUES (business_id, feat, NULL, NULL, false) ON CONFLICT DO NOTHING;
        END IF;
        IF pro_id IS NOT NULL THEN
            INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited)
            VALUES (pro_id, feat, NULL, NULL, false) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- =========================================================================
    -- REGISTER FEATURE FLAGS (global kill switches)
    -- =========================================================================
    -- Every feature_key used above MUST have a corresponding feature_flag row.
    -- If a flag is disabled globally, no plan can access it regardless of limits.

    INSERT INTO feature_flags (feature_key, is_enabled_globally, description) VALUES
        -- Metered features
        ('create_product',        true, 'Product catalog: create/edit products'),
        ('ai_responses',          true, 'AI chatbot responses (monthly metered)'),
        ('email_invoices',        true, 'Email invoice sending (monthly metered)'),
        ('live_order_updates',    true, 'Real-time order status notifications'),
        ('message_history_days',  true, 'Message history retention period'),
        ('faqs',                  true, 'FAQ training entries for AI'),
        ('campaign_sends',        true, 'Broadcast campaign sends'),
        ('bulk_messaging',        true, 'Bulk message sending'),

        -- Boolean features
        ('custom_domain',         true, 'Custom store slug URL (store/yourname)'),
        ('invoice_customization', true, 'Custom invoice branding and templates'),
        ('advanced_analytics',    true, 'Advanced analytics dashboard and reports'),
        ('google_sheets_sync',    true, 'Google Sheets order sync integration'),
        ('template_builder',      true, 'WhatsApp template message builder'),
        ('webhooks',              true, 'Webhook endpoint configuration'),
        ('white_label',           true, 'White-label branding removal'),
        ('priority_support',      true, 'Priority support channel access'),
        ('api_access',            true, 'REST API access for integrations'),
        ('multi_staff',           true, 'Multi-staff team access'),

        -- Shared features
        ('otp_send',              true, 'Send OTP via WhatsApp/SMS'),
        ('live_api_keys',         true, 'Access to live WhatsApp API keys'),
        ('sandbox_mode',          true, 'Sandbox/test mode access'),
        ('basic_analytics',       true, 'Basic view counts and metrics'),
        ('contact_management',    true, 'Contact list management'),
        ('order_management',      true, 'Order processing and management'),
        ('message_inbox',         true, 'WhatsApp message inbox'),
        ('store_preview',         true, 'Store preview and bot preview')
    ON CONFLICT (feature_key) DO UPDATE SET
        description = EXCLUDED.description;

    -- =========================================================================
    -- COPY TO ALL BILLING CYCLES
    -- =========================================================================
    -- Each plan_slug can have multiple UUIDs (monthly, yearly, etc.).
    -- The features above were seeded for ONE UUID per slug. Now copy them
    -- to all other plan UUIDs with the same slug so every billing cycle
    -- has identical feature limits.
    FOR plan_rec IN
        SELECT pp.id AS target_id, pp.plan_slug, pf_src.plan_id AS source_id
        FROM pricing_plans pp
        CROSS JOIN LATERAL (
            SELECT DISTINCT plan_id
            FROM plan_features
            WHERE plan_id IN (
                SELECT id FROM pricing_plans p2
                WHERE p2.plan_slug = pp.plan_slug
                  AND p2.product_domain = 'shop'
                  AND p2.is_active = true
            )
            LIMIT 1
        ) pf_src
        WHERE pp.product_domain = 'shop'
          AND pp.is_active = true
          AND pp.id != pf_src.plan_id
          AND NOT EXISTS (
              SELECT 1 FROM plan_features WHERE plan_id = pp.id LIMIT 1
          )
    LOOP
        INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited)
        SELECT plan_rec.target_id, feature_key, hard_limit, soft_limit, is_unlimited
        FROM plan_features
        WHERE plan_id = plan_rec.source_id
        ON CONFLICT (plan_id, feature_key) DO UPDATE SET
            hard_limit   = EXCLUDED.hard_limit,
            soft_limit   = EXCLUDED.soft_limit,
            is_unlimited = EXCLUDED.is_unlimited;

        RAISE NOTICE 'Copied features from % (%) to %',
            plan_rec.source_id, plan_rec.plan_slug, plan_rec.target_id;
    END LOOP;

    -- =========================================================================
    -- SUMMARY
    -- =========================================================================
    RAISE NOTICE '=========================================================';
    RAISE NOTICE 'Feature seed complete for SHOP domain';
    RAISE NOTICE '  starter  = %', starter_id;
    RAISE NOTICE '  business = %', business_id;
    RAISE NOTICE '  pro      = %', pro_id;
    RAISE NOTICE '---------------------------------------------------------';
    RAISE NOTICE 'Starter:    18 features (10 prod, 1000 AI, random domain)';
    RAISE NOTICE 'Business:   18 features (50 prod, 5000 AI, custom domain)';
    RAISE NOTICE 'Enterprise: 18 features (100 prod, 15000 AI, all premium)';
    RAISE NOTICE '=========================================================';

END $$;
