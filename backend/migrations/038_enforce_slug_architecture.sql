-- ============================================
-- Migration 038: Enforce Slug Architecture
-- ============================================
-- 
-- ARCHITECTURE PRINCIPLE:
--   DB trigger is the SOLE slug generator.
--   Application inserts with NULL slug → trigger fills it.
--   No application-level slug generation.
--
-- CHANGES:
--   1. UNIQUE(user_id) on businesses → prevent duplicate business rows
--   2. Updated trigger → always generates slug (fallback to Supabase UUID)
--   3. Backfill existing NULL slugs
--   4. Resolve collisions
--   5. NOT NULL on url_slug + url_slug_lower
--   6. Replace partial unique index with full UNIQUE constraint
--
-- PATTERN: Shopify shop handle / Stripe account onboarding
-- ============================================

-- =============================================================
-- STEP 1: Add UNIQUE(user_id) on businesses
-- Prevents race condition: concurrent signups can't create duplicates
-- =============================================================

-- First check and remove any duplicate user_id rows (keep earliest)
DELETE FROM businesses
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM businesses
    ORDER BY user_id, created_at ASC
);

ALTER TABLE businesses
DROP CONSTRAINT IF EXISTS businesses_user_id_unique;

ALTER TABLE businesses
ADD CONSTRAINT businesses_user_id_unique UNIQUE (user_id);

-- =============================================================
-- STEP 2: Update slug generation function
-- Now handles NULL business_name with Supabase UUID fallback
-- =============================================================

-- Drop and recreate to avoid parameter conflicts
DROP FUNCTION IF EXISTS generate_url_slug(text) CASCADE;

CREATE OR REPLACE FUNCTION generate_url_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    slug TEXT;
BEGIN
    -- Handle NULL or empty input
    IF input_text IS NULL OR TRIM(input_text) = '' THEN
        RETURN NULL;  -- Caller must handle fallback
    END IF;

    -- Convert to lowercase and trim
    slug := LOWER(TRIM(input_text));
    
    -- Replace non-alphanumeric chars with hyphens
    slug := REGEXP_REPLACE(slug, '[^a-z0-9]+', '-', 'g');
    
    -- Remove leading/trailing hyphens
    slug := REGEXP_REPLACE(slug, '^-+|-+$', '', 'g');
    
    -- Collapse multiple hyphens
    slug := REGEXP_REPLACE(slug, '-+', '-', 'g');
    
    -- Max length 50 chars
    IF LENGTH(slug) > 50 THEN
        slug := SUBSTRING(slug, 1, 50);
        slug := REGEXP_REPLACE(slug, '-$', '');
    END IF;
    
    -- If slug became empty after sanitization, return NULL
    IF slug = '' THEN
        RETURN NULL;
    END IF;
    
    RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================
-- STEP 3: Updated trigger — SOLE slug owner
-- Always generates slug. Fallback to 'store-{uuid8}'.
-- Handles collision by appending random suffix.
-- =============================================================

DROP TRIGGER IF EXISTS trigger_auto_generate_business_slug ON businesses;

CREATE OR REPLACE FUNCTION auto_generate_business_slug()
RETURNS TRIGGER AS $$
DECLARE
    allow_regeneration BOOLEAN;
    base_slug TEXT;
    candidate_slug TEXT;
    collision_count INTEGER;
    suffix TEXT;
BEGIN
    -- Check if frontend explicitly allows slug regeneration (for UPDATE)
    BEGIN
        allow_regeneration := current_setting('app.allow_slug_regeneration', true)::boolean;
    EXCEPTION WHEN OTHERS THEN
        allow_regeneration := false;
    END;

    -- ============================================================
    -- INSERT: Always generate slug
    -- ============================================================
    IF TG_OP = 'INSERT' THEN
        IF NEW.url_slug IS NULL OR NEW.url_slug = '' THEN
            -- Try business_name first
            base_slug := generate_url_slug(NEW.business_name);
            
            -- Fallback: use Supabase user_id (stable internal ID)
            IF base_slug IS NULL THEN
                base_slug := 'store-' || SUBSTRING(NEW.user_id::text, 1, 8);
            END IF;
            
            -- Handle collision: check if slug exists, append suffix if needed
            candidate_slug := base_slug;
            SELECT COUNT(*) INTO collision_count
            FROM businesses
            WHERE url_slug_lower = LOWER(candidate_slug)
              AND id IS DISTINCT FROM NEW.id;
            
            IF collision_count > 0 THEN
                -- Append random 4-char suffix
                suffix := SUBSTRING(md5(random()::text), 1, 4);
                candidate_slug := base_slug || '-' || suffix;
            END IF;
            
            NEW.url_slug := candidate_slug;
            NEW.url_slug_lower := LOWER(candidate_slug);
            RAISE NOTICE 'Slug generated: %', NEW.url_slug;
        ELSE
            -- Slug was provided explicitly — just normalize
            NEW.url_slug_lower := LOWER(NEW.url_slug);
        END IF;

    -- ============================================================
    -- UPDATE: Only regenerate if explicitly allowed AND name changed
    -- ============================================================
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.business_name IS NOT NULL 
           AND TRIM(NEW.business_name) != ''
           AND allow_regeneration 
           AND (OLD.business_name IS DISTINCT FROM NEW.business_name) THEN
            
            base_slug := generate_url_slug(NEW.business_name);
            
            IF base_slug IS NOT NULL THEN
                -- Handle collision on update too
                candidate_slug := base_slug;
                SELECT COUNT(*) INTO collision_count
                FROM businesses
                WHERE url_slug_lower = LOWER(candidate_slug)
                  AND id IS DISTINCT FROM NEW.id;
                
                IF collision_count > 0 THEN
                    suffix := SUBSTRING(md5(random()::text), 1, 4);
                    candidate_slug := base_slug || '-' || suffix;
                END IF;
                
                RAISE NOTICE 'Slug regenerated (consent): % -> %', OLD.url_slug, candidate_slug;
                NEW.url_slug := candidate_slug;
                NEW.url_slug_lower := LOWER(candidate_slug);
            END IF;
        END IF;
        
        -- Always keep url_slug_lower in sync
        IF NEW.url_slug IS DISTINCT FROM OLD.url_slug THEN
            NEW.url_slug_lower := LOWER(NEW.url_slug);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires on INSERT always, UPDATE only when business_name changes
CREATE TRIGGER trigger_auto_generate_business_slug
    BEFORE INSERT OR UPDATE OF business_name ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_business_slug();

-- =============================================================
-- STEP 4: Backfill existing NULL slugs
-- Uses business_name if available, else user_id prefix
-- =============================================================

UPDATE businesses
SET 
    url_slug = COALESCE(
        generate_url_slug(business_name),
        'store-' || SUBSTRING(user_id::text, 1, 8)
    ),
    url_slug_lower = LOWER(COALESCE(
        generate_url_slug(business_name),
        'store-' || SUBSTRING(user_id::text, 1, 8)
    ))
WHERE url_slug IS NULL OR url_slug = '';

-- =============================================================
-- STEP 5: Resolve collisions in backfilled slugs
-- Append user_id suffix to duplicates (keep earliest)
-- =============================================================

WITH duplicates AS (
    SELECT id, user_id, url_slug_lower,
           ROW_NUMBER() OVER (PARTITION BY url_slug_lower ORDER BY created_at) as rn
    FROM businesses
    WHERE url_slug_lower IS NOT NULL
)
UPDATE businesses b
SET 
    url_slug = b.url_slug || '-' || SUBSTRING(b.user_id::text, 1, 8),
    url_slug_lower = b.url_slug_lower || '-' || SUBSTRING(b.user_id::text, 1, 8)
FROM duplicates d
WHERE b.id = d.id 
  AND d.rn > 1;

-- =============================================================
-- STEP 6: Enforce NOT NULL
-- No business row should ever exist without a slug
-- =============================================================

ALTER TABLE businesses
ALTER COLUMN url_slug SET NOT NULL;

ALTER TABLE businesses
ALTER COLUMN url_slug_lower SET NOT NULL;

-- =============================================================
-- STEP 7: Replace partial unique index with full UNIQUE constraint
-- Old: WHERE url_slug_lower IS NOT NULL (allowed multiple NULLs)
-- New: Full UNIQUE (NOT NULL enforced above)
-- =============================================================

DROP INDEX IF EXISTS idx_businesses_url_slug_lower;

ALTER TABLE businesses
DROP CONSTRAINT IF EXISTS businesses_url_slug_lower_unique;

ALTER TABLE businesses
ADD CONSTRAINT businesses_url_slug_lower_unique UNIQUE (url_slug_lower);

-- =============================================================
-- STEP 8: Add documentation
-- =============================================================

COMMENT ON CONSTRAINT businesses_user_id_unique ON businesses IS 
'One business per user. Prevents duplicate rows from race conditions.';

COMMENT ON CONSTRAINT businesses_url_slug_lower_unique ON businesses IS 
'Unique slug for each business. Enforced NOT NULL. DB trigger is sole generator.';

COMMENT ON FUNCTION auto_generate_business_slug IS 
'SOLE slug generator. On INSERT: always generates from business_name or user_id fallback. On UPDATE: only regenerates with app.allow_slug_regeneration consent. Handles collisions with random suffix.';

-- =============================================================
-- VERIFICATION (run after migration)
-- =============================================================

DO $$
DECLARE
    null_count INTEGER;
    dup_count INTEGER;
    user_dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM businesses WHERE url_slug IS NULL;
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT url_slug_lower FROM businesses GROUP BY url_slug_lower HAVING COUNT(*) > 1
    ) sub;
    SELECT COUNT(*) INTO user_dup_count FROM (
        SELECT user_id FROM businesses GROUP BY user_id HAVING COUNT(*) > 1
    ) sub;
    
    IF null_count = 0 AND dup_count = 0 AND user_dup_count = 0 THEN
        RAISE NOTICE '✅ Migration 038 PASSED: 0 null slugs, 0 duplicate slugs, 0 duplicate user_ids';
    ELSE
        RAISE EXCEPTION '❌ Migration 038 FAILED: % null slugs, % duplicate slugs, % duplicate user_ids',
            null_count, dup_count, user_dup_count;
    END IF;
END $$;
