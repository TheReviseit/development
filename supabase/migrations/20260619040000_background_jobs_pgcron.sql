-- ===================================================================
-- Migration 20260619040000: Background Jobs via pg_cron (zero-daemon)
-- ===================================================================
-- Replaces Celery Beat tasks with pg_cron scheduled functions.
-- Runs entirely inside PostgreSQL — no background process needed.
--
-- Prerequisites:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;  (run once if missing)
--
-- Jobs scheduled:
--   1. Abandoned checkout cleanup — every 15 minutes
--      Cancels pending subscriptions older than 30 minutes.
-- ===================================================================

-- =============================================================================
-- 1. Enable pg_cron extension (safe to re-run)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =============================================================================
-- 2. Abandoned checkout cleanup function
-- =============================================================================
-- Find pending subscriptions created > 30 min ago and cancel them.
-- Matches the logic in tasks/abandoned_checkout_cleanup.py

CREATE OR REPLACE FUNCTION cleanup_abandoned_checkouts()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    v_cutoff := NOW() - INTERVAL '30 minutes';

    WITH cancelled AS (
        UPDATE subscriptions
        SET status = 'cancelled',
            updated_at = NOW(),
            cancellation_reason = 'checkout_abandoned_ttl'
        WHERE status = 'pending'
          AND created_at < v_cutoff
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM cancelled;

    RETURN v_count;
END;
$$;

-- =============================================================================
-- 3. Schedule jobs via pg_cron
-- =============================================================================
-- Abandoned checkout cleanup: every 15 minutes
SELECT cron.schedule(
    'cleanup-abandoned-checkouts',  -- job name
    '*/15 * * * *',                 -- every 15 minutes
    'SELECT cleanup_abandoned_checkouts()'
);

-- =============================================================================
-- 4. Helper: check job status
-- =============================================================================
-- Run this to see scheduled jobs:
--   SELECT * FROM cron.job;
--
-- Run this to see execution history:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

