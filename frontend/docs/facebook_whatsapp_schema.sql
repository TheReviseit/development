-- =====================================================
-- FACEBOOK LOGIN + WHATSAPP BUSINESS CLOUD API SCHEMA
-- Multi-Tenant SaaS Architecture
-- =====================================================
-- This schema enables each customer to connect their own
-- WhatsApp Business Account via Facebook Login
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- FACEBOOK ACCOUNTS TABLE
-- =====================================================
-- Stores Facebook account connections for each user
-- Each user can have one Facebook account connected

CREATE TABLE IF NOT EXISTS connected_facebook_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Facebook User Info
    facebook_user_id TEXT NOT NULL,
    facebook_user_name TEXT,
    facebook_email TEXT,
    
    -- Access Tokens (encrypted)
    access_token TEXT NOT NULL, -- Encrypted Facebook access token
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE, -- Token expiration
    
    -- Token refresh info
    refresh_token TEXT, -- Some apps may get this
    last_refreshed_at TIMESTAMP WITH TIME ZONE,
    
    -- Permissions granted
    granted_permissions TEXT[], -- Array of permissions: ['business_management', 'whatsapp_business_management']
    
    -- Connection status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
    connection_error TEXT, -- Store last error message
    
    -- Timestamps
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure one active Facebook account per user
    UNIQUE(user_id, facebook_user_id)
);

CREATE INDEX idx_fb_accounts_user_id ON connected_facebook_accounts(user_id);
CREATE INDEX idx_fb_accounts_status ON connected_facebook_accounts(status);
CREATE INDEX idx_fb_accounts_facebook_user_id ON connected_facebook_accounts(facebook_user_id);

-- =====================================================
-- BUSINESS MANAGERS TABLE
-- =====================================================
-- Stores Facebook Business Manager connections
-- A user can have multiple Business Managers

CREATE TABLE IF NOT EXISTS connected_business_managers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facebook_account_id UUID NOT NULL REFERENCES connected_facebook_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Business Manager Info from Meta
    business_id TEXT NOT NULL, -- Meta Business Manager ID
    business_name TEXT NOT NULL,
    business_email TEXT,
    business_vertical TEXT, -- Industry/category
    
    -- Access level
    permitted_roles TEXT[], -- ['ADMIN', 'EMPLOYEE', 'ANALYST']
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(facebook_account_id, business_id)
);

CREATE INDEX idx_bm_facebook_account ON connected_business_managers(facebook_account_id);
CREATE INDEX idx_bm_user_id ON connected_business_managers(user_id);
CREATE INDEX idx_bm_business_id ON connected_business_managers(business_id);

-- =====================================================
-- WHATSAPP BUSINESS ACCOUNTS TABLE
-- =====================================================
-- Stores WhatsApp Business Accounts (WABAs)
-- Customer-owned WhatsApp Business Accounts

CREATE TABLE IF NOT EXISTS connected_whatsapp_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_manager_id UUID NOT NULL REFERENCES connected_business_managers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- WABA Info from Meta
    waba_id TEXT NOT NULL UNIQUE, -- WhatsApp Business Account ID
    waba_name TEXT,
    account_review_status TEXT, -- 'APPROVED', 'PENDING', 'REJECTED'
    business_verification_status TEXT, -- 'verified', 'unverified'
    
    -- Currency and tier
    currency TEXT DEFAULT 'USD',
    message_template_namespace TEXT,
    
    -- Quality rating
    quality_rating TEXT, -- 'GREEN', 'YELLOW', 'RED', 'UNKNOWN'
    
    -- Limits
    messaging_limit_tier TEXT, -- 'TIER_1K', 'TIER_10K', etc.
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(business_manager_id, waba_id)
);

CREATE INDEX idx_waba_bm_id ON connected_whatsapp_accounts(business_manager_id);
CREATE INDEX idx_waba_user_id ON connected_whatsapp_accounts(user_id);
CREATE INDEX idx_waba_waba_id ON connected_whatsapp_accounts(waba_id);

-- =====================================================
-- WHATSAPP PHONE NUMBERS TABLE
-- =====================================================
-- Stores individual phone numbers under each WABA
-- The actual numbers used for sending/receiving messages

CREATE TABLE IF NOT EXISTS connected_phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    whatsapp_account_id UUID NOT NULL REFERENCES connected_whatsapp_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Phone Number Info from Meta
    phone_number_id TEXT NOT NULL UNIQUE, -- Meta's phone number ID (used for API calls)
    display_phone_number TEXT NOT NULL, -- Formatted: +1234567890
    verified_name TEXT, -- Business name verified by Meta
    
    -- Quality and status
    code_verification_status TEXT, -- 'VERIFIED', 'NOT_VERIFIED'
    quality_rating TEXT, -- 'GREEN', 'YELLOW', 'RED', 'UNKNOWN'
    
    -- Platform type
    platform_type TEXT DEFAULT 'CLOUD_API', -- 'CLOUD_API', 'ON_PREMISE'
    
    -- Webhook configuration
    webhook_url TEXT, -- Your webhook URL for this number
    webhook_verified BOOLEAN DEFAULT false,
    webhook_verify_token TEXT, -- Encrypted verify token
    
    -- Messaging capabilities
    is_official_business_account BOOLEAN DEFAULT false,
    can_send_messages BOOLEAN DEFAULT true,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false, -- One primary number per user
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(whatsapp_account_id, phone_number_id)
);

CREATE INDEX idx_phone_waba_id ON connected_phone_numbers(whatsapp_account_id);
CREATE INDEX idx_phone_user_id ON connected_phone_numbers(user_id);
CREATE INDEX idx_phone_number_id ON connected_phone_numbers(phone_number_id);
CREATE INDEX idx_phone_is_primary ON connected_phone_numbers(is_primary);

-- =====================================================
-- WHATSAPP MESSAGES TABLE
-- =====================================================
-- Stores all WhatsApp messages (sent and received)
-- For compliance, analytics, and debugging

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number_id UUID NOT NULL REFERENCES connected_phone_numbers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Message identifiers
    message_id TEXT NOT NULL UNIQUE, -- Meta's message ID
    wamid TEXT, -- WhatsApp Message ID (wamid)
    
    -- Message details
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_number TEXT NOT NULL, -- Sender phone number
    to_number TEXT NOT NULL, -- Recipient phone number
    
    -- Content
    message_type TEXT NOT NULL, -- 'text', 'image', 'video', 'document', 'audio', 'template'
    message_body TEXT, -- Text content
    media_url TEXT, -- URL for media messages
    media_id TEXT, -- Meta media ID
    
    -- Template info (for outbound template messages)
    template_name TEXT,
    template_language TEXT,
    template_parameters JSONB,
    
    -- Status tracking
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    error_code TEXT,
    error_message TEXT,
    
    -- Pricing
    conversation_id TEXT, -- Meta conversation ID
    conversation_category TEXT, -- 'authentication', 'marketing', 'utility', 'service'
    pricing_model TEXT, -- 'CBP' (Conversation-Based Pricing)
    
    -- Metadata
    metadata JSONB, -- Additional data
    
    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Analytics
    conversation_origin TEXT -- 'user_initiated', 'business_initiated'
);

CREATE INDEX idx_messages_phone_number ON whatsapp_messages(phone_number_id);
CREATE INDEX idx_messages_user_id ON whatsapp_messages(user_id);
CREATE INDEX idx_messages_message_id ON whatsapp_messages(message_id);
CREATE INDEX idx_messages_direction ON whatsapp_messages(direction);
CREATE INDEX idx_messages_status ON whatsapp_messages(status);
CREATE INDEX idx_messages_created_at ON whatsapp_messages(created_at DESC);

-- =====================================================
-- WEBHOOK EVENTS LOG TABLE
-- =====================================================
-- Logs all webhook events received from Meta
-- Critical for debugging and compliance

CREATE TABLE IF NOT EXISTS webhook_events_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    phone_number_id UUID REFERENCES connected_phone_numbers(id) ON DELETE SET NULL,
    
    -- Event details
    event_type TEXT NOT NULL, -- 'messages', 'message_status', 'account_update'
    webhook_payload JSONB NOT NULL, -- Full webhook payload
    
    -- Processing status
    processed BOOLEAN DEFAULT false,
    processing_error TEXT,
    
    -- Signature verification
    signature_verified BOOLEAN DEFAULT false,
    signature_value TEXT,
    
    -- Timestamps
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_webhook_events_type ON webhook_events_log(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events_log(processed);
CREATE INDEX idx_webhook_events_received_at ON webhook_events_log(received_at DESC);

-- =====================================================
-- META APP PERMISSIONS AUDIT TABLE
-- =====================================================
-- Tracks permission changes and app review status
-- Important for compliance and debugging

CREATE TABLE IF NOT EXISTS meta_permissions_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facebook_account_id UUID NOT NULL REFERENCES connected_facebook_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Permission details
    permission_name TEXT NOT NULL,
    permission_status TEXT NOT NULL CHECK (permission_status IN ('granted', 'declined', 'expired', 'revoked')),
    
    -- App review
    review_status TEXT, -- 'approved', 'pending', 'rejected'
    review_notes TEXT,
    
    -- Audit trail
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT -- 'user', 'meta', 'system'
);

CREATE INDEX idx_permissions_fb_account ON meta_permissions_audit(facebook_account_id);
CREATE INDEX idx_permissions_changed_at ON meta_permissions_audit(changed_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_fb_accounts_updated_at
    BEFORE UPDATE ON connected_facebook_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_managers_updated_at
    BEFORE UPDATE ON connected_business_managers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_waba_updated_at
    BEFORE UPDATE ON connected_whatsapp_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phone_numbers_updated_at
    BEFORE UPDATE ON connected_phone_numbers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS FOR EASY QUERYING
-- =====================================================

-- Complete connection view (all info in one query)
CREATE OR REPLACE VIEW user_whatsapp_connections AS
SELECT 
    u.id as user_id,
    u.email as user_email,
    u.full_name as user_name,
    
    fa.id as facebook_account_id,
    fa.facebook_user_name,
    fa.status as facebook_status,
    
    bm.id as business_manager_id,
    bm.business_name,
    bm.business_id,
    
    wa.id as whatsapp_account_id,
    wa.waba_id,
    wa.waba_name,
    wa.quality_rating as waba_quality,
    
    pn.id as phone_number_id,
    pn.phone_number_id as meta_phone_id,
    pn.display_phone_number,
    pn.verified_name,
    pn.is_primary,
    pn.is_active as phone_active
    
FROM users u
LEFT JOIN connected_facebook_accounts fa ON u.id = fa.user_id AND fa.deleted_at IS NULL
LEFT JOIN connected_business_managers bm ON fa.id = bm.facebook_account_id AND bm.deleted_at IS NULL
LEFT JOIN connected_whatsapp_accounts wa ON bm.id = wa.business_manager_id AND wa.deleted_at IS NULL
LEFT JOIN connected_phone_numbers pn ON wa.id = pn.whatsapp_account_id AND pn.deleted_at IS NULL
WHERE fa.status = 'active' AND pn.is_active = true;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to get active phone number for a user
CREATE OR REPLACE FUNCTION get_user_active_phone(p_user_id UUID)
RETURNS TABLE (
    phone_number_id UUID,
    meta_phone_id TEXT,
    display_phone_number TEXT,
    waba_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pn.id,
        pn.phone_number_id,
        pn.display_phone_number,
        wa.waba_id
    FROM connected_phone_numbers pn
    JOIN connected_whatsapp_accounts wa ON pn.whatsapp_account_id = wa.id
    JOIN connected_business_managers bm ON wa.business_manager_id = bm.id
    JOIN connected_facebook_accounts fa ON bm.facebook_account_id = fa.id
    WHERE fa.user_id = p_user_id
        AND pn.is_active = true
        AND pn.is_primary = true
        AND fa.status = 'active'
        AND pn.deleted_at IS NULL
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to soft delete a connection
CREATE OR REPLACE FUNCTION soft_delete_facebook_connection(p_facebook_account_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE connected_facebook_accounts 
    SET deleted_at = CURRENT_TIMESTAMP, status = 'revoked'
    WHERE id = p_facebook_account_id;
    
    UPDATE connected_business_managers 
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE facebook_account_id = p_facebook_account_id;
    
    UPDATE connected_whatsapp_accounts 
    SET deleted_at = CURRENT_TIMESTAMP, is_active = false
    WHERE business_manager_id IN (
        SELECT id FROM connected_business_managers 
        WHERE facebook_account_id = p_facebook_account_id
    );
    
    UPDATE connected_phone_numbers 
    SET deleted_at = CURRENT_TIMESTAMP, is_active = false
    WHERE whatsapp_account_id IN (
        SELECT wa.id FROM connected_whatsapp_accounts wa
        JOIN connected_business_managers bm ON wa.business_manager_id = bm.id
        WHERE bm.facebook_account_id = p_facebook_account_id
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE connected_facebook_accounts IS 'Stores Facebook OAuth connections for each user';
COMMENT ON TABLE connected_business_managers IS 'Facebook Business Manager accounts accessible by the user';
COMMENT ON TABLE connected_whatsapp_accounts IS 'WhatsApp Business Accounts (WABAs) owned by the customer';
COMMENT ON TABLE connected_phone_numbers IS 'Individual phone numbers under each WABA for sending messages';
COMMENT ON TABLE whatsapp_messages IS 'All WhatsApp messages sent and received through the platform';
COMMENT ON TABLE webhook_events_log IS 'Audit log of all webhook events received from Meta';

-- =====================================================
-- SAMPLE QUERY EXAMPLES
-- =====================================================

/*
-- Get all connections for a user
SELECT * FROM user_whatsapp_connections WHERE user_id = 'your-uuid-here';

-- Get user's active phone number
SELECT * FROM get_user_active_phone('your-uuid-here');

-- Get message history for a user
SELECT * FROM whatsapp_messages 
WHERE user_id = 'your-uuid-here' 
ORDER BY created_at DESC 
LIMIT 100;

-- Check token expiration
SELECT 
    u.email,
    fa.facebook_user_name,
    fa.expires_at,
    CASE 
        WHEN fa.expires_at < NOW() THEN 'EXPIRED'
        WHEN fa.expires_at < NOW() + INTERVAL '7 days' THEN 'EXPIRING_SOON'
        ELSE 'VALID'
    END as token_status
FROM connected_facebook_accounts fa
JOIN users u ON fa.user_id = u.id
WHERE fa.status = 'active';

-- Soft delete a user's Facebook connection
SELECT soft_delete_facebook_connection('facebook-account-uuid-here');
*/

