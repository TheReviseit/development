-- =====================================================
-- ADD SIZE OPTIONS AND COLOR OPTIONS COLUMNS
-- =====================================================
-- Run this SQL in your Supabase SQL Editor to add
-- support for custom sizes and colors in the options page
-- =====================================================

-- Add size_options column (JSONB array of strings)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS size_options JSONB DEFAULT '[]'::jsonb;

-- Add color_options column (JSONB array of objects with name and hex)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS color_options JSONB DEFAULT '[]'::jsonb;

-- Grant permissions (if needed)
-- GRANT ALL ON businesses TO authenticated;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'businesses' 
AND column_name IN ('size_options', 'color_options');
