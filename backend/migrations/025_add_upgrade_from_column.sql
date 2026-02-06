-- Migration: Add upgrade_from column to track upgrade history
-- Created: 2026-02-06

-- Add upgrade_from column to track which plan user upgraded from
ALTER TABLE otp_console_subscriptions
ADD COLUMN IF NOT EXISTS upgrade_from TEXT;

-- Add comment for documentation
COMMENT ON COLUMN otp_console_subscriptions.upgrade_from IS 'Previous plan name when upgrading (for audit/analytics)';
