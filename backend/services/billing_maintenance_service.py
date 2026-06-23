"""
Billing maintenance — checkout queue drain and orphan reconciliation.

Used by Celery beat (Render) and optional daily Vercel safety-net cron.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

logger = logging.getLogger("reviseit.billing.maintenance")


def process_checkout_queue(max_jobs: int = 3) -> Dict[str, Any]:
    """Drain up to max_jobs checkout jobs from the Postgres lease queue."""
    from workers.checkout_processor_daemon import process_one_job

    processed = 0
    for _ in range(max_jobs):
        try:
            if process_one_job():
                processed += 1
            else:
                break
        except Exception as e:
            logger.warning(f"checkout_queue_job_error: {e}")
            break
    return {"ok": True, "processed": processed}


def reconcile_orphans() -> Dict[str, Any]:
    """Fail stuck checkouts and reconcile long-pending subscriptions."""
    from supabase_client import get_supabase_client

    db = get_supabase_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    stuck = (
        db.table("checkout_requests")
        .update(
            {
                "status": "failed",
                "error_message": "[ORPHAN] processing exceeded 10 minutes",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("status", "processing")
        .lt("processing_started_at", cutoff)
        .execute()
    )
    stuck_count = len(stuck.data or [])

    pending_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    pending = (
        db.table("subscriptions")
        .select("id, razorpay_subscription_id, user_id, product_domain")
        .in_("status", ["pending", "pending_upgrade"])
        .lt("updated_at", pending_cutoff)
        .limit(50)
        .execute()
    )
    reconciled = 0
    for sub in pending.data or []:
        rzp_id = sub.get("razorpay_subscription_id")
        if not rzp_id:
            continue
        try:
            from services.reconciliation_engine import reconcile_subscription

            outcome = reconcile_subscription(
                subscription_id=sub["id"],
                razorpay_subscription_id=rzp_id,
            )
            if outcome.get("auto_healed"):
                reconciled += 1
        except Exception as rec_err:
            logger.warning(f"orphan_reconcile_skip sub={sub.get('id')}: {rec_err}")

    return {
        "ok": True,
        "stuck_checkouts_failed": stuck_count,
        "subscriptions_reconciled": reconciled,
    }
