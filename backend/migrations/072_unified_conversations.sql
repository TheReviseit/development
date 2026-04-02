-- ===================================================================
-- Migration 072: Unified Conversations
-- ===================================================================
-- Cross-channel conversation tracking with automation state.
--
-- ROLLBACK: DROP TABLE IF EXISTS unified_conversations CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS unified_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    channel_connection_id UUID REFERENCES channel_connections(id),
    
    -- Contact
    contact_platform_id TEXT NOT NULL,
    contact_name TEXT,
    contact_username TEXT,
    contact_profile_pic TEXT,
    
    -- Thread
    thread_id TEXT,
    
    -- State
    status TEXT DEFAULT 'active',
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    unread_count INT DEFAULT 0,
    is_starred BOOLEAN DEFAULT FALSE,
    
    -- Labels/Tags
    labels JSONB DEFAULT '[]',
    
    -- Automation state
    automation_active BOOLEAN DEFAULT TRUE,
    current_flow_id UUID,
    flow_state JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, channel, contact_platform_id)
);

CREATE INDEX IF NOT EXISTS idx_unified_convos_user 
    ON unified_conversations(user_id, channel, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_convos_contact 
    ON unified_conversations(contact_platform_id, channel);
