-- ===================================================================
-- Migration 20260619000000: Subscription Events (Event Sourcing)
-- ===================================================================
-- Immutable, append-only event log for all subscription state changes.
-- This is the source of truth; subscriptions.status becomes a
-- denormalized projection maintained by subscription_projection_worker.
--
-- Partitioning: RANGE on created_at with monthly partitions.
-- No generated columns — avoids PostgreSQL's immutability requirement.
--
-- To apply: Paste into Supabase Dashboard > SQL Editor, run ONCE.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS subscription_events CASCADE;
--   DROP TABLE IF EXISTS projection_checkpoints CASCADE;
--   DROP TYPE IF EXISTS subscription_event_type CASCADE;
--   DROP FUNCTION IF EXISTS create_subscription_events_partition(TEXT);
--   DROP FUNCTION IF EXISTS create_next_month_partition();
--   DROP FUNCTION IF EXISTS drop_old_partitions();
--   DROP FUNCTION IF EXISTS update_projection_lag();
-- ===================================================================

-- =============================================================================
-- 0. Self-healing: drop non-partitioned table from previous failed runs
-- =============================================================================
DO $$
DECLARE
    v_relkind TEXT;
BEGIN
    SELECT relkind INTO v_relkind
    FROM pg_class
    WHERE relname = 'subscription_events'
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

    IF v_relkind IS NOT NULL AND v_relkind <> 'p' THEN
        DROP TABLE IF EXISTS subscription_events CASCADE;
        DROP TABLE IF EXISTS subscription_events_default CASCADE;
        PERFORM drop_old_partitions();
    END IF;
END;
$$;

-- =============================================================================
-- 1. Event type enum
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_event_type') THEN
        CREATE TYPE subscription_event_type AS ENUM (
            'subscription.created',
            'subscription.activated',
            'subscription.payment_failed',
            'subscription.past_due',
            'subscription.grace_period_started',
            'subscription.grace_period_expired',
            'subscription.suspended',
            'subscription.cancelled',
            'subscription.reactivated',
            'subscription.expired',
            'subscription.halted',
            'subscription.resumed',
            'subscription.upgraded',
            'subscription.downgraded',
            'subscription.renewed',
            'subscription.reconciled'
        );
    END IF;
END;
$$;

-- =============================================================================
-- 2. Main event table — RANGE partitioned by created_at
-- =============================================================================
-- The PRIMARY KEY must include the partition key (created_at).
-- id alone is unique within a partition via BIGSERIAL; the combo
-- (id, created_at) is globally unique.
CREATE TABLE IF NOT EXISTS subscription_events (
    id              BIGSERIAL,
    subscription_id UUID            NOT NULL,
    user_id         UUID            NOT NULL,
    product_domain  TEXT            NOT NULL,
    event_type      subscription_event_type NOT NULL,
    previous_status TEXT,
    new_status      TEXT            NOT NULL,
    reason          TEXT            DEFAULT '',
    triggered_by    TEXT            NOT NULL DEFAULT 'system',
    actor           TEXT            NOT NULL DEFAULT 'system',
    payload         JSONB           DEFAULT '{}'::jsonb,
    idempotency_key TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- =============================================================================
-- 3. Partition helper function
-- =============================================================================
-- Creates a monthly partition with proper bounds and indexes.
-- Uses the first day of the given month as lower bound and
-- first day of the next month as upper bound.

CREATE OR REPLACE FUNCTION create_subscription_events_partition(
    partition_date DATE  -- Any date within the target month
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    month_start TEXT;
    month_end   TEXT;
    part_name   TEXT;
BEGIN
    month_start := to_char(date_trunc('month', partition_date), 'YYYY-MM-DD');
    month_end   := to_char(date_trunc('month', partition_date) + INTERVAL '1 month', 'YYYY-MM-DD');
    part_name   := 'subscription_events_' || to_char(partition_date, 'YYYY_MM');

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF subscription_events
         FOR VALUES FROM (%L) TO (%L)',
        part_name, month_start, month_end
    );

    -- Index: lookup by subscription_id (most common query)
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (subscription_id, created_at DESC)',
        part_name || '_sub_idx', part_name
    );

    -- Index: event_type filtering for projection worker
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (event_type)',
        part_name || '_evt_idx', part_name
    );

    -- Index: projection worker offset scan
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (id)',
        part_name || '_id_idx', part_name
    );
END;
$$;

-- =============================================================================
-- 3b. Bootstrap partitions: current + next 2 months
-- =============================================================================
SELECT create_subscription_events_partition(DATE '2026-06-01');
SELECT create_subscription_events_partition(DATE '2026-07-01');
SELECT create_subscription_events_partition(DATE '2026-08-01');

-- =============================================================================
-- 4. Projection checkpoint table
-- =============================================================================
CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projector_name          TEXT        PRIMARY KEY,
    last_processed_event_id BIGINT      NOT NULL DEFAULT 0,
    last_processed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lag_seconds             INTEGER     NOT NULL DEFAULT 0,
    status                  TEXT        NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'paused', 'error')),
    error_message           TEXT
);

INSERT INTO projection_checkpoints (projector_name, status)
VALUES ('subscription_status', 'running')
ON CONFLICT (projector_name) DO NOTHING;

-- =============================================================================
-- 5. Cron: Create partition for month after next
-- =============================================================================
-- Call monthly (e.g., on the 25th) so next month's partition is ready
-- before the month boundary.

CREATE OR REPLACE FUNCTION create_next_month_partition()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM create_subscription_events_partition(
        date_trunc('month', NOW() + INTERVAL '2 months')
    );
END;
$$;

-- =============================================================================
-- 6. Cron: Drop partitions older than 12 months
-- =============================================================================

CREATE OR REPLACE FUNCTION drop_old_partitions()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT
            inhrelid::regclass::text AS part_name,
            substring(inhrelid::regclass::text from 'subscription_events_(\d{4}_\d{2})') AS month_key
        FROM pg_inherits
        WHERE inhparent = 'subscription_events'::regclass
    LOOP
        IF rec.month_key IS NOT NULL
           AND to_date(replace(rec.month_key, '_', '-') || '-01', 'YYYY-MM-DD')
               < date_trunc('month', NOW() - INTERVAL '12 months')
        THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', rec.part_name);
        END IF;
    END LOOP;
END;
$$;

-- =============================================================================
-- 7. Observability: projection lag updated on INSERT
-- =============================================================================
-- Applies trigger to each partition (triggers on the parent
-- wouldn't fire for child-only operations in all PG versions).

CREATE OR REPLACE FUNCTION update_projection_lag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE projection_checkpoints
    SET lag_seconds = EXTRACT(EPOCH FROM (NOW() - NEW.created_at))::INTEGER
    WHERE projector_name = 'subscription_status';
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    part_name TEXT;
BEGIN
    FOR part_name IN
        SELECT inhrelid::regclass::text
        FROM pg_inherits
        WHERE inhparent = 'subscription_events'::regclass
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_update_projection_lag ON %I',
            part_name
        );
        EXECUTE format(
            'CREATE TRIGGER trg_update_projection_lag
             AFTER INSERT ON %I
             FOR EACH ROW
             EXECUTE FUNCTION update_projection_lag()',
            part_name
        );
    END LOOP;
END;
$$;
