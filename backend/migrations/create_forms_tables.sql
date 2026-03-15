-- =============================================================================
-- ENTERPRISE FORM BUILDER — Database Schema
-- Supabase (PostgreSQL) Migration
-- =============================================================================
-- Tables: forms, form_fields, form_responses, response_values
-- Run this via Supabase SQL Editor or psql CLI
-- =============================================================================

-- ─── 1. FORMS ────────────────────────────────────────────────────────────────
-- Core form metadata. One row per form created by a user.
CREATE TABLE IF NOT EXISTS forms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Identity
    title           TEXT NOT NULL DEFAULT 'Untitled Form',
    description     TEXT,
    slug            TEXT UNIQUE,                     -- SEO-friendly URL slug
    short_id        TEXT UNIQUE,                     -- Numeric short ID (e.g. "842934")

    -- State
    status          TEXT NOT NULL DEFAULT 'draft'    -- draft | published | archived
                    CHECK (status IN ('draft', 'published', 'archived')),
    version         INT NOT NULL DEFAULT 1,

    -- Appearance
    theme           JSONB DEFAULT '{"primaryColor":"#4f46e5","backgroundColor":"#ffffff","fontFamily":"Inter","borderRadius":"8px","logoUrl":null}'::jsonb,
    cover_image_url TEXT,

    -- Settings
    settings        JSONB DEFAULT '{
        "submitButtonText": "Submit",
        "successMessage": "Thank you! Your response has been recorded.",
        "successRedirectUrl": null,
        "notifyOnSubmission": true,
        "notifyEmails": [],
        "captchaEnabled": false,
        "captchaProvider": null,
        "rateLimitPerIp": 10,
        "rateLimitWindowMinutes": 60,
        "closedMessage": "This form is no longer accepting responses.",
        "isOpen": true,
        "maxResponses": null,
        "expiresAt": null
    }'::jsonb,

    -- UTM / Tracking
    utm_tracking    JSONB DEFAULT '{"captureUtm":true,"captureReferrer":true,"captureIp":true,"captureUserAgent":true}'::jsonb,

    -- Integration hooks (webhooks, Zapier, etc.)
    webhooks        JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    response_count  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ                      -- Soft delete
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forms_user_id      ON forms(user_id);
CREATE INDEX IF NOT EXISTS idx_forms_slug          ON forms(slug);
CREATE INDEX IF NOT EXISTS idx_forms_short_id      ON forms(short_id);
CREATE INDEX IF NOT EXISTS idx_forms_status        ON forms(status);
CREATE INDEX IF NOT EXISTS idx_forms_created_at    ON forms(created_at DESC);

-- ─── 2. FORM FIELDS ─────────────────────────────────────────────────────────
-- One row per field in a form. Ordered by `position`.
CREATE TABLE IF NOT EXISTS form_fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id         UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,

    -- Field definition
    field_type      TEXT NOT NULL
                    CHECK (field_type IN (
                        'text', 'email', 'phone', 'number', 'url',
                        'dropdown', 'radio', 'checkbox', 'multi_select',
                        'date', 'file_upload', 'textarea',
                        'hidden', 'utm', 'heading', 'paragraph_block', 'divider'
                    )),
    label           TEXT NOT NULL DEFAULT 'Untitled Field',
    placeholder     TEXT,
    help_text       TEXT,
    default_value   TEXT,

    -- Position & grouping
    position        INT NOT NULL DEFAULT 0,
    section         TEXT,                            -- Optional section grouping

    -- Validation
    required        BOOLEAN NOT NULL DEFAULT false,
    validation      JSONB DEFAULT '{}'::jsonb,       -- {"minLength":1,"maxLength":500,"pattern":"","min":null,"max":null,"allowedFileTypes":[],"maxFileSizeMb":10}

    -- Options (for dropdown, radio, checkbox, multi_select)
    options         JSONB DEFAULT '[]'::jsonb,       -- [{"label":"Option 1","value":"option_1"},...]

    -- Conditional logic
    conditional     JSONB,                           -- {"field_id":"...","operator":"equals","value":"...","action":"show"}

    -- Field-level settings
    settings        JSONB DEFAULT '{}'::jsonb,       -- {"width":"full","hidden":false,"utmParam":null}

    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_fields_form_id    ON form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_position   ON form_fields(form_id, position);

-- ─── 3. FORM RESPONSES ──────────────────────────────────────────────────────
-- One row per form submission. Lightweight header; values stored in response_values.
CREATE TABLE IF NOT EXISTS form_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id         UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,

    -- Submitter metadata
    ip_address      INET,
    user_agent      TEXT,
    referrer        TEXT,

    -- UTM data captured at submission time
    utm_source      TEXT,
    utm_medium      TEXT,
    utm_campaign    TEXT,
    utm_term        TEXT,
    utm_content     TEXT,

    -- Status
    status          TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed', 'partial', 'spam')),

    -- Metadata
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_responses_form_id       ON form_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_submitted_at  ON form_responses(form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_responses_status        ON form_responses(form_id, status);

-- ─── 4. RESPONSE VALUES ─────────────────────────────────────────────────────
-- EAV pattern: one row per field value per response.
-- Optimised for millions of submissions via narrow rows + composite indexes.
CREATE TABLE IF NOT EXISTS response_values (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id     UUID NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
    field_id        UUID NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,

    -- Value storage (text for simplicity — cast on read when needed)
    value           TEXT,
    file_url        TEXT,                            -- For file upload fields

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_response_values_response_id  ON response_values(response_id);
CREATE INDEX IF NOT EXISTS idx_response_values_field_id     ON response_values(field_id);
CREATE INDEX IF NOT EXISTS idx_response_values_composite    ON response_values(response_id, field_id);

-- ─── 5. AUTO-UPDATE TRIGGER ─────────────────────────────────────────────────
-- Keeps `updated_at` current on forms and form_fields.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forms_updated_at ON forms;
CREATE TRIGGER trg_forms_updated_at
    BEFORE UPDATE ON forms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_form_fields_updated_at ON form_fields;
CREATE TRIGGER trg_form_fields_updated_at
    BEFORE UPDATE ON form_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 6. RESPONSE COUNT TRIGGER ──────────────────────────────────────────────
-- Automatically increments forms.response_count on each new submission.
CREATE OR REPLACE FUNCTION increment_form_response_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE forms SET response_count = response_count + 1 WHERE id = NEW.form_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_response_count ON form_responses;
CREATE TRIGGER trg_increment_response_count
    AFTER INSERT ON form_responses
    FOR EACH ROW EXECUTE FUNCTION increment_form_response_count();

-- ─── 7. ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- NOTE: Flowauxi uses Firebase Auth, not Supabase Auth.
-- The backend uses service_role_key which BYPASSES RLS entirely.
-- These policies are for defense-in-depth if the anon key is ever used directly.
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_values ENABLE ROW LEVEL SECURITY;

-- Service role (backend) has full access by default (bypasses RLS).
-- For anon key access (public forms), we allow SELECT on published forms
-- and INSERT on responses/values for published forms.

-- Public read for published forms (for the public renderer via anon key)
CREATE POLICY forms_public_read ON forms
    FOR SELECT USING (status = 'published' AND deleted_at IS NULL);

CREATE POLICY form_fields_public_read ON form_fields
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM forms WHERE forms.id = form_fields.form_id AND forms.status = 'published' AND forms.deleted_at IS NULL)
    );

-- Form responses: anyone can INSERT (public submissions for published forms)
CREATE POLICY form_responses_public_insert ON form_responses
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM forms WHERE forms.id = form_responses.form_id AND forms.status = 'published' AND forms.deleted_at IS NULL)
    );

-- Allow SELECT on responses (service role bypasses this anyway)
CREATE POLICY form_responses_select ON form_responses
    FOR SELECT USING (true);

-- Response values: anyone can INSERT (part of submission)
CREATE POLICY response_values_public_insert ON response_values
    FOR INSERT WITH CHECK (true);

-- Allow SELECT on response values (service role bypasses this anyway)
CREATE POLICY response_values_select ON response_values
    FOR SELECT USING (true);

-- ─── DONE ────────────────────────────────────────────────────────────────────
-- Run this migration, then proceed with backend + frontend implementation.
