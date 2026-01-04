-- =============================================================================
-- Order Booking Robustness Migration
-- Adds idempotency keys, fingerprints, and optimistic locking support
-- =============================================================================

-- 1. Idempotency Keys Table
-- Prevents duplicate operations from AI retries, network retries, user re-confirmation
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed
    result_id TEXT,
    result_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Composite unique constraint for key + operation
    CONSTRAINT idempotency_keys_unique UNIQUE (key, operation)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_idempotency_key_operation ON idempotency_keys(key, operation);

-- Index for cleanup of expired keys
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at) WHERE status != 'completed';

-- 2. Add columns to orders table
-- Add fingerprint for duplicate detection (within time windows)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- Add idempotency_key reference
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Add version for optimistic locking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Index for fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_orders_fingerprint ON orders(user_id, fingerprint);

-- Index for idempotency key lookups
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 3. Add source column if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- 4. Function to automatically cleanup expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency_keys 
    WHERE expires_at < NOW() 
    AND status != 'pending';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 5. Enable Row Level Security on orders table (if not already)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own orders
DROP POLICY IF EXISTS orders_isolation_policy ON orders;
CREATE POLICY orders_isolation_policy ON orders
    FOR ALL
    USING (user_id = auth.uid()::text OR user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- 6. Add sheets sync columns to ai_capabilities (for Google Sheets integration)
ALTER TABLE ai_capabilities ADD COLUMN IF NOT EXISTS sheets_sync_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_capabilities ADD COLUMN IF NOT EXISTS sheets_spreadsheet_id TEXT;
ALTER TABLE ai_capabilities ADD COLUMN IF NOT EXISTS sheets_sheet_name TEXT DEFAULT 'Orders';
ALTER TABLE ai_capabilities ADD COLUMN IF NOT EXISTS sheets_credentials JSONB;

-- 7. Add order_booking_enabled column if not exists
ALTER TABLE ai_capabilities ADD COLUMN IF NOT EXISTS order_booking_enabled BOOLEAN DEFAULT FALSE;

-- 8. Analytics columns for order tracking
ALTER TABLE analytics_daily ADD COLUMN IF NOT EXISTS orders_created INTEGER DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN IF NOT EXISTS orders_completed INTEGER DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN IF NOT EXISTS orders_cancelled INTEGER DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN IF NOT EXISTS ai_orders INTEGER DEFAULT 0;

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE idempotency_keys IS 'Stores idempotency keys to prevent duplicate operations from retries';
COMMENT ON COLUMN orders.fingerprint IS 'Hash of order details for duplicate detection within time windows';
COMMENT ON COLUMN orders.version IS 'Optimistic locking version - increment on each update';
COMMENT ON COLUMN orders.source IS 'Order creation source: manual, ai, api, webhook';

