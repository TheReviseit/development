-- =============================================================================
-- OTP Platform - Schema Fix Migration
-- Unifies otp_businesses with otp_projects
-- Run this AFTER running both otp_migration.sql and otp_console_migration.sql
-- =============================================================================

-- =============================================================================
-- STEP 0: Drop old foreign key constraints referencing otp_businesses
-- =============================================================================

-- Drop foreign key on otp_requests.business_id
DO $$ 
BEGIN
    ALTER TABLE otp_requests DROP CONSTRAINT IF EXISTS otp_requests_business_id_fkey;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Drop foreign key on otp_idempotency_keys.business_id
DO $$ 
BEGIN
    ALTER TABLE otp_idempotency_keys DROP CONSTRAINT IF EXISTS otp_idempotency_keys_business_id_fkey;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Drop foreign key on otp_audit_logs.business_id
DO $$ 
BEGIN
    ALTER TABLE otp_audit_logs DROP CONSTRAINT IF EXISTS otp_audit_logs_business_id_fkey;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Drop foreign key on otp_webhook_logs.business_id
DO $$ 
BEGIN
    ALTER TABLE otp_webhook_logs DROP CONSTRAINT IF EXISTS otp_webhook_logs_business_id_fkey;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- =============================================================================
-- STEP 1: Allow otp_requests to reference otp_projects instead of otp_businesses
-- =============================================================================

-- Add project_id column to otp_requests (nullable for backward compatibility)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'otp_requests' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE otp_requests ADD COLUMN project_id UUID REFERENCES otp_projects(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Make business_id nullable (for transition period)
-- =============================================================================
DO $$ 
BEGIN
    -- Make business_id nullable if it's not already
    ALTER TABLE otp_requests ALTER COLUMN business_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
    NULL; -- Column may already be nullable
END $$;

-- =============================================================================
-- STEP 3: Add project_id to idempotency keys
-- =============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'otp_idempotency_keys' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE otp_idempotency_keys ADD COLUMN project_id UUID REFERENCES otp_projects(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =============================================================================
-- STEP 4: Add project_id to audit logs
-- =============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'otp_audit_logs' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE otp_audit_logs ADD COLUMN project_id UUID REFERENCES otp_projects(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- STEP 5: Add project_id to webhook logs
-- =============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'otp_webhook_logs' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE otp_webhook_logs ADD COLUMN project_id UUID REFERENCES otp_projects(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- STEP 6: Create indexes for project_id lookups
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_otp_requests_project ON otp_requests(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_idempotency_project ON otp_idempotency_keys(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_audit_project ON otp_audit_logs(project_id) WHERE project_id IS NOT NULL;

-- =============================================================================
-- STEP 7: Add org_id to otp_requests for easier querying
-- =============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'otp_requests' AND column_name = 'org_id'
    ) THEN
        ALTER TABLE otp_requests ADD COLUMN org_id UUID REFERENCES otp_organizations(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_otp_requests_org ON otp_requests(org_id) WHERE org_id IS NOT NULL;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON COLUMN otp_requests.project_id IS 'Reference to otp_projects (preferred over business_id)';
COMMENT ON COLUMN otp_requests.business_id IS 'Deprecated: Use project_id instead';
COMMENT ON COLUMN otp_requests.org_id IS 'Organization ID for multi-tenant queries';
