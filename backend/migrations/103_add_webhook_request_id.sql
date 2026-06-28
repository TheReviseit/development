-- ============================================================================
-- 103: Add request_id column to webhook_events (Sprint 3 — Correlation ID)
-- ============================================================================
-- Enables end-to-end tracing: frontend X-Request-Id → backend → webhook → DB.
-- The request_id is populated by webhook_processor.process_event() when the
-- calling endpoint forwards the X-Request-Id header from the original checkout
-- request.
-- ============================================================================

-- Add request_id column (nullable, populated on insert by webhook processor)
ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS request_id TEXT;

-- Index for fast lookup by correlation ID during debugging
CREATE INDEX IF NOT EXISTS idx_webhook_events_request_id
ON webhook_events(request_id);

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'webhook_events'
-- ORDER BY ordinal_position;
