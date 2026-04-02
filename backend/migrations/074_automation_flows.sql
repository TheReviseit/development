-- ===================================================================
-- Migration 074: Automation Flows (with FAANG Fix #8 — Versioning)
-- ===================================================================
-- Multi-step workflow definitions with schema versioning.
-- Running flows always use published_steps (immutable snapshot).
--
-- ROLLBACK: DROP TABLE IF EXISTS automation_flows CASCADE;
-- ===================================================================

CREATE TABLE IF NOT EXISTS automation_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    
    name TEXT NOT NULL,
    description TEXT,
    channels TEXT[] NOT NULL DEFAULT '{instagram,whatsapp}',
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Flow definition (JSON graph) — DRAFT
    steps JSONB NOT NULL,
    variables JSONB DEFAULT '{}',
    
    -- FAANG Fix #8: Schema Versioning
    version INT DEFAULT 1,
    is_draft BOOLEAN DEFAULT TRUE,
    published_version INT DEFAULT 0,
    published_steps JSONB,          -- Immutable snapshot of published flow
    schema_version TEXT DEFAULT '1.0',
    
    -- Stats
    total_runs INT DEFAULT 0,
    completed_runs INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_flows_user 
    ON automation_flows(user_id, is_active);
