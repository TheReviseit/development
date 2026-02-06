-- Console Email Verification OTP Storage
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.otp_console_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_otp_console_verification_email 
ON public.otp_console_verification(email);

-- Index for cleanup of expired OTPs
CREATE INDEX IF NOT EXISTS idx_otp_console_verification_expires 
ON public.otp_console_verification(expires_at);

-- Add email_verified_at column to users table if it doesn't exist
ALTER TABLE public.otp_console_users 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- Grant permissions for service role
GRANT ALL ON public.otp_console_verification TO service_role;
GRANT ALL ON public.otp_console_verification TO authenticated;

-- Enable RLS (Row Level Security)
ALTER TABLE public.otp_console_verification ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role full access" ON public.otp_console_verification
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
