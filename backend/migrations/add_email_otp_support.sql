-- =============================================================================
-- Multi-Channel OTP Support Migration
-- Adds email OTP support with billing-accurate usage tracking
-- =============================================================================

-- 1. Add destination_type column to otp_requests
-- Distinguishes phone vs email destinations
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS 
    destination_type VARCHAR(10) DEFAULT 'phone' 
    CHECK (destination_type IN ('phone', 'email'));

-- 2. Add email column for email OTP destinations
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- 3. Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_otp_requests_email_purpose 
    ON otp_requests(email, purpose, created_at DESC) 
    WHERE email IS NOT NULL;

-- 4. Create composite index for multi-channel queries
CREATE INDEX IF NOT EXISTS idx_otp_requests_channel_destination 
    ON otp_requests(channel, destination_type, created_at DESC);


-- =============================================================================
-- Usage Events Table (Billing-Accurate Tracking)
-- =============================================================================

-- Immutable usage events for billing
-- Key design: event_id is idempotent, billable only on first delivery
CREATE TABLE IF NOT EXISTS otp_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Idempotency key: "sent:request_id", "delivered:request_id", etc.
    event_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- Reference
    project_id UUID NOT NULL,
    request_id VARCHAR(30) NOT NULL,
    
    -- Event type: otp_sent, otp_delivered, otp_verified, otp_failed
    event_type VARCHAR(30) NOT NULL,
    
    -- Channel and destination
    channel VARCHAR(20) NOT NULL,  -- 'whatsapp', 'email', 'sms'
    destination_type VARCHAR(10) NOT NULL,  -- 'phone', 'email'
    
    -- Billing flags
    billable BOOLEAN DEFAULT FALSE,  -- Only TRUE on first successful delivery
    
    -- Price snapshot at time of event (critical for invoice accuracy)
    unit_price NUMERIC(10, 4),
    
    -- Metadata (message_id, error_code, etc.)
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for billing queries
CREATE INDEX IF NOT EXISTS idx_usage_events_billable 
    ON otp_usage_events(project_id, billable, created_at DESC);

-- Index for analytics
CREATE INDEX IF NOT EXISTS idx_usage_events_channel 
    ON otp_usage_events(channel, event_type, created_at DESC);


-- =============================================================================
-- Blocked Destinations Table (Extends existing blocked_numbers)
-- =============================================================================

-- Rename table if it exists with old name (optional, for compatibility)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_blocked_numbers') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_blocked_destinations') THEN
        ALTER TABLE otp_blocked_numbers RENAME TO otp_blocked_destinations;
    END IF;
END $$;

-- Add destination_type to blocked destinations
ALTER TABLE otp_blocked_destinations ADD COLUMN IF NOT EXISTS 
    destination_type VARCHAR(10) DEFAULT 'phone';

-- Add email column to blocked destinations
ALTER TABLE otp_blocked_destinations ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Create index for email blocklist lookups
CREATE INDEX IF NOT EXISTS idx_blocked_destinations_email 
    ON otp_blocked_destinations(email) 
    WHERE email IS NOT NULL;


-- =============================================================================
-- Rate Limits Table Updates
-- =============================================================================

-- Add destination_type to rate limits
ALTER TABLE otp_rate_limits ADD COLUMN IF NOT EXISTS 
    destination_type VARCHAR(10) DEFAULT 'phone';

-- Note: The existing `key` column format already supports email via pattern 'email:user@example.com:purpose'
-- No additional index needed - the existing idx_otp_rate_limits_key covers all lookups


-- =============================================================================
-- Audit Log Updates
-- =============================================================================

-- Add channel to audit logs for channel-specific auditing
ALTER TABLE otp_audit_logs ADD COLUMN IF NOT EXISTS channel VARCHAR(20);

-- Add destination_type to audit logs
ALTER TABLE otp_audit_logs ADD COLUMN IF NOT EXISTS destination_type VARCHAR(10);


-- =============================================================================
-- Provider Events Table (For delivery receipts/webhooks)
-- =============================================================================

CREATE TABLE IF NOT EXISTS otp_provider_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    request_id VARCHAR(30) NOT NULL,
    message_id VARCHAR(255),  -- Provider's message ID (wamid, email_id)
    
    -- Provider info
    provider VARCHAR(50) NOT NULL,  -- 'whatsapp_cloud_api', 'resend'
    channel VARCHAR(20) NOT NULL,
    
    -- Event from provider
    event_type VARCHAR(50) NOT NULL,  -- 'sent', 'delivered', 'read', 'failed', 'bounced'
    event_timestamp TIMESTAMPTZ NOT NULL,
    
    -- Raw webhook payload for debugging
    raw_payload JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for looking up events by request
CREATE INDEX IF NOT EXISTS idx_provider_events_request 
    ON otp_provider_events(request_id, event_timestamp DESC);

-- Index for looking up events by message_id
CREATE INDEX IF NOT EXISTS idx_provider_events_message 
    ON otp_provider_events(message_id) 
    WHERE message_id IS NOT NULL;


-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE otp_usage_events IS 'Immutable billing events for OTP usage tracking';
COMMENT ON COLUMN otp_usage_events.event_id IS 'Idempotency key to prevent duplicate billing';
COMMENT ON COLUMN otp_usage_events.billable IS 'TRUE only for first successful delivery per request';
COMMENT ON COLUMN otp_usage_events.unit_price IS 'Price snapshot at time of event for invoice accuracy';

COMMENT ON TABLE otp_provider_events IS 'Delivery receipts and webhooks from OTP providers';
