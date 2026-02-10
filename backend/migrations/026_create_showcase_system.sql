-- ============================================
-- ENTERPRISE SHOWCASE SYSTEM
-- Design: JSONB-driven, versioned, extensible
-- Scale: Millions of businesses, zero migrations
-- ============================================

-- 1. SHOWCASE SETTINGS (JSONB-driven configuration)
CREATE TABLE IF NOT EXISTS showcase_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,  -- One config per business
    
    -- ✅ ENTERPRISE FIX #1: JSONB-driven config (NOT flat columns)
    presentation_config JSONB NOT NULL DEFAULT '{
        "version": 1,
        "fields": {
            "price": {"visible": false},
            "colors": {"visible": false},
            "sizes": {"visible": false},
            "stock": {"visible": false},
            "category": {"visible": true},
            "description": {"visible": true}
        },
        "actions": {
            "order": {"enabled": false, "label": "Order Now"},
            "book": {"enabled": false, "label": "Book Now"}
        },
        "layout": {
            "type": "standard",
            "imageRatio": "1:1"
        }
    }',
    
    -- ✅ ENTERPRISE FIX #5: Version tracking
    config_version INTEGER NOT NULL DEFAULT 1,
    
    -- ✅ ENTERPRISE FIX #3: Content type hint (soft classification)
    content_type TEXT DEFAULT 'generic' 
        CHECK (content_type IN ('generic', 'visual', 'service', 'catalog')),
    
    -- Metadata for A/B testing, theme packs (future)
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SHOWCASE ITEMS (Content-first, commerce-optional)
CREATE TABLE IF NOT EXISTS showcase_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    
    -- ✅ Core Content Fields (always present)
    title TEXT NOT NULL,
    description TEXT,
    subtitle TEXT,
    
    -- Media
    image_url TEXT,
    image_public_id TEXT,
    thumbnail_url TEXT,
    additional_images JSONB DEFAULT '[]',  -- ["url1", "url2"] for future flexibility
    
    -- ✅ ENTERPRISE FIX #2: Commerce data in optional JSONB
    -- This avoids tight coupling and forced e-commerce logic
    commerce JSONB DEFAULT NULL,
    -- Example structure:
    -- {
    --   "price": 2999,
    --   "compareAt": 3999,
    --   "inventory": {
    --     "status": "in_stock",
    --     "quantity": 12
    --   },
    --   "variants": [
    --     {"color": "Red", "size": "M", "sku": "ABC-M-RED"}
    --   ]
    -- }
    
    -- Extensible metadata (tags, albums, custom fields)
    metadata JSONB DEFAULT '{}',
    -- Examples:
    -- {"tags": ["wedding", "outdoor"], "album": "Summer 2024"}
    -- {"beforeImage": "url1", "afterImage": "url2"}
    -- {"videoUrl": "...", "duration": "2:30"}
    -- {"customField1": "anything"}
    
    -- Status
    is_visible BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    
    -- Engagement (future)
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR SCALE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_showcase_items_user_id ON showcase_items(user_id);
CREATE INDEX IF NOT EXISTS idx_showcase_items_visible ON showcase_items(user_id) 
    WHERE is_visible = true AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_showcase_items_featured ON showcase_items(user_id, is_featured DESC, created_at DESC);

-- GIN index for JSONB queries (future: filter by tags, search metadata)
CREATE INDEX IF NOT EXISTS idx_showcase_items_metadata ON showcase_items USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_showcase_items_commerce ON showcase_items USING gin(commerce);

CREATE INDEX IF NOT EXISTS idx_showcase_settings_user_id ON showcase_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_showcase_settings_config ON showcase_settings USING gin(presentation_config);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE showcase_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE showcase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "showcase_settings_deny_all" ON showcase_settings
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "showcase_items_deny_all" ON showcase_items
    FOR ALL TO anon, authenticated USING (false);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_showcase_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS showcase_items_updated_at ON showcase_items;
CREATE TRIGGER showcase_items_updated_at BEFORE UPDATE ON showcase_items
    FOR EACH ROW EXECUTE FUNCTION update_showcase_timestamp();

DROP TRIGGER IF EXISTS showcase_settings_updated_at ON showcase_settings;
CREATE TRIGGER showcase_settings_updated_at BEFORE UPDATE ON showcase_settings
    FOR EACH ROW EXECUTE FUNCTION update_showcase_timestamp();

-- Auto-create default settings for new businesses
CREATE OR REPLACE FUNCTION create_default_showcase_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO showcase_settings (user_id, content_type)
    VALUES (NEW.user_id, 'generic')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_showcase_settings_on_business ON businesses;
CREATE TRIGGER create_showcase_settings_on_business
    AFTER INSERT ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION create_default_showcase_settings();

-- ============================================
-- COMMENTS (Documentation)
-- ============================================
COMMENT ON TABLE showcase_settings IS 'JSONB-driven showcase configuration - zero migrations for new features';
COMMENT ON COLUMN showcase_settings.presentation_config IS 'All UI config in JSON - fields, actions, layout. Versionable and backward-compatible.';
COMMENT ON COLUMN showcase_settings.content_type IS 'Soft hint for UX/analytics - does NOT drive logic';
COMMENT ON TABLE showcase_items IS 'Content-first items with optional commerce data';
COMMENT ON COLUMN showcase_items.commerce IS 'Optional JSONB for pricing/inventory - separates content from commerce';
COMMENT ON COLUMN showcase_items.metadata IS 'Extensible JSONB for tags, albums, videos, custom fields - zero migrations';
