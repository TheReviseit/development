-- ============================================
-- ADD SIZE PRICING COLUMNS TO PRODUCTS TABLE
-- Run this in Supabase SQL Editor
-- ============================================

-- Add columns for size-based pricing on PRODUCTS table
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_size_pricing BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS size_prices JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS size_stocks JSONB DEFAULT '{}';

-- Add columns for size-based pricing on PRODUCT_VARIANTS table
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS has_size_pricing BOOLEAN DEFAULT false;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size_prices JSONB DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN products.has_size_pricing IS 'If true, each size can have its own price';
COMMENT ON COLUMN products.size_prices IS 'Size → price mapping, e.g., {"S": 999, "M": 1099, "L": 1199}';
COMMENT ON COLUMN products.size_stocks IS 'Size → stock mapping, e.g., {"S": 10, "M": 20, "L": 15}';
COMMENT ON COLUMN product_variants.has_size_pricing IS 'If true, each size in this variant can have its own price';
COMMENT ON COLUMN product_variants.size_prices IS 'Size → price mapping for this variant';
