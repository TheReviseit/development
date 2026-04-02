-- ===================================================================
-- Migration 078: Outbox Events (FAANG Fix #6)
-- ===================================================================
-- Transactional outbox pattern for crash-safe message delivery.
-- Message + outbox event written in same transaction.
-- Worker polls outbox → dispatches → marks completed.
--
-- ROLLBACK: DROP TABLE IF EXISTS outbox_events CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    channel TEXT NOT NULL,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient polling (pending + failed with retry due)
CREATE INDEX IF NOT EXISTS idx_outbox_pending 
    ON outbox_events(status, created_at) 
    WHERE status IN ('pending', 'failed');

-- Index for dead letter monitoring
CREATE INDEX IF NOT EXISTS idx_outbox_dead_letter 
    ON outbox_events(status) 
    WHERE status = 'dead_letter';

-- Index for cleanup of old completed events
CREATE INDEX IF NOT EXISTS idx_outbox_completed_cleanup 
    ON outbox_events(created_at) 
    WHERE status = 'completed';
