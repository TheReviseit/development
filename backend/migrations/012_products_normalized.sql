-- ============================================
-- PRODUCTION-GRADE NORMALIZED PRODUCT SCHEMA
-- Migration: 012_products_normalized.sql
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. PRODUCT CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,  -- Firebase UID (matches businesses.user_id)
    name TEXT NOT NULL,
    slug TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- 2. PRODUCTS TABLE (MAIN)
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,  -- Firebase UID
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    
    -- Preserve original JSON id for migration reference
    legacy_id TEXT,
    
    -- Core fields
    name TEXT NOT NULL,
    description TEXT,
    sku TEXT,
    brand TEXT,
    
    -- Pricing
    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    compare_at_price DECIMAL(12, 2),
    price_unit TEXT DEFAULT 'INR',
    
    -- Stock
    stock_quantity INTEGER DEFAULT 0,
    stock_status TEXT DEFAULT 'in_stock' 
        CHECK (stock_status IN ('in_stock', 'out_of_stock', 'low_stock', 'preorder')),
    track_inventory BOOLEAN DEFAULT true,
    low_stock_threshold INTEGER DEFAULT 5,
    
    -- Media
    image_url TEXT,
    image_public_id TEXT,
    
    -- Metadata
    duration TEXT,
    materials TEXT[],
    tags TEXT[],
    sizes TEXT[],
    colors TEXT[],
    
    -- Status & Soft Delete
    is_available BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRODUCT VARIANTS TABLE (with user_id for bulletproof ownership)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,  -- For bulletproof ownership verification
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Variant attributes
    color TEXT,
    size TEXT,
    material TEXT,
    
    -- Pricing (overrides product price if set)
    price DECIMAL(12, 2),
    compare_at_price DECIMAL(12, 2),
    stock_quantity INTEGER DEFAULT 0,
    sku TEXT,
    
    -- Media
    image_url TEXT,
    image_public_id TEXT,
    
    -- Status
    is_available BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCT IMAGES TABLE (with user_id for bulletproof ownership)
CREATE TABLE IF NOT EXISTS product_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,  -- For bulletproof ownership verification
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    
    image_url TEXT NOT NULL,
    public_id TEXT,
    alt_text TEXT,
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PRODUCT AUDIT LOG (who did what, when)
CREATE TABLE IF NOT EXISTS product_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id UUID,
    action TEXT NOT NULL 
        CHECK (action IN ('create', 'update', 'delete', 'restore', 'bulk_update', 'bulk_delete')),
    
    -- Change details
    changes JSONB,
    affected_count INTEGER DEFAULT 1,
    
    -- Context
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRODUCT BACKUPS TABLE (automatic pre-destructive backups)
CREATE TABLE IF NOT EXISTS product_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- Backup data
    products_data JSONB NOT NULL,
    products_count INTEGER NOT NULL,
    
    -- Context
    reason TEXT NOT NULL,  -- 'pre_bulk_delete', 'pre_migration', 'scheduled', 'manual'
    triggered_by TEXT,  -- API endpoint or user action
    
    -- Retention
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    is_restored BOOLEAN DEFAULT false,
    restored_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_not_deleted ON products(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_products_available ON products(user_id) WHERE is_available = true AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_products_name_search ON products USING gin(to_tsvector('english', name));

-- Partial unique index: only enforce when SKU is not null/empty
CREATE UNIQUE INDEX IF NOT EXISTS products_user_sku_unique 
    ON products(user_id, sku) 
    WHERE sku IS NOT NULL AND sku <> '';

CREATE INDEX IF NOT EXISTS idx_variants_user_id ON product_variants(user_id);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON product_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_images_user_id ON product_images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON product_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON product_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_user_id ON product_backups(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- Service role bypasses RLS, API layer verifies Firebase UID
-- ============================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_backups ENABLE ROW LEVEL SECURITY;

-- Deny all access to anon and authenticated users
-- Service role (used by API) bypasses RLS automatically
CREATE POLICY "products_deny_all" ON products 
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "variants_deny_all" ON product_variants 
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "categories_deny_all" ON product_categories 
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "images_deny_all" ON product_images 
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "audit_deny_all" ON product_audit_log 
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "backups_deny_all" ON product_backups 
    FOR ALL TO anon, authenticated USING (false);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_product_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_product_timestamp();

DROP TRIGGER IF EXISTS variants_updated_at ON product_variants;
CREATE TRIGGER variants_updated_at BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION update_product_timestamp();

DROP TRIGGER IF EXISTS categories_updated_at ON product_categories;
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE FUNCTION update_product_timestamp();

-- Auto-set deleted_at when is_deleted changes to true
CREATE OR REPLACE FUNCTION set_product_deleted_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false) THEN
        NEW.deleted_at = NOW();
    ELSIF NEW.is_deleted = false AND OLD.is_deleted = true THEN
        NEW.deleted_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_soft_delete ON products;
CREATE TRIGGER products_soft_delete BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_product_deleted_at();

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE products IS 'Normalized products table with soft delete support';
COMMENT ON TABLE product_variants IS 'Product variants (size, color combinations) with user_id for ownership';
COMMENT ON TABLE product_categories IS 'Product categories per user';
COMMENT ON TABLE product_images IS 'Multiple images per product/variant';
COMMENT ON TABLE product_audit_log IS 'Audit trail for all product changes';
COMMENT ON TABLE product_backups IS 'Automatic backups before destructive operations';
COMMENT ON COLUMN products.legacy_id IS 'Original JSON id for migration reference';
COMMENT ON COLUMN products.is_deleted IS 'Soft delete flag - never permanently delete products';
