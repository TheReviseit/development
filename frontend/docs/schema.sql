-- WhatsApp SaaS Onboarding Database Schema
-- Run this SQL in your Supabase SQL Editor

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'user',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Businesses Table
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  category TEXT NOT NULL,
  website TEXT,
  address TEXT,
  logo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  language TEXT DEFAULT 'English',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. WhatsApp Connections Table
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('cloud_api', 'gupshup', 'twilio', '360dialog')),
  phone_number TEXT NOT NULL,
  phone_number_id TEXT,
  business_id_meta TEXT,
  api_token TEXT NOT NULL, -- This will be encrypted
  default_sender_name TEXT NOT NULL,
  messaging_category TEXT CHECK (messaging_category IN ('transactional', 'marketing')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('connected', 'pending', 'failed')),
  test_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_business_id ON whatsapp_connections(business_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_connections_updated_at BEFORE UPDATE ON whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (firebase_uid = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (firebase_uid = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (firebase_uid = auth.jwt() ->> 'sub');

-- Businesses table policies
CREATE POLICY "Users can view own businesses" ON businesses
  FOR SELECT USING (user_id IN (
    SELECT id FROM users WHERE firebase_uid = auth.jwt() ->> 'sub'
  ));

CREATE POLICY "Users can insert own businesses" ON businesses
  FOR INSERT WITH CHECK (user_id IN (
    SELECT id FROM users WHERE firebase_uid = auth.jwt() ->> 'sub'
  ));

CREATE POLICY "Users can update own businesses" ON businesses
  FOR UPDATE USING (user_id IN (
    SELECT id FROM users WHERE firebase_uid = auth.jwt() ->> 'sub'
  ));

-- WhatsApp connections table policies
CREATE POLICY "Users can view own connections" ON whatsapp_connections
  FOR SELECT USING (business_id IN (
    SELECT b.id FROM businesses b
    JOIN users u ON b.user_id = u.id
    WHERE u.firebase_uid = auth.jwt() ->> 'sub'
  ));

CREATE POLICY "Users can insert own connections" ON whatsapp_connections
  FOR INSERT WITH CHECK (business_id IN (
    SELECT b.id FROM businesses b
    JOIN users u ON b.user_id = u.id
    WHERE u.firebase_uid = auth.jwt() ->> 'sub'
  ));

CREATE POLICY "Users can update own connections" ON whatsapp_connections
  FOR UPDATE USING (business_id IN (
    SELECT b.id FROM businesses b
    JOIN users u ON b.user_id = u.id
    WHERE u.firebase_uid = auth.jwt() ->> 'sub'
  ));
