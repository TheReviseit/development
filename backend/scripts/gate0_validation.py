#!/usr/bin/env python3
"""
GATE-0 validation queries — run after Day 0 deploy.

Usage: python backend/scripts/gate0_validation.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    from supabase_client import get_supabase_client

    db = get_supabase_client()
    failed = False

    # GATE-0a: plan drift
    drift = db.rpc("gate0_plan_drift_count", {}).execute() if False else None
    subs = (
        db.table("subscriptions")
        .select("id, plan_name, plan_id, pricing_plan_id")
        .not_.is_("pricing_plan_id", "null")
        .execute()
    )
    drift_count = 0
    for sub in subs.data or []:
        plan = (
            db.table("pricing_plans")
            .select("plan_slug, razorpay_plan_id")
            .eq("id", sub["pricing_plan_id"])
            .limit(1)
            .execute()
        )
        if plan.data:
            p = plan.data[0]
            if sub.get("plan_id") != p.get("razorpay_plan_id") or sub.get(
                "plan_name"
            ) != p.get("plan_slug"):
                drift_count += 1
    print(f"GATE-0a plan_drift_count={drift_count} (expect 0)")
    if drift_count > 0:
        failed = True

    # GATE-0c: duplicate active subs
    active = (
        db.table("subscriptions")
        .select("user_id, product_domain, status")
        .in_("status", ["active", "trialing", "pending_upgrade"])
        .execute()
    )
    from collections import Counter

    counts = Counter(
        (r["user_id"], r["product_domain"]) for r in (active.data or [])
    )
    dupes = sum(1 for c in counts.values() if c > 1)
    print(f"GATE-0c duplicate_active_pairs={dupes} (expect 0)")
    if dupes > 0:
        failed = True

    # GATE-0b: view exists (smoke)
    try:
        view = db.table("subscription_current").select("id").limit(1).execute()
        print(f"GATE-0b subscription_current_ok rows_sample={len(view.data or [])}")
    except Exception as e:
        print(f"GATE-0b subscription_current FAILED: {e}")
        failed = True

    if failed:
        print("GATE-0 FAILED")
        sys.exit(1)
    print("GATE-0 PASSED")
    sys.exit(0)


if __name__ == "__main__":
    main()
