-- ===================================================================
-- Migration 073: Automation Rules
-- ===================================================================
-- Cross-channel automation rules with priority and conditions.
--
-- ROLLBACK: DROP TABLE IF EXISTS automation_rules CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    
    name TEXT NOT NULL,
    description TEXT,
    channels TEXT[] NOT NULL DEFAULT '{instagram,whatsapp}',
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    
    -- Trigger
    trigger_type TEXT NOT NULL,
    trigger_config JSONB NOT NULL,
    
    -- Action
    action_type TEXT NOT NULL,
    action_config JSONB NOT NULL,
    
    -- Conditions
    conditions JSONB DEFAULT '[]',
    
    -- Stats
    trigger_count INT DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_rules_user 
    ON automation_rules(user_id, is_active, priority DESC);
