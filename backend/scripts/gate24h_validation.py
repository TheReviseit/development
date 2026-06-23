#!/usr/bin/env python3
"""GATE-24h reconciliation suite — run daily after Phase 1 deploy."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    from supabase_client import get_supabase_client

    db = get_supabase_client()
    failed = False

    subs = (
        db.table("subscriptions")
        .select("id, plan_name, plan_id, pricing_plan_id, status")
        .not_.is_("pricing_plan_id", "null")
        .in_("status", ["active", "trialing", "pending_upgrade", "grace_period"])
        .execute()
    )
    drift = 0
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
                drift += 1
    print(f"R1 plan_drift={drift} (expect 0)")
    if drift > 0:
        failed = True

    stuck = (
        db.table("checkout_requests")
        .select("id")
        .eq("status", "processing")
        .execute()
    )
    print(f"R5 stuck_processing={len(stuck.data or [])}")

    pending_outbox = (
        db.table("billing_outbox")
        .select("id")
        .eq("status", "pending")
        .execute()
    )
    print(f"R outbox_pending={len(pending_outbox.data or [])}")

    if failed:
        print("GATE-24h FAILED")
        sys.exit(1)
    print("GATE-24h PASSED")
    sys.exit(0)


if __name__ == "__main__":
    main()
