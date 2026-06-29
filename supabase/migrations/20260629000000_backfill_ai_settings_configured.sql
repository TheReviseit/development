-- ═══════════════════════════════════════════════════════════════════════════════
-- FAANG-GRADE: Backfill AI Settings Configured and Store Slug flags
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Backfills:
--   1. ai_settings_configured = TRUE for all users who have a matching row
--      in the businesses table with a non-empty business_name.
--   2. store_slug = businesses.url_slug (or fallback if empty) for the same users.
--
-- Includes a partial index constraint to make the scan surgical and highly
-- performant, avoiding table scans for large user databases.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Partial Index for Surgical Scan ──────────────────────────────────────
-- Note: Created non-concurrently as some migration runners execute within a transaction
-- block where CONCURRENTLY is illegal. It is safe because it only targets FALSE values.
CREATE INDEX IF NOT EXISTS idx_users_ai_settings_not_configured
  ON public.users (firebase_uid)
  WHERE ai_settings_configured = FALSE;

-- ─── 2. Transactional Backfill ───────────────────────────────────────────────
BEGIN;

DO $$
DECLARE
  affected_count INT;
BEGIN
  UPDATE public.users u
  SET
    ai_settings_configured = TRUE,
    store_slug = COALESCE(NULLIF(TRIM(b.url_slug), ''), LOWER(SUBSTRING(u.firebase_uid FROM 1 FOR 8))),
    updated_at = NOW()
  FROM public.businesses b
  WHERE
    u.firebase_uid = b.user_id
    AND u.ai_settings_configured = FALSE
    AND b.business_name IS NOT NULL
    AND TRIM(b.business_name) != '';

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled % users', affected_count;
END $$;

COMMIT;
