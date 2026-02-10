-- ============================================
-- Enterprise URL Routing: Business Slug Migration
-- ============================================
-- Purpose: Add url_slug fields to businesses table for SEO-friendly URLs
-- Canonical URL: /showcase/{business_slug} (lowercase, URL-safe)
-- 
-- Requirements:
-- 1. Slug is LOCKED once created (doesn't auto-update)
-- 2. Case-insensitive matching via url_slug_lower
-- 3. Unique constraint prevents collisions
-- 4. Resolution order: url_slug → username_lower → 404

-- Step 1: Add slug columns to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS url_slug TEXT,
ADD COLUMN IF NOT EXISTS url_slug_lower TEXT;

-- Step 2: Create unique indexes for fast lookup and collision prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_url_slug_lower
ON businesses (url_slug_lower)
WHERE url_slug_lower IS NOT NULL;

-- Step 3: Create slug generation function
CREATE OR REPLACE FUNCTION generate_url_slug(business_name TEXT)
RETURNS TEXT AS $$
DECLARE
    slug TEXT;
BEGIN
    -- Convert to lowercase
    slug := LOWER(TRIM(business_name));
    
    -- Replace spaces and special chars with hyphens
    slug := REGEXP_REPLACE(slug, '[^a-z0-9]+', '-', 'g');
    
    -- Remove leading/trailing hyphens
    slug := REGEXP_REPLACE(slug, '^-+|-+$', '', 'g');
    
    -- Collapse multiple hyphens
    slug := REGEXP_REPLACE(slug, '-+', '-', 'g');
    
    -- Max length 50 chars
    IF LENGTH(slug) > 50 THEN
        slug := SUBSTRING(slug, 1, 50);
        -- Remove trailing hyphen if cut mid-word
        slug := REGEXP_REPLACE(slug, '-$', '');
    END IF;
    
    RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 4: Migrate existing businesses to have slugs
-- Generate slugs from business_name if available, otherwise from username
UPDATE businesses
SET 
    url_slug = CASE 
        WHEN business_name IS NOT NULL AND TRIM(business_name) != '' 
        THEN generate_url_slug(business_name)
        ELSE (
            SELECT generate_url_slug(username)
            FROM users
            WHERE users.firebase_uid = businesses.user_id
            LIMIT 1
        )
    END,
    url_slug_lower = CASE 
        WHEN business_name IS NOT NULL AND TRIM(business_name) != '' 
        THEN generate_url_slug(business_name)
        ELSE (
            SELECT generate_url_slug(username)
            FROM users
            WHERE users.firebase_uid = businesses.user_id
            LIMIT 1
        )
    END
WHERE url_slug IS NULL OR url_slug_lower IS NULL;

-- Step 5: Handle slug collisions by appending user_id suffix
-- If slug already exists, append first 8 chars of user_id
WITH duplicates AS (
    SELECT user_id, url_slug_lower,
           ROW_NUMBER() OVER (PARTITION BY url_slug_lower ORDER BY created_at) as rn
    FROM businesses
    WHERE url_slug_lower IS NOT NULL
)
UPDATE businesses b
SET 
    url_slug = b.url_slug || '-' || SUBSTRING(b.user_id, 1, 8),
    url_slug_lower = b.url_slug_lower || '-' || SUBSTRING(b.user_id, 1, 8)
FROM duplicates d
WHERE b.user_id = d.user_id 
  AND d.rn > 1;

-- Step 6: Add NOT NULL constraint after migration
-- (Optional - only if you want to enforce slugs for all businesses)
-- ALTER TABLE businesses
-- ALTER COLUMN url_slug SET NOT NULL,
-- ALTER COLUMN url_slug_lower SET NOT NULL;

-- Step 7: Create trigger to auto-generate slug for new businesses
CREATE OR REPLACE FUNCTION auto_generate_business_slug()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if not provided
    IF NEW.url_slug IS NULL OR NEW.url_slug = '' THEN
        -- Use business_name if available
        IF NEW.business_name IS NOT NULL AND TRIM(NEW.business_name) != '' THEN
            NEW.url_slug := generate_url_slug(NEW.business_name);
            NEW.url_slug_lower := NEW.url_slug;
        END IF;
    ELSE
        -- Normalize provided slug
        NEW.url_slug := generate_url_slug(NEW.url_slug);
        NEW.url_slug_lower := NEW.url_slug;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_business_slug ON businesses;
CREATE TRIGGER trigger_auto_generate_business_slug
    BEFORE INSERT OR UPDATE OF url_slug, business_name ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_business_slug();

-- Step 8: Add comments for documentation
COMMENT ON COLUMN businesses.url_slug IS 'Public URL slug derived from business_name. LOCKED once created. Format: lowercase-with-hyphens';
COMMENT ON COLUMN businesses.url_slug_lower IS 'Lowercase version for case-insensitive lookups. Always equals url_slug.';

-- ============================================
-- Verification Queries
-- ============================================

-- Check migration results
-- SELECT 
--     user_id,
--     business_name,
--     url_slug,
--     url_slug_lower,
--     created_at
-- FROM businesses
-- ORDER BY created_at DESC
-- LIMIT 10;

-- Check for remaining NULL slugs
-- SELECT COUNT(*) as null_slugs
-- FROM businesses
-- WHERE url_slug IS NULL OR url_slug_lower IS NULL;

-- Check for slug collisions (should be 0 after migration)
-- SELECT url_slug_lower, COUNT(*) as count
-- FROM businesses
-- GROUP BY url_slug_lower
-- HAVING COUNT(*) > 1;
