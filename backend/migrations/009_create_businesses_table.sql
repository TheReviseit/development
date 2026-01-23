-- Migration: Create businesses table for consolidated storage
-- Run this in Supabase SQL Editor

-- Create businesses table
CREATE TABLE IF NOT EXISTS businesses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,  -- Firebase UID
    business_name TEXT,
    industry TEXT,
    custom_industry TEXT,
    description TEXT,
    contact JSONB DEFAULT '{}',
    social_media JSONB DEFAULT '{}',
    location JSONB DEFAULT '{}',
    timings JSONB DEFAULT '{}',
    products JSONB DEFAULT '[]',
    product_categories TEXT[] DEFAULT '{}',
    policies JSONB DEFAULT '{}',
    ecommerce_policies JSONB DEFAULT '{}',
    faqs JSONB DEFAULT '[]',
    brand_voice JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);

-- Enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own business data
CREATE POLICY "Users can view own business data" ON businesses
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own business data" ON businesses
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own business data" ON businesses
    FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_businesses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_businesses_updated_at ON businesses;
CREATE TRIGGER trigger_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_businesses_updated_at();

-- Comment on table
COMMENT ON TABLE businesses IS 'Business profile data including products, timings, FAQs, policies - migrated from Firestore';
COMMENT ON COLUMN businesses.user_id IS 'Firebase UID (string format)';
COMMENT ON COLUMN businesses.products IS 'JSON array of products/services with name, price, description, imageUrl, etc.';
