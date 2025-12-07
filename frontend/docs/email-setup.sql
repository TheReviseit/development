-- Email Automation Setup Script
-- Run this in your Supabase SQL Editor

-- 1. Make your user an admin (replace with your email)
-- UPDATE users 
-- SET role = 'admin' 
-- WHERE email = 'your-email@example.com';

-- 2. Create email_logs table for tracking sent emails (optional)
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sent_by UUID REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES users(id),
  subject TEXT NOT NULL,
  template_name TEXT,
  status TEXT CHECK (status IN ('sent', 'failed', 'pending')) DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_by ON email_logs(sent_by);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_user_id ON email_logs(recipient_user_id);

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all email logs
CREATE POLICY "Admins can view all email logs"
ON email_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.firebase_uid = current_setting('request.jwt.claims', true)::json->>'sub'
    AND users.role = 'admin'
  )
);

-- Policy: Service role can insert email logs
CREATE POLICY "Service role can insert email logs"
ON email_logs
FOR INSERT
WITH CHECK (true);

-- Verify setup
SELECT 
  'Email logs table created successfully' as message,
  COUNT(*) as log_count 
FROM email_logs;
