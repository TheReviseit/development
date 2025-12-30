-- Migration: Fix user_id type for Firebase compatibility
-- Created: 2025-12-31
-- Firebase UIDs are strings, not UUIDs, so we need to change the column type

-- Drop existing constraints and indexes first
DROP INDEX IF EXISTS idx_appointments_user_date;
DROP INDEX IF EXISTS idx_appointments_status;
DROP INDEX IF EXISTS idx_ai_capabilities_user;

-- Alter ai_capabilities table to use TEXT for user_id
ALTER TABLE ai_capabilities 
ALTER COLUMN user_id TYPE TEXT;

-- Alter appointments table to use TEXT for user_id
ALTER TABLE appointments 
ALTER COLUMN user_id TYPE TEXT;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_capabilities_user ON ai_capabilities(user_id);

-- Add comment explaining the change
COMMENT ON COLUMN ai_capabilities.user_id IS 'Firebase UID (string format)';
COMMENT ON COLUMN appointments.user_id IS 'Firebase UID (string format)';
