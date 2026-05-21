-- Split DNS custom domains from custom store slugs.
--
-- Existing feature:
--   custom_domain      => custom /store/{storeurl} slug, Business + Pro.
--
-- New feature:
--   custom_dns_domain  => real DNS custom domain, Pro only.

INSERT INTO public.feature_flags (feature_key, is_enabled_globally, description)
VALUES (
    'custom_dns_domain',
    TRUE,
    'Real DNS custom domain for public Shop storefronts'
)
ON CONFLICT (feature_key) DO UPDATE SET
    is_enabled_globally = EXCLUDED.is_enabled_globally,
    description = EXCLUDED.description;

INSERT INTO public.plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited)
SELECT
    id,
    'custom_dns_domain',
    CASE WHEN plan_slug = 'pro' THEN NULL ELSE 0 END,
    CASE WHEN plan_slug = 'pro' THEN NULL ELSE 0 END,
    CASE WHEN plan_slug = 'pro' THEN TRUE ELSE FALSE END
FROM public.pricing_plans
WHERE product_domain = 'shop'
  AND plan_slug IN ('starter', 'business', 'pro')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET
    hard_limit = EXCLUDED.hard_limit,
    soft_limit = EXCLUDED.soft_limit,
    is_unlimited = EXCLUDED.is_unlimited;
