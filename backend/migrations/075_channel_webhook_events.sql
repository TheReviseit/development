-- ===================================================================
-- Migration 075: Channel Webhook Events (with FAANG Fix #7)
-- ===================================================================
-- Cross-channel replay protection with time-based validation.
--
-- ROLLBACK: DROP TABLE IF EXISTS channel_webhook_events CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS channel_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    channel TEXT NOT NULL,
    event_type TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    processing_result TEXT,
    processing_time_ms FLOAT,
    
    -- FAANG Fix #7: Time-based replay protection
    event_timestamp TIMESTAMPTZ,     -- Meta's timestamp from webhook
    received_at TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_webhooks_event 
    ON channel_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_channel_webhooks_created 
    ON channel_webhook_events(created_at DESC);

-- Auto-cleanup: remove events older than 7 days
-- (handled by Celery Beat task)
