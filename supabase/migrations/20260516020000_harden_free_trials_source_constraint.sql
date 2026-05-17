-- Harden free_trials.source to persisted analytics values.
-- Internal request intents such as onboarding_plan_selection must be normalized
-- by the API before insertion.

DO $$
BEGIN
  IF to_regclass('public.free_trials') IS NOT NULL THEN
    ALTER TABLE public.free_trials
      DROP CONSTRAINT IF EXISTS free_trials_source_check;

    ALTER TABLE public.free_trials
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

    COMMENT ON COLUMN public.free_trials.source IS
      'Persisted trial attribution source. Internal request intents are normalized before insert.';
  END IF;
END $$;
