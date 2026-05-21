-- Custom Domain Store Bindings
-- Binds a custom domain to a concrete Shop storefront resource.

ALTER TABLE public.tenant_domains
    ADD COLUMN IF NOT EXISTS resource_type TEXT,
    ADD COLUMN IF NOT EXISTS resource_id TEXT,
    ADD COLUMN IF NOT EXISTS canonical_store_slug TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tenant_domains_resource_type_check'
    ) THEN
        ALTER TABLE public.tenant_domains
            ADD CONSTRAINT tenant_domains_resource_type_check
            CHECK (resource_type IS NULL OR resource_type IN ('shop_store'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_domains_resource
    ON public.tenant_domains (resource_type, resource_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_domains_active_unbound_shop
    ON public.tenant_domains (product_domain, status, routing_enabled)
    WHERE deleted_at IS NULL
      AND product_domain = 'shop'
      AND status = 'active'
      AND (resource_id IS NULL OR canonical_store_slug IS NULL);

COMMENT ON COLUMN public.tenant_domains.resource_type IS
    'Concrete product resource type served by this domain. Phase 1 supports shop_store.';
COMMENT ON COLUMN public.tenant_domains.resource_id IS
    'Concrete resource id. For shop_store, this is businesses.id.';
COMMENT ON COLUMN public.tenant_domains.canonical_store_slug IS
    'Snapshot of the canonical public store slug used for custom-domain routing.';

NOTIFY pgrst, 'reload schema';
