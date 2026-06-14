-- =============================================================================
-- Migration: 099_add_missing_subscription_columns.sql
-- Description: Add missing columns to subscriptions table used by upgrade flow
--              and cancellation tracking.
-- =============================================================================

-- Add cancellation_reason: tracks why a subscription was cancelled
-- (e.g. 'upgraded', 'abandoned_checkout', 'manual_cancel')
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add previous_subscription_id: links to the previous subscription when upgrading
-- This creates a chain: new_sub -> old_sub for audit and cancellation purposes
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS previous_subscription_id UUID REFERENCES subscriptions(id);

-- Refresh PostgREST schema cache so it picks up new columns immediately
NOTIFY pgrst, 'reload schema';
