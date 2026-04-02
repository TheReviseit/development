-- ===================================================================
-- Migration 070: Channel Connections
-- ===================================================================
-- Multi-channel connection management for Instagram, WhatsApp, etc.
-- Each business can connect multiple accounts per channel.
--
-- ROLLBACK: DROP TABLE IF EXISTS channel_connections CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    
    -- Channel-specific identifiers
    channel_account_id TEXT NOT NULL,
    channel_display_name TEXT,
    channel_username TEXT,
    channel_profile_pic_url TEXT,
    
    -- Auth / Token (encrypted at rest via Supabase)
    access_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'user',
    
    -- Facebook hierarchy
    facebook_page_id TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_webhook_at TIMESTAMPTZ,
    
    -- Metadata
    permissions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, channel, channel_account_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_conn_user_channel 
    ON channel_connections(user_id, channel);
CREATE INDEX IF NOT EXISTS idx_channel_conn_account 
    ON channel_connections(channel_account_id);
CREATE INDEX IF NOT EXISTS idx_channel_conn_page 
    ON channel_connections(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_channel_conn_active 
    ON channel_connections(is_active) WHERE is_active = TRUE;
