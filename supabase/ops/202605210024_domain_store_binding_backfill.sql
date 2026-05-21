-- Domain store binding backfill - reviewed transaction template.
--
-- Usage:
-- 1. Run only the DRY RUN section first and review every row.
-- 2. Replace expected_count := NULL with the reviewed row count.
-- 3. Run the full transaction during a low-traffic window.
-- 4. Keep ROLLBACK while rehearsing; change to COMMIT only after review.

BEGIN;

CREATE TEMP TABLE domain_store_binding_review AS
WITH active_shop_domains AS (
    SELECT
        td.id AS domain_id,
        td.tenant_id,
        td.user_id,
        td.normalized_host,
        td.routing_enabled,
        td.routing_version
    FROM public.tenant_domains td
    WHERE td.deleted_at IS NULL
      AND td.product_domain = 'shop'
      AND td.status = 'active'
),
candidates AS (
    SELECT
        d.domain_id,
        d.tenant_id,
        d.user_id,
        d.normalized_host,
        d.routing_enabled,
        d.routing_version,
        b.id AS business_id,
        b.url_slug,
        COUNT(b.id) OVER (PARTITION BY d.domain_id) AS candidate_count
    FROM active_shop_domains d
    LEFT JOIN public.businesses b
      ON b.user_id = d.user_id
     AND b.url_slug IS NOT NULL
     AND b.url_slug <> ''
)
SELECT
    domain_id,
    tenant_id,
    user_id,
    normalized_host,
    routing_enabled,
    routing_version,
    MAX(candidate_count) AS candidate_count,
    MAX(business_id::text) FILTER (WHERE candidate_count = 1) AS business_id,
    MAX(url_slug) FILTER (WHERE candidate_count = 1) AS canonical_store_slug,
    CASE
        WHEN COALESCE(MAX(candidate_count), 0) = 1 THEN 'bind'
        WHEN COALESCE(MAX(candidate_count), 0) = 0 THEN 'disable_store_not_configured'
        ELSE 'disable_store_binding_ambiguous'
    END AS action
FROM candidates
GROUP BY domain_id, tenant_id, user_id, normalized_host, routing_enabled, routing_version
ORDER BY normalized_host;

-- DRY RUN REVIEW OUTPUT
SELECT * FROM domain_store_binding_review ORDER BY normalized_host;

DO $$
DECLARE
    -- Safety latch: after reviewing the dry-run output, replace NULL with
    -- the exact number of reviewed rows, for example: expected_count INTEGER := 3;
    expected_count INTEGER := NULL;
    actual_count INTEGER;
BEGIN
    IF expected_count IS NULL THEN
        RAISE EXCEPTION 'Safety latch not set. Run the dry-run SELECT first, review every row, then set expected_count to the reviewed row count.';
    END IF;

    SELECT COUNT(*) INTO actual_count FROM domain_store_binding_review;
    IF actual_count <> expected_count THEN
        RAISE EXCEPTION 'Backfill row count mismatch. reviewed=%, actual=%', expected_count, actual_count;
    END IF;
END $$;

UPDATE public.tenant_domains td
SET
    resource_type = 'shop_store',
    resource_id = review.business_id,
    canonical_store_slug = review.canonical_store_slug,
    last_error_code = NULL,
    last_error_message = NULL,
    updated_at = NOW()
FROM domain_store_binding_review review
WHERE td.id = review.domain_id
  AND review.action = 'bind';

UPDATE public.tenant_domains td
SET
    routing_enabled = FALSE,
    routing_version = td.routing_version + CASE WHEN td.routing_enabled THEN 1 ELSE 0 END,
    resource_type = NULL,
    resource_id = NULL,
    canonical_store_slug = NULL,
    last_error_code = CASE
        WHEN review.action = 'disable_store_binding_ambiguous' THEN 'STORE_BINDING_AMBIGUOUS'
        ELSE 'STORE_NOT_CONFIGURED'
    END,
    last_error_message = CASE
        WHEN review.action = 'disable_store_binding_ambiguous'
            THEN 'Multiple Shop storefronts matched this tenant. Resolve the store binding before enabling routing.'
        ELSE 'Domain verified, but Shop storefront setup is required before routing can turn on.'
    END,
    updated_at = NOW()
FROM domain_store_binding_review review
WHERE td.id = review.domain_id
  AND review.action IN ('disable_store_not_configured', 'disable_store_binding_ambiguous');

INSERT INTO public.domain_events (domain_id, tenant_id, user_id, event_type, actor_id, metadata)
SELECT
    review.domain_id,
    review.tenant_id,
    review.user_id,
    'store_binding_backfilled',
    'system',
    jsonb_build_object(
        'action', review.action,
        'resource_id', review.business_id,
        'canonical_store_slug', review.canonical_store_slug
    )
FROM domain_store_binding_review review;

SELECT * FROM domain_store_binding_review ORDER BY normalized_host;

-- Change to COMMIT after dry-run review and expected row count replacement.
ROLLBACK;
