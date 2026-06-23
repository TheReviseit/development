"""Check images on shop pages and business logos"""
import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from supabase import create_client

c = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Check businesses table for logos
tables = ['businesses', 'store_settings', 'user_settings', 'brand_settings']
for table in tables:
    try:
        r = c.table(table).select('*').limit(3).execute()
        if r.data:
            keys = list(r.data[0].keys())
            print(f'\n=== {table} ({len(r.data)} rows) ===')
            img_cols = [k for k in keys if any(x in k.lower() for x in ['logo', 'image', 'photo', 'icon', 'brand', 'favicon', 'og_image', 'avatar'])]
            if img_cols:
                print(f'  Image columns: {img_cols}')
                for row in r.data:
                    for col in img_cols:
                        val = row.get(col)
                        if val:
                            print(f'  {col}={str(val)[:120]}')
            else:
                print(f'  No image-related columns found')
                print(f'  All columns: {keys[:15]}...' if len(keys) > 15 else f'  All columns: {keys}')
        else:
            print(f'{table}: no rows')
    except Exception as e:
        print(f'{table}: {e}')

# Check what images the shop hero uses
print('\n=== Shop static assets ===')
import glob
static = []
for p in ['frontend/public/shop-photos/*', 'frontend/public/*logo*', 'frontend/public/*icon*', 'frontend/public/favicon*']:
    matches = glob.glob(p)
    static.extend(matches)
if static:
    for f in static:
        size = os.path.getsize(f) if os.path.exists(f) else 0
        print(f'  {os.path.relpath(f, "frontend/public")} ({size} bytes)')
else:
    print('  No static images found at those paths')
