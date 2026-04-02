-- ===================================================================
-- Migration 077: Idempotency Keys (FAANG Fix #1)
-- ===================================================================
-- Three-layer idempotency: Redis SETNX → DB constraint → state machine.
-- DB layer is the final guarantee when Redis is unavailable.
--
-- ROLLBACK: DROP TABLE IF EXISTS idempotency_keys CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'failed')),
    context TEXT,                    -- Debug context
    error TEXT,                      -- Error message if failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_idem_created 
    ON idempotency_keys(created_at);
CREATE INDEX IF NOT EXISTS idx_idem_status 
    ON idempotency_keys(status) WHERE status = 'processing';
