"""
Cleanup jobs for WhatsApp connection attempts, DB locks, and orphan sessions.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict

logger = logging.getLogger("flowauxi.whatsapp_connection.cleanup")


def expire_stale_connection_attempts(client) -> Dict[str, int]:
    """Expire non-terminal attempts that passed expires_at."""
    now = datetime.now(timezone.utc).isoformat()
    terminal = ["active", "cancelled", "conflict", "expired", "failed", "disconnected"]
    result = (
        client.table("whatsapp_connection_attempts")
        .update({"state": "expired", "failure_code": "ATTEMPT_EXPIRED"})
        .lt("expires_at", now)
        .not_.in_("state", terminal)
        .execute()
    )
    count = len(result.data or [])
    logger.info("whatsapp_attempts_expired count=%s", count)
    return {"expired_attempts": count}


def release_expired_locks(client) -> Dict[str, int]:
    """Remove DB fallback locks after their TTL expires."""
    now = datetime.now(timezone.utc).isoformat()
    result = client.table("whatsapp_locks").delete().lt("expires_at", now).execute()
    count = len(result.data or [])
    logger.info("whatsapp_locks_released count=%s", count)
    return {"released_locks": count}


def cleanup_whatsapp_connection_state(client) -> Dict[str, int]:
    stats = {}
    stats.update(expire_stale_connection_attempts(client))
    stats.update(release_expired_locks(client))
    return stats
