"""Check Cloudinary connectivity and stored image URLs"""
import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

# 1. Check Cloudinary credentials
print("=== Cloudinary Config ===")
for key in ['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'NEXT_PUBLIC_CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']:
    val = os.getenv(key)
    if val:
        masked = val[:6] + '...' + val[-4:] if len(val) > 12 else val[:6] + '...'
        print(f'  {key}={masked}')
    else:
        print(f'  {key}=NOT SET')

# 2. Test Cloudinary API
try:
    import cloudinary
    import cloudinary.api
    cloudinary.config(
        cloud_name=os.getenv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'),
        api_key=os.getenv('NEXT_PUBLIC_CLOUDINARY_API_KEY'),
        api_secret=os.getenv('CLOUDINARY_API_SECRET'),
    )
    result = cloudinary.api.ping()
    print(f'\n  Cloudinary ping: {result.get("status", "unknown")}')
except Exception as e:
    print(f'\n  Cloudinary ping FAILED: {e}')

# 3. Try to list resources
try:
    result = cloudinary.api.resources(max_results=10)
    resources = result.get('resources', [])
    print(f'\n  Cloudinary resources found: {len(resources)}')
    for r in resources[:5]:
        print(f'    {r.get("public_id", "?")[:60]} → {r.get("secure_url", "?")[:80]}')
except Exception as e:
    print(f'  Cloudinary list FAILED: {e}')

# 4. Check showcase_settings table for logo URLs
from supabase import create_client
c = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
r = c.table('showcase_settings').select('*').limit(10).execute()
if r.data:
    print(f'\n=== showcase_settings ({len(r.data)} rows) ===')
    for row in r.data:
        biz_id = str(row.get('id', ''))[:12]
        logo = row.get('logo_url', '') or row.get('logoUrl', '') or ''
        print(f'  id={biz_id} logo_url={str(logo)[:100]}')
else:
    print('\n=== showcase_settings: no rows ===')

# 5. Check users table for avatar/photo
r = c.table('users').select('id, avatar_url, photo_url').limit(5).execute()
if r.data:
    print(f'\n=== users ({len(r.data)} rows) ===')
    for row in r.data:
        uid = str(row.get('id', ''))[:12]
        for col in ['avatar_url', 'photo_url']:
            val = row.get(col, '') or ''
            if val:
                print(f'  {uid} {col}={str(val)[:100]}')
        if not any(row.get(c) for c in ['avatar_url', 'photo_url']):
            print(f'  {uid} no avatar/photo')
