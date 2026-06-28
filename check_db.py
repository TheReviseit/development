import sys, os
sys.path.append('C:\\Users\\Sugan001\\Desktop\\Flowauxi\\backend')
from app import app
from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv('C:\\Users\\Sugan001\\Desktop\\Flowauxi\\backend\\.env')
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)
    res = supabase.table('business').select('*').limit(10).execute()
    print('Businesses:')
    for b in res.data:
        print(f"ID: {b.get('id')}, Slug: {b.get('url_slug')}, Owner: {b.get('owner_uid')}")
else:
    print("No env vars")
