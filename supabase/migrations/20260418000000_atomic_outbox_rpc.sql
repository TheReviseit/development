-- Atomic Outbox Pattern RPC
-- Guarantees atomicity between subscription creation and outbox event publishing

CREATE OR REPLACE FUNCTION create_pending_subscription_and_outbox(
    p_user_id VARCHAR,
    p_domain VARCHAR,
    p_pricing_plan_id UUID,
    p_plan_id VARCHAR,
    p_plan_name VARCHAR,
    p_amount_paise INTEGER,
    p_currency VARCHAR,
    p_tenant_id VARCHAR,
    p_idempotency_key VARCHAR
)
RETURNS JSONB AS $$
DECLARE
    v_subscription_id UUID;
    v_outbox_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Insert subscription
    INSERT INTO subscriptions (
        user_id, product_domain, pricing_plan_id, plan_id, plan_name, 
        amount_paise, currency, status, created_at, updated_at
    ) VALUES (
        p_user_id, p_domain, p_pricing_plan_id, p_plan_id, p_plan_name,
        p_amount_paise, p_currency, 'pending', NOW(), NOW()
    ) RETURNING id INTO v_subscription_id;

    -- 2. Insert outbox event
    INSERT INTO events_outbox (
        type, aggregate_type, aggregate_id, payload, status
    ) VALUES (
        'subscription.created', 'subscription', v_subscription_id,
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'user_id', p_user_id,
            'subscription_id', v_subscription_id,
            'plan_slug', p_plan_name,
            'amount', p_amount_paise,
            'currency', p_currency,
            'idempotency_key', p_idempotency_key,
            'timestamp', NOW()
        ),
        'PENDING'
    ) RETURNING id INTO v_outbox_id;

    v_result := jsonb_build_object(
        'subscription_id', v_subscription_id,
        'outbox_id', v_outbox_id
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
