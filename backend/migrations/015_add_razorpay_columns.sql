-- Migration: Add Razorpay payment gateway columns to businesses table
-- Run this in Supabase SQL Editor

-- Add Razorpay key columns for store owners
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS payments_enabled BOOLEAN DEFAULT FALSE;

-- Comment on columns
COMMENT ON COLUMN businesses.razorpay_key_id IS 'Store owner Razorpay Key ID for accepting payments';
COMMENT ON COLUMN businesses.razorpay_key_secret IS 'Store owner Razorpay Key Secret (encrypted)';
COMMENT ON COLUMN businesses.payments_enabled IS 'Whether online payments are enabled for this store';
