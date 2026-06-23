-- Phase 3: indexes that must be built CONCURRENTLY in production (run outside a transaction).
-- Apply manually on prod during low traffic:
--   psql $DATABASE_URL -c "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_checkout_inflight ON checkout_requests (user_id, domain) WHERE status IN ('initiated', 'processing');"
--   psql $DATABASE_URL -c "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_idempotency_key ON subscriptions (idempotency_key) WHERE idempotency_key IS NOT NULL;"

-- Dev/staging: safe to run in migration runner (non-concurrent fallback already in 20260621000000)

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_idempotency_key
    ON subscriptions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX idx_subscriptions_idempotency_key IS
    'Prevents duplicate subscription rows for the same checkout idempotency key.';
