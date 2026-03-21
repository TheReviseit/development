"""
Concurrency Gate — Global inflight request limiter for LLM calls.

FAANG-grade production pattern: prevent system collapse under load
by capping the number of simultaneous LLM API calls.

When the gate is full, callers get an immediate signal to use
local fallback instead of queueing — this prevents cascading latency.

Thread-safe: uses threading.Semaphore (the correct primitive for this).
"""

import time
import threading
import logging
from typing import Optional

logger = logging.getLogger('reviseit.concurrency_gate')


class ConcurrencyGate:
    """
    Thread-safe inflight request limiter.

    Usage:
        gate = get_concurrency_gate()
        if not gate.try_acquire():
            return local_fallback()
        try:
            result = call_llm(...)
        finally:
            gate.release()

    Or as a context manager:
        with gate.acquire_or_raise():
            result = call_llm(...)
    """

    def __init__(self, max_inflight: int = 10):
        self._max_inflight = max_inflight
        self._semaphore = threading.Semaphore(max_inflight)
        self._lock = threading.Lock()

        # Observability counters
        self._current_inflight = 0
        self._total_acquired = 0
        self._total_rejected = 0
        self._peak_inflight = 0

        logger.info(
            f"⚡ ConcurrencyGate initialized (max_inflight={max_inflight})"
        )

    def try_acquire(self) -> bool:
        """
        Try to acquire a slot. Returns True if acquired, False if gate is full.
        Non-blocking — returns immediately.
        """
        acquired = self._semaphore.acquire(blocking=False)
        with self._lock:
            if acquired:
                self._current_inflight += 1
                self._total_acquired += 1
                self._peak_inflight = max(self._peak_inflight, self._current_inflight)
            else:
                self._total_rejected += 1
                logger.warning(
                    f"🚫 ConcurrencyGate FULL ({self._max_inflight}/{self._max_inflight} inflight) "
                    f"— request will use local fallback | total_rejected={self._total_rejected}"
                )
        return acquired

    def release(self):
        """Release a slot back to the gate."""
        self._semaphore.release()
        with self._lock:
            self._current_inflight = max(0, self._current_inflight - 1)

    @property
    def current_inflight(self) -> int:
        """Current number of inflight LLM requests."""
        with self._lock:
            return self._current_inflight

    @property
    def available_slots(self) -> int:
        """Number of available slots."""
        with self._lock:
            return self._max_inflight - self._current_inflight

    def get_stats(self) -> dict:
        """Get observability stats."""
        with self._lock:
            return {
                "max_inflight": self._max_inflight,
                "current_inflight": self._current_inflight,
                "available_slots": self._max_inflight - self._current_inflight,
                "total_acquired": self._total_acquired,
                "total_rejected": self._total_rejected,
                "peak_inflight": self._peak_inflight,
                "rejection_rate_pct": round(
                    self._total_rejected / max(self._total_acquired + self._total_rejected, 1) * 100, 1
                ),
            }


# =========================================================================
# SINGLETON
# =========================================================================

_concurrency_gate: Optional[ConcurrencyGate] = None
_gate_lock = threading.Lock()


def get_concurrency_gate(max_inflight: int = 10) -> ConcurrencyGate:
    """Get or create the global concurrency gate singleton."""
    global _concurrency_gate
    if _concurrency_gate is None:
        with _gate_lock:
            if _concurrency_gate is None:
                _concurrency_gate = ConcurrencyGate(max_inflight=max_inflight)
    return _concurrency_gate
