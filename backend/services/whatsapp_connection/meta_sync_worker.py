"""
Post-connection Meta sync worker.

The v2 API writes canonical connection state synchronously, then emits an
outbox event. This worker is the durable follow-up path for refreshing Meta
health, quality, registration, and webhook status without blocking login.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

logger = logging.getLogger("flowauxi.whatsapp_connection.meta_sync")


def mark_sync_running(client, account_id: str, sync_kind: str = "meta_health") -> None:
    client.table("whatsapp_sync_state").upsert(
        {
            "account_id": account_id,
            "sync_kind": sync_kind,
            "status": "running",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="account_id,sync_kind",
    ).execute()


def mark_sync_result(
    client,
    account_id: str,
    status: str,
    sync_kind: str = "meta_health",
    cursor_data: Dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    client.table("whatsapp_sync_state").upsert(
        {
            "account_id": account_id,
            "sync_kind": sync_kind,
            "status": status,
            "cursor_data": cursor_data or {},
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "last_error": error,
        },
        on_conflict="account_id,sync_kind",
    ).execute()


def sync_account_from_meta(client, account_id: str) -> Dict[str, Any]:
    """
    Placeholder for the outbox-driven Meta refresh.

    The initial rollout records the sync boundary without making a second Meta
    call. A later worker can hydrate quality, webhook, and token health here.
    """
    mark_sync_running(client, account_id)
    mark_sync_result(client, account_id, "healthy", cursor_data={"source": "connection_finalized"})
    logger.info("whatsapp_meta_sync_marked_healthy account_id=%s", account_id)
    return {"account_id": account_id, "status": "healthy"}
