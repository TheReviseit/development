"""
Internal billing endpoints — warm worker, process checkout queue, orphan reconciliation.
Protected by CRON_SECRET bearer token.
"""

import logging
import os
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request

logger = logging.getLogger("reviseit.billing.internal")

internal_billing_bp = Blueprint(
    "internal_billing", __name__, url_prefix="/internal/checkout"
)


def _authorized() -> bool:
    secret = os.getenv("CRON_SECRET") or os.getenv("BILLING_CRON_SECRET")
    if not secret:
        return False
    auth = request.headers.get("Authorization", "")
    return auth == f"Bearer {secret}"


@internal_billing_bp.route("/warm", methods=["GET", "POST"])
def warm():
    if not _authorized():
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"ok": True, "warmed_at": datetime.now(timezone.utc).isoformat()})


@internal_billing_bp.route("/process", methods=["POST"])
def process_one():
    """Process a single checkout job from the queue."""
    if not _authorized():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        from workers.checkout_processor_daemon import process_one_job

        processed = process_one_job()
        return jsonify({"ok": True, "processed": processed})
    except Exception as e:
        logger.error(f"checkout_process_error: {e}", exc_info=True)
        return jsonify({"ok": False, "error": str(e)[:200]}), 500


@internal_billing_bp.route("/reconcile-orphans", methods=["POST"])
def reconcile_orphans():
    """Fail stuck checkouts and reconcile pending subscriptions."""
    if not _authorized():
        return jsonify({"error": "Unauthorized"}), 401
    try:
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

        return jsonify(
            {
                "ok": True,
                "stuck_checkouts_failed": stuck_count,
                "subscriptions_reconciled": reconciled,
            }
        )
    except Exception as e:
        logger.error(f"reconcile_orphans_error: {e}", exc_info=True)
        return jsonify({"ok": False, "error": str(e)[:200]}), 500


def register_internal_billing_routes(app):
    app.register_blueprint(internal_billing_bp)
