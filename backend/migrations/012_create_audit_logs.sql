-- Migration: Create audit logs table for compliance
-- ==================================================
-- Date: 2026-02-14
-- Description: Immutable audit trail for all pricing and payment events (SOC 2, GDPR)

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id 
ON audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type 
ON audit_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp 
ON audit_logs(timestamp);

-- Prevent updates and deletes (append-only for compliance)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

-- Create triggers to prevent modifications
DROP TRIGGER IF EXISTS audit_log_immutable_update ON audit_logs;
CREATE TRIGGER audit_log_immutable_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS audit_log_immutable_delete ON audit_logs;
CREATE TRIGGER audit_log_immutable_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
