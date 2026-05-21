-- Custom Domain Engine - Phase 1
-- Source of truth for tenant-owned custom domains.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tenant_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    product_domain TEXT NOT NULL DEFAULT 'shop',
    display_host TEXT NOT NULL,
    normalized_host TEXT NOT NULL,
    ascii_host TEXT NOT NULL,
    unicode_skeleton TEXT NOT NULL,
    apex_host TEXT NOT NULL,
    domain_kind TEXT NOT NULL CHECK (domain_kind IN ('apex', 'subdomain', 'www')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'pending_dns', 'verified', 'active', 'failed',
            'suspended', 'removed', 'provider_removal_pending'
        )),
    dns_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (dns_status IN ('pending', 'verified', 'failed', 'propagation_pending')),
    ssl_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (ssl_status IN ('pending', 'active', 'failed')),
    provider_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (provider_status IN ('pending', 'assigned', 'verified', 'failed', 'removed')),
    ownership_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (ownership_status IN ('pending', 'verified', 'failed')),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    redirect_policy TEXT NOT NULL DEFAULT 'none'
        CHECK (redirect_policy IN ('none', 'redirect_to_primary', 'primary')),
    redirect_target_host TEXT,
    routing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    routing_version BIGINT NOT NULL DEFAULT 1,
    verification_token_hash TEXT NOT NULL,
    expected_records JSONB NOT NULL DEFAULT '{}'::jsonb,
    observed_records JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider_name TEXT NOT NULL DEFAULT 'vercel',
    provider_domain_id TEXT,
    provider_last_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_checked_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    ssl_active_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    quarantined_until TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_domains_active_host
    ON public.tenant_domains (normalized_host)
    WHERE deleted_at IS NULL AND status <> 'removed';

CREATE INDEX IF NOT EXISTS idx_tenant_domains_owner
    ON public.tenant_domains (user_id, product_domain, status);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_routing
    ON public.tenant_domains (normalized_host, routing_enabled, routing_version)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_domains_cleanup
    ON public.tenant_domains (status, next_check_at)
    WHERE status IN ('pending', 'pending_dns', 'provider_removal_pending');

CREATE TABLE IF NOT EXISTS public.domain_verification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES public.tenant_domains(id) ON DELETE CASCADE,
    attempt_type TEXT NOT NULL CHECK (attempt_type IN ('ownership', 'dns', 'provider', 'ssl', 'remove')),
    result TEXT NOT NULL CHECK (result IN ('success', 'pending', 'failed')),
    observed_records JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_attempts_domain_time
    ON public.domain_verification_attempts (domain_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.domain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID REFERENCES public.tenant_domains(id) ON DELETE SET NULL,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_domain_time
    ON public.domain_events (domain_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_time
    ON public.domain_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.domain_idempotency_keys (
    namespace TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    response_body JSONB,
    status_code INTEGER,
    state TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (state IN ('in_progress', 'completed', 'failed_transient')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_idempotency_expires
    ON public.domain_idempotency_keys (expires_at);

CREATE OR REPLACE FUNCTION public.set_tenant_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_domains_updated_at ON public.tenant_domains;
CREATE TRIGGER trg_tenant_domains_updated_at
BEFORE UPDATE ON public.tenant_domains
FOR EACH ROW EXECUTE FUNCTION public.set_tenant_domains_updated_at();

ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_domains_service_role ON public.tenant_domains;
CREATE POLICY tenant_domains_service_role ON public.tenant_domains
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS domain_attempts_service_role ON public.domain_verification_attempts;
CREATE POLICY domain_attempts_service_role ON public.domain_verification_attempts
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS domain_events_service_role ON public.domain_events;
CREATE POLICY domain_events_service_role ON public.domain_events
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS domain_idempotency_service_role ON public.domain_idempotency_keys;
CREATE POLICY domain_idempotency_service_role ON public.domain_idempotency_keys
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
