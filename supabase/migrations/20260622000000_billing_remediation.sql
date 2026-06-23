-- Billing remediation Phase 0+1: plan backfill, authoritative view, funnel events,
-- checkout worker leases, Postgres rate limits, indexes.

-- Migration F: backfill plan drift
UPDATE subscriptions s
SET plan_name = pp.plan_slug,
    plan_id = pp.razorpay_plan_id,
    updated_at = now()
FROM pricing_plans pp
WHERE s.pricing_plan_id = pp.id
  AND s.deleted_at IS NULL
  AND (s.plan_id IS DISTINCT FROM pp.razorpay_plan_id
       OR s.plan_name IS DISTINCT FROM pp.plan_slug);

-- Migration A: authoritative subscription read model
CREATE OR REPLACE VIEW subscription_current AS
SELECT DISTINCT ON (s.user_id, s.product_domain)
  s.*,
  pp.plan_slug AS authoritative_plan_slug,
  pp.display_name AS authoritative_plan_display_name,
  pp.razorpay_plan_id AS authoritative_razorpay_plan_id,
  COALESCE(
    pm.tier_level,
    CASE
      WHEN pp.plan_slug ~ '(pro|professional)$' THEN 2
      WHEN pp.plan_slug ~ '(business|growth)$' THEN 1
      ELSE 0
    END
  ) AS tier_level
FROM subscriptions s
JOIN pricing_plans pp ON pp.id = s.pricing_plan_id
LEFT JOIN plan_metadata pm ON pm.plan_id = pp.id
WHERE s.status NOT IN ('cancelled', 'expired', 'halted', 'failed')
  AND s.deleted_at IS NULL
ORDER BY s.user_id, s.product_domain,
  CASE s.status
    WHEN 'active' THEN 1
    WHEN 'pending_upgrade' THEN 2
    WHEN 'trialing' THEN 3
    ELSE 4
  END,
  COALESCE(pm.tier_level, 0) DESC,
  s.created_at DESC;

-- Migration G: billing funnel events (free-tier observability)
CREATE TABLE IF NOT EXISTS billing_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT NOT NULL,
  user_id UUID,
  product_domain TEXT,
  event_name TEXT NOT NULL,
  checkout_token TEXT,
  duration_ms INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_funnel_correlation
  ON billing_funnel_events (correlation_id);

CREATE INDEX IF NOT EXISTS idx_billing_funnel_event_created
  ON billing_funnel_events (event_name, created_at DESC);

-- Migration H: checkout worker lease columns
ALTER TABLE checkout_requests
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_checkout_stuck
  ON checkout_requests (status, processing_started_at)
  WHERE status IN ('initiated', 'processing');

-- Migration H RPC: claim checkout with lease
CREATE OR REPLACE FUNCTION claim_checkout_with_lease(
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 600
) RETURNS SETOF checkout_requests AS $$
DECLARE
  v_row checkout_requests%ROWTYPE;
BEGIN
  UPDATE checkout_requests
  SET status = 'initiated',
      worker_id = NULL,
      processing_started_at = NULL,
      worker_lease_expires_at = NULL,
      retry_count = COALESCE(retry_count, 0) + 1,
      updated_at = now()
  WHERE status = 'processing'
    AND worker_lease_expires_at IS NOT NULL
    AND worker_lease_expires_at < now()
    AND COALESCE(retry_count, 0) < 5;

  SELECT * INTO v_row
  FROM checkout_requests
  WHERE status = 'initiated'
     OR (status = 'processing' AND worker_lease_expires_at IS NOT NULL AND worker_lease_expires_at < now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE checkout_requests SET
    status = 'processing',
    worker_id = p_worker_id,
    processing_started_at = now(),
    worker_lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
    updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN NEXT v_row;
END;
$$ LANGUAGE plpgsql;

-- Migration I: Postgres-primary rate limits
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window
  ON rate_limit_buckets (window_start);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_bucket_key TEXT,
  p_window_seconds INT,
  p_max_requests INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  INSERT INTO rate_limit_buckets (bucket_key, window_start, request_count)
  VALUES (p_bucket_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET request_count = rate_limit_buckets.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql;

-- Migration B: drop restrictive plan_name check if present
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_name_check;

-- Migration E: hot path index
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain_status_created
  ON subscriptions (user_id, product_domain, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Migration D: subscription_events idempotency (partitioned table safe)
-- subscription_events is RANGE-partitioned on created_at; a UNIQUE index on
-- idempotency_key alone is invalid on the parent. Use a small dedup table instead.
DROP INDEX IF EXISTS idx_subscription_events_idempotency;

CREATE TABLE IF NOT EXISTS subscription_event_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  subscription_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_event_idempotency_created
  ON subscription_event_idempotency (created_at DESC);

-- Non-unique index on partitioned parent for lookups (valid without created_at in UNIQUE)
CREATE INDEX IF NOT EXISTS idx_subscription_events_idempotency_lookup
  ON subscription_events (idempotency_key, created_at DESC)
  WHERE idempotency_key IS NOT NULL;

-- Extend atomic transition RPC to enforce global idempotency via dedup table
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

-- Activation service feature flag
INSERT INTO billing_runtime_flags (flag_key, flag_value) VALUES
  ('use_activation_service', 'true'::jsonb),
  ('billing_sync_checkout', 'false'::jsonb)
ON CONFLICT (flag_key) DO UPDATE SET flag_value = EXCLUDED.flag_value;
