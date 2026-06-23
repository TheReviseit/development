"""Check image URLs in database"""
import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from supabase import create_client

c = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

tables = ['showcase_items', 'products', 'business_profiles']
for table in tables:
    try:
        cols = 'id, image_url, thumbnail_url, image_public_id, logo_url, business_logo'
        # Try with just the columns that exist
        try:
            r = c.table(table).select('*').limit(3).execute()
        except:
            r = c.table(table).select('id').limit(1).execute()
            print(f'{table}: table exists but no access')
            continue
        
        if not r.data:
            print(f'{table}: no rows')
            continue
        
        # Show available columns
        keys = list(r.data[0].keys())
        print(f'\n=== {table} ({len(r.data)} rows) === columns: {keys}')
        
        for row in r.data:
            for col in keys:
                val = row.get(col)
                if val and any(img_key in col.lower() for img_key in ['image', 'logo', 'photo', 'icon', 'avatar', 'picture']):
                    s = str(val)
                    print(f'  {col}={s[:100]}')
    except Exception as e:
        print(f'{table}: {e}')
