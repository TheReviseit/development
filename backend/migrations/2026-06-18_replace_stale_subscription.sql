-- =============================================================================
-- Migration: Replace Stale Subscription — Atomic RPC Function
-- 
-- Creates the replace_stale_subscription RPC used by payments.py when
-- CASE 2 replaces a stale Razorpay subscription (DB row exists with an
-- old sub ID that no longer exists on Razorpay).
--
-- The FK fk_payment_attempts_razorpay_subscription references the mutable
-- business key subscriptions.razorpay_subscription_id, not the UUID PK.
-- Changing the parent key is blocked while child payment_attempt rows
-- reference the old value — creating a chicken-and-egg deadlock.
--
-- This RPC wraps three operations in a single Postgres transaction:
--   1. DELETE stale payment_attempts (unblock FK)
--   2. UPDATE subscription row with new Razorpay sub ID
--   3. INSERT fresh payment_attempt with new sub ID
--
-- Safety:
--   - SELECT ... FOR UPDATE serializes concurrent callers
--   - Idempotency guard: skips if subscription already has the new ID
--   - Deleted payment_attempts have status='initiated' (zero money moved)
--   - Real payment history lives in payment_history (never touched here)
-- =============================================================================

CREATE OR REPLACE FUNCTION replace_stale_subscription(
    old_rzp_sub_id TEXT,
    new_rzp_sub_id TEXT,
    new_customer_id TEXT,
    p_user_id UUID,
    p_subscription_id UUID,
    p_plan_name TEXT,
    p_plan_id TEXT,
    p_idempotency_key TEXT,
    p_ai_responses_limit INT,
    p_product_domain TEXT,
    p_amount_paise BIGINT,
    p_currency TEXT,
    p_pricing_plan_id TEXT,
    p_request_id TEXT,
    p_client_ip TEXT,
    p_user_agent TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INT;
    current_sub_id TEXT;
BEGIN
    -- ══════════════════════════════════════════════════════════════
    -- IDEMPOTENCY GUARD
    -- If this subscription row already has the new sub ID (a
    -- previous call to this RPC succeeded but the HTTP response
    -- was lost to a network blip), return success immediately.
    -- Without this guard, the retry would DELETE the fresh
    -- payment_attempts and re-INSERT them — harmless but wasteful,
    -- and would cause log noise.
    -- ══════════════════════════════════════════════════════════════
    SELECT razorpay_subscription_id INTO current_sub_id
    FROM subscriptions WHERE id = p_subscription_id;

    IF current_sub_id = new_rzp_sub_id THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'deleted_payment_attempts', 0
        );
    END IF;

    -- ══════════════════════════════════════════════════════════════
    -- ROW LOCK — Serialize on the subscription row
    -- Two concurrent requests for the same user (double-tap on the
    -- pay button, frontend retry) will both reach here. The first
    -- caller acquires the row lock and proceeds. The second blocks
    -- until the first commits, then hits the idempotency guard above
    -- and returns immediately.
    -- ══════════════════════════════════════════════════════════════
    PERFORM 1 FROM subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    -- ══════════════════════════════════════════════════════════════
    -- Step 1: DELETE stale payment_attempts
    --
    -- These rows have status='initiated', zero payment_id, zero
    -- amount. They block the FK because they reference the old
    -- razorpay_subscription_id, and Postgres prevents changing that
    -- key in the parent table while child rows still reference it.
    --
    -- A fresh payment_attempt is inserted in Step 3 to replace them.
    -- Successful payment records live in payment_history (never
    -- deleted, never touched by this function).
    -- ══════════════════════════════════════════════════════════════
    DELETE FROM payment_attempts
    WHERE razorpay_subscription_id = old_rzp_sub_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- ══════════════════════════════════════════════════════════════
    -- Step 2: UPDATE subscription with new Razorpay sub ID
    --
    -- The FK constraint is now satisfied because no child rows
    -- reference the old sub ID (deleted above). The row keeps its
    -- original UUID primary key — only the Razorpay business key
    -- changes.
    -- ══════════════════════════════════════════════════════════════
    UPDATE subscriptions SET
        razorpay_subscription_id = new_rzp_sub_id,
        razorpay_customer_id = new_customer_id,
        plan_name = p_plan_name,
        plan_id = p_plan_id,
        status = 'pending',
        idempotency_key = p_idempotency_key,
        ai_responses_limit = p_ai_responses_limit,
        product_domain = p_product_domain,
        amount_paise = p_amount_paise,
        currency = p_currency,
        pricing_plan_id = p_pricing_plan_id::UUID,
        updated_at = NOW()
    WHERE id = p_subscription_id;

    -- ══════════════════════════════════════════════════════════════
    -- Step 3: INSERT fresh payment_attempt
    --
    -- Replaces the deleted stale attempts with a new one that
    -- references the correct (new) Razorpay sub ID.
    -- ══════════════════════════════════════════════════════════════
    INSERT INTO payment_attempts (
        user_id, request_id, plan_name, idempotency_key,
        status, razorpay_subscription_id, client_ip, user_agent
    ) VALUES (
        p_user_id, p_request_id, p_plan_name, p_idempotency_key,
        'initiated', new_rzp_sub_id, p_client_ip, p_user_agent
    );

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'deleted_payment_attempts', deleted_count
    );
END;
$$;
