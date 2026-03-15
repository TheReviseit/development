-- =============================================================================
-- MIGRATION 065: Enterprise Form Builder Fixes
-- Supabase (PostgreSQL) — Run via SQL Editor or psql
--
-- Changes:
--   1. Partial index on forms(deleted_at) for O(log n) purge queries
--   2. form_deletions audit table for full deletion traceability
--
-- NOTE: All ON DELETE CASCADE FK constraints are already defined in the
--       original create_forms_tables.sql migration:
--         form_fields.form_id         → forms(id) ON DELETE CASCADE  ✓
--         form_responses.form_id      → forms(id) ON DELETE CASCADE  ✓
--         response_values.response_id → form_responses(id) ON DELETE CASCADE ✓
--         response_values.field_id    → form_fields(id) ON DELETE CASCADE ✓
--
--       The two-phase delete pattern (soft-delete → hard-delete purge) means
--       the cascade only fires during Phase 2 (hard-delete), which is correct.
-- =============================================================================


-- ─── 1. PERFORMANCE INDEX FOR PURGE QUERIES ──────────────────────────────────
-- Without this, `SELECT ... WHERE deleted_at < cutoff` would full-scan forms.
-- Partial index: only indexes rows where deleted_at IS NOT NULL (soft-deleted
-- forms), keeping the index tiny and fast regardless of total table size.
-- This is the enterprise standard for soft-delete columns.
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_forms_deleted_at
    ON forms(deleted_at)
    WHERE deleted_at IS NOT NULL;


-- ─── 2. FORM DELETIONS AUDIT TABLE ───────────────────────────────────────────
-- Immutable audit log for every form deletion event.
--
-- Design decisions:
--   • NO FOREIGN KEY on form_id — intentional. Once the form is hard-purged,
--     the forms row is gone. The audit record must outlive the form for
--     support and compliance queries (e.g. "My form disappeared!").
--   • soft_deleted_at = when user clicked Delete (Phase 1).
--   • hard_purged_at  = when the purge job actually deleted the DB row (Phase 2).
--   • metadata JSONB   = extensible: can store response_count at deletion time,
--     plan info, workspace_id, IP, etc. — without schema migration.
-- =============================================================================
CREATE TABLE IF NOT EXISTS form_deletions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References (no FK — audit record survives the hard-delete)
    form_id         UUID        NOT NULL,
    user_id         UUID        NOT NULL,

    -- Snapshot at deletion time (denormalized for audit durability)
    form_title      TEXT,
    form_slug       TEXT,
    response_count  INT         DEFAULT 0,

    -- Two-phase delete timestamps
    soft_deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    hard_purged_at  TIMESTAMPTZ,               -- NULL until Phase 2 runs

    -- Classification
    reason          TEXT        NOT NULL DEFAULT 'user_initiated'
                    CHECK (reason IN ('user_initiated', 'admin_purge', 'account_closure', 'system')),

    -- Extensible metadata (future: workspace_id, plan, IP address, etc.)
    metadata        JSONB       NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup by form (idempotency checks, restore lookups)
CREATE INDEX IF NOT EXISTS idx_form_deletions_form_id
    ON form_deletions(form_id);

-- Lookup by user (support queries: "show me all deleted forms for user X")
CREATE INDEX IF NOT EXISTS idx_form_deletions_user_id
    ON form_deletions(user_id);

-- Lookup pending hard-purge (purge job: find records where hard_purged_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_form_deletions_pending_purge
    ON form_deletions(soft_deleted_at)
    WHERE hard_purged_at IS NULL;


-- ─── DONE ─────────────────────────────────────────────────────────────────────
-- After running this migration, deploy the updated form_service.py and
-- forms_api.py which implement the two-phase delete + audit logging.
