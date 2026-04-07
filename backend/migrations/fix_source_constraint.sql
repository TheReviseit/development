-- Add 'shop_onboarding' to source check constraint
-- Run in Supabase SQL Editor

ALTER TABLE free_trials DROP CONSTRAINT free_trials_source_check;

ALTER TABLE free_trials ADD CONSTRAINT free_trials_source_check CHECK (
    source IN (
        'organic',
        'marketing',
        'referral',
        'api',
        'shop',
        'shop_onboarding',
        'admin_grant'
    )
);

SELECT 'Source constraint updated successfully' as result;