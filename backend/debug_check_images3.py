"""Check ALL image URLs across all tables"""
import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from supabase import create_client
c = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Scan ALL user-created tables for image/logo columns
r = c.table('showcase_settings').select('*').limit(5).execute()
if r.data:
    print(f'\n=== showcase_settings ===')
    for row in r.data:
        for k, v in row.items():
            if v and any(x in k.lower() for x in ['logo', 'image', 'photo', 'icon', 'brand', 'banner', 'avatar', 'picture', 'thumbnail']):
                print(f'  {k}={str(v)[:120]}')

r = c.table('showcase_items').select('*').limit(10).execute()
if r.data:
    print(f'\n=== showcase_items ({len(r.data)}) ===')
    for row in r.data:
        uid = str(row.get('id', ''))[:12]
        img = row.get('image_url', '') or ''
        tn = row.get('thumbnail_url', '') or ''
        print(f'  id={uid} image_url={str(img)[:100]}')
        if tn:
            print(f'           thumbnail_url={str(tn)[:100]}')

# Check ALL tables for image columns  
r2 = c.table('showcase_items').select('*').limit(1).execute()
print(f'\n=== showcase_items columns ===')
print(list(r2.data[0].keys()) if r2.data else 'no rows')
