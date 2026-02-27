-- =============================================================================
-- Migration 049: Plan Add-Ons Architecture
-- =============================================================================
-- Purpose: Create tables for add-on purchases (extra products, extra domains, etc.)
-- Critical: Add-on limits are merged in FeatureGateEngine, not UpgradeEngine
-- =============================================================================

BEGIN;

-- =============================================================================
-- Table: plan_addons
-- =============================================================================
-- Defines available add-ons that can be purchased by users
-- Add-ons boost specific feature limits (e.g., +10 products, +1000 AI responses)
-- =============================================================================
CREATE TABLE IF NOT EXISTS plan_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identification
    addon_slug VARCHAR(100) UNIQUE NOT NULL,              -- 'extra_products_10', 'extra_domain'
    product_domain VARCHAR(50) NOT NULL,                  -- 'shop', 'dashboard', 'all' (all domains)
    display_name VARCHAR(200) NOT NULL,                   -- 'Extra 10 Products'
    description TEXT,

    -- Pricing (in paise, integer arithmetic)
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
    billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    currency VARCHAR(3) DEFAULT 'INR',

    -- Entitlement (which feature this add-on affects)
    feature_key VARCHAR(100),                             -- 'create_product' (what limit this boosts)
    limit_increase INTEGER CHECK (limit_increase > 0),    -- +10 products

    -- Availability rules
    min_plan_tier INTEGER DEFAULT 0 CHECK (min_plan_tier >= 0),  -- Minimum tier to purchase (0=all)
    max_quantity INTEGER CHECK (max_quantity > 0),        -- Max purchases (1=single, NULL=unlimited)
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_plan_addons_domain ON plan_addons(product_domain);
CREATE INDEX IF NOT EXISTS idx_plan_addons_feature_key ON plan_addons(feature_key);
CREATE INDEX IF NOT EXISTS idx_plan_addons_active ON plan_addons(is_active) WHERE is_active = true;

-- =============================================================================
-- Table: subscription_addons
-- =============================================================================
-- Junction table linking subscriptions to purchased add-ons
-- Tracks which add-ons a user has purchased and their quantity
-- =============================================================================
CREATE TABLE IF NOT EXISTS subscription_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- References
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES plan_addons(id),
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),

    -- Razorpay integration
    razorpay_addon_id TEXT,                               -- Razorpay item ID (for billing)

    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,

    -- Constraint: One add-on per subscription (quantity handles multiple purchases)
    UNIQUE(subscription_id, addon_id)
);

-- Indexes for FeatureGateEngine queries
CREATE INDEX IF NOT EXISTS idx_subscription_addons_subscription
    ON subscription_addons(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_addons_status
    ON subscription_addons(status) WHERE status = 'active';

-- =============================================================================
-- Seed Add-Ons for Shop Domain
-- =============================================================================

-- Add-on: Extra 10 Products (₹500/month)
INSERT INTO plan_addons (
    addon_slug,
    product_domain,
    display_name,
    description,
    amount_paise,
    billing_cycle,
    feature_key,
    limit_increase,
    max_quantity,
    min_plan_tier
)
VALUES (
    'extra_products_10',
    'shop',
    'Extra 10 Products',
    'Add 10 more products to your store. Can be purchased multiple times.',
    50000,  -- ₹500
    'monthly',
    'create_product',
    10,
    5,  -- Max 5 purchases (50 extra products total)
    0   -- Available on all tiers
)
ON CONFLICT (addon_slug) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    amount_paise = EXCLUDED.amount_paise,
    is_active = true;

-- Add-on: Additional Custom Domain (₹999/month)
INSERT INTO plan_addons (
    addon_slug,
    product_domain,
    display_name,
    description,
    amount_paise,
    billing_cycle,
    feature_key,
    limit_increase,
    max_quantity,
    min_plan_tier
)
VALUES (
    'extra_domain',
    'shop',
    'Additional Custom Domain',
    'Connect another custom domain to your shop.',
    99900,  -- ₹999
    'monthly',
    'custom_domain',
    1,
    3,  -- Max 3 additional domains
    1   -- Business tier required
)
ON CONFLICT (addon_slug) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    amount_paise = EXCLUDED.amount_paise,
    is_active = true;

-- =============================================================================
-- Seed Add-Ons for All Domains (Cross-Domain)
-- =============================================================================

-- Add-on: Extra 1000 AI Responses (₹300/month)
INSERT INTO plan_addons (
    addon_slug,
    product_domain,
    display_name,
    description,
    amount_paise,
    billing_cycle,
    feature_key,
    limit_increase,
    max_quantity,
    min_plan_tier
)
VALUES (
    'extra_ai_1000',
    'all',  -- Available across all domains
    'Extra 1000 AI Responses',
    'Boost your AI response quota by 1000 responses per month.',
    30000,  -- ₹300
    'monthly',
    'ai_responses',
    1000,
    10,  -- Can buy up to 10 (10,000 extra AI responses)
    0    -- Available on all tiers
)
ON CONFLICT (addon_slug) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    amount_paise = EXCLUDED.amount_paise,
    is_active = true;

-- =============================================================================
-- Verification Queries
-- =============================================================================
-- Run after migration to verify:
--
-- 1. List all active add-ons:
--    SELECT addon_slug, product_domain, display_name, amount_paise, feature_key
--    FROM plan_addons
--    WHERE is_active = true
--    ORDER BY product_domain, amount_paise;
--
-- 2. Test add-on purchase simulation:
--    INSERT INTO subscription_addons (subscription_id, addon_id, quantity)
--    VALUES (
--        '<subscription_id>',
--        (SELECT id FROM plan_addons WHERE addon_slug = 'extra_products_10'),
--        2  -- Buying 2x (20 extra products)
--    );
--
-- 3. Check entitlement merge (after FeatureGateEngine enhancement):
--    -- User on Starter (10 products) + 2x extra_products_10
--    -- Should see effective_limit = 10 + (2 * 10) = 30 products
-- =============================================================================

COMMIT;
