"""
Connection health checks for canonical WhatsApp accounts.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict

logger = logging.getLogger("flowauxi.whatsapp_connection.health")


def mark_stale_accounts(client, stale_before_iso: str) -> Dict[str, int]:
    result = (
        client.table("whatsapp_accounts")
        .update({"status": "stale", "connection_error": "validation_stale"})
        .lt("last_validated_at", stale_before_iso)
        .eq("status", "active")
        .is_("deleted_at", "null")
        .execute()
    )
    count = len(result.data or [])
    logger.info("whatsapp_accounts_marked_stale count=%s", count)
    return {"stale_accounts": count}


def record_health_check(client, account_id: str, status: str, details: dict | None = None) -> None:
    client.table("whatsapp_audit_logs").insert(
        {
            "account_id": account_id,
            "action": "whatsapp_connection_health_check",
            "actor_type": "worker",
            "summary": f"WhatsApp connection health is {status}",
            "details": details or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
