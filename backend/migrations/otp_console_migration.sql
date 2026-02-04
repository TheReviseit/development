-- =============================================================================
-- OTP Developer Console Database Schema
-- Isolated auth system, multi-tenant organizations, RBAC-ready
-- =============================================================================

-- =============================================================================
-- CONSOLE USERS (Isolated from existing user table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_console_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255),
    -- Email verification
    is_email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(64),
    verification_token_expires TIMESTAMPTZ,
    -- Password reset
    reset_token VARCHAR(64),
    reset_token_expires TIMESTAMPTZ,
    -- Session tracking
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    login_count INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ORGANIZATIONS (Teams / Companies)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE, -- URL-friendly name
    owner_id UUID REFERENCES otp_console_users(id) ON DELETE SET NULL,
    -- Billing
    plan VARCHAR(50) DEFAULT 'free', -- free, starter, pro, enterprise
    plan_expires_at TIMESTAMPTZ,
    -- Quotas
    monthly_otp_limit INTEGER DEFAULT 1000,
    monthly_otp_used INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ORG MEMBERS (RBAC-ready)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES otp_organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES otp_console_users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'admin', -- owner, admin, developer, viewer
    invited_by UUID REFERENCES otp_console_users(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- =============================================================================
-- PROJECTS (Each project = OTP app with isolated keys)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES otp_organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- Environment (test projects cannot send real OTPs)
    environment VARCHAR(20) DEFAULT 'test', -- test | live
    -- WhatsApp configuration
    whatsapp_mode VARCHAR(20) DEFAULT 'platform', -- platform | customer
    whatsapp_phone_number_id VARCHAR(50), -- For customer mode
    -- Webhook configuration
    webhook_url TEXT,
    webhook_secret VARCHAR(64),
    webhook_events JSONB DEFAULT '["otp.delivery.delivered", "otp.delivery.failed"]',
    -- Settings
    otp_length INTEGER DEFAULT 6,
    otp_ttl_seconds INTEGER DEFAULT 300,
    max_verify_attempts INTEGER DEFAULT 5,
    resend_cooldown_seconds INTEGER DEFAULT 60,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- API KEYS - Add project_id and environment
-- =============================================================================
-- Note: Run this only if otp_api_keys exists
DO $$ 
BEGIN
    -- Add project_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'otp_api_keys' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE otp_api_keys ADD COLUMN project_id UUID REFERENCES otp_projects(id) ON DELETE CASCADE;
    END IF;
    
    -- Add environment if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'otp_api_keys' AND column_name = 'environment'
    ) THEN
        ALTER TABLE otp_api_keys ADD COLUMN environment VARCHAR(20) DEFAULT 'test';
    END IF;
END $$;

-- =============================================================================
-- CONSOLE SESSIONS (for JWT refresh tokens)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_console_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES otp_console_users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(64) NOT NULL,
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CONSOLE AUDIT LOGS (for compliance and security)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_console_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES otp_console_users(id),
    org_id UUID REFERENCES otp_organizations(id),
    -- Action details
    action VARCHAR(50) NOT NULL, -- login, logout, create_project, create_key, revoke_key, etc.
    resource_type VARCHAR(50), -- project, api_key, webhook, settings
    resource_id UUID,
    -- Request context
    ip_address INET,
    user_agent TEXT,
    -- Result
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AUTH RATE LIMITS (prevents credential stuffing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS otp_auth_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL, -- 'ip:192.168.1.1:login' or 'email:user@example.com:login'
    window_start TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_console_users_email ON otp_console_users(email);
CREATE INDEX IF NOT EXISTS idx_console_users_verification ON otp_console_users(verification_token) WHERE is_email_verified = FALSE;
CREATE INDEX IF NOT EXISTS idx_console_users_reset ON otp_console_users(reset_token) WHERE reset_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_owner ON otp_organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON otp_organizations(slug);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON otp_org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON otp_org_members(org_id);

CREATE INDEX IF NOT EXISTS idx_projects_org ON otp_projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_env ON otp_projects(environment);

CREATE INDEX IF NOT EXISTS idx_api_keys_project ON otp_api_keys(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_env ON otp_api_keys(environment);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON otp_console_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON otp_console_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON otp_console_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_user ON otp_console_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON otp_console_audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON otp_console_audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits ON otp_auth_rate_limits(key, window_start);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE otp_console_users IS 'Developer console users (isolated from main app users)';
COMMENT ON TABLE otp_organizations IS 'Multi-tenant organizations for console';
COMMENT ON TABLE otp_org_members IS 'Organization membership with RBAC roles';
COMMENT ON TABLE otp_projects IS 'OTP projects with isolated configuration';
COMMENT ON TABLE otp_console_sessions IS 'JWT refresh token sessions';
COMMENT ON TABLE otp_console_audit_logs IS 'Security and compliance audit trail';
COMMENT ON TABLE otp_auth_rate_limits IS 'Rate limiting for auth endpoints';

COMMENT ON COLUMN otp_projects.environment IS 'test = sandbox mode, live = real delivery';
COMMENT ON COLUMN otp_api_keys.environment IS 'test keys cannot send real OTPs';
