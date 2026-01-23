-- =============================================================================
-- Migration: 011_webhook_idempotency_fix.sql
-- Description: Fix duplicate payment insert issue with enhanced idempotency
-- 
-- This migration adds:
-- 1. Proper UNIQUE constraint on payment_history.razorpay_payment_id
-- 2. Index on webhook_events.payment_id for fast payment-level deduplication
-- 3. Composite index for concurrent request handling
-- =============================================================================

-- Ensure UNIQUE constraint exists on razorpay_payment_id
-- This is critical for upsert to work correctly
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'payment_history_razorpay_payment_id_key'
    ) THEN
        ALTER TABLE payment_history 
        ADD CONSTRAINT payment_history_razorpay_payment_id_key 
        UNIQUE (razorpay_payment_id);
    END IF;
END $$;

-- Add index on webhook_events.payment_id for payment-level deduplication queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_id 
ON webhook_events(payment_id) 
WHERE payment_id IS NOT NULL;

-- Add composite index for finding events by subscription + type
-- Useful for event ordering queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_sub_type 
ON webhook_events(subscription_id, event_type, created_at DESC)
WHERE subscription_id IS NOT NULL;

-- Add index on payment_history for user + created_at queries
CREATE INDEX IF NOT EXISTS idx_payment_history_user_created 
ON payment_history(user_id, created_at DESC);

-- Add index on payment_history status for filtering
CREATE INDEX IF NOT EXISTS idx_payment_history_status 
ON payment_history(status);

-- =============================================================================
-- Create webhook_event_locks table for atomic event processing
-- This provides database-level locking for concurrent webhook requests
-- =============================================================================
CREATE TABLE IF NOT EXISTS webhook_event_locks (
    event_id TEXT PRIMARY KEY,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by TEXT,  -- request_id that acquired the lock
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- Index for cleaning up expired locks
CREATE INDEX IF NOT EXISTS idx_webhook_event_locks_expires 
ON webhook_event_locks(expires_at);

-- Function to acquire event lock (returns true if acquired, false if already locked)
CREATE OR REPLACE FUNCTION acquire_webhook_event_lock(
    p_event_id TEXT,
    p_request_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_acquired BOOLEAN;
BEGIN
    -- Try to insert lock, ignore if already exists
    INSERT INTO webhook_event_locks (event_id, locked_by)
    VALUES (p_event_id, p_request_id)
    ON CONFLICT (event_id) DO NOTHING;
    
    -- Check if we acquired the lock
    SELECT locked_by = p_request_id INTO v_acquired
    FROM webhook_event_locks
    WHERE event_id = p_event_id;
    
    RETURN COALESCE(v_acquired, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Function to release event lock
CREATE OR REPLACE FUNCTION release_webhook_event_lock(
    p_event_id TEXT,
    p_request_id TEXT
) RETURNS VOID AS $$
BEGIN
    DELETE FROM webhook_event_locks
    WHERE event_id = p_event_id AND locked_by = p_request_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired locks (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_webhook_locks() RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM webhook_event_locks WHERE expires_at < NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Create stored procedure for atomic payment upsert
-- This provides database-level atomicity for payment recording
-- =============================================================================
CREATE OR REPLACE FUNCTION upsert_payment_history(
    p_user_id TEXT,
    p_razorpay_payment_id TEXT,
    p_amount INTEGER,
    p_currency TEXT DEFAULT 'INR',
    p_status TEXT DEFAULT 'captured',
    p_payment_method TEXT DEFAULT NULL,
    p_subscription_id UUID DEFAULT NULL,
    p_razorpay_order_id TEXT DEFAULT NULL,
    p_razorpay_signature TEXT DEFAULT NULL,
    p_error_code TEXT DEFAULT NULL,
    p_error_description TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    is_new BOOLEAN,
    payment_id UUID
) AS $$
DECLARE
    v_payment_id UUID;
    v_is_new BOOLEAN;
BEGIN
    -- Attempt insert, update on conflict
    INSERT INTO payment_history (
        user_id,
        razorpay_payment_id,
        amount,
        currency,
        status,
        payment_method,
        subscription_id,
        razorpay_order_id,
        razorpay_signature,
        error_code,
        error_description
    ) VALUES (
        p_user_id::UUID,
        p_razorpay_payment_id,
        p_amount,
        p_currency,
        p_status,
        p_payment_method,
        p_subscription_id,
        p_razorpay_order_id,
        p_razorpay_signature,
        p_error_code,
        p_error_description
    )
    ON CONFLICT (razorpay_payment_id) DO UPDATE SET
        status = CASE 
            WHEN payment_history.status = 'failed' AND EXCLUDED.status = 'captured' 
            THEN EXCLUDED.status 
            ELSE payment_history.status 
        END,
        -- Update other fields only if they were NULL before
        payment_method = COALESCE(payment_history.payment_method, EXCLUDED.payment_method),
        razorpay_order_id = COALESCE(payment_history.razorpay_order_id, EXCLUDED.razorpay_order_id),
        razorpay_signature = COALESCE(payment_history.razorpay_signature, EXCLUDED.razorpay_signature)
    RETURNING id, (xmax = 0) INTO v_payment_id, v_is_new;
    
    RETURN QUERY SELECT TRUE, v_is_new, v_payment_id;
    
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Add RLS policy for webhook_event_locks (service role only)
-- =============================================================================
ALTER TABLE webhook_event_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_event_locks_service_policy ON webhook_event_locks
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE webhook_event_locks IS 
'Provides database-level locking for concurrent webhook event processing';

COMMENT ON FUNCTION upsert_payment_history IS 
'Atomically inserts or updates payment_history, returns (success, is_new, payment_id)';

COMMENT ON FUNCTION acquire_webhook_event_lock IS 
'Acquires a lock for webhook event processing. Returns TRUE if lock acquired.';
