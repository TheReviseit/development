-- =============================================================================
-- Migration 060: Subscription Monitoring Engine
-- =============================================================================
-- Purpose: Add tables for subscription lifecycle tracking, billing events,
--          payment retry scheduling, and account suspension management.
--
-- This migration creates the infrastructure for a production-grade
-- subscription monitoring system similar to Stripe's internal billing engine.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. billing_events — Immutable audit log for ALL billing state changes
-- =============================================================================
-- Every subscription state transition, payment attempt, webhook receipt,
-- retry action, and suspension event is recorded here. This is the
-- source of truth for billing forensics.

CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    user_id UUID NOT NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    product_domain TEXT,

    -- Event classification
    event_type TEXT NOT NULL,
    -- Types: subscription.state_change, payment.failed, payment.captured,
    --        payment.retry_scheduled, payment.retry_attempted,
    --        webhook.received, webhook.processed, webhook.duplicate,
    --        account.suspended, account.reactivated,
    --        grace_period.started, grace_period.expired,
    --        monitor.overdue_detected, monitor.expiry_detected

    event_source TEXT NOT NULL DEFAULT 'system',
    -- Sources: razorpay_webhook, billing_monitor, retry_engine,
    --          suspension_service, admin_action, system

    -- State transition (nullable for non-transition events)
    previous_state TEXT,
    new_state TEXT,

    -- Event payload (flexible JSON for event-specific data)
    payload JSONB DEFAULT '{}'::jsonb,

    -- Razorpay correlation
    razorpay_event_id TEXT,        -- Razorpay webhook event ID
    razorpay_payment_id TEXT,      -- Associated payment ID
    razorpay_subscription_id TEXT, -- Associated subscription ID

    -- Idempotency
    idempotency_key TEXT UNIQUE,   -- Prevents duplicate event processing

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_by TEXT              -- Worker/service that processed this
);

-- Indexes for billing_events
CREATE INDEX IF NOT EXISTS idx_billing_events_user_id
    ON billing_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_events_subscription
    ON billing_events(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_events_type
    ON billing_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_events_razorpay_event
    ON billing_events(razorpay_event_id)
    WHERE razorpay_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_events_created
    ON billing_events(created_at DESC);


-- =============================================================================
-- 2. subscription_status_history — State machine transition log
-- =============================================================================
-- Tracks every status change for every subscription. Used for debugging,
-- compliance auditing, and MRR impact analysis.

CREATE TABLE IF NOT EXISTS subscription_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    product_domain TEXT,

    -- State transition
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    reason TEXT,                    -- Human-readable reason for change
    triggered_by TEXT NOT NULL,     -- webhook, monitor, retry_engine, admin, user

    -- Financial impact
    plan_slug TEXT,
    amount_paise INTEGER,          -- Plan amount at time of transition

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_status_history_subscription
    ON subscription_status_history(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_history_user
    ON subscription_status_history(user_id, created_at DESC);


-- =============================================================================
-- 3. payment_retries — Retry schedule and tracking
-- =============================================================================
-- Manages the 3-day payment recovery lifecycle:
--   Day 0: Payment fails → schedule retry
--   Day 1: Auto-retry payment
--   Day 2: Send warning notification
--   Day 3: Suspend account

CREATE TABLE IF NOT EXISTS payment_retries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    product_domain TEXT,

    -- Retry state
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'succeeded', 'failed', 'cancelled')),

    -- Retry schedule
    retry_number INTEGER NOT NULL DEFAULT 1,   -- 1, 2, 3
    max_retries INTEGER NOT NULL DEFAULT 3,
    scheduled_at TIMESTAMPTZ NOT NULL,         -- When to execute
    executed_at TIMESTAMPTZ,                   -- When actually executed
    next_action TEXT NOT NULL,                 -- retry_payment, send_warning, suspend_account
    -- Actions: retry_payment (day 1), send_warning (day 2), suspend_account (day 3)

    -- Payment details
    razorpay_payment_id TEXT,      -- Failed payment that triggered retry
    razorpay_subscription_id TEXT,
    failure_reason TEXT,           -- Original failure reason
    retry_result TEXT,             -- Result of retry attempt

    -- Notification tracking
    warning_sent_at TIMESTAMPTZ,
    warning_channel TEXT,          -- email, push, in_app

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_retries_pending
    ON payment_retries(status, scheduled_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payment_retries_subscription
    ON payment_retries(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_retries_user
    ON payment_retries(user_id);


-- =============================================================================
-- 4. account_suspensions — Suspension/reactivation tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_suspensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    product_domain TEXT,

    -- Suspension details
    suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suspension_reason TEXT NOT NULL,
    -- Reasons: payment_failed, subscription_expired, subscription_cancelled,
    --          subscription_halted, admin_action

    -- Reactivation
    reactivated_at TIMESTAMPTZ,
    reactivation_reason TEXT,
    reactivated_by TEXT,           -- system, admin, payment_recovery

    -- Features disabled
    disabled_features JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspensions_user
    ON account_suspensions(user_id, suspended_at DESC);

CREATE INDEX IF NOT EXISTS idx_suspensions_active
    ON account_suspensions(user_id)
    WHERE reactivated_at IS NULL;


-- =============================================================================
-- 5. Add grace_period columns to subscriptions table
-- =============================================================================

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS last_payment_failure_at TIMESTAMPTZ;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS payment_retry_count INTEGER DEFAULT 0;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS suspension_reason TEXT;


-- =============================================================================
-- 6. Indexes for billing monitor queries
-- =============================================================================

-- Find overdue subscriptions (period ended but still active)
CREATE INDEX IF NOT EXISTS idx_subscriptions_overdue
    ON subscriptions(current_period_end, status)
    WHERE status IN ('active', 'trialing');

-- Find subscriptions in grace period
CREATE INDEX IF NOT EXISTS idx_subscriptions_grace
    ON subscriptions(grace_period_end, status)
    WHERE status = 'grace_period';

-- Find past_due subscriptions for retry
CREATE INDEX IF NOT EXISTS idx_subscriptions_past_due
    ON subscriptions(last_payment_failure_at, status)
    WHERE status = 'past_due';


-- =============================================================================
-- 7. Helper function: Record billing event (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION record_billing_event(
    p_user_id UUID,
    p_subscription_id UUID,
    p_domain TEXT,
    p_event_type TEXT,
    p_event_source TEXT,
    p_previous_state TEXT,
    p_new_state TEXT,
    p_payload JSONB,
    p_idempotency_key TEXT DEFAULT NULL,
    p_razorpay_event_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Idempotent insert (skip if key already exists)
    INSERT INTO billing_events (
        user_id, subscription_id, product_domain,
        event_type, event_source,
        previous_state, new_state,
        payload, idempotency_key, razorpay_event_id
    ) VALUES (
        p_user_id, p_subscription_id, p_domain,
        p_event_type, p_event_source,
        p_previous_state, p_new_state,
        p_payload, p_idempotency_key, p_razorpay_event_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;


-- =============================================================================
-- 8. Helper function: Transition subscription status atomically
-- =============================================================================

CREATE OR REPLACE FUNCTION transition_subscription_status(
    p_subscription_id UUID,
    p_expected_status TEXT,
    p_new_status TEXT,
    p_reason TEXT,
    p_triggered_by TEXT,
    p_grace_period_end TIMESTAMPTZ DEFAULT NULL,
    p_suspension_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated INTEGER;
    v_user_id UUID;
    v_domain TEXT;
    v_plan TEXT;
    v_amount INTEGER;
BEGIN
    -- Get subscription details before update
    SELECT user_id, product_domain, plan_name
    INTO v_user_id, v_domain, v_plan
    FROM subscriptions
    WHERE id = p_subscription_id AND status = p_expected_status;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Atomic status transition with optimistic lock
    UPDATE subscriptions
    SET status = p_new_status,
        grace_period_end = COALESCE(p_grace_period_end, grace_period_end),
        suspension_reason = p_suspension_reason,
        suspended_at = CASE WHEN p_new_status = 'suspended' THEN NOW() ELSE suspended_at END,
        updated_at = NOW()
    WHERE id = p_subscription_id
      AND status = p_expected_status;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
        -- Record state transition in history
        INSERT INTO subscription_status_history (
            subscription_id, user_id, product_domain,
            from_status, to_status, reason, triggered_by,
            plan_slug
        ) VALUES (
            p_subscription_id, v_user_id, v_domain,
            p_expected_status, p_new_status, p_reason, p_triggered_by,
            v_plan
        );
    END IF;

    RETURN v_updated > 0;
END;
$$;

COMMIT;
