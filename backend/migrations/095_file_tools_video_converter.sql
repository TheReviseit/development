CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.file_tool_upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    user_id TEXT,
    guest_id_hash TEXT,
    tool_key TEXT NOT NULL,
    batch_id TEXT,
    filename TEXT NOT NULL,
    declared_mime_type TEXT,
    total_size_bytes BIGINT NOT NULL CHECK (total_size_bytes > 0),
    chunk_size_bytes BIGINT NOT NULL CHECK (chunk_size_bytes > 0),
    total_chunks INTEGER NOT NULL CHECK (total_chunks > 0),
    received_bytes BIGINT NOT NULL DEFAULT 0 CHECK (received_bytes >= 0),
    expected_sha256 TEXT,
    source_sha256 TEXT,
    source_storage_provider TEXT,
    source_storage_key TEXT,
    status TEXT NOT NULL DEFAULT 'receiving'
        CHECK (status IN ('receiving', 'assembly_queued', 'assembling', 'assembled', 'failed', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (user_id IS NOT NULL AND guest_id_hash IS NULL)
        OR (user_id IS NULL AND guest_id_hash IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.file_tool_upload_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_session_id UUID NOT NULL REFERENCES public.file_tool_upload_sessions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    byte_start BIGINT NOT NULL CHECK (byte_start >= 0),
    byte_end BIGINT NOT NULL CHECK (byte_end >= byte_start),
    chunk_sha256 TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    storage_provider TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_tool_job_progress_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.file_tool_jobs(id) ON DELETE CASCADE,
    sequence_id BIGINT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'progress',
    stage TEXT NOT NULL,
    percent DOUBLE PRECISION,
    processed_ms BIGINT,
    speed DOUBLE PRECISION,
    eta_seconds INTEGER,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_tool_video_metadata (
    job_id UUID PRIMARY KEY REFERENCES public.file_tool_jobs(id) ON DELETE CASCADE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.file_tool_video_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.file_tool_jobs(id) ON DELETE CASCADE,
    output_artifact_id UUID REFERENCES public.file_tool_artifacts(id) ON DELETE SET NULL,
    thumbnail_artifact_id UUID REFERENCES public.file_tool_artifacts(id) ON DELETE SET NULL,
    poster_artifact_id UUID REFERENCES public.file_tool_artifacts(id) ON DELETE SET NULL,
    container TEXT,
    video_codec TEXT,
    audio_codec TEXT,
    width INTEGER,
    height INTEGER,
    fps DOUBLE PRECISION,
    bit_rate BIGINT,
    size_bytes BIGINT,
    validation_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_upload_chunks_session_index
    ON public.file_tool_upload_chunks (upload_session_id, chunk_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_upload_chunks_session_idempotency
    ON public.file_tool_upload_chunks (upload_session_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_file_tool_upload_sessions_owner
    ON public.file_tool_upload_sessions (COALESCE(user_id, ''), COALESCE(guest_id_hash, ''), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_tool_upload_sessions_cleanup
    ON public.file_tool_upload_sessions (status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_tool_progress_sequence
    ON public.file_tool_job_progress_events (job_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_file_tool_video_outputs_job
    ON public.file_tool_video_outputs (job_id);

ALTER TABLE public.file_tool_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_upload_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_job_progress_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_video_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_tool_video_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_tool_upload_sessions_service_role ON public.file_tool_upload_sessions;
CREATE POLICY file_tool_upload_sessions_service_role ON public.file_tool_upload_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_upload_chunks_service_role ON public.file_tool_upload_chunks;
CREATE POLICY file_tool_upload_chunks_service_role ON public.file_tool_upload_chunks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_progress_service_role ON public.file_tool_job_progress_events;
CREATE POLICY file_tool_progress_service_role ON public.file_tool_job_progress_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_video_metadata_service_role ON public.file_tool_video_metadata;
CREATE POLICY file_tool_video_metadata_service_role ON public.file_tool_video_metadata
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS file_tool_video_outputs_service_role ON public.file_tool_video_outputs;
CREATE POLICY file_tool_video_outputs_service_role ON public.file_tool_video_outputs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.feature_flags (feature_key, is_enabled_globally, description)
VALUES
    ('files_image_converter_enabled', true, 'Runtime kill switch for Image Converter.'),
    ('files_video_converter_enabled', true, 'Runtime kill switch for Video Converter for WhatsApp.')
ON CONFLICT (feature_key) DO UPDATE
SET
    description = EXCLUDED.description,
    updated_at = NOW();
