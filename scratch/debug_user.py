import os
import sys
from dotenv import load_dotenv
from supabase import create_client

# Load env variables from backend
load_dotenv('c:/Users/Sugan001/Desktop/Flowauxi/backend/.env')

supabase_url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_key:
    print("Error: Missing env vars.")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_key)

# Call provision RPC
firebase_uid = "LPlPgrmSY8eG3ahsfUaGobzx9Vm1"
print(f"\nCalling provision_user_with_membership RPC for {firebase_uid}...")
try:
    rpc_res = supabase.rpc('provision_user_with_membership', {
        'p_firebase_uid': firebase_uid,
        'p_email': 'rajaraman5262@gmail.com',
        'p_full_name': 'Raja Raman .s',
        'p_phone': None,
        'p_product': 'shop',
        'p_allow_create': False,
        'p_is_self_service': False,
        'p_trial_days': 0,
        'p_request_id': None,
        'p_ip_address': None,
        'p_user_agent': None,
        'p_traceparent': None
    }).execute()
    print("RPC result keys:", rpc_res.data.keys() if isinstance(rpc_res.data, dict) else "Not a dict")
    if isinstance(rpc_res.data, dict):
        rpc_user = rpc_res.data.get('user', {})
        print("RPC user data:")
        for k, v in rpc_user.items():
            print(f"  {k}: {v}")
except Exception as e:
    print("RPC call failed:", e)

print(f"Supabase URL: {supabase_url}")

# Query user by firebase_uid
firebase_uid = "LPlPgrmSY8eG3ahsfUaGobzx9Vm1"
print(f"\nQuerying users by firebase_uid={firebase_uid}...")
res_user = supabase.table('users').select('*').eq('firebase_uid', firebase_uid).execute()
print("User data:", res_user.data)

# Query user by id
uuid = "559d8ca3-31f0-4b2c-ac12-e711cf84ea98"
print(f"\nQuerying users by id={uuid}...")
res_user_uuid = supabase.table('users').select('*').eq('id', uuid).execute()
print("User data by UUID:", res_user_uuid.data)

# Query businesses by user_id
print(f"\nQuerying businesses by user_id={firebase_uid}...")
res_biz = supabase.table('businesses').select('*').eq('user_id', firebase_uid).execute()
print("Business data by firebase_uid:", res_biz.data)

print(f"\nQuerying businesses by user_id={uuid}...")
res_biz_uuid = supabase.table('businesses').select('*').eq('user_id', uuid).execute()
print("Business data by Supabase UUID:", res_biz_uuid.data)

# Query auth_sync_warm_cache
print(f"\nQuerying auth_sync_warm_cache table...")
res_cache = supabase.table('auth_sync_warm_cache').select('*').execute()
print("Warm Cache data:")
for row in res_cache.data:
    print(f"Key: {row.get('cache_key')}, Status: {row.get('status_code')}, Expires: {row.get('expires_at')}")
    user_data = row.get('response_body', {}).get('user', {})
    print(f"    User uid: {user_data.get('firebase_uid')}, configured: {user_data.get('ai_settings_configured')}, slug: {user_data.get('store_slug')}")
