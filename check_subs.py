import os
import sys
from supabase import create_client, Client

sys.path.append('c:/Users/Sugan001/Desktop/Flowauxi/backend')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

def check_subs():
    print("--- Subscriptions Audit ---")
    try:
        # Check domain values in subscriptions
        domains = supabase.table("subscriptions").select("product_domain").execute()
        unique_domains = set(d['product_domain'] for d in domains.data if d.get('product_domain'))
        print(f"Unique product domains in subscriptions: {unique_domains}")

        # Check a few rows
        subs = supabase.table("subscriptions").select("*").limit(5).execute()
        for s in subs.data:
            print(f"Sub: user={s.get('user_id')}, domain={s.get('product_domain')}, plan={s.get('pricing_plan_id')}, status={s.get('status')}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_subs()
