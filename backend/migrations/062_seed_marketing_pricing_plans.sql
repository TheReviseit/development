-- =============================================================================
-- Migration 062: Seed Marketing Domain Pricing Plans
-- =============================================================================
-- Root cause fix: the /api/subscriptions/create endpoint resolves pricing from
-- pricing_plans WHERE product_domain='marketing'. Without rows for this domain,
-- every payment attempt from marketing.flowauxi.com / localhost:3003 fails with
-- PLAN_NOT_FOUND (404) before Razorpay is ever called.
--
-- Prices (in paise) match frontend/lib/pricing/pricing-config.ts MARKETING_PRICING:
--   starter:  ₹1,999  = 199900 paise
--   business: ₹4,999  = 499900 paise
--   pro:      ₹9,999  = 999900 paise
--
-- IMPORTANT: Set the sandbox Razorpay plan IDs below before running.
--            Create Razorpay plans via: https://dashboard.razorpay.com/app/subscriptions/plans
--            Use interval=monthly, period=1, currency=INR, amount=<amount in paise>
--
-- After running this migration also run:
--   062b_seed_marketing_plan_features.sql  (plan_features table)
--   048_seed_plan_metadata.sql             (plan_metadata table — re-run is safe)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1: Insert marketing pricing plans (idempotent via ON CONFLICT)
-- ---------------------------------------------------------------------------
-- Replace 'plan_REPLACE_STARTER_SANDBOX', 'plan_REPLACE_BUSINESS_SANDBOX',
-- 'plan_REPLACE_PRO_SANDBOX' with your actual Razorpay sandbox plan IDs.
-- Production plan IDs can be added later via UPDATE.
-- ---------------------------------------------------------------------------

INSERT INTO pricing_plans (
    product_domain,
    plan_slug,
    billing_cycle,
    amount_paise,
    currency,
    razorpay_plan_id,            -- legacy col (backwards compat) = sandbox value
    razorpay_plan_id_sandbox,    -- used in dev / staging
    razorpay_plan_id_production, -- set before go-live
    display_name,
    description,
    features_json,
    limits_json,
    pricing_version,
    is_active
)
VALUES
-- ── Starter ──────────────────────────────────────────────────────────────
(
    'marketing',
    'starter',
    'monthly',
    199900,   -- ₹1,999
    'INR',
    'plan_SQOvdwg0BIKMQG',          -- razorpay_plan_id (legacy)
    'plan_SQOvdwg0BIKMQG',          -- razorpay_plan_id_sandbox
    NULL,                                     -- razorpay_plan_id_production (set before launch)
    'Starter',
    'For small marketing campaigns',
    '["3,000 AI Responses / month","1 WhatsApp Number","Up to 5 Broadcast Campaigns","500 Recipients per Campaign","Basic Template Builder","Message Scheduling","Email Support"]',
    '{"ai_responses":3000,"whatsapp_numbers":1,"faqs":50,"campaigns":5,"campaign_recipients":500}',
    1,
    true
),
-- ── Business ─────────────────────────────────────────────────────────────
(
    'marketing',
    'business',
    'monthly',
    499900,   -- ₹4,999
    'INR',
    'plan_SQOwRDf8bjhA6U',
    'plan_SQOwRDf8bjhA6U',
    NULL,
    'Business',
    'For professional marketers',
    '["10,000 AI Responses / month","Up to 2 WhatsApp Numbers","Unlimited Broadcast Campaigns","5,000 Recipients per Campaign","Advanced Template Builder","Campaign Analytics","A/B Testing","Priority Support"]',
    '{"ai_responses":10000,"whatsapp_numbers":2,"faqs":150,"campaigns":-1,"campaign_recipients":5000}',
    1,
    true
),
-- ── Pro ──────────────────────────────────────────────────────────────────
(
    'marketing',
    'pro',
    'monthly',
    999900,   -- ₹9,999
    'INR',
    'plan_SQOx8bTay4truR',
    'plan_SQOx8bTay4truR',
    NULL,
    'Pro',
    'Enterprise marketing power',
    '["30,000 AI Responses / month","Unlimited WhatsApp Numbers","Unlimited Broadcast Campaigns","Unlimited Recipients","Custom Templates & Branding","Advanced Campaign Analytics","Multi-Campaign A/B Testing","API Access","Dedicated Account Manager"]',
    '{"ai_responses":30000,"whatsapp_numbers":-1,"faqs":-1,"campaigns":-1,"campaign_recipients":-1}',
    1,
    true
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- STEP 2: Verify rows were inserted
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    plan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO plan_count
    FROM pricing_plans
    WHERE product_domain = 'marketing' AND is_active = true;

    IF plan_count < 3 THEN
        RAISE WARNING 'Expected 3 marketing pricing plans, found %. Check for ON CONFLICT skips or existing rows.', plan_count;
    ELSE
        RAISE NOTICE '✅ Marketing pricing plans: % rows (starter, business, pro)', plan_count;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 3: Show what was inserted / what exists
-- ---------------------------------------------------------------------------
SELECT
    plan_slug,
    billing_cycle,
    amount_paise,
    amount_paise / 100.0 AS amount_rupees,
    display_name,
    razorpay_plan_id_sandbox,
    razorpay_plan_id_production,
    is_active
FROM pricing_plans
WHERE product_domain = 'marketing'
ORDER BY amount_paise;

COMMIT;

-- =============================================================================
-- AFTER RUNNING:
--
-- 1. Get actual Razorpay sandbox plan IDs:
--    a. Go to https://dashboard.razorpay.com/app/subscriptions/plans (test mode)
--    b. Create 3 plans: monthly, INR, amounts: 199900, 499900, 999900 paise
--    c. Copy the plan IDs (format: plan_XXXXXXXXXXXXXXXXXX)
--
-- 2. Update the placeholder IDs:
--    UPDATE pricing_plans SET
--        razorpay_plan_id = 'plan_ACTUAL_ID_HERE',
--        razorpay_plan_id_sandbox = 'plan_ACTUAL_ID_HERE'
--    WHERE product_domain = 'marketing' AND plan_slug = 'starter';
--    -- repeat for business, pro
--
-- 3. For production, also set razorpay_plan_id_production (live mode plan IDs)
--
-- 4. Run 062b_seed_marketing_plan_features.sql for feature gate configuration
-- =============================================================================
