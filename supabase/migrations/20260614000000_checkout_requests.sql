CREATE TABLE IF NOT EXISTS checkout_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    firebase_uid    TEXT NOT NULL,
    domain          TEXT NOT NULL,
    target_plan_id  TEXT NOT NULL,
    target_plan_slug TEXT NOT NULL,
    billing_cycle   TEXT NOT NULL DEFAULT 'monthly',
    user_email      TEXT NOT NULL,
    addon_data      JSONB DEFAULT '[]'::jsonb,
    checkout_token  TEXT NOT NULL UNIQUE,
    razorpay_plan_id TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'initiated'
                        CHECK (status IN ('initiated','processing','completed','failed')),
    razorpay_subscription_id TEXT,
    razorpay_key_id         TEXT,
    amount_paise    INTEGER,
    currency        TEXT DEFAULT 'INR',
    error_message   TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 3,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    worker_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkout_requests_user_status
    ON checkout_requests (user_id, status);

CREATE INDEX IF NOT EXISTS idx_checkout_requests_status_created
    ON checkout_requests (status, created_at)
    WHERE status IN ('initiated', 'processing');

CREATE INDEX IF NOT EXISTS idx_checkout_requests_token
    ON checkout_requests (checkout_token);

CREATE INDEX IF NOT EXISTS idx_checkout_requests_orphan_sweep
    ON checkout_requests (status, updated_at)
    WHERE status = 'processing';
