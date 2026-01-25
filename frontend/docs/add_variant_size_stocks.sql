-- ============================================
-- ADD SIZE STOCK COLUMN TO PRODUCT VARIANTS TABLE
-- Run this in Supabase SQL Editor
-- ============================================

-- Add column for size-based stock on PRODUCT_VARIANTS table
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size_stocks JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN product_variants.size_stocks IS 'Size → stock mapping for this variant, e.g., {"S": 10, "M": 20}';
