-- ===================================================================
-- Migration 100: Subscription Events (Event Sourcing)
-- ===================================================================
-- Same schema as supabase/migrations/20260619000000_subscription_events.sql
-- Use the supabase version as canonical.
--
-- RANGE partitioned on created_at with monthly partitions.
-- No generated columns — avoids PostgreSQL immutability requirement.
-- ===================================================================

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
        PERFORM drop_old_partitions();
    END IF;
END;
$$;

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

CREATE OR REPLACE FUNCTION create_subscription_events_partition(
    partition_date DATE
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

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (subscription_id, created_at DESC)',
        part_name || '_sub_idx', part_name
    );

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (event_type)',
        part_name || '_evt_idx', part_name
    );

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (id)',
        part_name || '_id_idx', part_name
    );
END;
$$;

SELECT create_subscription_events_partition(DATE '2026-06-01');
SELECT create_subscription_events_partition(DATE '2026-07-01');
SELECT create_subscription_events_partition(DATE '2026-08-01');

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
