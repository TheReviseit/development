-- =============================================================================
-- Migration: 025_fix_audit_resource_id.sql
-- Description: Fix otp_console_audit_logs.resource_id column type
-- 
-- PROBLEM: resource_id is typed as UUID but receives external provider IDs
--          like Razorpay subscription IDs (sub_xxx) which are TEXT.
--          This causes PostgreSQL error 22P02.
--
-- SOLUTION: Change resource_id from UUID to TEXT to accept any identifier.
-- =============================================================================

-- Step 1: Alter resource_id from UUID to TEXT
-- Note: PostgreSQL can safely cast UUID to TEXT, but NULL values may need handling
ALTER TABLE otp_console_audit_logs 
ALTER COLUMN resource_id TYPE TEXT USING resource_id::TEXT;

-- Step 2: Add explicit column for external provider IDs (recommended for clarity)
ALTER TABLE otp_console_audit_logs 
ADD COLUMN IF NOT EXISTS external_provider_id TEXT;

-- Step 3: Add correlation ID for distributed tracing
ALTER TABLE otp_console_audit_logs 
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

-- Step 4: Add index on external_provider_id for lookups
CREATE INDEX IF NOT EXISTS idx_audit_external_provider 
ON otp_console_audit_logs(external_provider_id) 
WHERE external_provider_id IS NOT NULL;

-- Step 5: Add index on correlation_id for request tracing
CREATE INDEX IF NOT EXISTS idx_audit_correlation 
ON otp_console_audit_logs(correlation_id) 
WHERE correlation_id IS NOT NULL;

-- Step 6: Update column comments
COMMENT ON COLUMN otp_console_audit_logs.resource_id IS 
  'Resource identifier - can be UUID or external provider ID (TEXT). e.g., project ID or sub_xxx';

COMMENT ON COLUMN otp_console_audit_logs.external_provider_id IS 
  'External provider ID (e.g., Razorpay sub_xxx, pay_xxx, cust_xxx)';

COMMENT ON COLUMN otp_console_audit_logs.correlation_id IS 
  'Request correlation ID for distributed tracing (X-Request-Id header)';
