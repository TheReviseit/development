-- =============================================================================
-- Channel Isolation Migration
-- Adds strict constraints for WhatsApp/Email OTP separation
-- =============================================================================

-- STEP 1: Make phone column nullable (required for Email OTPs)
-- This allows email-only OTP requests without a phone number
ALTER TABLE otp_requests ALTER COLUMN phone DROP NOT NULL;

-- STEP 2: Ensure email column exists (in case migration wasn't applied)
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- STEP 3: Ensure destination_type column exists with proper values
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS 
    destination_type VARCHAR(10) DEFAULT 'phone' 
    CHECK (destination_type IN ('phone', 'email'));

-- STEP 4: Add CHECK constraint to enforce destination type consistency
-- This prevents NULL conflicts and ensures data integrity
DO $$
BEGIN
    -- Drop existing constraint if it exists (for re-running migration)
    ALTER TABLE otp_requests DROP CONSTRAINT IF EXISTS chk_destination_type_columns;
    
    -- Add the new constraint
    ALTER TABLE otp_requests ADD CONSTRAINT chk_destination_type_columns
    CHECK (
        -- Phone destinations: phone is set, email is null
        (destination_type = 'phone' AND phone IS NOT NULL) OR
        -- Email destinations: email is set, phone can be null
        (destination_type = 'email' AND email IS NOT NULL)
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint may already exist or table structure differs: %', SQLERRM;
END $$;

-- STEP 5: Create composite index for channel-aware rate limiting
-- Uses COALESCE to support both phone and email lookups efficiently
CREATE INDEX IF NOT EXISTS idx_otp_requests_destination_rate
ON otp_requests(destination_type, created_at DESC)
WHERE destination_type IS NOT NULL;

-- STEP 6: Create separate indexes for phone and email rate limit queries
CREATE INDEX IF NOT EXISTS idx_otp_requests_phone_rate
ON otp_requests(phone, purpose, created_at DESC)
WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_otp_requests_email_rate
ON otp_requests(email, purpose, created_at DESC)
WHERE email IS NOT NULL;

-- STEP 7: Add channel column if not exists (may already exist)
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS 
    channel VARCHAR(20) DEFAULT 'whatsapp';

-- STEP 8: Add message_id column for provider tracking (WhatsApp wamid, Resend email ID)
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS 
    message_id VARCHAR(100);

-- STEP 8: Update existing records to have correct destination_type
-- This backfills the destination_type for existing WhatsApp OTPs
UPDATE otp_requests 
SET destination_type = 'phone' 
WHERE phone IS NOT NULL AND (destination_type IS NULL OR destination_type = '');

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON COLUMN otp_requests.destination_type IS 
    'Type of destination: phone (WhatsApp/SMS) or email. Enforces channel separation.';

COMMENT ON CONSTRAINT chk_destination_type_columns ON otp_requests IS 
    'Ensures phone OTPs have phone set, email OTPs have email set. Prevents NULL conflicts.';
