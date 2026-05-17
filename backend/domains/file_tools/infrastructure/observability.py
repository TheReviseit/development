"""Structured observability helpers for file tools."""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Optional

logger = logging.getLogger("file_tools")


def hash_identifier(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def log_event(event: str, **fields: Any) -> None:
    safe_fields = {
        key: value
        for key, value in fields.items()
        if value is not None
    }
    logger.info("[file_tools] %s %s", event, safe_fields)


def log_failure(event: str, **fields: Any) -> None:
    safe_fields = {
        key: value
        for key, value in fields.items()
        if value is not None
    }
    logger.warning("[file_tools] %s %s", event, safe_fields)
