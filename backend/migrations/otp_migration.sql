-- =============================================================================
-- OTP Platform Database Schema
-- Production-Grade OTP API Platform for WhatsApp/SMS Delivery
-- =============================================================================

-- =============================================================================
-- BUSINESSES TABLE
-- Stores business accounts using the OTP platform
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    -- WhatsApp configuration
    whatsapp_mode VARCHAR(20) NOT NULL DEFAULT 'platform', -- 'platform' or 'customer'
    phone_number_id VARCHAR(50), -- For customer mode: their WhatsApp phone number ID
    -- Webhook configuration
    webhook_url TEXT, -- Delivery status webhook endpoint
    webhook_secret VARCHAR(64), -- HMAC secret for webhook signatures
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- =============================================================================
-- API KEYS TABLE
-- Stores hashed API keys for authentication (Twilio-style)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES otp_businesses(id) ON DELETE CASCADE,
    key_prefix VARCHAR(20) NOT NULL, -- e.g., 'otp_live_abc12' or 'otp_test_abc12'
    key_hash VARCHAR(64) NOT NULL, -- SHA256 hash of full key
    name VARCHAR(100) DEFAULT 'Default',
    scopes JSONB DEFAULT '["send", "verify"]',
    -- Rate limits
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 10000,
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    -- Soft-delete for audit compliance
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

-- =============================================================================
-- IDEMPOTENCY KEYS TABLE
-- Prevents duplicate OTP sends on client retries
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(64) NOT NULL,
    business_id UUID REFERENCES otp_businesses(id),
    request_id VARCHAR(30) NOT NULL,
    request_hash VARCHAR(64) NOT NULL, -- Hash of request payload
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    UNIQUE(business_id, idempotency_key)
);

-- =============================================================================
-- OTP REQUESTS TABLE
-- Core table for tracking OTP lifecycle
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(30) NOT NULL UNIQUE, -- e.g., 'otp_req_abc123'
    business_id UUID REFERENCES otp_businesses(id),
    phone VARCHAR(20) NOT NULL,
    -- Purpose-scoped OTPs (prevents cross-flow reuse)
    purpose VARCHAR(30) NOT NULL, -- login, signup, password_reset, transaction
    -- OTP data (never store plaintext)
    otp_hash VARCHAR(64) NOT NULL, -- HMAC-SHA256 hash
    otp_length INTEGER DEFAULT 6,
    -- Channel configuration
    channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    template_name VARCHAR(100) DEFAULT 'otp_authentication', -- Meta default template
    -- Timing
    expires_at TIMESTAMPTZ NOT NULL,
    -- Verification tracking
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending', -- pending, verified, expired
    verified_at TIMESTAMPTZ,
    -- Delivery tracking (independent of verification)
    delivery_status VARCHAR(20) DEFAULT 'queued', -- queued, sent, delivered, failed
    delivery_channel VARCHAR(20), -- actual channel used (may differ if fallback)
    delivery_attempts INTEGER DEFAULT 0,
    last_delivery_error TEXT,
    -- Resend tracking
    resend_count INTEGER DEFAULT 0,
    last_resend_at TIMESTAMPTZ,
    next_allowed_resend_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '60 seconds',
    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- BLOCKED NUMBERS TABLE
-- Fraud prevention: auto-block numbers that abuse rate limits
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_blocked_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    reason VARCHAR(50) NOT NULL, -- rate_limit_abuse, manual_block, fraud_detection
    rate_limit_violations INTEGER DEFAULT 0,
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    is_permanent BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RATE LIMITS TABLE
-- Sliding window rate limit state
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL, -- e.g., 'phone:+919876543210:global' or 'phone:+919876543210:login'
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AUDIT LOGS TABLE
-- Complete audit trail for compliance
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES otp_businesses(id),
    request_id VARCHAR(30),
    action VARCHAR(50) NOT NULL, -- send, verify, resend, rate_limited, blocked
    phone VARCHAR(20),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN,
    error_code VARCHAR(50),
    latency_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- WEBHOOK DELIVERY LOGS TABLE
-- Track webhook delivery attempts with retry status
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES otp_businesses(id),
    request_id VARCHAR(30),
    event_type VARCHAR(50) NOT NULL, -- otp.delivery.sent, otp.delivery.delivered, otp.delivery.failed
    payload JSONB NOT NULL,
    -- Delivery tracking
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, delivered, failed, dead_letter
    last_status_code INTEGER,
    last_error TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_otp_requests_request_id ON otp_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_otp_requests_phone_purpose ON otp_requests(phone, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_requests_business_status ON otp_requests(business_id, status);
CREATE INDEX IF NOT EXISTS idx_otp_requests_expires ON otp_requests(expires_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_otp_api_keys_prefix ON otp_api_keys(key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_otp_api_keys_business ON otp_api_keys(business_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_key ON otp_rate_limits(key, window_start);

CREATE INDEX IF NOT EXISTS idx_otp_blocked_phone ON otp_blocked_numbers(phone, expires_at);
-- Note: For active blocks, query with: WHERE expires_at > NOW() OR is_permanent = TRUE
-- Partial index with NOW() not allowed (NOW() is not IMMUTABLE)

CREATE INDEX IF NOT EXISTS idx_otp_audit_logs_business ON otp_audit_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_audit_logs_request ON otp_audit_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_otp_idempotency_lookup ON otp_idempotency_keys(business_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_otp_webhook_pending ON otp_webhook_logs(status, next_retry_at) 
    WHERE status IN ('pending', 'failed');

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================
COMMENT ON TABLE otp_businesses IS 'Business accounts using the OTP platform';
COMMENT ON TABLE otp_api_keys IS 'API keys for authentication (soft-delete enabled)';
COMMENT ON TABLE otp_requests IS 'OTP request lifecycle tracking';
COMMENT ON TABLE otp_blocked_numbers IS 'Phone numbers blocked for fraud prevention';
COMMENT ON TABLE otp_rate_limits IS 'Sliding window rate limit counters';
COMMENT ON TABLE otp_audit_logs IS 'Complete audit trail for compliance';
COMMENT ON TABLE otp_webhook_logs IS 'Webhook delivery tracking with retry support';

COMMENT ON COLUMN otp_api_keys.revoked_at IS 'Soft-delete timestamp for audit compliance';
COMMENT ON COLUMN otp_requests.purpose IS 'Scopes OTP to specific flow: login, signup, password_reset, transaction';
COMMENT ON COLUMN otp_requests.status IS 'Verification status (independent of delivery)';
COMMENT ON COLUMN otp_requests.delivery_status IS 'Delivery status (can fail without affecting verification)';
