"""
AI Brain Observability — Production metrics for LLM operations.

Tracks:
- 429 rate vs success rate (%)
- Retries per request
- Circuit breaker state changes
- Cooldown active time
- Success vs fallback ratio
- Local vs LLM response ratio
- Per-key usage and cooldown stats

All metrics are thread-safe and designed for structured logging.
"""

import time
import threading
import logging
from typing import Dict, Any, Optional
from collections import deque

logger = logging.getLogger('reviseit.ai_metrics')


class AIMetrics:
    """
    Thread-safe metrics collector for AI Brain operations.

    Uses sliding window (last 5 minutes) for rate calculations.
    Emits structured log lines for production observability.
    """

    def __init__(self, window_seconds: float = 300.0):
        self._lock = threading.Lock()
        self._window = window_seconds

        # Sliding window event buffers
        self._successes: deque = deque()
        self._rate_limits: deque = deque()
        self._errors: deque = deque()
        self._local_responses: deque = deque()
        self._fallback_responses: deque = deque()

        # Cumulative counters
        self._total_requests: int = 0
        self._total_successes: int = 0
        self._total_rate_limits: int = 0
        self._total_errors: int = 0
        self._total_local: int = 0
        self._total_fallback: int = 0
        self._total_retries: int = 0
        self._total_circuit_trips: int = 0
        self._total_circuit_blocked: int = 0

        # Per-key tracking
        self._per_key_429: Dict[int, int] = {}
        self._per_key_success: Dict[int, int] = {}

    def _prune(self, buffer: deque):
        """Remove entries older than the window."""
        cutoff = time.monotonic() - self._window
        while buffer and buffer[0] < cutoff:
            buffer.popleft()

    def record_success(self, key_index: int = 0, retries: int = 0):
        """Record a successful LLM call."""
        now = time.monotonic()
        with self._lock:
            self._successes.append(now)
            self._total_requests += 1
            self._total_successes += 1
            self._total_retries += retries
            self._per_key_success[key_index] = self._per_key_success.get(key_index, 0) + 1

    def record_rate_limit(self, key_index: int = 0, retry_after: float = 0):
        """Record a 429 rate limit event."""
        now = time.monotonic()
        with self._lock:
            self._rate_limits.append(now)
            self._total_rate_limits += 1
            self._per_key_429[key_index] = self._per_key_429.get(key_index, 0) + 1

        logger.warning(
            f"[AI] rate_limit_hit=true key={key_index} retry_after={retry_after:.1f}s "
            f"total_429s={self._total_rate_limits}"
        )

    def record_error(self, error_type: str = "unknown"):
        """Record a non-429 error."""
        now = time.monotonic()
        with self._lock:
            self._errors.append(now)
            self._total_requests += 1
            self._total_errors += 1

    def record_local_response(self, intent: str):
        """Record a locally-handled response (no LLM call)."""
        now = time.monotonic()
        with self._lock:
            self._local_responses.append(now)
            self._total_requests += 1
            self._total_local += 1

    def record_fallback_response(self, intent: str, reason: str = "rate_limit"):
        """Record a fallback/degraded response."""
        now = time.monotonic()
        with self._lock:
            self._fallback_responses.append(now)
            self._total_requests += 1
            self._total_fallback += 1

        logger.info(
            f"[AI] fallback=true intent={intent} reason={reason} "
            f"total_fallbacks={self._total_fallback}"
        )

    def record_circuit_trip(self):
        """Record circuit breaker tripping to OPEN."""
        with self._lock:
            self._total_circuit_trips += 1

    def record_circuit_blocked(self):
        """Record a request blocked by circuit breaker."""
        with self._lock:
            self._total_circuit_blocked += 1

    def get_stats(self) -> Dict[str, Any]:
        """Get current metrics snapshot."""
        with self._lock:
            # Prune all buffers
            for buf in [
                self._successes, self._rate_limits, self._errors,
                self._local_responses, self._fallback_responses
            ]:
                self._prune(buf)

            window_total = (
                len(self._successes) + len(self._rate_limits) +
                len(self._errors) + len(self._local_responses) +
                len(self._fallback_responses)
            )

            llm_attempts = len(self._successes) + len(self._rate_limits) + len(self._errors)

            return {
                # Window rates (last 5 min)
                "window_total": window_total,
                "window_successes": len(self._successes),
                "window_rate_limits": len(self._rate_limits),
                "window_errors": len(self._errors),
                "window_local": len(self._local_responses),
                "window_fallback": len(self._fallback_responses),
                "rate_limit_pct": (
                    round(len(self._rate_limits) / max(llm_attempts, 1) * 100, 1)
                ),
                "success_pct": (
                    round(len(self._successes) / max(llm_attempts, 1) * 100, 1)
                ),
                "local_pct": (
                    round(len(self._local_responses) / max(window_total, 1) * 100, 1)
                ),
                # Cumulative
                "total_requests": self._total_requests,
                "total_successes": self._total_successes,
                "total_rate_limits": self._total_rate_limits,
                "total_errors": self._total_errors,
                "total_local": self._total_local,
                "total_fallback": self._total_fallback,
                "total_retries": self._total_retries,
                "total_circuit_trips": self._total_circuit_trips,
                "total_circuit_blocked": self._total_circuit_blocked,
                # Per-key
                "per_key_429": dict(self._per_key_429),
                "per_key_success": dict(self._per_key_success),
            }

    def log_summary(self):
        """Emit a structured log summary of current metrics."""
        stats = self.get_stats()

        # Include system health state if available
        try:
            from .system_health import get_system_health
            health = get_system_health()
            health_stats = health.get_stats()
            system_state = health_stats["state"]
        except Exception:
            system_state = "unknown"

        # Include concurrency gate stats if available
        try:
            from .concurrency_gate import get_concurrency_gate
            gate = get_concurrency_gate()
            gate_stats = gate.get_stats()
            gate_info = (
                f"gate_inflight={gate_stats['current_inflight']}/{gate_stats['max_inflight']} "
                f"gate_rejected={gate_stats['total_rejected']} "
            )
        except Exception:
            gate_info = ""

        logger.info(
            f"[AI-METRICS] "
            f"system_state={system_state} "
            f"success_rate={stats['success_pct']}% "
            f"rate_limit_rate={stats['rate_limit_pct']}% "
            f"local_rate={stats['local_pct']}% "
            f"{gate_info}"
            f"total_req={stats['total_requests']} "
            f"total_429={stats['total_rate_limits']} "
            f"total_fallback={stats['total_fallback']} "
            f"circuit_trips={stats['total_circuit_trips']} "
            f"retries={stats['total_retries']}"
        )


# =========================================================================
# SINGLETON
# =========================================================================

_ai_metrics: Optional[AIMetrics] = None
_metrics_lock = threading.Lock()


def get_ai_metrics() -> AIMetrics:
    """Get or create the global AI metrics singleton."""
    global _ai_metrics
    if _ai_metrics is None:
        with _metrics_lock:
            if _ai_metrics is None:
                _ai_metrics = AIMetrics()
    return _ai_metrics
