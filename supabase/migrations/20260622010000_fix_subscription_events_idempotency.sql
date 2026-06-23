-- Fix: subscription_events is partitioned by created_at — UNIQUE(idempotency_key) alone is invalid.
-- Safe to run if 20260622000000 failed partway through Migration D.

DROP INDEX IF EXISTS idx_subscription_events_idempotency;

CREATE TABLE IF NOT EXISTS subscription_event_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  subscription_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_event_idempotency_created
  ON subscription_event_idempotency (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_events_idempotency_lookup
  ON subscription_events (idempotency_key, created_at DESC)
  WHERE idempotency_key IS NOT NULL;

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
    SELECT status, user_id, product_domain INTO STRICT v_sub
    FROM subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    v_current_status := v_sub.status;

    IF v_current_status = p_new_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason', 'already_in_state',
            'new_status', p_new_status
        );
    END IF;

    IF v_current_status != p_previous_status THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'state_changed',
            'current_status', v_current_status,
            'expected_status', p_previous_status
        );
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        BEGIN
            INSERT INTO subscription_event_idempotency (idempotency_key, subscription_id)
            VALUES (p_idempotency_key, p_subscription_id);
        EXCEPTION WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', true,
                'reason', 'duplicate_idempotency_key',
                'new_status', p_new_status
            );
        END;
    END IF;

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
