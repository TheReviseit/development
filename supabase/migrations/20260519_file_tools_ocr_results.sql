CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.file_tool_ocr_results (
    job_id UUID PRIMARY KEY REFERENCES public.file_tool_jobs(id) ON DELETE CASCADE,
    source_artifact_id UUID REFERENCES public.file_tool_artifacts(id) ON DELETE SET NULL,
    text TEXT NOT NULL DEFAULT '',
    blocks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    language_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    engine_version TEXT,
    preprocessing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_tool_ocr_results_source_artifact
    ON public.file_tool_ocr_results (source_artifact_id);

ALTER TABLE public.file_tool_ocr_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_tool_ocr_results_service_role ON public.file_tool_ocr_results;
CREATE POLICY file_tool_ocr_results_service_role ON public.file_tool_ocr_results
    FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.feature_flags (feature_key, is_enabled_globally, description)
VALUES
    ('files_ocr_enabled', true, 'Runtime kill switch for Image OCR.')
ON CONFLICT (feature_key) DO UPDATE
SET
    description = EXCLUDED.description,
    updated_at = NOW();
