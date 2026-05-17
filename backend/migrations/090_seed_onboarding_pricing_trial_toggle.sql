CREATE TABLE IF NOT EXISTS feature_flags (
    feature_key          VARCHAR(100) PRIMARY KEY,
    is_enabled_globally BOOLEAN NOT NULL DEFAULT true,
    description          TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags (
    feature_key,
    is_enabled_globally,
    description
)
VALUES (
    'onboarding_pricing_trial_toggle',
    true,
    'Runtime kill switch for onboarding pricing Free trial toggle. Disable to force paid-only pricing mode.'
)
ON CONFLICT (feature_key) DO UPDATE
SET
    description = EXCLUDED.description,
    updated_at = NOW();
