import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from supabase import create_client
import json

c = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Get all tables
try:
    r = c.table('showcase_items').select('id, image_url, thumbnail_url, title, category').limit(5).execute()
    if r.data:
        print(f'showcase_items: {len(r.data)} rows')
        for row in r.data:
            print(f'  {row.get("title","?")}: img={str(row.get("image_url",""))[:80]} tn={str(row.get("thumbnail_url",""))[:80]}')
except Exception as e:
    print(f'showcase_items err: {e}')

try:
    r = c.table('showcase_settings').select('id, business_name, logo_url, slug').limit(5).execute()
    if r.data:
        print(f'\nshowcase_settings: {len(r.data)} rows')
        for row in r.data:
            print(f'  {row.get("business_name","?")} (slug={row.get("slug","?")}) logo={str(row.get("logo_url","") or "")[:80]}')
except Exception as e:
    print(f'\nshowcase_settings err: {e}')

try:
    r = c.table('products').select('id, title, image_url').limit(5).execute()
    if r.data:
        print(f'\nproducts: {len(r.data)} rows')
        for row in r.data:
            print(f'  {row.get("title","?")}: img={str(row.get("image_url","") or "")[:80]}')
    else:
        print('\nproducts: 0 rows')
except Exception as e:
    print(f'\nproducts err: {e}')
