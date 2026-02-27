-- =============================================================================
-- Migration: Update Shop Plan features_json
-- =============================================================================
-- The features_json column was originally seeded with incomplete feature lists.
-- This migration updates all shop plans to match the frontend pricing-config.ts.
--
-- IDEMPOTENT: Safe to re-run at any time.
-- =============================================================================

-- Starter Plan
UPDATE pricing_plans
SET features_json = '[
  "Auto-generated store URL (e.g. store/a1b2c3d4)",
  "10 products (incl. variants)",
  "Standard invoice",
  "10 email invoices",
  "10 live order updates via email",
  "Normal Dashboard",
  "Message inbox",
  "Up to 10 days message history",
  "Email support"
]'::jsonb
WHERE product_domain = 'shop'
  AND plan_slug = 'starter'
  AND is_active = true;

-- Business Plan
UPDATE pricing_plans
SET features_json = '[
  "Custom store URL from your business name (e.g. store/your-brand)",
  "50 products (incl. variants)",
  "50 live order updates (Email & WhatsApp)",
  "Get order updates in Google Sheets (up to 50 orders)",
  "Invoice customization",
  "Analytics dashboard",
  "Message inbox",
  "Up to 50 days message history",
  "Email and call support"
]'::jsonb
WHERE product_domain = 'shop'
  AND plan_slug = 'business'
  AND is_active = true;

-- Pro Plan
UPDATE pricing_plans
SET features_json = '[
  "Custom store URL from your business name (e.g. store/your-brand)",
  "100 products",
  "100 live order updates (Email & WhatsApp)",
  "Get order updates in Google Sheets",
  "Invoice customization",
  "Analytics dashboard",
  "Message inbox",
  "No limit message history",
  "Email and call support"
]'::jsonb
WHERE product_domain = 'shop'
  AND plan_slug = 'pro'
  AND is_active = true;

-- Verify
SELECT plan_slug, billing_cycle, jsonb_array_length(features_json) as feature_count
FROM pricing_plans
WHERE product_domain = 'shop' AND is_active = true
ORDER BY amount_paise;
