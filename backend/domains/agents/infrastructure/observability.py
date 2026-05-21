"""Small observability helpers for the agents domain."""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Iterator

from ..domain.policies import PIIRedactionPolicy

logger = logging.getLogger("flowauxi.agents")


@contextmanager
def latency_timer() -> Iterator[dict[str, int]]:
    started = time.perf_counter()
    result = {"latency_ms": 0}
    try:
        yield result
    finally:
        result["latency_ms"] = int((time.perf_counter() - started) * 1000)


def log_turn(call_id: str, tenant_id: str, transcript: str, source: str, latency_ms: int) -> None:
    logger.info(
        "voice_turn call_id=%s tenant_id=%s source=%s latency_ms=%s transcript=%s",
        call_id,
        tenant_id,
        source,
        latency_ms,
        PIIRedactionPolicy.redact_text(transcript)[:240],
    )

