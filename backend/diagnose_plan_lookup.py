"""
Plan Lookup Diagnostic Script
==============================
Verifies that the pricing_plans table has the expected rows for all
product domains, and simulates the exact lookup the billing API performs.

Run from the backend directory:
    python diagnose_plan_lookup.py

Exit code 0 = all good, non-zero = issues found.
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_supabase_client

# These are the slugs the frontend sends (from plan.id in the pricing engine)
# and the domain-prefixed variants stored in the DB.
EXPECTED_PLANS = [
    # (product_domain, short_slug, full_slug)
    ("shop",       "starter",  "shop_starter"),
    ("shop",       "business", "shop_business"),
    ("shop",       "pro",      "shop_pro"),
    ("dashboard",  "starter",  "dashboard_starter"),
    ("dashboard",  "business", "dashboard_business"),
    ("dashboard",  "pro",      "dashboard_pro"),
    ("marketing",  "starter",  "marketing_starter"),
    ("marketing",  "business", "marketing_business"),
    ("marketing",  "pro",      "marketing_pro"),
    ("showcase",   "starter",  "showcase_starter"),
    ("showcase",   "business", "showcase_business"),
    ("showcase",   "pro",      "showcase_pro"),
    ("api",        "starter",  "api_starter"),
    ("api",        "business", "api_business"),
    ("api",        "pro",      "api_pro"),
    ("booking",    "starter",  "booking_starter"),
    ("booking",    "pro",      "booking_pro"),
]


def check_plan(db, domain: str, slug: str) -> dict:
    """Simulate exact backend lookup with fallback."""
    # Attempt 1: exact slug
    try:
        result = db.table('pricing_plans').select(
            'id, plan_slug, display_name, product_domain, is_active, razorpay_plan_id, razorpay_plan_id_sandbox'
        ).eq('product_domain', domain).eq('plan_slug', slug).eq('is_active', True).execute()
        if result.data:
            return {"found": True, "via": "exact", "row": result.data[0]}
    except Exception as e:
        if 'multiple' not in str(e).lower() and 'no rows' not in str(e).lower():
            return {"found": False, "error": str(e)}

    # Attempt 2: domain-prefixed fallback
    if not slug.startswith(f"{domain}_"):
        full_slug = f"{domain}_{slug}"
        try:
            result2 = db.table('pricing_plans').select(
                'id, plan_slug, display_name, product_domain, is_active, razorpay_plan_id, razorpay_plan_id_sandbox'
            ).eq('product_domain', domain).eq('plan_slug', full_slug).eq('is_active', True).execute()
            if result2.data:
                return {"found": True, "via": f"fallback({full_slug})", "row": result2.data[0]}
        except Exception as e2:
            if 'multiple' not in str(e2).lower() and 'no rows' not in str(e2).lower():
                return {"found": False, "error": str(e2)}

    return {"found": False, "via": None, "row": None}


def main():
    print("\n" + "=" * 70)
    print("  BILLING PLAN LOOKUP DIAGNOSTIC")
    print("=" * 70)

    db = get_supabase_client()
    if not db:
        print("\n❌ Could not connect to Supabase. Check .env file.")
        sys.exit(1)

    # Dump all active plans for context
    print("\n📋 All active pricing_plans rows:\n")
    all_plans = db.table('pricing_plans').select(
        'product_domain, plan_slug, display_name, is_active, razorpay_plan_id'
    ).eq('is_active', True).order('product_domain').order('plan_slug').execute()

    if not all_plans.data:
        print("  ⚠️  NO active pricing plans found in database!")
    else:
        print(f"  {'Domain':<14} {'Slug':<25} {'Name':<20} {'Razorpay ID'}")
        print(f"  {'-'*14} {'-'*25} {'-'*20} {'-'*30}")
        for row in all_plans.data:
            rp = row.get('razorpay_plan_id') or row.get('razorpay_plan_id_sandbox') or 'N/A'
            print(f"  {row['product_domain']:<14} {row['plan_slug']:<25} {row.get('display_name',''):<20} {rp}")

    print("\n" + "=" * 70)
    print("  PLAN LOOKUP SIMULATION (mirrors billing API logic)")
    print("=" * 70 + "\n")

    issues = []
    for domain, short_slug, full_slug in EXPECTED_PLANS:
        # Simulate frontend sending short slug
        result = check_plan(db, domain, short_slug)

        status = "✅" if result["found"] else "❌"
        via = f"via={result['via']}" if result.get("via") else ""
        err = f"error={result.get('error','')}" if not result["found"] else ""

        razorpay = ""
        if result["found"] and result.get("row"):
            row = result["row"]
            razorpay_id = row.get('razorpay_plan_id') or row.get('razorpay_plan_id_sandbox') or 'MISSING'
            razorpay = f"→ razorpay={razorpay_id}"

        print(f"  {status}  {domain:<12} {short_slug:<12} {via or err:<30} {razorpay}")

        if not result["found"]:
            issues.append((domain, short_slug, full_slug))

    print()

    if issues:
        print("=" * 70)
        print("  ❌ ISSUES FOUND — Run the SQL below in Supabase to fix:\n")
        print("  The following plans are MISSING or INACTIVE:\n")
        for domain, short_slug, full_slug in issues:
            print(f"  → {domain}/{full_slug}")
        print()
        print("  SQL to verify:")
        print("  SELECT product_domain, plan_slug, is_active FROM pricing_plans")
        print(f"  WHERE product_domain IN ({', '.join(repr(d) for d,_,_ in issues)})")
        print("  ORDER BY product_domain, plan_slug;\n")
        print("  If rows exist but is_active=false, run:")
        print("  UPDATE pricing_plans SET is_active = true WHERE plan_slug IN (")
        print(f"    {', '.join(repr(f) for _,_,f in issues)}")
        print("  );\n")
        sys.exit(1)
    else:
        print("=" * 70)
        print("  ✅ All expected plans found — billing lookup should work correctly!")
        print("=" * 70 + "\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
