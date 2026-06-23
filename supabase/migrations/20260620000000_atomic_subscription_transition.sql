-- ===================================================================
-- Migration 20260620000000: Atomic Subscription State Transition RPC
-- ===================================================================
-- FAANG-level: Single atomic operation for subscription state transitions.
-- Eliminates the race window between INSERT into subscription_events
-- and UPDATE of subscriptions.status.
--
-- Previously: 3 separate DB calls (SELECT, INSERT, UPDATE) with no
-- transaction — if the UPDATE failed after INSERT, the subscription
-- status would be inconsistent until the projection worker healed it.
--
-- Now: Single Postgres function with FOR UPDATE lock and atomic
-- INSERT + UPDATE inside one transaction.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS transition_subscription_via_event(
--       UUID, TEXT, subscription_event_type, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT
--   );
--   DROP INDEX IF EXISTS idx_pricing_plans_domain_slug_active;
--   DROP INDEX IF EXISTS idx_subscriptions_idempotency;
-- ===================================================================

-- =============================================================================
-- 1. Atomic transition function: INSERT event + UPDATE status in one tx
-- =============================================================================
-- Locks the subscription row with FOR UPDATE to prevent concurrent transitions.
-- Both the event INSERT and status UPDATE happen in the same transaction.
-- If either fails, both are rolled back atomically.

CREATE OR REPLACE FUNCTION transition_subscription_via_event(
    p_subscription_id UUID,
    p_new_status TEXT,
    p_event_type subscription_event_type,
    p_user_id UUID,
    p_product_domain TEXT,
    p_previous_status TEXT,
    p_reason TEXT DEFAULT '',
    p_triggered_by TEXT DEFAULT 'system',
    p_payload JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_id BIGINT;
    v_current_status TEXT;
    v_sub RECORD;
BEGIN
    -- Lock the subscription row to prevent concurrent transitions
    SELECT status, user_id, product_domain INTO STRICT v_sub
    FROM subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    v_current_status := v_sub.status;

    -- If status already matches expected, this is a no-op (idempotent)
    IF v_current_status = p_new_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason', 'already_in_state',
            'new_status', p_new_status
        );
    END IF;

    -- If status doesn't match expected, reject (state already changed)
    IF v_current_status != p_previous_status THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'state_changed',
            'current_status', v_current_status,
            'expected_status', p_previous_status
        );
    END IF;

    -- Insert event into append-only log
    INSERT INTO subscription_events (
        subscription_id, user_id, product_domain, event_type,
        previous_status, new_status, reason, triggered_by,
        payload, idempotency_key
    ) VALUES (
        p_subscription_id,
        COALESCE(p_user_id, v_sub.user_id),
        COALESCE(p_product_domain, v_sub.product_domain),
        p_event_type,
        p_previous_status,
        p_new_status,
        p_reason,
        p_triggered_by,
        p_payload,
        p_idempotency_key
    ) RETURNING id INTO v_event_id;

    -- Update subscription status (same transaction)
    UPDATE subscriptions
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = p_subscription_id;

    RETURN jsonb_build_object(
        'success', true,
        'reason', 'transitioned',
        'event_id', v_event_id,
        'new_status', p_new_status,
        'from_status', p_previous_status
    );
END;
$$;

-- =============================================================================
-- 2. Performance index: pricing plans lookup
-- =============================================================================
-- Used by every create-subscription call. Without this index, the DB
-- scans pricing_plans sequentially for every request.
CREATE INDEX IF NOT EXISTS idx_pricing_plans_domain_slug_active
    ON pricing_plans (product_domain, plan_slug)
    WHERE is_active = TRUE;

-- =============================================================================
-- 3. Performance index: idempotency key lookup
-- =============================================================================
-- Used by subscription creation to check for duplicate idempotency keys.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_idempotency
    ON subscriptions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- 4. Index: checkout_requests polling
-- =============================================================================
-- Used by the polling endpoint to quickly find checkout status.
CREATE INDEX IF NOT EXISTS idx_checkout_requests_token_status
    ON checkout_requests (checkout_token, status);

-- =============================================================================
-- 5. Add action_taken and last_error columns to webhook_events
-- =============================================================================
ALTER TABLE webhook_events
    ADD COLUMN IF NOT EXISTS action_taken TEXT,
    ADD COLUMN IF NOT EXISTS last_error TEXT;

-- =============================================================================
-- 6. Update table statistics for query planner
-- =============================================================================
ANALYZE subscriptions;
ANALYZE pricing_plans;
ANALYZE checkout_requests;
ANALYZE webhook_events;
