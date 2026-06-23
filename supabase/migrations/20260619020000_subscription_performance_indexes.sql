-- ===================================================================
-- Migration 20260619020000: Subscription Performance Indexes (Phase E)
-- ===================================================================
-- Performance indexes identified from query analysis:
--   1. Active subscription lookup (most frequent query)
--   2. User + domain subscription lookup (upgrade page)
--   3. Razorpay subscription ID lookup (webhook handler)
--   4. Expired/pending cleanup scans (background jobs)
--   5. Subscription status history lookups
--   6. billing_events lookups (audit trail)
--
-- ROLLBACK: DROP INDEX IF EXISTS <index_name> for each below.
-- ===================================================================

-- =============================================================================
-- 0. Add deleted_at column if missing (needed by partial indexes below)
-- =============================================================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- =============================================================================
-- 1. Active subscription lookup by user + domain
-- =============================================================================
-- Used by: upgrade_engine._get_subscription(), Subscription.get_by_user_and_domain()
-- Pattern: SELECT * FROM subscriptions WHERE user_id = ? AND product_domain = ?
--          AND status IN ('active','trialing','grace_period','completed')
--          AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1

CREATE INDEX IF NOT EXISTS idx_subscriptions_active_lookup
    ON subscriptions (user_id, product_domain, status, created_at DESC)
    WHERE deleted_at IS NULL
      AND status IN ('active', 'trialing', 'grace_period', 'completed');

-- =============================================================================
-- 2. Pending subscription lookup (abandoned checkout cleanup)
-- =============================================================================
-- Used by: abandoned_checkout_cleanup.sweep_stale_pending()
-- Pattern: SELECT id FROM subscriptions WHERE status = 'pending'
--          AND created_at < ? AND deleted_at IS NULL

CREATE INDEX IF NOT EXISTS idx_subscriptions_stale_pending
    ON subscriptions (created_at)
    WHERE status = 'pending' AND deleted_at IS NULL;

-- =============================================================================
-- 3. Razorpay subscription ID lookup (webhook handler)
-- =============================================================================
-- Used by: webhook_processor._find_subscription()
-- Pattern: SELECT * FROM subscriptions WHERE razorpay_subscription_id = ?

CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay_id
    ON subscriptions (razorpay_subscription_id)
    WHERE razorpay_subscription_id IS NOT NULL;

-- =============================================================================
-- 4. Past-due subscription lookup (billing monitor)
-- =============================================================================
-- Used by: billing_monitor.run_billing_cycle()
-- Pattern: SELECT * FROM subscriptions WHERE status = 'past_due'
--          AND deleted_at IS NULL

CREATE INDEX IF NOT EXISTS idx_subscriptions_past_due
    ON subscriptions (updated_at)
    WHERE status = 'past_due' AND deleted_at IS NULL;

-- =============================================================================
-- 5. Subscription status history lookups
-- =============================================================================
-- Used by: admin UI, debugging

CREATE INDEX IF NOT EXISTS idx_sub_status_history_sub
    ON subscription_status_history (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_status_history_user
    ON subscription_status_history (user_id, created_at DESC);

-- =============================================================================
-- 6. billing_events performance
-- =============================================================================
-- Used by: _record_event, admin audit

CREATE INDEX IF NOT EXISTS idx_billing_events_lookup
    ON billing_events (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_events_idempotency
    ON billing_events (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- 7. free_trials performance (frequently joined with subscriptions)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_free_trials_active_lookup
    ON free_trials (user_id, domain, expires_at DESC)
    WHERE status IN ('active', 'expiring_soon');

-- =============================================================================
-- 8. ANALYZE updated tables (update query planner statistics)
-- =============================================================================

ANALYZE subscriptions;
ANALYZE subscription_status_history;
ANALYZE billing_events;
ANALYZE free_trials;
