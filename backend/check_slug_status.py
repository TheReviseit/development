"""
Pre-Fix Diagnostic: Check slug state, subscriptions, and plan_features
Standalone script — does NOT use supabase_client.py to avoid encoding issues.
Run: py check_slug_status.py
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')

if not url or not key:
    print("ERROR: Missing SUPABASE env vars")
    sys.exit(1)

client = create_client(url, key)
print("Connected to Supabase\n")

print("=" * 70)
print("CHECK #1 - ALL BUSINESS SLUGS")
print("=" * 70)
result = client.table('businesses').select(
    'user_id, business_name, url_slug, url_slug_lower'
).limit(20).execute()

if result.data:
    for row in result.data:
        uid = row.get('user_id', '?')
        name = row.get('business_name', '(none)')
        slug = row.get('url_slug', '(none)')
        slug_lower = row.get('url_slug_lower', '(none)')
        uid_prefix = uid[:8].lower() if uid else '?'
        
        is_fallback = (slug == uid_prefix or slug == f"store-{uid_prefix}" 
                       or slug == uid or (slug and len(slug) == 8 and slug == uid[:8]))
        status = "[FALLBACK - UID-based]" if is_fallback else "[CUSTOM SLUG]"
        
        print(f"\n  user_id:       {uid[:20]}...")
        print(f"  business_name: {name}")
        print(f"  url_slug:      {slug}")
        print(f"  url_slug_lower:{slug_lower}")
        print(f"  status:        {status}")
else:
    print("  No businesses found")

print("\n" + "=" * 70)
print("CHECK #2 - SUBSCRIPTIONS (shop domain)")
print("=" * 70)
sub_result = client.table('subscriptions').select(
    'user_id, pricing_plan_id, plan_id, plan_name, status, product_domain'
).eq('product_domain', 'shop').in_(
    'status', ['active', 'completed', 'trialing', 'trial', 'processing']
).limit(20).execute()

if sub_result.data:
    for sub in sub_result.data:
        print(f"\n  user_id:         {sub.get('user_id')}")
        print(f"  pricing_plan_id: {sub.get('pricing_plan_id')}")
        print(f"  plan_id:         {sub.get('plan_id')}")
        print(f"  plan_name:       {sub.get('plan_name')}")
        print(f"  status:          {sub.get('status')}")
else:
    print("  No active shop subscriptions found")

print("\n" + "=" * 70)
print("CHECK #3 - PLAN_FEATURES for custom_domain")
print("=" * 70)
pf_result = client.table('plan_features').select(
    'plan_id, feature_key, hard_limit, soft_limit, is_unlimited'
).eq('feature_key', 'custom_domain').execute()

if pf_result.data:
    for pf in pf_result.data:
        hl = pf.get('hard_limit')
        unlimited = pf.get('is_unlimited')
        if hl == 0:
            access = "DENIED (hard_limit=0)"
        elif hl is None and not unlimited:
            access = "ALLOWED (boolean, hard_limit=NULL)"
        elif unlimited:
            access = "ALLOWED (is_unlimited=true)"
        else:
            access = f"UNKNOWN (hard_limit={hl}, unlimited={unlimited})"
        
        print(f"\n  plan_id:      {pf.get('plan_id')}")
        print(f"  hard_limit:   {hl}")
        print(f"  is_unlimited: {unlimited}")
        print(f"  access:       {access}")
else:
    print("  WARNING: NO plan_features rows for custom_domain - seed not run!")

print("\n" + "=" * 70)
print("CHECK #4 - PRICING_PLANS (shop domain)")
print("=" * 70)
pp_result = client.table('pricing_plans').select(
    'id, plan_slug, product_domain, is_active, razorpay_plan_id'
).eq('product_domain', 'shop').eq('is_active', True).execute()

if pp_result.data:
    for pp in pp_result.data:
        has_features = any(
            pf.get('plan_id') == pp.get('id') 
            for pf in (pf_result.data or [])
        )
        seed_status = "Features seeded" if has_features else "NO features seeded"
        
        print(f"\n  id:               {pp.get('id')}")
        print(f"  plan_slug:        {pp.get('plan_slug')}")
        print(f"  razorpay_plan_id: {pp.get('razorpay_plan_id')}")
        print(f"  features:         {seed_status}")
else:
    print("  No active shop pricing plans found")

print("\n" + "=" * 70)
print("CHECK #5 - CROSS-REFERENCE: subscription plan vs features")
print("=" * 70)
if sub_result.data and pf_result.data:
    plan_ids_with_features = {pf.get('plan_id') for pf in pf_result.data}
    for sub in sub_result.data:
        ppid = sub.get('pricing_plan_id')
        has = ppid in plan_ids_with_features if ppid else False
        status = "HAS custom_domain feature" if has else "MISSING custom_domain feature"
        uid = sub.get('user_id', '?')
        print(f"\n  user {uid[:8]}... -> pricing_plan_id={ppid}")
        print(f"  {status}")
        
        if not has and ppid and pp_result.data:
            this_plan = next((pp for pp in pp_result.data if pp.get('id') == ppid), None)
            if this_plan:
                slug = this_plan.get('plan_slug')
                siblings = [pp for pp in pp_result.data 
                           if pp.get('plan_slug') == slug and pp.get('id') != ppid]
                sibling_with_features = any(
                    sib.get('id') in plan_ids_with_features for sib in siblings
                )
                if sibling_with_features:
                    print(f"  -> Sibling plan ({slug}) HAS features - fallback should work")
                else:
                    print(f"  -> WARNING: No sibling with features either. SEED NOT RUN for {slug}!")
elif not sub_result.data:
    print("  No subscriptions to cross-reference")
elif not pf_result.data:
    print("  No plan_features to cross-reference - SEED NOT RUN")

print("\n" + "=" * 70)
print("DIAGNOSIS COMPLETE")
print("=" * 70)
