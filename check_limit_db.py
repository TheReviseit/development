import os
import sys
from supabase import create_client, Client

# Add backend to path to import config/utils if needed
sys.path.append('c:/Users/Sugan001/Desktop/Flowauxi/backend')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Supabase environment variables missing")
    sys.exit(1)

supabase: Client = create_client(url, key)

def check_db():
    print("--- Database Audit ---")
    
    # Check plan_features for shop domain
    print("\n1. Checking plan_features for 'shop' domain:")
    try:
        # First find the starter plan ID
        plans = supabase.table("pricing_plans").select("id, plan_slug, product_domain").eq("product_domain", "shop").execute()
        print(f"Plans found: {plans.data}")
        
        for plan in plans.data:
            features = supabase.table("plan_features").select("*").eq("plan_id", plan['id']).eq("feature_key", "create_product").execute()
            print(f"Plan {plan['plan_slug']} ({plan['id']}) 'create_product' feature: {features.data}")
            
    except Exception as e:
        print(f"Error checking plans/features: {e}")

    # Check products count for a sample user (or just total)
    print("\n2. Checking total products:")
    try:
        products = supabase.table("products").select("id", count="exact").execute()
        print(f"Total products in DB: {products.count}")
    except Exception as e:
        print(f"Error checking products: {e}")

if __name__ == "__main__":
    check_db()
