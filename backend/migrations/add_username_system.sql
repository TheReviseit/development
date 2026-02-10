-- =====================================================
-- USERNAME SYSTEM MIGRATION
-- Phase 1: Database Schema Changes
-- =====================================================
-- This migration adds username support to the users table
-- with enterprise-grade features:
-- - Case-insensitive uniqueness
-- - 1-change-ever policy enforcement
-- - Claim window to prevent squatting
-- - Reserved username system
-- =====================================================

-- Add username columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS username_lower TEXT,
ADD COLUMN IF NOT EXISTS username_status TEXT DEFAULT 'pending' CHECK (username_status IN ('pending', 'active', 'reserved')),
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS username_change_count INTEGER DEFAULT 0;

-- Add unique constraints on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower 
ON users(username_lower) 
WHERE username_lower IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username 
ON users(username) 
WHERE username IS NOT NULL;

-- Add index for fast status lookups
CREATE INDEX IF NOT EXISTS idx_users_username_status 
ON users(username_status) 
WHERE username_status IS NOT NULL;

-- =====================================================
-- RESERVED USERNAMES TABLE
-- =====================================================
-- Stores reserved usernames that cannot be claimed
-- Allows dynamic updates without code deployment
-- =====================================================

CREATE TABLE IF NOT EXISTS reserved_usernames (
  username_lower TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- POPULATE RESERVED USERNAMES
-- =====================================================
-- Initial blocklist of system and common routes
-- =====================================================

INSERT INTO reserved_usernames (username_lower, reason) VALUES
  ('admin', 'system'),
  ('api', 'system'),
  ('support', 'system'),
  ('help', 'system'),
  ('about', 'system'),
  ('pricing', 'system'),
  ('login', 'system'),
  ('signup', 'system'),
  ('settings', 'system'),
  ('dashboard', 'system'),
  ('app', 'system'),
  ('www', 'system'),
  ('mail', 'system'),
  ('email', 'system'),
  ('ftp', 'system'),
  ('localhost', 'system'),
  ('flowauxi', 'brand'),
  ('system', 'system'),
  ('root', 'system'),
  ('null', 'system'),
  ('undefined', 'system'),
  ('test', 'system'),
  ('demo', 'system'),
  ('legal', 'system'),
  ('terms', 'system'),
  ('privacy', 'system'),
  ('contact', 'system'),
  ('store', 'system'),
  ('showcase', 'system'),
  ('product', 'system'),
  ('order', 'system'),
  ('payment', 'system'),
  ('checkout', 'system'),
  ('billing', 'system'),
  ('static', 'system'),
  ('public', 'system'),
  ('assets', 'system'),
  ('cdn', 'system'),
  ('media', 'system'),
  ('upload', 'system'),
  ('download', 'system'),
  ('webhook', 'system'),
  ('callback', 'system')
ON CONFLICT (username_lower) DO NOTHING;

-- =====================================================
-- USERNAME VALIDATION FUNCTION
-- =====================================================
-- Validates username format and availability
-- Returns: Boolean (true if valid and available)
-- =====================================================

CREATE OR REPLACE FUNCTION validate_username(p_username TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_username_lower TEXT;
  v_is_reserved BOOLEAN;
  v_is_taken BOOLEAN;
BEGIN
  -- Convert to lowercase for case-insensitive check
  v_username_lower := LOWER(TRIM(p_username));
  
  -- Check length (3-30 characters)
  IF LENGTH(v_username_lower) < 3 OR LENGTH(v_username_lower) > 30 THEN
    RETURN FALSE;
  END IF;
  
  -- Check format: alphanumeric and hyphens only, no leading/trailing hyphens
  IF v_username_lower !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' AND LENGTH(v_username_lower) > 1 THEN
    RETURN FALSE;
  END IF;
  
  -- Single character usernames must be alphanumeric
  IF LENGTH(v_username_lower) = 1 AND v_username_lower !~ '^[a-z0-9]$' THEN
    RETURN FALSE;
  END IF;
  
  -- Check if reserved
  SELECT EXISTS(
    SELECT 1 FROM reserved_usernames 
    WHERE username_lower = v_username_lower
  ) INTO v_is_reserved;
  
  IF v_is_reserved THEN
    RETURN FALSE;
  END IF;
  
  -- Check if taken by another user
  SELECT EXISTS(
    SELECT 1 FROM users 
    WHERE username_lower = v_username_lower 
    AND id != p_user_id
  ) INTO v_is_taken;
  
  IF v_is_taken THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USERNAME CLAIM FUNCTION
-- =====================================================
-- Enforces 1-change-ever policy
-- Handles claim window and status transitions
-- =====================================================

CREATE OR REPLACE FUNCTION claim_username(
  p_user_id UUID,
  p_username TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_username_lower TEXT;
  v_current_status TEXT;
  v_change_count INTEGER;
  v_is_valid BOOLEAN;
BEGIN
  -- Get current user data
  SELECT username_status, username_change_count
  INTO v_current_status, v_change_count
  FROM users
  WHERE id = p_user_id;
  
  -- Enforce 1-change-ever policy (except for first claim)
  IF v_current_status = 'active' AND v_change_count >= 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Username can only be changed once',
      'code', 'CHANGE_LIMIT_REACHED'
    );
  END IF;
  
  -- Validate username
  v_is_valid := validate_username(p_username, p_user_id);
  
  IF NOT v_is_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or unavailable username',
      'code', 'INVALID_USERNAME'
    );
  END IF;
  
  v_username_lower := LOWER(TRIM(p_username));
  
  -- Update user record (pending status, requires confirmation)
  UPDATE users
  SET 
    username = p_username,
    username_lower = v_username_lower,
    username_status = 'pending',
    claimed_at = CURRENT_TIMESTAMP
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'username', p_username,
    'status', 'pending'
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USERNAME CONFIRM FUNCTION
-- =====================================================
-- Activates username after user confirmation
-- Increments change count
-- =====================================================

CREATE OR REPLACE FUNCTION confirm_username(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_username TEXT;
  v_current_status TEXT;
BEGIN
  -- Get current data
  SELECT username, username_status
  INTO v_username, v_current_status
  FROM users
  WHERE id = p_user_id;
  
  IF v_current_status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No pending username to confirm',
      'code', 'NO_PENDING_USERNAME'
    );
  END IF;
  
  -- Activate username
  UPDATE users
  SET 
    username_status = 'active',
    username_changed_at = CURRENT_TIMESTAMP,
    username_change_count = username_change_count + 1
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'username', v_username,
    'status', 'active'
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CLEANUP ABANDONED CLAIMS
-- =====================================================
-- Clears pending usernames after 24h timeout
-- Run this as a periodic job
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_abandoned_username_claims()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Clear pending usernames older than 24 hours
  UPDATE users
  SET 
    username = NULL,
    username_lower = NULL,
    username_status = 'pending',
    claimed_at = NULL
  WHERE 
    username_status = 'pending'
    AND claimed_at < (CURRENT_TIMESTAMP - INTERVAL '24 hours');
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN users.username IS 'Public username for URL routing (display case preserved)';
COMMENT ON COLUMN users.username_lower IS 'Lowercase username for case-insensitive uniqueness';
COMMENT ON COLUMN users.username_status IS 'Status: pending (claimed), active (confirmed), reserved (system)';
COMMENT ON COLUMN users.claimed_at IS 'When username was first claimed (prevents squatting)';
COMMENT ON COLUMN users.username_changed_at IS 'Last time username was changed';
COMMENT ON COLUMN users.username_change_count IS 'Number of times username changed (max 1)';

COMMENT ON TABLE reserved_usernames IS 'System reserved usernames that cannot be claimed';
COMMENT ON FUNCTION validate_username IS 'Validates username format and checks availability';
COMMENT ON FUNCTION claim_username IS 'Claims username with pending status (requires confirmation)';
COMMENT ON FUNCTION confirm_username IS 'Activates pending username after user confirmation';
COMMENT ON FUNCTION cleanup_abandoned_username_claims IS 'Removes pending usernames older than 24h';
