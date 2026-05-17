-- =============================================================================
-- Migration: 091_harden_free_trials_source_constraint.sql
-- Description:
--   Keep free_trials.source aligned with persisted analytics values.
--   Internal UI/action sentinels such as onboarding_plan_selection are request
--   intents only and must be mapped before insertion.
-- =============================================================================

BEGIN;

ALTER TABLE free_trials
  DROP CONSTRAINT IF EXISTS free_trials_source_check;

ALTER TABLE free_trials
  ADD CONSTRAINT free_trials_source_check CHECK (
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

COMMENT ON COLUMN free_trials.source IS
  'Persisted trial attribution source. Internal request intents are normalized before insert.';

COMMIT;
