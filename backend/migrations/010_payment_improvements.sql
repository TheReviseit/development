-- =============================================================================
-- Migration: 010_payment_improvements.sql
-- Description: Enterprise-grade payment security improvements
-- - UNIQUE constraints for idempotency and webhook deduplication
-- - Updated status enum with proper state machine
-- - Webhook events table
-- - Payment attempts logging
-- =============================================================================

-- Add idempotency_key column with UNIQUE constraint
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- Add last_webhook_event_at for event ordering safety
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ;

-- Update status check constraint with new states
ALTER TABLE subscriptions 
DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions 
ADD CONSTRAINT subscriptions_status_check 
CHECK (status IN ('created', 'pending', 'processing', 'completed', 'active', 'failed', 'cancelled', 'expired', 'halted', 'paused'));

-- Create webhook_events table for deduplication
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,  -- UNIQUE constraint prevents duplicate processing
    event_type TEXT NOT NULL,
    subscription_id TEXT,
    payment_id TEXT,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL,  -- When Razorpay created the event
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    processing_result TEXT CHECK (processing_result IN ('processed', 'ignored_duplicate', 'ignored_ordering', 'failed'))
);

-- Index for fast duplicate checks
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_subscription_id ON webhook_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);

-- Create payment_attempts table for audit trail
CREATE TABLE IF NOT EXISTS payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    request_id TEXT NOT NULL,  -- Correlates with frontend x-request-id
    plan_name TEXT NOT NULL,
    idempotency_key TEXT,
    status TEXT NOT NULL CHECK (status IN ('initiated', 'checkout_opened', 'payment_completed', 'verification_started', 'verification_completed', 'failed')),
    razorpay_subscription_id TEXT,
    razorpay_payment_id TEXT,
    error_message TEXT,
    client_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payment attempts
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_id ON payment_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_request_id ON payment_attempts(request_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_idempotency_key ON payment_attempts(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_created_at ON payment_attempts(created_at);

-- Trigger for payment_attempts updated_at
CREATE OR REPLACE FUNCTION update_payment_attempts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_attempts_updated_at ON payment_attempts;
CREATE TRIGGER trigger_payment_attempts_updated_at
    BEFORE UPDATE ON payment_attempts
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_attempts_updated_at();

-- RLS policies for new tables
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;

-- Service role can access webhook_events (backend only)
CREATE POLICY webhook_events_service_policy ON webhook_events
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can view their own payment attempts
CREATE POLICY payment_attempts_select_policy ON payment_attempts
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything for payment_attempts
CREATE POLICY payment_attempts_service_policy ON payment_attempts
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Optional: Ensure only one active subscription per user
-- Uncomment if you want to enforce this at DB level
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user 
--     ON subscriptions(user_id) 
--     WHERE status IN ('active', 'completed');

-- Add index on subscriptions.idempotency_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_idempotency_key ON subscriptions(idempotency_key);
