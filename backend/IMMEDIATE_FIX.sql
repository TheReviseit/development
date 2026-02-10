-- ========================================
-- IMMEDIATE FIX: Run this in Supabase SQL Editor
-- ========================================
-- This will:
-- 1. Install the trigger function
-- 2. Generate the slug for your current business
-- ========================================

-- Step 1: Drop existing function if it exists (to avoid parameter name conflicts)
DROP FUNCTION IF EXISTS generate_url_slug(text);

-- Step 2: Create the slug generation function
CREATE OR REPLACE FUNCTION generate_url_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    slug TEXT;
BEGIN
    -- Convert to lowercase and trim
    slug := LOWER(TRIM(input_text));
    
    -- Replace non-alphanumeric chars with hyphens
    slug := REGEXP_REPLACE(slug, '[^a-z0-9]+', '-', 'g');
    
    -- Remove leading/trailing hyphens
    slug := REGEXP_REPLACE(slug, '^-+|-+$', '', 'g');
    
    -- Limit to 50 chars
    slug := SUBSTRING(slug, 1, 50);
    
    RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_generate_business_slug ON businesses;

-- Step 3: Create the trigger function with explicit consent
CREATE OR REPLACE FUNCTION auto_generate_business_slug()
RETURNS TRIGGER AS $$
DECLARE
    allow_regeneration BOOLEAN;
BEGIN
    -- Check if frontend explicitly allows slug regeneration
    BEGIN
        allow_regeneration := current_setting('app.allow_slug_regeneration', true)::boolean;
    EXCEPTION WHEN OTHERS THEN
        allow_regeneration := false;
    END;
    
    -- Only process if business_name is valid
    IF NEW.business_name IS NOT NULL AND TRIM(NEW.business_name) != '' THEN
        
        -- INSERT: Always generate slug for new businesses
        IF TG_OP = 'INSERT' THEN
            IF NEW.url_slug IS NULL OR NEW.url_slug = '' THEN
                NEW.url_slug := generate_url_slug(NEW.business_name);
                NEW.url_slug_lower := LOWER(NEW.url_slug);
                RAISE NOTICE 'New business slug generated: %', NEW.url_slug;
            END IF;
        
        -- UPDATE: Only regenerate if explicitly allowed AND name actually changed
        ELSIF TG_OP = 'UPDATE' THEN
            IF allow_regeneration AND (OLD.business_name IS DISTINCT FROM NEW.business_name) THEN
                DECLARE
                    old_slug_value TEXT := OLD.url_slug;
                BEGIN
                    NEW.url_slug := generate_url_slug(NEW.business_name);
                    NEW.url_slug_lower := LOWER(NEW.url_slug);
                    RAISE NOTICE 'Slug regenerated with consent: % -> %', old_slug_value, NEW.url_slug;
                END;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create the trigger
CREATE TRIGGER trigger_auto_generate_business_slug
    BEFORE INSERT OR UPDATE OF business_name ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_business_slug();

-- Step 5: MANUALLY FIX YOUR CURRENT BUSINESS
-- Replace 'DYsTJwhVhjeo9NEf9qNMoR5wh1V2' with your actual user_id if different
UPDATE businesses 
SET 
    url_slug = generate_url_slug(business_name),
    url_slug_lower = LOWER(generate_url_slug(business_name))
WHERE user_id = 'DYsTJwhVhjeo9NEf9qNMoR5wh1V2'
AND business_name IS NOT NULL;

-- Step 6: Verify it worked
SELECT 
    business_name,
    url_slug,
    url_slug_lower,
    user_id
FROM businesses 
WHERE user_id = 'DYsTJwhVhjeo9NEf9qNMoR5wh1V2';

-- You should see output like:
-- business_name | url_slug | url_slug_lower | user_id
-- Raja          | raja     | raja           | DYsTJwhVhjeo9NEf9qNMoR5wh1V2
