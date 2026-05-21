"""Validation helpers for Retell WebSocket events."""

from __future__ import annotations

from typing import Any

from ..contracts.retell import RetellInboundEvent
from ..domain.errors import RetellProtocolError


def parse_retell_event(payload: dict[str, Any]) -> RetellInboundEvent:
    if not isinstance(payload, dict):
        raise RetellProtocolError("Retell event must be a JSON object.")
    event = RetellInboundEvent.from_payload(payload)
    if event.needs_response and not event.call_id:
        raise RetellProtocolError("Retell response event is missing call_id.")
    return event

