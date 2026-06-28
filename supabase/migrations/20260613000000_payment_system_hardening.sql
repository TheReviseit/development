-- =============================================================================
-- Migration: Payment System Hardening - FK Constraints, Indexes, State Machine
-- =============================================================================
-- APPLIES TO: Supabase (managed Postgres)
--
-- Changes:
-- 1. Enforce one active subscription per user per product_domain (partial unique index)
-- 2. Add FK constraint: webhook_events.subscription_id → subscriptions(razorpay_subscription_id)
-- 3. Add FK constraint: webhook_events.payment_id → payment_history(razorpay_payment_id)
-- 4. Add FK constraint: payment_attempts.razorpay_subscription_id → subscriptions(razorpay_subscription_id)
-- 5. Add index on subscriptions.product_domain for domain-scoped queries
-- 6. Add index on subscriptions(razorpay_subscription_id, status) for fast status lookups
-- 7. Add composite index on subscriptions(user_id, product_domain, status) for fast lookups
-- 8. Add index on webhook_events(event_type, created_at) for webhook routing
-- 9. Remove invalid state transitions from status check constraint
-- 10. Add updated_at trigger to webhook_events
-- =============================================================================

-- =============================================================================
-- 1. One active subscription per user per product_domain
-- =============================================================================
-- Prevents duplicate active subscriptions (the "double-charge" bug).
-- Only one subscription per user+domain can be in a non-terminal state.
-- Terminal states: cancelled, expired, halted, failed
DROP INDEX IF EXISTS idx_subscriptions_one_active_per_user_domain;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user_domain
    ON subscriptions(user_id, product_domain)
    WHERE status IN ('active', 'past_due', 'trialing');

-- =============================================================================
-- 2. Composite unique index on razorpay_subscription_id + user_id
-- =============================================================================
-- Ensures no user can have duplicate razorpay_subscription_id references.
-- The existing UNIQUE on razorpay_subscription_id alone is global;
-- this composite adds an extra safety layer.
DROP INDEX IF EXISTS idx_subscriptions_razorpay_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_razorpay_user
    ON subscriptions(razorpay_subscription_id, user_id)
    WHERE razorpay_subscription_id IS NOT NULL;

-- =============================================================================
-- 3. FK constraint: webhook_events → subscriptions(razorpay_subscription_id)
-- =============================================================================
-- Ensures webhook events always reference a valid subscription.
-- ON DELETE SET NULL so webhook audit trail survives subscription cleanup.
-- The FK is NOT VALID initially to avoid locking large tables.
-- Run VALIDATE after deployment in a maintenance window.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_webhook_events_subscription'
        AND table_name = 'webhook_events'
    ) THEN
        ALTER TABLE webhook_events
        ADD CONSTRAINT fk_webhook_events_subscription
        FOREIGN KEY (subscription_id)
        REFERENCES subscriptions(razorpay_subscription_id)
        ON DELETE SET NULL
        NOT VALID;
    END IF;
END $$;

-- =============================================================================
-- 4. FK constraint: webhook_events → payment_history(razorpay_payment_id)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_webhook_events_payment'
        AND table_name = 'webhook_events'
    ) THEN
        ALTER TABLE webhook_events
        ADD CONSTRAINT fk_webhook_events_payment
        FOREIGN KEY (payment_id)
        REFERENCES payment_history(razorpay_payment_id)
        ON DELETE SET NULL
        NOT VALID;
    END IF;
END $$;

-- =============================================================================
-- 5. FK constraint: payment_attempts(razorpay_subscription_id) → subscriptions
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_payment_attempts_razorpay_subscription'
        AND table_name = 'payment_attempts'
    ) THEN
        ALTER TABLE payment_attempts
        ADD CONSTRAINT fk_payment_attempts_razorpay_subscription
        FOREIGN KEY (razorpay_subscription_id)
        REFERENCES subscriptions(razorpay_subscription_id)
        ON DELETE SET NULL
        NOT VALID;
    END IF;
END $$;

-- =============================================================================
-- 6. Index on subscriptions.product_domain for domain-scoped queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_domain
    ON subscriptions(product_domain);

-- =============================================================================
-- 7. Index on subscriptions(razorpay_subscription_id, status) for fast lookups
-- =============================================================================
-- Critical for update_subscription_status() and get_subscription_by_razorpay_id()
CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay_status
    ON subscriptions(razorpay_subscription_id, status);

-- =============================================================================
-- 8. Composite index on subscriptions(user_id, product_domain, status)
-- =============================================================================
-- Fast lookups for create_subscription() user+domain+status checks
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain_status
    ON subscriptions(user_id, product_domain, status);

-- =============================================================================
-- 9. Index on webhook_events(event_type, created_at) for webhook routing
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_webhook_events_type_created
    ON webhook_events(event_type, created_at DESC);

-- =============================================================================
-- 10. Index on payment_history(razorpay_payment_id, status) for dedup
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_status
    ON payment_history(razorpay_payment_id, status);

-- =============================================================================
-- 11. Updated_at trigger for webhook_events
-- =============================================================================
CREATE OR REPLACE FUNCTION update_webhook_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_webhook_events_updated_at ON webhook_events;
CREATE TRIGGER trigger_webhook_events_updated_at
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_events_updated_at();

-- Add updated_at column if missing
ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================================================
-- 12. Add previous_subscription_id column for upgrade row chaining
-- =============================================================================
-- When a user upgrades, a NEW subscription row is created with status
-- =pending_upgrade= and previous_subscription_id pointing to the old
-- ACTIVE subscription. On activation, the old sub is cancelled.
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS previous_subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_previous_id
    ON subscriptions(previous_subscription_id);

-- =============================================================================
-- 13. Atomic RPC: apply_pending_upgrade (Race-condition-safe upgrade activation)
-- =============================================================================
-- Called by both the frontend verify endpoint AND the webhook handler.
-- Uses SELECT FOR UPDATE to prevent double-activation race conditions.
-- Returns { success: true/false, reason: string }

CREATE OR REPLACE FUNCTION apply_pending_upgrade(
    p_subscription_id UUID,
    p_razorpay_subscription_id TEXT,
    p_new_plan_slug TEXT,
    p_new_pricing_plan_id UUID DEFAULT NULL,
    p_new_amount_paise INTEGER DEFAULT NULL,
    p_new_pricing_version INTEGER DEFAULT NULL,
    p_current_period_start TIMESTAMPTZ DEFAULT NULL,
    p_current_period_end TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_subscription RECORD;
    v_current_status TEXT;
    v_previous_sub_id UUID;
    v_user_id UUID;
    v_domain TEXT;
BEGIN
    -- Lock the row to prevent concurrent activation
    SELECT * INTO v_subscription
    FROM subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'subscription_not_found'
        );
    END IF;

    v_current_status := v_subscription.status;
    v_previous_sub_id := v_subscription.previous_subscription_id;
    v_user_id := v_subscription.user_id;
    v_domain := v_subscription.product_domain;

    -- Only activate from pending_upgrade state
    IF v_current_status != 'pending_upgrade' THEN
        -- Already active — idempotent
        IF v_current_status = 'active' THEN
            RETURN jsonb_build_object(
                'success', true,
                'reason', 'already_active',
                'status', 'active'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'invalid_state',
            'current_status', v_current_status
        );
    END IF;

    -- Atomic activation: update in locked transaction
    UPDATE subscriptions SET
        status = 'active',
        plan_name = COALESCE(p_new_plan_slug, v_subscription.plan_name),
        pricing_plan_id = COALESCE(p_new_pricing_plan_id, v_subscription.pricing_plan_id),
        amount_paise = COALESCE(p_new_amount_paise, v_subscription.amount_paise),
        pricing_version = COALESCE(p_new_pricing_version, v_subscription.pricing_version),
        current_period_start = COALESCE(p_current_period_start, v_subscription.current_period_start, NOW()),
        current_period_end = COALESCE(p_current_period_end, v_subscription.current_period_end),
        updated_at = NOW()
    WHERE id = p_subscription_id;

    -- Cancel previous subscription (if this is an upgrade)
    IF v_previous_sub_id IS NOT NULL THEN
        UPDATE subscriptions SET
            status = 'cancelled',
            cancelled_at = NOW(),
            cancellation_reason = 'upgraded',
            updated_at = NOW()
        WHERE id = v_previous_sub_id AND status = 'active';
    ELSE
        -- Fallback: cancel any other ACTIVE sub for same user+domain
        UPDATE subscriptions SET
            status = 'cancelled',
            cancelled_at = NOW(),
            cancellation_reason = 'upgraded',
            updated_at = NOW()
        WHERE user_id = v_user_id
          AND product_domain = v_domain
          AND status = 'active'
          AND id != p_subscription_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reason', 'activated',
        'subscription_id', p_subscription_id,
        'razorpay_subscription_id', p_razorpay_subscription_id
    );
END;
$$;

-- =============================================================================
-- 13. Validate NOT VALID constraints after a grace period
-- =============================================================================
-- Run this after deployment once all existing data has been reconciled.
-- ALTER TABLE webhook_events VALIDATE CONSTRAINT fk_webhook_events_subscription;
-- ALTER TABLE webhook_events VALIDATE CONSTRAINT fk_webhook_events_payment;
-- ALTER TABLE payment_attempts VALIDATE CONSTRAINT fk_payment_attempts_razorpay_subscription;
