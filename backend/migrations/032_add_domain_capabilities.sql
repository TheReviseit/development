-- Migration: Add domain-specific capabilities for shop and marketing products
-- Created: 2026-02-10
-- Description: Extends ai_capabilities with shop_enabled and marketing_enabled columns
--              to support domain-based product isolation architecture

-- ============================================================
-- 1. Add domain capability columns
-- ============================================================

-- Add shop_enabled column (default TRUE for all existing users)
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS shop_enabled BOOLEAN DEFAULT TRUE;

-- Add marketing_enabled column (default FALSE, opt-in feature)
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS marketing_enabled BOOLEAN DEFAULT FALSE;

-- Add extensible JSONB column for future domain-specific capabilities
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS domain_capabilities JSONB DEFAULT '{}';

-- ============================================================
-- 2. Create indexes for domain capability lookups
-- ============================================================

-- Index for shop capability queries (most common)
CREATE INDEX IF NOT EXISTS idx_ai_capabilities_shop 
ON ai_capabilities(user_id, shop_enabled);

-- Index for marketing capability queries
CREATE INDEX IF NOT EXISTS idx_ai_capabilities_marketing 
ON ai_capabilities(user_id, marketing_enabled);

-- Composite index for multi-domain capability checks
CREATE INDEX IF NOT EXISTS idx_ai_capabilities_domains 
ON ai_capabilities(user_id, shop_enabled, showcase_enabled, marketing_enabled);

-- ============================================================
-- 3. Backfill existing users with shop capability
-- ============================================================

-- Ensure all existing users have shop enabled (backwards compatibility)
UPDATE ai_capabilities 
SET shop_enabled = TRUE 
WHERE shop_enabled IS NULL;

-- ============================================================
-- 4. Add column comments for documentation
-- ============================================================

COMMENT ON COLUMN ai_capabilities.shop_enabled IS 
  'Enable shop/commerce product access. Default: TRUE for all users. Required for shop.flowauxi.com access.';

COMMENT ON COLUMN ai_capabilities.marketing_enabled IS 
  'Enable marketing/campaigns product access. Default: FALSE (opt-in). Required for marketing.flowauxi.com access.';

COMMENT ON COLUMN ai_capabilities.domain_capabilities IS 
  'Extensible JSONB for future domain-specific capability configuration.';

-- ============================================================
-- 5. Create function to auto-grant shop capability on user creation
-- ============================================================

CREATE OR REPLACE FUNCTION auto_grant_shop_capability()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure new users always get shop enabled
  IF NEW.shop_enabled IS NULL THEN
    NEW.shop_enabled := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trigger_auto_grant_shop ON ai_capabilities;

-- Create trigger for new user insertions
CREATE TRIGGER trigger_auto_grant_shop
  BEFORE INSERT ON ai_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_shop_capability();

-- ============================================================
-- 6. Verification queries (run manually to verify migration)
-- ============================================================

-- Verify column additions
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'ai_capabilities' AND column_name IN ('shop_enabled', 'marketing_enabled', 'domain_capabilities');

-- Verify all users have shop enabled
-- SELECT COUNT(*) as total_users, 
--        COUNT(*) FILTER (WHERE shop_enabled = TRUE) as shop_enabled_count,
--        COUNT(*) FILTER (WHERE marketing_enabled = TRUE) as marketing_enabled_count
-- FROM ai_capabilities;

-- Sample user capabilities
-- SELECT user_id, shop_enabled, showcase_enabled, marketing_enabled, domain_capabilities
-- FROM ai_capabilities 
-- LIMIT 5;
