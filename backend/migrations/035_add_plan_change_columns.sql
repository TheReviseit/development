-- =============================================================================
-- Migration: 035_add_plan_change_columns.sql
-- Description: Add plan change support (upgrade/downgrade) to subscriptions
-- Date: 2026-02-14
-- =============================================================================
--
-- Enterprise plan change system:
--   - pending_plan_slug: target plan for scheduled change
--   - Proration tracking: order_id, payment_status
--   - plan_change_locked: prevents concurrent modifications
--   - last_processed_event_id: webhook idempotency
--   - plan_change_history: full audit trail
--

-- =============================================================================
-- 1. Add pending plan change columns to subscriptions
-- =============================================================================

-- Target plan for the scheduled change
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS pending_plan_slug VARCHAR(50);

-- FK to the exact pricing_plans row for the new plan
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS pending_pricing_plan_id UUID;

-- Locked amount for the new plan (immutable once set)
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS pending_amount_paise INTEGER;

-- Pricing version of the new plan
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS pending_pricing_version INTEGER;

-- When the plan change takes effect (= current_period_end)
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS change_scheduled_at TIMESTAMPTZ;

-- Direction: 'upgrade' or 'downgrade'
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS change_direction VARCHAR(10)
    CHECK (change_direction IN ('upgrade', 'downgrade'));

-- Razorpay order ID for proration payment (upgrades only)
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS proration_order_id TEXT;

-- Status of the proration payment
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS proration_payment_status VARCHAR(20)
    CHECK (proration_payment_status IN ('pending', 'captured', 'failed'));

-- Concurrency lock: TRUE while subscription.update is in-flight
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_change_locked BOOLEAN DEFAULT FALSE;

-- Webhook idempotency: last processed Razorpay event ID
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS last_processed_event_id TEXT;


-- =============================================================================
-- 2. Indexes for plan change queries
-- =============================================================================

-- Find subscriptions with pending changes (for cron/webhook processing)
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_plan
    ON subscriptions(pending_plan_slug)
    WHERE pending_plan_slug IS NOT NULL;

-- Find by proration order (for payment.captured webhook)
CREATE INDEX IF NOT EXISTS idx_subscriptions_proration_order
    ON subscriptions(proration_order_id)
    WHERE proration_order_id IS NOT NULL;

-- Webhook idempotency lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_last_event
    ON subscriptions(last_processed_event_id)
    WHERE last_processed_event_id IS NOT NULL;


-- =============================================================================
-- 3. Plan Change History (audit trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS plan_change_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Subscription reference
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Change details
    change_direction VARCHAR(10) NOT NULL CHECK (change_direction IN ('upgrade', 'downgrade')),
    from_plan_slug VARCHAR(50) NOT NULL,
    to_plan_slug VARCHAR(50) NOT NULL,
    from_amount_paise INTEGER NOT NULL,
    to_amount_paise INTEGER NOT NULL,
    from_pricing_version INTEGER NOT NULL,
    to_pricing_version INTEGER NOT NULL,
    product_domain VARCHAR(50) NOT NULL,

    -- Proration (upgrades only)
    proration_amount_paise INTEGER DEFAULT 0,
    proration_order_id TEXT,
    proration_payment_id TEXT,

    -- Scheduling
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_for TIMESTAMPTZ,           -- When change will take effect
    applied_at TIMESTAMPTZ,               -- When change was actually applied
    cancelled_at TIMESTAMPTZ,             -- If user cancelled before application

    -- Status: 'requested', 'payment_pending', 'scheduled', 'applied', 'failed', 'cancelled'
    status VARCHAR(20) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'payment_pending', 'scheduled', 'applied', 'failed', 'cancelled')),

    -- Razorpay event that triggered application
    applied_by_event_id TEXT,

    -- Request metadata
    request_id TEXT,
    client_ip TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plan_change_history_subscription
    ON plan_change_history(subscription_id);

CREATE INDEX IF NOT EXISTS idx_plan_change_history_user
    ON plan_change_history(user_id);

CREATE INDEX IF NOT EXISTS idx_plan_change_history_status
    ON plan_change_history(status)
    WHERE status IN ('payment_pending', 'scheduled');


-- =============================================================================
-- 4. RLS Policies
-- =============================================================================

ALTER TABLE plan_change_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own change history
CREATE POLICY plan_change_history_select_policy ON plan_change_history
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY plan_change_history_service_policy ON plan_change_history
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- =============================================================================
-- 5. Atomic plan change function (called from webhook handler)
-- =============================================================================
-- This ensures plan application is atomic — no partial updates.

CREATE OR REPLACE FUNCTION apply_plan_change(
    p_razorpay_subscription_id TEXT,
    p_expected_pending_slug VARCHAR(50),
    p_event_id TEXT,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_sub RECORD;
    v_result JSONB;
BEGIN
    -- Lock the row for update (prevents concurrent webhook processing)
    SELECT *
    INTO v_sub
    FROM subscriptions
    WHERE razorpay_subscription_id = p_razorpay_subscription_id
    FOR UPDATE;

    IF v_sub IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'subscription_not_found');
    END IF;

    -- Idempotency: skip if already processed this event
    IF v_sub.last_processed_event_id = p_event_id THEN
        RETURN jsonb_build_object('success', true, 'reason', 'already_processed', 'idempotent', true);
    END IF;

    -- No pending change to apply
    IF v_sub.pending_plan_slug IS NULL THEN
        RETURN jsonb_build_object('success', true, 'reason', 'no_pending_change');
    END IF;

    -- Verify expected slug matches (safety check)
    IF v_sub.pending_plan_slug != p_expected_pending_slug THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'slug_mismatch',
            'expected', p_expected_pending_slug,
            'actual', v_sub.pending_plan_slug
        );
    END IF;

    -- ATOMIC: Apply the plan change
    UPDATE subscriptions
    SET
        -- Apply new plan
        plan_name = v_sub.pending_plan_slug,
        amount_paise = v_sub.pending_amount_paise,
        pricing_version = v_sub.pending_pricing_version,
        pricing_plan_id = v_sub.pending_pricing_plan_id,

        -- Update period
        current_period_start = COALESCE(p_period_start, current_period_start),
        current_period_end = COALESCE(p_period_end, current_period_end),
        status = 'active',

        -- Reset usage for new cycle
        ai_responses_used = 0,

        -- Clear ALL pending fields
        pending_plan_slug = NULL,
        pending_pricing_plan_id = NULL,
        pending_amount_paise = NULL,
        pending_pricing_version = NULL,
        change_scheduled_at = NULL,
        change_direction = NULL,
        proration_order_id = NULL,
        proration_payment_status = NULL,
        plan_change_locked = FALSE,

        -- Record event for idempotency
        last_processed_event_id = p_event_id
    WHERE id = v_sub.id;

    -- Update audit trail
    UPDATE plan_change_history
    SET
        status = 'applied',
        applied_at = NOW(),
        applied_by_event_id = p_event_id
    WHERE subscription_id = v_sub.id
      AND status IN ('scheduled', 'payment_pending')
      AND to_plan_slug = p_expected_pending_slug;

    RETURN jsonb_build_object(
        'success', true,
        'reason', 'applied',
        'from_plan', v_sub.plan_name,
        'to_plan', v_sub.pending_plan_slug,
        'from_amount', v_sub.amount_paise,
        'to_amount', v_sub.pending_amount_paise
    );
END;
$$;
