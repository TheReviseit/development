-- ============================================
-- DATA MIGRATION: JSONB → Normalized Tables
-- Migration: 013_migrate_products_from_jsonb.sql
-- Run this AFTER 012_products_normalized.sql
-- ============================================

-- Step 0: Create backup BEFORE migration
INSERT INTO product_backups (user_id, products_data, products_count, reason, triggered_by)
SELECT 
    user_id,
    products,
    COALESCE(jsonb_array_length(products), 0),
    'pre_migration',
    'migration_013'
FROM businesses
WHERE products IS NOT NULL 
  AND jsonb_typeof(products) = 'array' 
  AND jsonb_array_length(products) > 0;

-- Step 1: Migrate categories (product_categories is TEXT[] in businesses table)
INSERT INTO product_categories (user_id, name)
SELECT DISTINCT
    b.user_id,
    cat.category_name
FROM businesses b,
LATERAL unnest(b.product_categories) AS cat(category_name)
WHERE b.product_categories IS NOT NULL 
  AND array_length(b.product_categories, 1) > 0
ON CONFLICT (user_id, name) DO NOTHING;

-- Step 2: Migrate products with fallbacks for camelCase/snake_case keys
INSERT INTO products (
    user_id, 
    legacy_id, 
    name, 
    description, 
    sku, 
    price, 
    price_unit,
    image_url, 
    image_public_id, 
    is_available, 
    duration, 
    brand,
    stock_status, 
    sizes, 
    colors, 
    materials, 
    category_id
)
SELECT 
    b.user_id,
    COALESCE(p->>'id', gen_random_uuid()::TEXT),
    COALESCE(p->>'name', 'Unnamed Product'),
    COALESCE(p->>'description', ''),
    NULLIF(COALESCE(p->>'sku', p->>'SKU', ''), ''),
    COALESCE((p->>'price')::DECIMAL, 0),
    COALESCE(p->>'priceUnit', p->>'price_unit', 'INR'),
    COALESCE(p->>'imageUrl', p->>'image_url', ''),
    COALESCE(p->>'imagePublicId', p->>'image_public_id', ''),
    COALESCE(
        (p->>'available')::BOOLEAN,
        (p->>'isAvailable')::BOOLEAN,
        (p->>'is_available')::BOOLEAN,
        true
    ),
    COALESCE(p->>'duration', ''),
    COALESCE(p->>'brand', ''),
    COALESCE(p->>'stockStatus', p->>'stock_status', 'in_stock'),
    CASE 
        WHEN p->'sizes' IS NOT NULL AND jsonb_typeof(p->'sizes') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p->'sizes'))
        ELSE '{}'::TEXT[]
    END,
    CASE 
        WHEN p->'colors' IS NOT NULL AND jsonb_typeof(p->'colors') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p->'colors'))
        WHEN p->>'colors' IS NOT NULL AND p->>'colors' != ''
        THEN ARRAY[p->>'colors']
        ELSE '{}'::TEXT[]
    END,
    CASE 
        WHEN p->'materials' IS NOT NULL AND jsonb_typeof(p->'materials') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p->'materials'))
        ELSE '{}'::TEXT[]
    END,
    (SELECT id FROM product_categories pc 
     WHERE pc.user_id = b.user_id 
       AND pc.name = COALESCE(p->>'category', '') 
     LIMIT 1)
FROM businesses b,
LATERAL jsonb_array_elements(b.products) AS p
WHERE b.products IS NOT NULL 
  AND jsonb_typeof(b.products) = 'array'
  AND jsonb_array_length(b.products) > 0;

-- Step 3: Migrate variants using a subquery approach (fixes SQL scope issue)
INSERT INTO product_variants (
    user_id, 
    product_id, 
    color, 
    size, 
    price, 
    stock_quantity, 
    image_url, 
    image_public_id
)
SELECT 
    variant_data.user_id,
    variant_data.product_id,
    variant_data.color,
    variant_data.size,
    variant_data.price,
    variant_data.stock_quantity,
    variant_data.image_url,
    variant_data.image_public_id
FROM (
    SELECT 
        prod.user_id,
        prod.id AS product_id,
        COALESCE(v->>'color', '') AS color,
        CASE 
            WHEN jsonb_typeof(v->'size') = 'array' 
            THEN (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(v->'size') AS s)
            ELSE COALESCE(v->>'size', '')
        END AS size,
        (v->>'price')::DECIMAL AS price,
        COALESCE(
            (v->>'stock')::INTEGER, 
            (v->>'stock_quantity')::INTEGER, 
            (v->>'stockQuantity')::INTEGER,
            0
        ) AS stock_quantity,
        COALESCE(v->>'imageUrl', v->>'image_url', '') AS image_url,
        COALESCE(v->>'imagePublicId', v->>'image_public_id', '') AS image_public_id
    FROM products prod
    JOIN businesses b ON b.user_id = prod.user_id
    CROSS JOIN LATERAL jsonb_array_elements(b.products) AS p
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE 
            WHEN p->'variants' IS NOT NULL AND jsonb_typeof(p->'variants') = 'array' 
            THEN p->'variants' 
            ELSE '[]'::jsonb 
        END
    ) AS v
    WHERE prod.legacy_id = COALESCE(p->>'id', '')
      AND p->'variants' IS NOT NULL 
      AND jsonb_typeof(p->'variants') = 'array'
      AND jsonb_array_length(p->'variants') > 0
) AS variant_data;

-- Step 4: Log successful migration in audit log
INSERT INTO product_audit_log (user_id, action, changes, affected_count)
SELECT 
    user_id,
    'bulk_update',
    jsonb_build_object(
        'action', 'migrated_from_jsonb',
        'migration', '013_migrate_products_from_jsonb',
        'timestamp', NOW()
    ),
    (SELECT COUNT(*) FROM products WHERE products.user_id = b.user_id)
FROM businesses b
WHERE b.products IS NOT NULL 
  AND jsonb_typeof(b.products) = 'array'
  AND jsonb_array_length(b.products) > 0;

-- ============================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================

-- Count products per user (compare with original JSON)
-- SELECT user_id, COUNT(*) as product_count FROM products GROUP BY user_id;

-- Count variants per user
-- SELECT user_id, COUNT(*) as variant_count FROM product_variants GROUP BY user_id;

-- Count categories per user
-- SELECT user_id, COUNT(*) as category_count FROM product_categories GROUP BY user_id;

-- Check backups were created
-- SELECT user_id, products_count, reason, created_at FROM product_backups;

-- NOTE: Do NOT drop the businesses.products JSONB column yet!
-- Keep it for rollback safety until you verify everything works.
