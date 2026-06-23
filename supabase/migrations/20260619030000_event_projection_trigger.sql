-- ===================================================================
-- Migration 20260619030000: Event Projection Trigger (zero-daemon)
-- ===================================================================
-- Replaces the projection daemon with a PostgreSQL trigger.
-- When any row is inserted into subscription_events, this trigger
-- automatically updates subscriptions.status — no background process
-- needed. Works on free tier (Supabase, Render, Vercel).
--
-- Safe to re-run: uses CREATE OR REPLACE + IF NOT EXISTS.
-- ===================================================================

-- =============================================================================
-- 1. Trigger function: project event onto subscriptions.status
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_project_subscription_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Eagerly project the new event onto the subscriptions table.
    -- The NEW row's new_status becomes the canonical subscription status.
    -- Only updates if the event actually conveys a status change
    -- (e.g., subscription.created, subscription.updated, subscription.cancelled).
    UPDATE subscriptions
    SET status = NEW.new_status,
        updated_at = NOW()
    WHERE id = NEW.subscription_id
      AND status IS DISTINCT FROM NEW.new_status;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. Apply trigger to subscription_events table
-- =============================================================================
DROP TRIGGER IF EXISTS trg_project_subscription_event ON subscription_events;
CREATE TRIGGER trg_project_subscription_event
    AFTER INSERT ON subscription_events
    FOR EACH ROW
    EXECUTE FUNCTION trg_project_subscription_event();

-- =============================================================================
-- 3. Backfill projection for any existing events that weren't projected
-- =============================================================================
UPDATE subscriptions sub
SET status = ev.new_status,
    updated_at = NOW()
FROM subscription_events ev
WHERE ev.subscription_id = sub.id
  AND ev.new_status IS DISTINCT FROM sub.status
  AND ev.id = (
      SELECT e2.id FROM subscription_events e2
      WHERE e2.subscription_id = sub.id
      ORDER BY e2.created_at DESC, e2.id DESC
      LIMIT 1
  );
