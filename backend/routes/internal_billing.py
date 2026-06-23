"""
Internal billing endpoints — warm worker, process checkout queue, orphan reconciliation.
Protected by CRON_SECRET bearer token.
"""

import logging
import os
from datetime import datetime, timezone

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
    """Process checkout jobs from the queue (up to 3 per call)."""
    if not _authorized():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        from services.billing_maintenance_service import process_checkout_queue

        result = process_checkout_queue(max_jobs=3)
        return jsonify(result)
    except Exception as e:
        logger.error(f"checkout_process_error: {e}", exc_info=True)
        return jsonify({"ok": False, "error": str(e)[:200]}), 500


@internal_billing_bp.route("/reconcile-orphans", methods=["POST"])
def reconcile_orphans():
    """Fail stuck checkouts and reconcile pending subscriptions."""
    if not _authorized():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        from services.billing_maintenance_service import reconcile_orphans as run_reconcile

        return jsonify(run_reconcile())
    except Exception as e:
        logger.error(f"reconcile_orphans_error: {e}", exc_info=True)
        return jsonify({"ok": False, "error": str(e)[:200]}), 500


def register_internal_billing_routes(app):
    app.register_blueprint(internal_billing_bp)
