-- ============================================
-- Migration 050: Fix Trigger — Respect Explicit Slugs
-- ============================================
--
-- ROOT CAUSE:
--   The trigger's UPDATE branch overwrites url_slug with a value derived
--   from business_name even when the backend has already set url_slug
--   explicitly (e.g., custom slug for Business/Pro users).
--
-- FIX:
--   On UPDATE, only regenerate slug if:
--     1. url_slug was NOT changed by the caller (url_slug == OLD.url_slug)
--     2. AND business_name actually changed
--     3. AND allow_regeneration session var is set
--
--   If the caller (backend) already set NEW.url_slug to a new value,
--   the trigger respects it — no overwrite.
--
-- PATTERN: Shopify's handle generation — explicit always wins.
-- ============================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_business_slug ON businesses;

-- Replace trigger function
CREATE OR REPLACE FUNCTION auto_generate_business_slug()
RETURNS TRIGGER AS $$
DECLARE
    allow_regeneration BOOLEAN;
    base_slug TEXT;
    candidate_slug TEXT;
    collision_count INTEGER;
    suffix TEXT;
BEGIN
    -- Check if frontend/backend explicitly allows slug regeneration
    BEGIN
        allow_regeneration := current_setting('app.allow_slug_regeneration', true)::boolean;
    EXCEPTION WHEN OTHERS THEN
        allow_regeneration := false;
    END;

    -- ============================================================
    -- INSERT: Always generate slug if not provided
    -- ============================================================
    IF TG_OP = 'INSERT' THEN
        IF NEW.url_slug IS NULL OR NEW.url_slug = '' THEN
            -- Try business_name first
            base_slug := generate_url_slug(NEW.business_name);

            -- Fallback: use Supabase user_id (stable internal ID)
            IF base_slug IS NULL THEN
                base_slug := SUBSTRING(NEW.user_id::text, 1, 8);
            END IF;

            -- Handle collision
            candidate_slug := base_slug;
            SELECT COUNT(*) INTO collision_count
            FROM businesses
            WHERE url_slug_lower = LOWER(candidate_slug)
              AND id IS DISTINCT FROM NEW.id;

            IF collision_count > 0 THEN
                suffix := SUBSTRING(md5(random()::text), 1, 4);
                candidate_slug := base_slug || '-' || suffix;
            END IF;

            NEW.url_slug := candidate_slug;
            NEW.url_slug_lower := LOWER(candidate_slug);
        ELSE
            -- Slug was provided explicitly — just normalize lower
            NEW.url_slug_lower := LOWER(NEW.url_slug);
        END IF;

    -- ============================================================
    -- UPDATE: Only regenerate if backend did NOT set slug explicitly
    -- ============================================================
    ELSIF TG_OP = 'UPDATE' THEN

        -- KEY FIX: If the caller already changed url_slug (i.e. backend
        -- set it explicitly), DO NOT overwrite. Just sync url_slug_lower.
        IF NEW.url_slug IS DISTINCT FROM OLD.url_slug THEN
            -- Backend set a new slug explicitly — respect it, just sync lower
            NEW.url_slug_lower := LOWER(NEW.url_slug);

        -- Only auto-generate when url_slug was NOT touched by caller
        ELSIF NEW.business_name IS NOT NULL
           AND TRIM(NEW.business_name) != ''
           AND allow_regeneration
           AND (OLD.business_name IS DISTINCT FROM NEW.business_name) THEN

            base_slug := generate_url_slug(NEW.business_name);

            IF base_slug IS NOT NULL THEN
                candidate_slug := base_slug;
                SELECT COUNT(*) INTO collision_count
                FROM businesses
                WHERE url_slug_lower = LOWER(candidate_slug)
                  AND id IS DISTINCT FROM NEW.id;

                IF collision_count > 0 THEN
                    suffix := SUBSTRING(md5(random()::text), 1, 4);
                    candidate_slug := base_slug || '-' || suffix;
                END IF;

                NEW.url_slug := candidate_slug;
                NEW.url_slug_lower := LOWER(candidate_slug);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger on INSERT and UPDATE of business_name OR url_slug
-- We listen on url_slug too so we can sync url_slug_lower.
CREATE TRIGGER trigger_auto_generate_business_slug
    BEFORE INSERT OR UPDATE OF business_name, url_slug ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_business_slug();

-- ============================================
-- Documentation
-- ============================================
COMMENT ON FUNCTION auto_generate_business_slug IS
'Enterprise slug generator. On INSERT: generates from business_name or user_id fallback. '
'On UPDATE: if caller set url_slug explicitly (NEW != OLD), respects it and only syncs '
'url_slug_lower. If caller did NOT change url_slug but business_name changed with '
'allow_regeneration=true, auto-generates from business_name. Handles collisions.';

-- ============================================
-- Verification
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_auto_generate_business_slug'
    ) THEN
        RAISE NOTICE 'Migration 050 PASSED: trigger recreated with explicit-slug-respect logic';
    ELSE
        RAISE EXCEPTION 'Migration 050 FAILED: trigger not created';
    END IF;
END $$;
