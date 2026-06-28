-- ============================================================================
-- 102: Billing Performance Indexes (Sprint 2)
-- ============================================================================
-- Target: checkout_requests, webhook_events tables
-- These queries run on every payment attempt and webhook delivery.
-- Seq scans at any meaningful load will cause checkout failures.
-- All indexes use IF NOT EXISTS so they are safe to re-run.
-- ============================================================================

-- 1. checkout_token lookup — the primary key for polling and webhook resolution
-- Used by: get_checkout_status(), webhook_processor, subscription_worker.execute()
CREATE INDEX IF NOT EXISTS idx_checkout_requests_token
ON checkout_requests(checkout_token);

-- 2. user_id lookup — find all checkouts for a user
-- Used by: create_subscription() idempotency check, admin panel
CREATE INDEX IF NOT EXISTS idx_checkout_requests_user_id
ON checkout_requests(user_id);

-- 3. firebase_uid lookup — same as user_id but for Firebase UID path
-- Used by: subscription_worker when resolving firebase_uid → UUID
CREATE INDEX IF NOT EXISTS idx_checkout_requests_firebase_uid
ON checkout_requests(firebase_uid);

-- 4. status lookup — finding pending/abandoned checkouts for cron jobs
-- Used by: cancel_orphaned_precreations() daily cron
CREATE INDEX IF NOT EXISTS idx_checkout_requests_status
ON checkout_requests(status);

-- 5. Composite: created_at + status — orphaned subscription cleanup query
-- Used by: daily cron that cancels pre-created subscriptions > 24h
CREATE INDEX IF NOT EXISTS idx_checkout_requests_created_status
ON checkout_requests(created_at, status);

-- 6. idempotency_key lookup — deduplication hot path
-- Used by: create_subscription() idempotency check
CREATE INDEX IF NOT EXISTS idx_checkout_requests_idempotency_key
ON checkout_requests(idempotency_key);

-- 7. Razorpay subscription_id lookup — webhook resolution
-- Used by: webhook_processor when Razorpay sends subscription.charged events
CREATE INDEX IF NOT EXISTS idx_checkout_requests_razorpay_sub_id
ON checkout_requests(razorpay_subscription_id);

-- 8. webhook_events.event_id — dedup on webhook delivery
-- Used by: webhook_processor.process_event() — every webhook hits this
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
ON webhook_events(event_id);

-- 9. webhook_events.subscription_id — find related events for a sub
-- Used by: webhook debugging, status page queries
-- NOTE: The column is named subscription_id (not razorpay_subscription_id).
-- It stores the Razorpay subscription ID value.
CREATE INDEX IF NOT EXISTS idx_webhook_events_subscription_id
ON webhook_events(subscription_id);

-- 10. subscriptions.razorpay_subscription_id — webhook resolution
-- Used by: webhook_processor when activating subscriptions
-- NOTE: This column may not exist in all schemas — check first
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'razorpay_subscription_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay_id
        ON subscriptions(razorpay_subscription_id);
    END IF;
END $$;

-- Verify indexes were created (run after migration):
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('checkout_requests', 'webhook_events', 'subscriptions')
-- ORDER BY tablename, indexname;
