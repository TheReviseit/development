"""
Debug Product Limits Issue
Checks usage counters vs actual product count for a user
"""

import sys
from supabase_client import get_supabase_client

def debug_product_limits(firebase_uid: str):
    """Debug product limits for a specific user"""
    db = get_supabase_client()
    
    print(f"\n{'='*80}")
    print(f"DEBUGGING PRODUCT LIMITS FOR USER: {firebase_uid}")
    print(f"{'='*80}\n")
    
    # 1. Get Supabase UUID from Firebase UID
    print("1️⃣ Looking up Supabase UUID...")
    user_result = db.table('users').select('id, firebase_uid, email').eq('firebase_uid', firebase_uid).execute()
    
    if not user_result.data:
        print(f"❌ No user found with Firebase UID: {firebase_uid}")
        return
    
    user = user_result.data[0]
    supabase_uuid = user['id']
    email = user.get('email', 'N/A')
    
    print(f"✅ Found user:")
    print(f"   Email: {email}")
    print(f"   Firebase UID: {firebase_uid}")
    print(f"   Supabase UUID: {supabase_uuid}")
    
    # 2. Count actual products in products table
    print("\n2️⃣ Counting actual products...")
    products_result = db.table('products').select('id', count='exact').eq('user_id', firebase_uid).execute()
    actual_count = products_result.count or 0
    
    print(f"✅ Actual product count: {actual_count}")
    
    # 3. Check usage_counters table (uses Supabase UUID)
    print("\n3️⃣ Checking usage_counters...")
    counters_result = db.table('usage_counters').select('*').eq('user_id', supabase_uuid).eq('domain', 'shop').eq('feature_key', 'create_product').execute()
    
    if counters_result.data:
        counter = counters_result.data[0]
        print(f"✅ Usage counter found:")
        print(f"   Current Value: {counter['current_value']}")
        print(f"   Period: {counter['period']}")
        print(f"   Reset At: {counter.get('reset_at', 'N/A')}")
    else:
        print(f"⚠️ No usage counter found (will be created on first product)")
    
    # 4. Compare
    print("\n4️⃣ Analysis:")
    if counters_result.data:
        counter_value = counters_result.data[0]['current_value']
        if counter_value != actual_count:
            print(f"❌ MISMATCH DETECTED!")
            print(f"   Usage Counter: {counter_value}")
            print(f"   Actual Products: {actual_count}")
            print(f"   Difference: {counter_value - actual_count}")
            
            print("\n5️⃣ Proposed Fix:")
            print(f"   Reset usage counter to {actual_count}")
            
            response = input(f"\n   Apply fix? (yes/no): ")
            if response.lower() == 'yes':
                # Reset counter to actual count
                db.table('usage_counters').update({
                    'current_value': actual_count
                }).eq('user_id', supabase_uuid).eq('domain', 'shop').eq('feature_key', 'create_product').execute()
                
                print(f"   ✅ Counter reset to {actual_count}")
        else:
            print(f"✅ Counter is accurate ({counter_value} = {actual_count})")
    else:
        print(f"✅ No counter exists yet (normal for new users)")
    
    print(f"\n{'='*80}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_product_limits.py <firebase_uid>")
        print("Example: python debug_product_limits.py NoL4Q9qOzndl2gfss8MeMvTEKE3")
        sys.exit(1)
    
    firebase_uid = sys.argv[1]
    debug_product_limits(firebase_uid)
