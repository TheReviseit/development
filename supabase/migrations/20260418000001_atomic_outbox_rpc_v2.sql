-- Atomic Outbox Pattern RPC v2
-- Guarantees atomicity between subscription creation and outbox event publishing
-- Uses strict UUID type for user_id to match the subscriptions table schema

CREATE OR REPLACE FUNCTION public.create_pending_subscription_and_outbox_v2(
    p_user_id UUID,
    p_domain VARCHAR,
    p_pricing_plan_id UUID,
    p_plan_id VARCHAR,
    p_plan_name VARCHAR,
    p_amount_paise INTEGER,
    p_currency VARCHAR,
    p_tenant_id VARCHAR,
    p_idempotency_key VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription_id UUID;
    v_payload JSONB;
BEGIN
    -- 1. Insert pending subscription
    INSERT INTO subscriptions (
        user_id, product_domain, pricing_plan_id, plan_id, plan_name, 
        amount_paise, currency, status, created_at, updated_at
    ) VALUES (
        p_user_id, p_domain, p_pricing_plan_id, p_plan_id, p_plan_name,
        p_amount_paise, p_currency, 'pending', NOW(), NOW()
    ) RETURNING id INTO v_subscription_id;

    -- 2. Insert outbox event
    v_payload := jsonb_build_object(
        'subscription_id', v_subscription_id,
        'user_id', p_user_id,
        'domain', p_domain,
        'plan_id', p_plan_id,
        'amount_paise', p_amount_paise,
        'currency', p_currency,
        'idempotency_key', p_idempotency_key
    );

    INSERT INTO events_outbox (
        type, aggregate_type, aggregate_id, payload, status, created_at
    ) VALUES (
        'subscription.created',
        'subscription',
        v_subscription_id,
        v_payload,
        'PENDING',
        NOW()
    );

    RETURN v_subscription_id;
END;
$$;
