-- =============================================================================
-- Migration 063b: Fix marketing business plan advanced_analytics feature
-- =============================================================================
-- The advanced_analytics feature for business and pro plans should use
-- is_unlimited=true to clearly indicate the feature is enabled.
-- Previously it was (NULL, NULL, false) which is semantically ambiguous
-- and caused the feature check to incorrectly deny access.
-- =============================================================================

UPDATE plan_features
SET is_unlimited = true
WHERE feature_key = 'advanced_analytics'
  AND plan_id IN (
    SELECT id FROM pricing_plans
    WHERE product_domain = 'marketing'
      AND plan_slug IN ('business', 'pro')
      AND is_active = true
  );

-- Also fix other boolean features that should be is_unlimited=true when enabled:
-- custom_domain, template_builder, priority_support for business plan
UPDATE plan_features
SET is_unlimited = true
WHERE feature_key IN ('custom_domain', 'template_builder', 'advanced_analytics', 'priority_support')
  AND hard_limit IS NULL
  AND soft_limit IS NULL
  AND is_unlimited = false
  AND plan_id IN (
    SELECT id FROM pricing_plans
    WHERE product_domain = 'marketing'
      AND plan_slug IN ('business', 'pro')
      AND is_active = true
  );
