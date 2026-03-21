-- ============================================================================
-- Migration 060: Add CRM Intelligence Columns to Contacts Table
-- FAANG-Grade: Idempotent, strict constraints, indexed
-- ============================================================================

-- 1. Add CRM columns with strict NOT NULL + DEFAULT constraints
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(50) NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source VARCHAR(100) NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS interaction_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;

-- 2. Performance indexes for CRM queries
CREATE INDEX IF NOT EXISTS idx_contacts_user_status
  ON public.contacts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_contacts_user_interaction
  ON public.contacts(user_id, last_interaction_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_contacts_user_score
  ON public.contacts(user_id, lead_score DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_user_lifecycle
  ON public.contacts(user_id, lifecycle_stage);

-- 3. Ensure the unique constraint exists for idempotent upserts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'contacts_user_id_phone_normalized_key'
          AND n.nspname = 'public'
    ) THEN
        ALTER TABLE public.contacts
          ADD CONSTRAINT contacts_user_id_phone_normalized_key
          UNIQUE (user_id, phone_normalized);
    END IF;
END
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- Run this in Supabase SQL Editor. Safe to re-run (fully idempotent).
-- ============================================================================
