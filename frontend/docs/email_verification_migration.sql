-- Create verification_codes table
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  code VARCHAR(6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);

-- Add email_verified column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Add index on email_verified for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Add comment for documentation
COMMENT ON TABLE verification_codes IS 'Stores email verification codes for user email verification';
COMMENT ON COLUMN verification_codes.code IS '6-digit verification code sent to user email';
COMMENT ON COLUMN verification_codes.expires_at IS 'Code expiration timestamp (15 minutes from creation)';
COMMENT ON COLUMN verification_codes.attempts IS 'Number of failed verification attempts';
