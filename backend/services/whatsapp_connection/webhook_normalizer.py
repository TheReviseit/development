"""
WhatsApp webhook normalization helpers for the canonical v2 ingress.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Iterable, List


def stable_webhook_event_id(payload: Dict[str, Any], event: Dict[str, Any], index: int) -> str:
    message = event.get("message") or event.get("messages")
    if isinstance(message, dict) and message.get("id"):
        return f"whatsapp:msg:{message['id']}"

    status = event.get("status") or event.get("statuses")
    if isinstance(status, dict) and status.get("id"):
        return f"whatsapp:status:{status['id']}:{status.get('status', '')}"

    raw = json.dumps({"payload": payload, "event": event, "index": index}, sort_keys=True)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    return f"whatsapp:evt:{digest}"


def iter_whatsapp_changes(payload: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    for entry in payload.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value") or {}
            for message in value.get("messages", []) or []:
                yield {"type": "message", "message": message, "value": value, "change": change}
            for status in value.get("statuses", []) or []:
                yield {"type": "status", "status": status, "value": value, "change": change}


def normalize_webhook_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        {
            **event,
            "provider_event_id": stable_webhook_event_id(payload, event, index),
        }
        for index, event in enumerate(iter_whatsapp_changes(payload))
    ]
