-- =====================================================
-- SUPABASE DATABASE SCHEMA
-- Firebase Authentication → Supabase Sync System
-- =====================================================
-- This schema creates the necessary tables for storing
-- user data synced from Firebase Authentication
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- =====================================================
-- Stores user information synced from Firebase Auth
-- Primary key: id (UUID)
-- Unique constraint: firebase_uid
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Firebase Authentication UID (unique identifier from Firebase)
    firebase_uid TEXT NOT NULL UNIQUE,
    
    -- User profile information
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    
    -- Verification status
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    
    -- Authentication metadata
    provider TEXT, -- 'google.com', 'phone', 'password', etc.
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'manager')),
    
    -- Onboarding and activity tracking
    onboarding_completed BOOLEAN DEFAULT FALSE,
    last_sign_in_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES for performance
-- =====================================================

-- Index on firebase_uid for fast lookups during sync
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

-- Index on email for user searches
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index on phone for phone-based lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- =====================================================
-- UPDATE TIMESTAMP TRIGGER
-- =====================================================
-- Automatically updates the updated_at column

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- BUSINESSES TABLE (Optional - for your app)
-- =====================================================
-- Stores business information for each user

CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Business details
    business_name TEXT NOT NULL,
    category TEXT NOT NULL,
    website TEXT,
    address TEXT,
    logo_url TEXT,
    description TEXT,
    
    -- Settings
    timezone TEXT DEFAULT 'UTC',
    language TEXT DEFAULT 'en',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one business per user
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);

CREATE TRIGGER update_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- WHATSAPP CONNECTIONS TABLE (Optional - for your app)
-- =====================================================
-- Stores WhatsApp Business API connection details

CREATE TABLE IF NOT EXISTS whatsapp_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Provider information
    provider_type TEXT NOT NULL CHECK (provider_type IN ('cloud_api', 'gupshup', 'twilio', '360dialog')),
    phone_number TEXT NOT NULL,
    phone_number_id TEXT,
    business_id_meta TEXT,
    
    -- Encrypted API credentials (encrypted using your encryption service)
    api_token TEXT NOT NULL,
    
    -- Configuration
    default_sender_name TEXT,
    messaging_category TEXT CHECK (messaging_category IN ('transactional', 'marketing')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('connected', 'pending', 'failed')),
    test_number TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one connection per business
    UNIQUE(business_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_business_id ON whatsapp_connections(business_id);

CREATE TRIGGER update_whatsapp_connections_updated_at
    BEFORE UPDATE ON whatsapp_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VERIFICATION AND DATA INTEGRITY
-- =====================================================

-- Ensure firebase_uid is never null and always unique
ALTER TABLE users ALTER COLUMN firebase_uid SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_firebase_uid_unique UNIQUE (firebase_uid);

-- Add constraint to ensure email is present
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- =====================================================
-- SAMPLE DATA (Optional - for testing)
-- =====================================================
-- Uncomment to insert test data

/*
INSERT INTO users (firebase_uid, full_name, email, role) VALUES
('test-uid-123', 'Test User', 'test@example.com', 'user')
ON CONFLICT (firebase_uid) DO NOTHING;
*/
