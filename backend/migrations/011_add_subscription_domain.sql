-- Migration: Add domain field to subscriptions table
-- ==================================================
-- Date: 2026-02-14
-- Description: Add domain tracking for multi-domain pricing system

-- Add domain column to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS domain VARCHAR(50) DEFAULT 'dashboard' NOT NULL;

-- Add index for faster domain queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_domain 
ON subscriptions(domain);

-- Add composite index for user+domain queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain 
ON subscriptions(user_id, domain);

-- Add domain to existing subscriptions (backfill as 'dashboard')
UPDATE subscriptions 
SET domain = 'dashboard' 
WHERE domain IS NULL;

-- Add saga_id column for tracking distributed transactions
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS saga_id VARCHAR(100);

-- Add index for saga queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_saga_id 
ON subscriptions(saga_id);
