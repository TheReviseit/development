-- ===================================================================
-- Migration 071: Unified Messages
-- ===================================================================
-- Cross-channel message store with idempotency and full metadata.
--
-- ROLLBACK: DROP TABLE IF EXISTS unified_messages CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS unified_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    channel_connection_id UUID REFERENCES channel_connections(id),
    
    -- Message identity
    channel_message_id TEXT NOT NULL,
    conversation_id UUID,
    thread_id TEXT,
    
    -- Direction
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    
    -- Participants
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    recipient_id TEXT NOT NULL,
    recipient_name TEXT,
    
    -- Content
    message_type TEXT NOT NULL,
    message_body TEXT,
    media_url TEXT,
    media_type TEXT,
    media_id TEXT,
    
    -- Instagram-specific
    story_id TEXT,
    reel_id TEXT,
    referral_source TEXT,
    
    -- Status
    status TEXT DEFAULT 'received',
    error_message TEXT,
    
    -- AI/Automation
    is_automated BOOLEAN DEFAULT FALSE,
    automation_rule_id UUID,
    ai_model_used TEXT,
    ai_confidence FLOAT,
    
    -- Timestamps
    platform_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Idempotency (FAANG Fix #1 — DB layer guarantee)
    UNIQUE(channel, channel_message_id)
);

CREATE INDEX IF NOT EXISTS idx_unified_msgs_user_channel 
    ON unified_messages(user_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_msgs_conversation 
    ON unified_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_unified_msgs_sender 
    ON unified_messages(user_id, sender_id, channel);
CREATE INDEX IF NOT EXISTS idx_unified_msgs_thread 
    ON unified_messages(thread_id, created_at ASC);
