"""
Apply migration 050 and fix the stuck slug.
Run: py apply_slug_fix.py
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')

if not url or not key:
    print("ERROR: Missing SUPABASE env vars")
    sys.exit(1)

client = create_client(url, key)
print("Connected to Supabase\n")

# ============================================================
# STEP 1: Apply migration 050 via Supabase RPC (raw SQL)
# ============================================================
print("=" * 70)
print("STEP 1: Applying migration 050 - Fix trigger to respect explicit slugs")
print("=" * 70)

migration_sql = """
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
    BEGIN
        allow_regeneration := current_setting('app.allow_slug_regeneration', true)::boolean;
    EXCEPTION WHEN OTHERS THEN
        allow_regeneration := false;
    END;

    IF TG_OP = 'INSERT' THEN
        IF NEW.url_slug IS NULL OR NEW.url_slug = '' THEN
            base_slug := generate_url_slug(NEW.business_name);
            IF base_slug IS NULL THEN
                base_slug := SUBSTRING(NEW.user_id::text, 1, 8);
            END IF;
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
            NEW.url_slug_lower := LOWER(NEW.url_slug);
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- KEY FIX: If caller already changed url_slug, respect it
        IF NEW.url_slug IS DISTINCT FROM OLD.url_slug THEN
            NEW.url_slug_lower := LOWER(NEW.url_slug);
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

-- Recreate trigger listening on business_name AND url_slug
CREATE TRIGGER trigger_auto_generate_business_slug
    BEFORE INSERT OR UPDATE OF business_name, url_slug ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_business_slug();
"""

try:
    result = client.rpc('exec_sql', {'query': migration_sql}).execute()
    print("  Migration applied via RPC!")
except Exception as e:
    print(f"  RPC exec_sql not available ({e})")
    print("  Trying alternative approach: direct update...")
    print("")
    print("  NOTE: You need to run the SQL in migrations/050_fix_trigger_respect_explicit_slug.sql")
    print("  directly in the Supabase SQL Editor. Copy-paste it there.")
    print("")
    print("  Proceeding with STEP 2 (fix the stuck slug) which doesn't need the trigger fix...")

# ============================================================
# STEP 2: Fix the stuck slug - update directly
# ============================================================
print("\n" + "=" * 70)
print("STEP 2: Fix stuck slugs - migrate fallback slugs to business-name slugs")
print("=" * 70)

import re

def generate_slug(input_text):
    """Python mirror of generate_url_slug() SQL function"""
    if not input_text or not input_text.strip():
        return None
    slug = input_text.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'^-+|-+$', '', slug)
    slug = re.sub(r'-+', '-', slug)
    if len(slug) > 50:
        slug = slug[:50]
        slug = re.sub(r'-$', '', slug)
    return slug if slug else None

# Get all businesses with fallback slugs
result = client.table('businesses').select(
    'user_id, business_name, url_slug'
).execute()

fixed_count = 0
for row in (result.data or []):
    uid = row.get('user_id', '')
    name = row.get('business_name')
    slug = row.get('url_slug', '')
    uid_prefix = uid[:8].lower()
    
    # Detect fallback slug patterns
    is_fallback = (slug == uid_prefix or slug == f"store-{uid_prefix}" 
                   or slug == uid or (len(slug) <= 8 and slug == uid[:len(slug)].lower()))
    
    if is_fallback and name and name.strip():
        new_slug = generate_slug(name)
        if new_slug and new_slug != slug:
            # Check for collision
            collision = client.table('businesses').select('id').eq(
                'url_slug_lower', new_slug.lower()
            ).execute()
            
            if collision.data and len(collision.data) > 0:
                # Add suffix
                suffix = uid[:4].lower()
                new_slug = f"{new_slug}-{suffix}"
                print(f"  Collision detected, using: {new_slug}")
            
            try:
                client.table('businesses').update({
                    'url_slug': new_slug,
                    'url_slug_lower': new_slug.lower()
                }).eq('user_id', uid).execute()
                
                print(f"  FIXED: {uid[:16]}... '{slug}' -> '{new_slug}' (from '{name}')")
                fixed_count += 1
            except Exception as e:
                print(f"  ERROR fixing {uid[:16]}...: {e}")
        else:
            print(f"  SKIP: {uid[:16]}... - no valid slug from name '{name}'")
    elif is_fallback:
        print(f"  SKIP: {uid[:16]}... - no business_name set")

if fixed_count == 0:
    print("  No fallback slugs found to fix")

# ============================================================
# STEP 3: Verify results
# ============================================================
print("\n" + "=" * 70)
print("STEP 3: Verify results")
print("=" * 70)

verify = client.table('businesses').select(
    'user_id, business_name, url_slug, url_slug_lower'
).limit(20).execute()

for row in (verify.data or []):
    uid = row.get('user_id', '?')[:16]
    name = row.get('business_name', '(none)')
    slug = row.get('url_slug', '(none)')
    slug_lower = row.get('url_slug_lower', '(none)')
    uid_prefix = row.get('user_id', '')[:8].lower()
    
    is_fallback = (slug == uid_prefix or slug == f"store-{uid_prefix}" 
                   or slug == row.get('user_id', ''))
    status = "STILL FALLBACK" if is_fallback else "OK - CUSTOM"
    
    print(f"  [{status}] {uid}... name='{name}' slug='{slug}'")

print("\n" + "=" * 70)
print("DONE! Your users should now have proper custom slugs.")
print("Next: Run the migration SQL in Supabase SQL Editor if RPC failed.")
print("=" * 70)
