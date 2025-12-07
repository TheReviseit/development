-- Enhanced RLS Policies for Firebase Authentication
-- Run this SQL in your Supabase SQL Editor AFTER running schema.sql

-- First, add new columns to users table for auth sync
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMP WITH TIME ZONE;

-- Create index on last_sign_in_at for performance
CREATE INDEX IF NOT EXISTS idx_users_last_sign_in ON users(last_sign_in_at);

-- Comment on columns for documentation
COMMENT ON COLUMN users.firebase_uid IS 'Unique Firebase user ID from Firebase Auth';
COMMENT ON COLUMN users.phone_verified IS 'Whether phone number has been verified via OTP';
COMMENT ON COLUMN users.provider IS 'Firebase sign-in provider: google.com, phone, password, etc.';
COMMENT ON COLUMN users.last_sign_in_at IS 'Timestamp of last successful sign-in';

-- Drop existing RLS policies if they exist (to recreate with better names)
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;

-- Create enhanced RLS policies for users table

-- Policy 1: Allow service role to bypass RLS (for sync endpoint)
-- This is automatically handled by Supabase, no explicit policy needed

-- Policy 2: Users can SELECT their own data using Firebase UID from JWT
CREATE POLICY "auth_users_select_own" 
ON users 
FOR SELECT 
USING (
  firebase_uid = auth.jwt() ->> 'sub'
);

-- Policy 3: Users can UPDATE their own data
CREATE POLICY "auth_users_update_own" 
ON users 
FOR UPDATE 
USING (
  firebase_uid = auth.jwt() ->> 'sub'
)
WITH CHECK (
  firebase_uid = auth.jwt() ->> 'sub'
);

-- Policy 4: Users can INSERT their own data (handles first-time sync)
CREATE POLICY "auth_users_insert_own" 
ON users 
FOR INSERT 
WITH CHECK (
  firebase_uid = auth.jwt() ->> 'sub'
);

-- Note: The sync endpoint uses service_role key which bypasses RLS
-- Client-side queries use anon key with RLS enforced

-- Create a helper function to get current user ID from Firebase UID
CREATE OR REPLACE FUNCTION get_user_id_from_firebase()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM users 
    WHERE firebase_uid = auth.jwt() ->> 'sub'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update businesses policies to use the helper function
DROP POLICY IF EXISTS "Users can view own businesses" ON businesses;
DROP POLICY IF EXISTS "Users can insert own businesses" ON businesses;
DROP POLICY IF EXISTS "Users can update own businesses" ON businesses;

CREATE POLICY "auth_businesses_select_own" 
ON businesses 
FOR SELECT 
USING (
  user_id = get_user_id_from_firebase()
);

CREATE POLICY "auth_businesses_insert_own" 
ON businesses 
FOR INSERT 
WITH CHECK (
  user_id = get_user_id_from_firebase()
);

CREATE POLICY "auth_businesses_update_own" 
ON businesses 
FOR UPDATE 
USING (
  user_id = get_user_id_from_firebase()
)
WITH CHECK (
  user_id = get_user_id_from_firebase()
);

CREATE POLICY "auth_businesses_delete_own" 
ON businesses 
FOR DELETE 
USING (
  user_id = get_user_id_from_firebase()
);

-- Update whatsapp_connections policies
DROP POLICY IF EXISTS "Users can view own connections" ON whatsapp_connections;
DROP POLICY IF EXISTS "Users can insert own connections" ON whatsapp_connections;
DROP POLICY IF EXISTS "Users can update own connections" ON whatsapp_connections;

CREATE POLICY "auth_connections_select_own" 
ON whatsapp_connections 
FOR SELECT 
USING (
  business_id IN (
    SELECT id FROM businesses 
    WHERE user_id = get_user_id_from_firebase()
  )
);

CREATE POLICY "auth_connections_insert_own" 
ON whatsapp_connections 
FOR INSERT 
WITH CHECK (
  business_id IN (
    SELECT id FROM businesses 
    WHERE user_id = get_user_id_from_firebase()
  )
);

CREATE POLICY "auth_connections_update_own" 
ON whatsapp_connections 
FOR UPDATE 
USING (
  business_id IN (
    SELECT id FROM businesses 
    WHERE user_id = get_user_id_from_firebase()
  )
)
WITH CHECK (
  business_id IN (
    SELECT id FROM businesses 
    WHERE user_id = get_user_id_from_firebase()
  )
);

CREATE POLICY "auth_connections_delete_own" 
ON whatsapp_connections 
FOR DELETE 
USING (
  business_id IN (
    SELECT id FROM businesses 
    WHERE user_id = get_user_id_from_firebase()
  )
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE 'Enhanced RLS policies for Firebase auth have been successfully created!';
  RAISE NOTICE 'Users table now includes: phone_verified, provider, last_sign_in_at columns';
  RAISE NOTICE 'All policies are using firebase_uid from JWT for authentication';
END $$;
