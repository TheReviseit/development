-- ═══════════════════════════════════════════════════════════════════════════════
-- FAANG-GRADE: AI Settings Configured Flag for O(1) Store Icon Visibility
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Adds:
--   1. ai_settings_configured (BOOLEAN) — instant check for navbar icon visibility
--   2. store_slug (TEXT) — denormalized from businesses table for O(1) access
--      without joins on every auth sync
--
-- These columns are populated during the business save flow and returned
-- directly in the auth sync response, eliminating ALL additional API calls
-- from the navbar rendering path.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── AI Settings Configured Flag ─────────────────────────────────────────────
-- Single source of truth for whether the user has completed AI settings setup.
-- Used by the dashboard navbar to conditionally render the Store icon.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS ai_settings_configured BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.ai_settings_configured
IS 'Whether the user has completed AI settings setup. Set during business save. Used for O(1) Store icon visibility in navbar.';

-- ─── Store Slug (Denormalized) ───────────────────────────────────────────────
-- Denormalized from businesses.url_slug for O(1) access in auth sync.
-- Updated during business save to avoid joins on every page load.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS store_slug TEXT;

COMMENT ON COLUMN public.users.store_slug
IS 'Denormalized store slug from businesses.url_slug. Updated on business save for zero-join navbar rendering.';

-- ─── Index for fast lookups ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_ai_settings_configured
ON public.users (ai_settings_configured)
WHERE ai_settings_configured = TRUE;

CREATE INDEX IF NOT EXISTS idx_users_store_slug
ON public.users (store_slug)
WHERE store_slug IS NOT NULL;

-- ─── Auto-update updated_at trigger ─────────────────────────────────────────
-- The existing `update_users_updated_at` trigger already handles updated_at.

COMMIT;
