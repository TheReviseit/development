-- ============================================================
-- Voice Agents foundation: Retell custom LLM sidecar persistence
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Maps Retell agent ids to Flowauxi tenants. Calls may also pass tenant
-- metadata directly, but this table lets production avoid trusting caller data.
CREATE TABLE IF NOT EXISTS voice_agent_tenant_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    retell_agent_id TEXT NOT NULL,
    firebase_uid TEXT,
    user_id TEXT,
    business_id TEXT,
    product_domain TEXT NOT NULL DEFAULT 'voice',
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    languages JSONB NOT NULL DEFAULT '["en"]'::JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (retell_agent_id)
);

CREATE TABLE IF NOT EXISTS voice_call_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    retell_call_id TEXT,
    user_id TEXT,
    firebase_uid TEXT,
    business_id TEXT,
    product_domain TEXT NOT NULL DEFAULT 'voice',
    caller_phone TEXT,
    caller_phone_normalized TEXT,
    language TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, call_id)
);

CREATE TABLE IF NOT EXISTS voice_turn_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    response_id TEXT,
    turn_id TEXT,
    speaker TEXT NOT NULL DEFAULT 'caller',
    language TEXT NOT NULL DEFAULT 'en',
    transcript TEXT,
    response_text TEXT,
    source TEXT,
    latency_ms INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_cost_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    metric TEXT NOT NULL,
    quantity NUMERIC(12, 4) NOT NULL,
    unit TEXT NOT NULL,
    estimated_cost_usd NUMERIC(12, 6),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_agent_mappings_tenant
    ON voice_agent_tenant_mappings (tenant_id, is_enabled);

CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_tenant_started
    ON voice_call_sessions (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_caller
    ON voice_call_sessions (tenant_id, caller_phone_normalized);

CREATE INDEX IF NOT EXISTS idx_voice_turn_events_call
    ON voice_turn_events (tenant_id, call_id, created_at);

CREATE INDEX IF NOT EXISTS idx_voice_turn_events_source
    ON voice_turn_events (tenant_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_cost_events_tenant_created
    ON voice_cost_events (tenant_id, created_at DESC);

ALTER TABLE voice_agent_tenant_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_turn_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_cost_events ENABLE ROW LEVEL SECURITY;

-- Service-role backend code performs explicit tenant filtering and bypasses RLS.
-- These deny-by-default policies prevent accidental client exposure.
DROP POLICY IF EXISTS voice_agent_tenant_mappings_no_client_access ON voice_agent_tenant_mappings;
CREATE POLICY voice_agent_tenant_mappings_no_client_access
    ON voice_agent_tenant_mappings
    FOR ALL
    USING (FALSE)
    WITH CHECK (FALSE);

DROP POLICY IF EXISTS voice_call_sessions_no_client_access ON voice_call_sessions;
CREATE POLICY voice_call_sessions_no_client_access
    ON voice_call_sessions
    FOR ALL
    USING (FALSE)
    WITH CHECK (FALSE);

DROP POLICY IF EXISTS voice_turn_events_no_client_access ON voice_turn_events;
CREATE POLICY voice_turn_events_no_client_access
    ON voice_turn_events
    FOR ALL
    USING (FALSE)
    WITH CHECK (FALSE);

DROP POLICY IF EXISTS voice_cost_events_no_client_access ON voice_cost_events;
CREATE POLICY voice_cost_events_no_client_access
    ON voice_cost_events
    FOR ALL
    USING (FALSE)
    WITH CHECK (FALSE);

