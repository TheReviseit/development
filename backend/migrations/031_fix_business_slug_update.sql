-- ============================================
-- Migration 031: Fix Business Slug Update with Explicit Consent
-- ============================================
-- Purpose: Update slug generation trigger to only regenerate slugs
--          when user explicitly consents via UI confirmation
--
-- Security: Prevents accidental slug changes from:
--   - Admin scripts
--   - Bulk migrations
--   - Future APIs that update business_name
--
-- Policy: Store Name = Public URL (but only when user confirms)
-- ============================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_generate_business_slug ON businesses;

-- Replace the trigger function with consent-aware version
CREATE OR REPLACE FUNCTION auto_generate_business_slug()
RETURNS TRIGGER AS $$
DECLARE
    allow_regeneration BOOLEAN;
BEGIN
    -- Check if frontend explicitly allows slug regeneration
    -- This prevents accidental slug changes from scripts/migrations
    -- Session variable is transaction-scoped and auto-clears
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
            -- Check if business_name changed and user gave consent
            IF allow_regeneration AND (OLD.business_name IS DISTINCT FROM NEW.business_name) THEN
                -- Store old slug for logging
                DECLARE
                    old_slug_value TEXT := OLD.url_slug;
                BEGIN
                    NEW.url_slug := generate_url_slug(NEW.business_name);
                    NEW.url_slug_lower := LOWER(NEW.url_slug);
                    RAISE NOTICE 'Slug regenerated with user consent: % -> % (business_name: % -> %)', 
                        old_slug_value, NEW.url_slug, OLD.business_name, NEW.business_name;
                END;
            ELSIF NOT allow_regeneration AND (OLD.business_name IS DISTINCT FROM NEW.business_name) THEN
                -- Log when business_name changed but slug regeneration was NOT allowed
                RAISE NOTICE 'business_name changed but slug NOT regenerated (no consent): % (slug remains: %)', 
                    NEW.business_name, OLD.url_slug;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger on both INSERT and UPDATE of business_name
CREATE TRIGGER trigger_auto_generate_business_slug
    BEFORE INSERT OR UPDATE OF business_name ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_business_slug();

-- Add helpful comment for future developers
COMMENT ON FUNCTION auto_generate_business_slug IS 
'Generates URL slug from business_name. On INSERT: always generates. On UPDATE: only regenerates if app.allow_slug_regeneration session variable is true AND business_name changed. This prevents accidental URL changes from breaking SEO and user expectations.';

-- Verify the trigger was created successfully
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_auto_generate_business_slug'
    ) THEN
        RAISE NOTICE '✅ Migration 031 completed successfully';
        RAISE NOTICE 'ℹ️  Slug regeneration now requires explicit consent via app.allow_slug_regeneration';
    ELSE
        RAISE EXCEPTION '❌ Migration 031 failed - trigger not created';
    END IF;
END $$;
