-- ===================================================================
-- Migration 20260619010000: Billing Outbox + Dead Letter Queue
-- ===================================================================
-- Safe to re-run: all CREATE statements use IF NOT EXISTS or
-- exception blocks to handle prior partial runs gracefully.
-- ===================================================================

-- =============================================================================
-- 1. Types (safe re-run via DO block)
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE billing_outbox_status AS ENUM (
        'pending', 'processing', 'completed', 'failed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE webhook_dlq_status AS ENUM (
        'new', 'reviewing', 'replaying', 'resolved', 'dismissed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. Billing Outbox Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS billing_outbox (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            TEXT NOT NULL,
    event_type          TEXT NOT NULL,
    razorpay_subscription_id TEXT,
    razorpay_payment_id TEXT,
    subscription_id     UUID,
    user_id             UUID,
    product_domain      TEXT,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              billing_outbox_status NOT NULL DEFAULT 'pending',
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 3,
    last_error          TEXT,
    locked_until        TIMESTAMPTZ,
    locked_by           TEXT,
    scheduled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_billing_outbox_event UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_outbox_pending
    ON billing_outbox (scheduled_at, status)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_billing_outbox_locked
    ON billing_outbox (locked_until)
    WHERE locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_outbox_created
    ON billing_outbox (created_at DESC);

-- =============================================================================
-- 3. Webhook Dead Letter Queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS webhook_dlq (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            TEXT,
    event_type          TEXT NOT NULL,
    razorpay_subscription_id TEXT,
    razorpay_payment_id TEXT,
    raw_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message       TEXT NOT NULL,
    error_detail        TEXT,
    source              TEXT NOT NULL DEFAULT 'webhook_processor'
        CHECK (source IN ('webhook_processor', 'outbox_worker', 'reconciliation_engine')),
    status              webhook_dlq_status NOT NULL DEFAULT 'new',
    retry_count         INTEGER NOT NULL DEFAULT 0,
    outbox_id           UUID,
    reviewed_by         TEXT,
    reviewed_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_dlq_status
    ON webhook_dlq (status, created_at DESC)
    WHERE status IN ('new', 'reviewing', 'replaying');

CREATE INDEX IF NOT EXISTS idx_webhook_dlq_event
    ON webhook_dlq (event_id)
    WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_dlq_created
    ON webhook_dlq (created_at DESC);

-- =============================================================================
-- 4. Function: Dequeue next pending outbox row (SKIP LOCKED)
-- =============================================================================
CREATE OR REPLACE FUNCTION dequeue_billing_outbox(
    worker_id TEXT, batch_size INTEGER DEFAULT 10, lock_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
    id UUID, event_id TEXT, event_type TEXT,
    razorpay_subscription_id TEXT, razorpay_payment_id TEXT,
    subscription_id UUID, user_id UUID, product_domain TEXT,
    payload JSONB, retry_count INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    UPDATE billing_outbox
    SET status = 'processing',
        locked_until = NOW() + (lock_seconds || ' seconds')::INTERVAL,
        locked_by = worker_id, updated_at = NOW()
    WHERE id IN (
        SELECT id FROM billing_outbox
        WHERE status = 'pending' AND scheduled_at <= NOW()
          AND (locked_until IS NULL OR locked_until < NOW())
        ORDER BY scheduled_at LIMIT batch_size FOR UPDATE SKIP LOCKED
    )
    RETURNING billing_outbox.id, billing_outbox.event_id, billing_outbox.event_type,
        billing_outbox.razorpay_subscription_id, billing_outbox.razorpay_payment_id,
        billing_outbox.subscription_id, billing_outbox.user_id, billing_outbox.product_domain,
        billing_outbox.payload, billing_outbox.retry_count;
END;
$$;

-- =============================================================================
-- 5. Function: Replay a DLQ entry back to the outbox
-- =============================================================================
CREATE OR REPLACE FUNCTION replay_dlq_entry(p_dlq_id UUID)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql AS $$
DECLARE v_entry webhook_dlq%ROWTYPE;
BEGIN
    SELECT * INTO v_entry FROM webhook_dlq WHERE id = p_dlq_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'DLQ entry not found'::TEXT; RETURN;
    END IF;
    UPDATE webhook_dlq SET status = 'replaying', updated_at = NOW() WHERE id = p_dlq_id;
    INSERT INTO billing_outbox (event_id, event_type, razorpay_subscription_id,
        razorpay_payment_id, payload, status, scheduled_at)
    VALUES (v_entry.event_id, v_entry.event_type, v_entry.razorpay_subscription_id,
        v_entry.razorpay_payment_id, v_entry.raw_payload, 'pending', NOW())
    ON CONFLICT (event_id) DO NOTHING;
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- =============================================================================
-- 6. Function: Cleanup old completed outbox entries
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_billing_outbox(retention_hours INTEGER DEFAULT 72)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_deleted INTEGER;
BEGIN
    DELETE FROM billing_outbox
    WHERE status IN ('completed', 'failed')
      AND updated_at < NOW() - (retention_hours || ' hours')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;
