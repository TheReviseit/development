CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.file_tool_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id TEXT,
    guest_id_hash TEXT,
    tool_key TEXT NOT NULL,
    execution_mode TEXT NOT NULL DEFAULT 'sync'
        CHECK (execution_mode IN ('sync', 'async')),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled', 'expired')),
    request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    options_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    page_count INTEGER,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (user_id IS NOT NULL AND guest_id_hash IS NULL)
        OR (user_id IS NULL AND guest_id_hash IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.file_tool_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.file_tool_jobs(id) ON DELETE CASCADE,
    tenant_id UUID,
    user_id TEXT,
    guest_id_hash TEXT,
    tool_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    storage_provider TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    page_count INTEGER,
    retention_expires_at TIMESTAMPTZ NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    last_downloaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (user_id IS NOT NULL AND guest_id_hash IS NULL)
        OR (user_id IS NULL AND guest_id_hash IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.file_tool_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id TEXT,
    guest_id_hash TEXT,
    tool_key TEXT NOT NULL,
    draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (user_id IS NOT NULL AND guest_id_hash IS NULL)
        OR (user_id IS NULL AND guest_id_hash IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.file_tool_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id TEXT NOT NULL,
    tool_key TEXT NOT NULL,
    preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_tool_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id TEXT,
    guest_id_hash TEXT,
    tool_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_tool_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id TEXT,
    guest_id_hash TEXT,
    actor_type TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_tool_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id TEXT,
    guest_id_hash TEXT,
    product_domain TEXT NOT NULL DEFAULT 'files',
    tool_key TEXT NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    generation_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    bytes_generated BIGINT NOT NULL DEFAULT 0,
    pages_generated INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_tool_jobs_user_history
    ON public.file_tool_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_tool_jobs_guest_history
    ON public.file_tool_jobs (guest_id_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_tool_jobs_status_retry
    ON public.file_tool_jobs (status, next_retry_at, locked_until);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_jobs_idempotency
    ON public.file_tool_jobs (COALESCE(user_id, ''), COALESCE(guest_id_hash, ''), tool_key, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_file_tool_artifacts_job
    ON public.file_tool_artifacts (job_id);
CREATE INDEX IF NOT EXISTS idx_file_tool_artifacts_user_history
    ON public.file_tool_artifacts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_tool_artifacts_guest_history
    ON public.file_tool_artifacts (guest_id_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_tool_artifacts_cleanup
    ON public.file_tool_artifacts (retention_expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_artifacts_storage_key
    ON public.file_tool_artifacts (storage_provider, storage_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_drafts_owner_tool
    ON public.file_tool_drafts (COALESCE(user_id, ''), COALESCE(guest_id_hash, ''), tool_key);
CREATE INDEX IF NOT EXISTS idx_file_tool_drafts_cleanup
    ON public.file_tool_drafts (expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_preferences_user_tool
    ON public.file_tool_preferences (user_id, tool_key);
CREATE INDEX IF NOT EXISTS idx_file_tool_events_owner_time
    ON public.file_tool_events (COALESCE(user_id, ''), COALESCE(guest_id_hash, ''), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_tool_audit_time
    ON public.file_tool_audit_logs (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_usage_daily_owner_tool_date
    ON public.file_tool_usage_daily (
        COALESCE(user_id, ''),
        COALESCE(guest_id_hash, ''),
        product_domain,
        tool_key,
        usage_date
    );

ALTER TABLE public.file_tool_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_tool_jobs_service_role ON public.file_tool_jobs;
CREATE POLICY file_tool_jobs_service_role ON public.file_tool_jobs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_artifacts_service_role ON public.file_tool_artifacts;
CREATE POLICY file_tool_artifacts_service_role ON public.file_tool_artifacts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_drafts_service_role ON public.file_tool_drafts;
CREATE POLICY file_tool_drafts_service_role ON public.file_tool_drafts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_preferences_service_role ON public.file_tool_preferences;
CREATE POLICY file_tool_preferences_service_role ON public.file_tool_preferences
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_events_service_role ON public.file_tool_events;
CREATE POLICY file_tool_events_service_role ON public.file_tool_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_audit_logs_service_role ON public.file_tool_audit_logs;
CREATE POLICY file_tool_audit_logs_service_role ON public.file_tool_audit_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_usage_daily_service_role ON public.file_tool_usage_daily;
CREATE POLICY file_tool_usage_daily_service_role ON public.file_tool_usage_daily
    FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.feature_flags (feature_key, is_enabled_globally, description)
VALUES
    ('files_tools_enabled', true, 'Runtime kill switch for the Files Tools platform.'),
    ('files_text_to_pdf_enabled', true, 'Runtime kill switch for Text to PDF generation.')
ON CONFLICT (feature_key) DO UPDATE
SET
    description = EXCLUDED.description,
    updated_at = NOW();
