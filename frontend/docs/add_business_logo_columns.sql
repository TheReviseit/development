-- ============================================
-- ADD LOGO COLUMNS TO BUSINESSES TABLE
-- Run this in Supabase SQL Editor
-- ============================================

-- Add columns for store logo
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_public_id TEXT;

-- Add comments for documentation
COMMENT ON COLUMN businesses.logo_url IS 'URL of the business/store logo';
COMMENT ON COLUMN businesses.logo_public_id IS 'Cloudinary public ID for the logo';
