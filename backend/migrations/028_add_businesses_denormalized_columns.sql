-- Migration: Add denormalized contact/location columns to businesses table
-- Purpose: Improve query performance for frequently accessed fields
-- Note: These are denormalized copies of JSONB data for faster access
-- The JSONB fields remain the source of truth

-- Add flat columns for contact information
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Add flat columns for location information
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS pincode TEXT;

-- Add flat column for logo
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_businesses_phone ON businesses(phone);
CREATE INDEX IF NOT EXISTS idx_businesses_email ON businesses(email);
CREATE INDEX IF NOT EXISTS idx_businesses_city ON businesses(city);

-- Comments
COMMENT ON COLUMN businesses.phone IS 'Denormalized from contact JSONB for faster queries';
COMMENT ON COLUMN businesses.email IS 'Denormalized from contact JSONB for faster queries';
COMMENT ON COLUMN businesses.whatsapp IS 'Denormalized from contact JSONB for faster queries';
COMMENT ON COLUMN businesses.address IS 'Denormalized from location JSONB for faster queries';
COMMENT ON COLUMN businesses.city IS 'Denormalized from location JSONB for faster queries';
COMMENT ON COLUMN businesses.state IS 'Denormalized from location JSONB for faster queries';
COMMENT ON COLUMN businesses.pincode IS 'Denormalized from location JSONB for faster queries';
COMMENT ON COLUMN businesses.logo_url IS 'Business logo URL for branding';
