-- ===================================================================
-- Migration 076: Token Lifecycle Events
-- ===================================================================
-- Audit trail for OAuth token operations.
--
-- ROLLBACK: DROP TABLE IF EXISTS token_lifecycle_events CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS token_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_connection_id UUID REFERENCES channel_connections(id),
    event_type TEXT NOT NULL,
    old_expires_at TIMESTAMPTZ,
    new_expires_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_lifecycle_conn 
    ON token_lifecycle_events(channel_connection_id, created_at DESC);
