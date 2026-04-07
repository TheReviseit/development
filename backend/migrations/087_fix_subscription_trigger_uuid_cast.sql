-- ============================================================
-- FIX: auto_complete_onboarding_on_subscription trigger
-- ============================================================
-- ROOT CAUSE: subscriptions.user_id is TEXT but users.id is UUID
-- The trigger does: WHERE id = NEW.user_id → uuid = text → error
-- FIX: Cast NEW.user_id to UUID explicitly
-- ============================================================

CREATE OR REPLACE FUNCTION auto_complete_onboarding_on_subscription()
RETURNS TRIGGER AS $$
DECLARE v_rows_updated INTEGER;
BEGIN
  -- CRITICAL: Cast NEW.user_id (text) to UUID for comparison with users.id (uuid)
  UPDATE users SET onboarding_completed_at = NOW(), onboarding_completed_reason = 'subscription',
      onboarding_completed_via = 'trigger', updated_at = NOW() 
  WHERE id = NEW.user_id::uuid AND onboarding_completed_at IS NULL;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated > 0 THEN
    RAISE LOG '[trigger:SUCCESS] onboarding_completed user_id=% subscription_id=%', NEW.user_id, NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
