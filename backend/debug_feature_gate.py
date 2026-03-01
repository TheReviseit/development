"""
Deep diagnostic: Why is the feature gate returning 'denied' for custom_domain?
Traces the exact same path as FeatureGateEngine._get_subscription()
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')
client = create_client(url, key)
print("Connected\n")

FIREBASE_UID = 'vOBGfwJOc1ezDeVaJY5mFZ86SkX2'

# Step 1: Resolve Firebase UID to Supabase UUID
print("=" * 70)
print("STEP 1: Resolve Firebase UID -> Supabase UUID")
print("=" * 70)
user_result = client.table('users').select('id, email, firebase_uid').eq(
    'firebase_uid', FIREBASE_UID
).execute()
if user_result.data:
    supabase_uuid = user_result.data[0]['id']
    print(f"  Firebase UID: {FIREBASE_UID}")
    print(f"  Supabase UUID: {supabase_uuid}")
    print(f"  Email: {user_result.data[0].get('email')}")
else:
    print(f"  NOT FOUND for firebase_uid={FIREBASE_UID}")
    # Try alternate lookup
    alt = client.table('users').select('id, email, firebase_uid').eq(
        'email', 'rajaraman5262@gmail.com'
    ).execute()
    if alt.data:
        for u in alt.data:
            print(f"  Found by email: id={u['id']} firebase_uid={u.get('firebase_uid')}")
        supabase_uuid = alt.data[0]['id']
    else:
        print("  No user found at all!")
        sys.exit(1)

# Step 2: ALL subscriptions for this user
print("\n" + "=" * 70)
print("STEP 2: ALL subscriptions (no status filter)")
print("=" * 70)
all_subs = client.table('subscriptions').select('*').eq(
    'user_id', supabase_uuid
).order('created_at', desc=True).execute()

if all_subs.data:
    for i, sub in enumerate(all_subs.data):
        print(f"\n  --- Subscription #{i+1} ---")
        print(f"  id:              {sub.get('id')}")
        print(f"  status:          {sub.get('status')}")
        print(f"  plan_name:       {sub.get('plan_name')}")
        print(f"  plan_id:         {sub.get('plan_id')}  (Razorpay)")
        print(f"  pricing_plan_id: {sub.get('pricing_plan_id')}  (UUID FK)")
        print(f"  product_domain:  {sub.get('product_domain')}")
        print(f"  created_at:      {sub.get('created_at')}")
        print(f"  updated_at:      {sub.get('updated_at')}")
        print(f"  razorpay_sub_id: {sub.get('razorpay_subscription_id')}")
        print(f"  pending_upgrade: {sub.get('pending_upgrade_to_plan_id')}")
        
        # Resolve pricing_plan_id to plan_slug
        ppid = sub.get('pricing_plan_id')
        if ppid:
            plan = client.table('pricing_plans').select('plan_slug, product_domain').eq('id', ppid).execute()
            if plan.data:
                print(f"  RESOLVED plan_slug: {plan.data[0].get('plan_slug')}")
            else:
                print(f"  WARNING: pricing_plan_id {ppid} NOT FOUND in pricing_plans!")
else:
    print("  NO SUBSCRIPTIONS FOUND!")

# Step 3: What does the feature gate query return?
print("\n" + "=" * 70)
print("STEP 3: Simulating FeatureGateEngine._get_subscription()")
print("=" * 70)
ALLOWED = ['active', 'completed', 'past_due', 'grace_period', 'trialing', 'trial', 'processing', 'pending_upgrade', 'upgrade_failed']

fg_result = client.table('subscriptions').select(
    'id, user_id, plan_id, pricing_plan_id, plan_name, status, product_domain, created_at'
).match({
    'user_id': supabase_uuid,
    'product_domain': 'shop',
}).in_('status', ALLOWED).order('created_at', desc=True).limit(1).execute()

if fg_result.data:
    sub = fg_result.data[0]
    print(f"  Feature gate picks: id={sub['id']}")
    print(f"  status={sub['status']}")
    print(f"  plan_name={sub.get('plan_name')}")
    print(f"  pricing_plan_id={sub.get('pricing_plan_id')}")
    
    ppid = sub.get('pricing_plan_id')
    if ppid:
        plan = client.table('pricing_plans').select('plan_slug').eq('id', ppid).execute()
        if plan.data:
            slug = plan.data[0]['plan_slug']
            print(f"  RESOLVED plan_slug: {slug}")
            
            # Check custom_domain feature
            feat = client.table('plan_features').select('hard_limit, is_unlimited').match({
                'plan_id': ppid,
                'feature_key': 'custom_domain'
            }).execute()
            if feat.data:
                hl = feat.data[0].get('hard_limit')
                if hl == 0:
                    print(f"  custom_domain: DENIED (hard_limit=0)")
                else:
                    print(f"  custom_domain: ALLOWED (hard_limit={hl})")
            else:
                print(f"  custom_domain: NOT IN PLAN FEATURES!")
        else:
            print(f"  pricing_plan_id {ppid} NOT FOUND!")
else:
    print("  NO subscription returned by feature gate query!")

# Step 4: Business slug state
print("\n" + "=" * 70)
print("STEP 4: Current business slug")
print("=" * 70)
biz = client.table('businesses').select('user_id, business_name, url_slug, url_slug_lower').eq(
    'user_id', FIREBASE_UID
).execute()
if biz.data:
    for b in biz.data:
        print(f"  user_id: {b['user_id']}")
        print(f"  business_name: {b.get('business_name')}")
        print(f"  url_slug: {b.get('url_slug')}")
        print(f"  url_slug_lower: {b.get('url_slug_lower')}")
else:
    print("  NO business record found!")

print("\n" + "=" * 70)
print("DIAGNOSIS COMPLETE")
print("=" * 70)
