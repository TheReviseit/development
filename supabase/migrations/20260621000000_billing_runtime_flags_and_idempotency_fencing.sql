-- Billing runtime flags, audit trail, idempotency fencing columns, admin RPC

-- =============================================================================
-- billing_runtime_flags
-- =============================================================================
CREATE TABLE IF NOT EXISTS billing_runtime_flags (
    flag_key    TEXT PRIMARY KEY,
    flag_value  JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS billing_runtime_flags_audit (
    id            BIGSERIAL PRIMARY KEY,
    flag_key      TEXT NOT NULL,
    old_value     JSONB,
    new_value     JSONB NOT NULL,
    changed_by    TEXT NOT NULL,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_reason TEXT
);

INSERT INTO billing_runtime_flags (flag_key, flag_value) VALUES
  ('fix_domain_context', 'true'),
  ('billing_behavior_pinning', 'true'),
  ('fix_webhook_lock_contention', 'true'),
  ('fix_auth_check_revoked', 'true'),
  ('fix_409_recovery', 'true'),
  ('fix_checkout_user_id', 'true'),
  ('fix_server_idempotency', 'true'),
  ('webhook_dlq_on_exhausted', 'true'),
  ('canary_percent', '0'),
  ('billing_timeout_ms', '20000'),
  ('cb_threshold', '10'),
  ('cb_count_timeout_as_failure', 'false'),
  ('idempotency_reclaim_ttl_seconds', '90')
ON CONFLICT (flag_key) DO NOTHING;

ALTER TABLE billing_runtime_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_runtime_flags_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_read_billing_flags ON billing_runtime_flags;
CREATE POLICY service_read_billing_flags ON billing_runtime_flags
    FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS deny_client_write_billing_flags ON billing_runtime_flags;
CREATE POLICY deny_client_write_billing_flags ON billing_runtime_flags
    FOR ALL TO authenticated, anon USING (false);

DROP POLICY IF EXISTS service_read_billing_flags_audit ON billing_runtime_flags_audit;
CREATE POLICY service_read_billing_flags_audit ON billing_runtime_flags_audit
    FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS deny_client_write_billing_flags_audit ON billing_runtime_flags_audit;
CREATE POLICY deny_client_write_billing_flags_audit ON billing_runtime_flags_audit
    FOR ALL TO authenticated, anon USING (false);

-- Audit trigger
CREATE OR REPLACE FUNCTION audit_billing_runtime_flags()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO billing_runtime_flags_audit (
        flag_key, old_value, new_value, changed_by, change_reason
    ) VALUES (
        NEW.flag_key,
        OLD.flag_value,
        NEW.flag_value,
        NEW.updated_by,
        NULLIF(current_setting('app.change_reason', true), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_billing_runtime_flags ON billing_runtime_flags;
CREATE TRIGGER trg_audit_billing_runtime_flags
    AFTER UPDATE ON billing_runtime_flags
    FOR EACH ROW EXECUTE FUNCTION audit_billing_runtime_flags();

-- Admin RPC — writes only through this path in normal ops
CREATE OR REPLACE FUNCTION update_billing_runtime_flag(
    p_key TEXT,
    p_value JSONB,
    p_reason TEXT,
    p_actor TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'change_reason required (min 5 chars)';
    END IF;
    PERFORM set_config('app.change_reason', p_reason, true);
    UPDATE billing_runtime_flags
    SET flag_value = p_value,
        updated_at = NOW(),
        updated_by = p_actor
    WHERE flag_key = p_key;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown flag_key: %', p_key;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_billing_runtime_flag(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_billing_runtime_flag(TEXT, JSONB, TEXT, TEXT) TO service_role;

-- =============================================================================
-- Idempotency fencing columns
-- =============================================================================
ALTER TABLE idempotency_records
    ADD COLUMN IF NOT EXISTS claim_token UUID,
    ADD COLUMN IF NOT EXISTS reclaim_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_idempotency_processing_updated
    ON idempotency_records (key, updated_at)
    WHERE status = 'PROCESSING';

-- webhook_events retry_count if missing
ALTER TABLE webhook_events
    ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- In-flight checkout unique constraint (Phase 3 — CONCURRENTLY not supported in transaction)
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkout_inflight
    ON checkout_requests (user_id, domain)
    WHERE status IN ('initiated', 'processing');

ALTER TABLE checkout_requests
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON TABLE billing_runtime_flags IS
    'Runtime feature flags for billing remediation. Writes via update_billing_runtime_flag RPC only.';
