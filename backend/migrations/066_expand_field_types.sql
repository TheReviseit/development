-- =============================================================================
-- MIGRATION 066: Expand form_fields field_type CHECK constraint
-- Supabase (PostgreSQL) — Run via SQL Editor
--
-- The original constraint only allowed 17 field types. The FieldType enum
-- in form_entities.py has grown to 30 types. This migration drops the old
-- constraint and replaces it with one that includes ALL supported types.
-- =============================================================================

-- Drop the existing constraint
ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check;

-- Add the expanded constraint with ALL field types from FieldType enum
ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
    CHECK (field_type IN (
        -- Basic Inputs
        'text', 'email', 'phone', 'phone_international', 'number',
        'url', 'password', 'textarea',

        -- Choice Fields
        'dropdown', 'radio', 'checkbox', 'multi_select',
        'yes_no', 'consent_checkbox',

        -- Date & Time
        'date', 'time', 'date_range',

        -- Survey
        'rating', 'scale', 'slider',

        -- Advanced
        'file_upload', 'signature', 'address', 'hidden', 'utm',

        -- Layout (non-input)
        'heading', 'paragraph_block', 'description', 'divider', 'spacer'
    ));
