-- Migration 027: Add Showcase Toggle to AI Capabilities
-- Adds showcase_enabled column to ai_capabilities table

ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS showcase_enabled BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN ai_capabilities.showcase_enabled IS 'Enable showcase feature for this user';
