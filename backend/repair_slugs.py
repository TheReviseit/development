"""
Repair both users' slugs after the collision.
Run: py repair_slugs.py
"""
import os, sys, re
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

def generate_slug(name):
    if not name or not name.strip():
        return None
    slug = name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug[:50] if slug else None

# Get all businesses
result = client.table('businesses').select(
    'user_id, business_name, url_slug, url_slug_lower'
).execute()

if not result.data:
    print("No businesses found")
    sys.exit(0)

print(f"Found {len(result.data)} businesses\n")

# Track used slugs to handle collisions
used_slugs = set()
fixes = []

for row in result.data:
    uid = row.get('user_id', '')
    name = row.get('business_name', '')
    current_slug = row.get('url_slug', '')
    uid_prefix = uid[:8].lower()
    
    # Check if slug is a fallback
    is_fallback = (current_slug == uid_prefix or current_slug == f"store-{uid_prefix}" 
                   or current_slug == uid or not current_slug)
    
    if is_fallback and name and name.strip():
        desired_slug = generate_slug(name)
        if desired_slug:
            # Handle collision with used_slugs
            final_slug = desired_slug
            if final_slug in used_slugs:
                import hashlib
                suffix = hashlib.md5(uid.encode()).hexdigest()[:4]
                final_slug = f"{desired_slug}-{suffix}"
            
            used_slugs.add(final_slug)
            fixes.append((uid, current_slug, final_slug))
            print(f"  WILL FIX: {uid[:16]}... '{current_slug}' -> '{final_slug}' (from '{name}')")
        else:
            used_slugs.add(current_slug)
            print(f"  SKIP: {uid[:16]}... no valid slug from '{name}'")
    else:
        if current_slug:
            used_slugs.add(current_slug.lower())
        if not is_fallback:
            print(f"  OK: {uid[:16]}... slug='{current_slug}' (custom)")
        else:
            print(f"  SKIP: {uid[:16]}... no business_name")

if fixes:
    print(f"\nApplying {len(fixes)} fix(es)...")
    for uid, old_slug, new_slug in fixes:
        try:
            client.table('businesses').update({
                'url_slug': new_slug,
                'url_slug_lower': new_slug.lower()
            }).eq('user_id', uid).execute()
            print(f"  FIXED: {uid[:16]}... '{old_slug}' -> '{new_slug}'")
        except Exception as e:
            print(f"  ERROR: {uid[:16]}... {e}")
else:
    print("\nNo fixes needed!")

# Verify
print("\nVerification:")
verify = client.table('businesses').select(
    'user_id, business_name, url_slug'
).execute()
for row in (verify.data or []):
    uid = row.get('user_id', '?')[:16]
    print(f"  {uid}... name='{row.get('business_name')}' slug='{row.get('url_slug')}'")

print("\nDone!")
