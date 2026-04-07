-- ============================================================
-- MIGRATION: 086_onboarding_event_sourcing (v5)
-- ============================================================
-- Note: Using regular INDEX (not CONCURRENTLY) for Supabase compatibility
-- ============================================================

-- Step 1: Add new columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed_at') THEN
    ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed_reason') THEN
    ALTER TABLE users ADD COLUMN onboarding_completed_reason TEXT 
      CHECK (onboarding_completed_reason IN ('trial_start', 'subscription', 'manual', 'whatsapp_connect', 'migrated'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed_via') THEN
    ALTER TABLE users ADD COLUMN onboarding_completed_via TEXT;
  END IF;
END $$;

-- Step 2: Migrate data from old boolean
DO $$
DECLARE v_migrated INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed') THEN
    UPDATE users 
    SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
        onboarding_completed_reason = COALESCE(onboarding_completed_reason, 'migrated'),
        onboarding_completed_via = COALESCE(onboarding_completed_via, 'migration')
    WHERE onboarding_completed = true AND onboarding_completed_at IS NULL;
    GET DIAGNOSTICS v_migrated = ROW_COUNT;
    RAISE NOTICE 'Migrated % users', v_migrated;
  END IF;
END $$;

-- Step 3: Drop old boolean column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE users DROP COLUMN onboarding_completed;
  END IF;
END $$;

-- Step 4: Create indexes (non-CONCURRENTLY for transaction compatibility)
CREATE INDEX IF NOT EXISTS idx_users_onboarding_at ON users(onboarding_completed_at DESC) WHERE onboarding_completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_onboarding_reason ON users(onboarding_completed_reason) WHERE onboarding_completed_at IS NOT NULL;

-- Step 5: Create view
DROP VIEW IF EXISTS users_with_onboarding CASCADE;
CREATE VIEW users_with_onboarding AS
SELECT *, (onboarding_completed_at IS NOT NULL) AS onboarding_completed FROM users;

GRANT SELECT ON users_with_onboarding TO authenticated;
GRANT SELECT ON users_with_onboarding TO anon;
GRANT SELECT ON users_with_onboarding TO service_role;

-- ============================================================
-- TRIGGER: auto_complete_onboarding_on_trial
-- ============================================================

CREATE OR REPLACE FUNCTION auto_complete_onboarding_on_trial()
RETURNS TRIGGER AS $$
DECLARE v_existing TIMESTAMPTZ; v_rows_updated INTEGER;
BEGIN
  SELECT onboarding_completed_at INTO v_existing FROM users WHERE id = NEW.user_id;
  IF v_existing IS NOT NULL THEN
    RAISE LOG '[trigger] User % already onboarded', NEW.user_id;
    RETURN NEW;
  END IF;
  UPDATE users SET onboarding_completed_at = NOW(), onboarding_completed_reason = 'trial_start', 
      onboarding_completed_via = 'trigger', updated_at = NOW() WHERE id = NEW.user_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated > 0 THEN
    RAISE LOG '[trigger:SUCCESS] onboarding_completed user_id=% trial_id=%', NEW.user_id, NEW.id;
  ELSE
    RAISE WARNING '[trigger:ERROR] Failed to update user %', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trial_started_complete_onboarding ON free_trials;
CREATE TRIGGER trial_started_complete_onboarding
  AFTER INSERT ON free_trials
  FOR EACH ROW
  WHEN (NEW.status IN ('active', 'expiring_soon', 'pending'))
  EXECUTE FUNCTION auto_complete_onboarding_on_trial();

DROP TRIGGER IF EXISTS trial_activated_complete_onboarding ON free_trials;
CREATE TRIGGER trial_activated_complete_onboarding
  AFTER UPDATE OF status ON free_trials
  FOR EACH ROW
  WHEN (OLD.status != 'active' AND NEW.status = 'active')
  EXECUTE FUNCTION auto_complete_onboarding_on_trial();

-- ============================================================
-- TRIGGER: auto_complete_onboarding_on_subscription
-- ============================================================

CREATE OR REPLACE FUNCTION auto_complete_onboarding_on_subscription()
RETURNS TRIGGER AS $$
DECLARE v_rows_updated INTEGER;
BEGIN
  UPDATE users SET onboarding_completed_at = NOW(), onboarding_completed_reason = 'subscription',
      onboarding_completed_via = 'trigger', updated_at = NOW() 
  WHERE id = NEW.user_id AND onboarding_completed_at IS NULL;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated > 0 THEN
    RAISE LOG '[trigger:SUCCESS] onboarding_completed user_id=% subscription_id=%', NEW.user_id, NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscription_started_complete_onboarding ON subscriptions;
CREATE TRIGGER subscription_started_complete_onboarding
  AFTER INSERT ON subscriptions
  FOR EACH ROW
  WHEN (NEW.status IN ('active', 'pending', 'trialing', 'pending_upgrade'))
  EXECUTE FUNCTION auto_complete_onboarding_on_subscription();

-- HEALTH CHECK VIEW
CREATE OR REPLACE VIEW v_users_needing_onboarding AS
SELECT ft.id, ft.user_id, ft.status, ft.created_at
FROM free_trials ft JOIN users u ON ft.user_id = u.id
WHERE ft.status IN ('active', 'expiring_soon') AND u.onboarding_completed_at IS NULL;
