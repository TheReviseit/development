-- FAANG-Grade CRM Contacts Schema Modifications

-- 1. Add Intelligence and Tracking columns to existing contacts table
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(50) DEFAULT 'lead',
ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'whatsapp',
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS interaction_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;

-- 2. Create unique index for idempotency
-- Supabase automatically supports upserts based on unique constraints.
-- Let's ensure (user_id, phone_normalized) is unique.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'contacts_user_id_phone_normalized_key'
          AND n.nspname = 'public'
    ) THEN
        ALTER TABLE public.contacts ADD CONSTRAINT contacts_user_id_phone_normalized_key UNIQUE (user_id, phone_normalized);
    END IF;
END
$$;
