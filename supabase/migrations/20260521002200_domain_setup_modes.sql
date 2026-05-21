-- Domain setup modes for Vercel-managed DNS onboarding.
-- nameserver mode is the recommended SaaS flow; manual_dns remains the fallback.

ALTER TABLE public.tenant_domains
    ADD COLUMN IF NOT EXISTS setup_mode TEXT NOT NULL DEFAULT 'manual_dns',
    ADD COLUMN IF NOT EXISTS nameserver_status TEXT NOT NULL DEFAULT 'not_applicable',
    ADD COLUMN IF NOT EXISTS managed_dns_status TEXT NOT NULL DEFAULT 'not_applicable',
    ADD COLUMN IF NOT EXISTS desired_nameservers JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS managed_dns_records JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenant_domains_setup_mode_check'
    ) THEN
        ALTER TABLE public.tenant_domains
            ADD CONSTRAINT tenant_domains_setup_mode_check
            CHECK (setup_mode IN ('manual_dns', 'nameserver'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenant_domains_nameserver_status_check'
    ) THEN
        ALTER TABLE public.tenant_domains
            ADD CONSTRAINT tenant_domains_nameserver_status_check
            CHECK (nameserver_status IN ('not_applicable', 'pending', 'verified', 'failed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenant_domains_managed_dns_status_check'
    ) THEN
        ALTER TABLE public.tenant_domains
            ADD CONSTRAINT tenant_domains_managed_dns_status_check
            CHECK (managed_dns_status IN ('not_applicable', 'pending', 'synced', 'failed'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_domains_setup_mode
    ON public.tenant_domains (setup_mode, nameserver_status, managed_dns_status)
    WHERE deleted_at IS NULL;
