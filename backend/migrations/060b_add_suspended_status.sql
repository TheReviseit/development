-- =============================================================================
-- Migration 060b: Add 'suspended' to subscription status enum
-- =============================================================================
-- The subscription_lifecycle engine introduces a 'suspended' state that is
-- distinct from 'halted' (Razorpay-controlled) — 'suspended' is our system's
-- own suspension after grace period expiry or manual admin action.
-- =============================================================================

BEGIN;

ALTER TABLE subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_status_check
CHECK (status IN (
    'pending',
    'pending_upgrade',
    'active',
    'upgrade_failed',
    'trialing',
    'grace_period',
    'past_due',
    'suspended',       -- NEW: System-initiated suspension (distinct from halted)
    'cancelled',
    'halted',
    'paused',
    'expired'
));

COMMIT;
