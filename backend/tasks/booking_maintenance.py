"""
Booking expiration — Celery beat on Render (Vercel Hobby cannot run every minute).
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict

logger = logging.getLogger("reviseit.tasks.booking_maintenance")


def expire_stale_bookings() -> Dict[str, Any]:
    from supabase_client import get_supabase_client

    db = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()

    result = (
        db.table("appointments")
        .update(
            {
                "booking_status": "expired",
                "status": "cancelled",
                "expired_at": now,
            }
        )
        .in_("booking_status", ["draft", "payment_pending"])
        .neq("payment_status", "paid")
        .lt("reserved_until", now)
        .execute()
    )
    expired_count = len(result.data or [])
    if expired_count:
        logger.info(f"booking_expiry expired_count={expired_count}")
    return {"ok": True, "expired_count": expired_count, "checked_at": now}


try:
    from celery_app import celery_app

    if celery_app:

        @celery_app.task(name="booking_maintenance.expire_stale_bookings")
        def expire_stale_bookings_celery():
            return expire_stale_bookings()

except Exception:
    pass
