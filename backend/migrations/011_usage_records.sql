-- =============================================================================
-- Migration: 011_usage_records.sql
-- Description: Usage tracking table for entitlement enforcement
-- =============================================================================

-- Usage tracking table for soft caps and billing
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    resource_type TEXT NOT NULL, -- 'otp_send', 'api_call', etc.
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint for upsert
    UNIQUE(org_id, resource_type, period_start)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_records_org_id ON usage_records(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_records_resource_type ON usage_records(resource_type);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_usage_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_usage_records_updated_at ON usage_records;
CREATE TRIGGER trigger_usage_records_updated_at
    BEFORE UPDATE ON usage_records
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_records_updated_at();

-- RLS Policies
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for backend operations)
CREATE POLICY usage_records_service_policy ON usage_records
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- Atomic increment function for usage tracking
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_usage(
    p_org_id UUID,
    p_resource_type TEXT,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ,
    p_amount INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    -- Upsert with atomic increment
    INSERT INTO usage_records (org_id, resource_type, period_start, period_end, count)
    VALUES (p_org_id, p_resource_type, p_period_start, p_period_end, p_amount)
    ON CONFLICT (org_id, resource_type, period_start)
    DO UPDATE SET 
        count = usage_records.count + p_amount,
        updated_at = NOW()
    RETURNING count INTO new_count;
    
    RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Add org_id to subscriptions if not exists (for multi-tenant support)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'org_id'
    ) THEN
        ALTER TABLE subscriptions ADD COLUMN org_id UUID;
        CREATE INDEX idx_subscriptions_org_id ON subscriptions(org_id);
    END IF;
END $$;
