-- =============================================================================
-- FAANG-Grade Billing Schema
-- =============================================================================
-- Production-grade tables for transactional idempotency, outbox pattern,
-- and billing accuracy verification.
--
-- @version 1.0.0
-- @securityLevel FAANG-Production
-- =============================================================================

-- =============================================================================
-- TABLE: idempotency_records
-- =============================================================================
-- ACID idempotency for billing operations. Prevents duplicate charges.
--
-- Pattern:
-- 1. Insert with status='PROCESSING' (row-level lock)
-- 2. Execute operation
-- 3. Update status='COMPLETE' with result
-- 4. If ANY step fails, entire transaction rolls back

CREATE TABLE IF NOT EXISTS idempotency_records (
    key VARCHAR(255) PRIMARY KEY,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETE', 'FAILED')),
    result JSONB,
    error TEXT,
    user_id UUID REFERENCES auth.users(id),
    tenant_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Indexes
    CONSTRAINT valid_status CHECK (status IN ('PROCESSING', 'COMPLETE', 'FAILED'))
);

-- Indexes for performance (NOTE: Cannot use NOW() in index predicate - must be IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_idempotency_status 
    ON idempotency_records(status, created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_user 
    ON idempotency_records(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires 
    ON idempotency_records(expires_at);  -- Query with: WHERE expires_at < NOW()

-- Cleanup expired records (run via cron)
COMMENT ON TABLE idempotency_records IS 
    'ACID idempotency for billing. Prevents duplicate charges via row-level locking.';

-- =============================================================================
-- TABLE: events_outbox
-- =============================================================================
-- Guaranteed event delivery for metering and webhooks.
--
-- Pattern:
-- 1. Write event to outbox (within main transaction)
-- 2. Background processor polls and delivers
-- 3. At-least-once delivery guarantee

CREATE TABLE IF NOT EXISTS events_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50),
    aggregate_id UUID,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_event_status CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED'))
);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_outbox_pending 
    ON events_outbox(status, created_at) 
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_outbox_type 
    ON events_outbox(type, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate 
    ON events_outbox(aggregate_type, aggregate_id);

COMMENT ON TABLE events_outbox IS 
    'Outbox pattern for guaranteed event delivery. Background processor polls this table.';

-- =============================================================================
-- TABLE: billing_verification_logs
-- =============================================================================
-- Monthly billing accuracy audit trail.
-- Tracks discrepancies between metering and invoiced amounts.

CREATE TABLE IF NOT EXISTS billing_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    status VARCHAR(20) NOT NULL CHECK (status IN ('VERIFIED', 'DISCREPANCY', 'UNDER_REVIEW')),
    expected_amount INTEGER,
    actual_amount INTEGER,
    discrepancy_amount INTEGER,
    metered_usage JSONB,
    plan_details JSONB,
    verified_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_verification_tenant 
    ON billing_verification_logs(tenant_id, month);
CREATE INDEX IF NOT EXISTS idx_billing_verification_status 
    ON billing_verification_logs(status) 
    WHERE status IN ('DISCREPANCY', 'UNDER_REVIEW');

COMMENT ON TABLE billing_verification_logs IS 
    'Monthly billing accuracy audit. Flags discrepancies between metering and invoices.';

-- =============================================================================
-- TABLE: sla_incidents
-- =============================================================================
-- Tracks downtime for SLA compliance and automatic credits.

CREATE TABLE IF NOT EXISTS sla_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    severity VARCHAR(20) CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT,
    affected_services TEXT[],
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_incidents_tenant 
    ON sla_incidents(tenant_id, start_time);

COMMENT ON TABLE sla_incidents IS 
    'SLA incident tracking for automatic credit issuance.';

-- =============================================================================
-- TABLE: sla_credits
-- =============================================================================
-- Automatic credits issued for SLA violations.

CREATE TABLE IF NOT EXISTS sla_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL,
    month DATE NOT NULL,
    credit_amount INTEGER NOT NULL,
    downtime_ms INTEGER NOT NULL,
    excess_downtime_ms INTEGER,
    credit_percentage DECIMAL(5,2),
    reason VARCHAR(50) NOT NULL,
    auto_issued BOOLEAN DEFAULT TRUE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notification_sent BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sla_credits_tenant 
    ON sla_credits(tenant_id, month);

COMMENT ON TABLE sla_credits IS 
    'Automatic SLA credits issued to customers for downtime violations.';

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to clean up expired idempotency records
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency_records 
    WHERE expires_at < NOW() 
      AND status IN ('COMPLETE', 'FAILED');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get monthly downtime for SLA calculation
DROP FUNCTION IF EXISTS get_monthly_downtime(VARCHAR, DATE);

CREATE FUNCTION get_monthly_downtime(p_tenant_id VARCHAR, p_calc_month DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(duration_ms), 0)::INTEGER
    FROM sla_incidents
    WHERE tenant_id = p_tenant_id
      AND DATE_TRUNC('month', start_time) = DATE_TRUNC('month', p_calc_month);
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_credits ENABLE ROW LEVEL SECURITY;

-- Policies for service role (full access)
CREATE POLICY service_all_idempotency ON idempotency_records 
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_outbox ON events_outbox 
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_verification ON billing_verification_logs 
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_sla_incidents ON sla_incidents 
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_sla_credits ON sla_credits 
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION cleanup_expired_idempotency() IS 
    'Removes expired idempotency records. Run daily via cron job.';

COMMENT ON FUNCTION get_monthly_downtime(VARCHAR, DATE) IS 
    'Calculates total downtime for a tenant in a given month. Usage: SELECT get_monthly_downtime(tenant_id, month_date);';
