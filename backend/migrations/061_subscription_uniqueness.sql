-- =============================================================================
-- Migration 061: Enforce single active subscription per user per domain
-- =============================================================================
-- Without this constraint, race conditions during concurrent subscription
-- creation could create duplicate active subscriptions for the same tenant.
-- The application layer guards against this, but defense-in-depth requires
-- a database-level guarantee.
--
-- Uses a partial unique index so users CAN have multiple cancelled/expired
-- subscriptions (history), but only ONE active/in-progress subscription
-- per domain at any time.
-- =============================================================================

BEGIN;

-- Partial unique index: only one non-terminal subscription per user+domain
-- Terminal states (cancelled, expired, halted) are excluded so historical
-- records don't conflict with new subscriptions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user_domain
    ON subscriptions (user_id, product_domain)
    WHERE status NOT IN ('cancelled', 'expired', 'halted');

COMMIT;
