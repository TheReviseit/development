-- Migration: Add phone column to users table
-- ==================================================
-- Date: 2026-02-14
-- Description: Add phone number field to users table for signup

-- Add phone column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Add index for phone queries (optional but good for lookups)
CREATE INDEX IF NOT EXISTS idx_users_phone 
ON users(phone) 
WHERE phone IS NOT NULL;

-- Add comment to column
COMMENT ON COLUMN users.phone IS 'User phone number from signup';
