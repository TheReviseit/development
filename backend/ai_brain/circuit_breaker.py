"""
Circuit Breaker + Per-Key Cooldown for Gemini API — FAANG-grade resilience.

State Machine:
    CLOSED  → Normal operation. Tracks failures.
    OPEN    → All LLM calls blocked (use fallback). Auto-resets after cooldown.
    HALF_OPEN → Allows ONE test call. Success → CLOSED, Failure → OPEN.

Per-Key Cooldown:
    Tracks individual API key exhaustion timestamps.
    Skips exhausted keys, rotates to available ones.

Thread-safe: All state mutations use threading.Lock.
"""

import time
import threading
import logging
from enum import Enum
from typing import Dict, Optional

logger = logging.getLogger('reviseit.circuit_breaker')


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """
    Production-grade circuit breaker for LLM API calls.

    Transitions:
        CLOSED → OPEN:     when failure_count >= failure_threshold within window
        OPEN → HALF_OPEN:  after recovery_timeout seconds
        HALF_OPEN → CLOSED: on successful test call
        HALF_OPEN → OPEN:   on failed test call (reset timer)
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout_seconds: float = 45.0,
        failure_window_seconds: float = 60.0,
        half_open_max_calls: int = 1,
    ):
        self._state = CircuitState.CLOSED
        self._lock = threading.Lock()

        # Config
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout_seconds
        self._failure_window = failure_window_seconds
        self._half_open_max = half_open_max_calls

        # Tracking
        self._failure_timestamps: list = []  # sliding window
        self._last_failure_time: float = 0.0
        self._opened_at: float = 0.0
        self._half_open_calls: int = 0
        self._total_trips: int = 0  # lifetime counter for observability
        self._total_blocked: int = 0

    @property
    def state(self) -> CircuitState:
        """Get current state, auto-transitioning OPEN → HALF_OPEN if timeout elapsed."""
        with self._lock:
            if self._state == CircuitState.OPEN:
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= self._recovery_timeout:
                    self._state = CircuitState.HALF_OPEN
                    self._half_open_calls = 0
                    logger.info(
                        f"🔄 Circuit breaker HALF_OPEN (recovery timeout {self._recovery_timeout:.0f}s elapsed)"
                    )
            return self._state

    def peek_state(self) -> CircuitState:
        """Get current state WITHOUT consuming a HALF_OPEN probe.

        Use this for load-shedding decisions where you need to know
        the state but don't want to "spend" the one allowed test call.
        """
        with self._lock:
            if self._state == CircuitState.OPEN:
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= self._recovery_timeout:
                    return CircuitState.HALF_OPEN  # Would transition, but don't mutate
            return self._state

    def can_execute(self) -> bool:
        """Check if an LLM call is allowed right now."""
        current = self.state  # triggers auto-transition

        if current == CircuitState.CLOSED:
            return True

        if current == CircuitState.HALF_OPEN:
            with self._lock:
                if self._half_open_calls < self._half_open_max:
                    self._half_open_calls += 1
                    logger.info("🧪 Circuit breaker HALF_OPEN: allowing test call")
                    return True
                return False

        # OPEN
        with self._lock:
            self._total_blocked += 1
        return False

    def record_success(self):
        """Record a successful API call. Resets circuit to CLOSED."""
        with self._lock:
            if self._state in (CircuitState.HALF_OPEN, CircuitState.OPEN):
                logger.info(f"✅ Circuit breaker CLOSED (was {self._state.value}, successful call)")
            self._state = CircuitState.CLOSED
            self._failure_timestamps.clear()
            self._half_open_calls = 0

    def record_failure(self):
        """Record a failed API call (429 or other transient error)."""
        now = time.monotonic()
        with self._lock:
            # Add to sliding window
            self._failure_timestamps.append(now)
            self._last_failure_time = now

            # Prune old failures outside window
            cutoff = now - self._failure_window
            self._failure_timestamps = [t for t in self._failure_timestamps if t > cutoff]

            # HALF_OPEN failure → back to OPEN
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                self._opened_at = now
                logger.warning(
                    f"⛔ Circuit breaker OPEN (HALF_OPEN test failed, "
                    f"recovery in {self._recovery_timeout:.0f}s)"
                )
                return

            # CLOSED → check threshold
            if self._state == CircuitState.CLOSED:
                if len(self._failure_timestamps) >= self._failure_threshold:
                    self._state = CircuitState.OPEN
                    self._opened_at = now
                    self._total_trips += 1
                    logger.warning(
                        f"⛔ Circuit breaker OPEN (threshold={self._failure_threshold} "
                        f"failures in {self._failure_window:.0f}s window, "
                        f"recovery in {self._recovery_timeout:.0f}s, "
                        f"total trips={self._total_trips})"
                    )

    def get_stats(self) -> Dict:
        """Get observability stats."""
        with self._lock:
            return {
                "state": self._state.value,
                "recent_failures": len(self._failure_timestamps),
                "failure_threshold": self._failure_threshold,
                "total_trips": self._total_trips,
                "total_blocked": self._total_blocked,
                "recovery_timeout_s": self._recovery_timeout,
            }


class PerKeyCooldownTracker:
    """
    Track per-API-key cooldown state.

    When a key gets 429'd, record its cooldown expiry.
    On next request, skip keys that are still in cooldown.
    """

    def __init__(self):
        self._cooldowns: Dict[int, float] = {}  # key_index → monotonic expiry time
        self._lock = threading.Lock()

    def mark_exhausted(self, key_index: int, retry_after_seconds: float):
        """Mark a key as exhausted with a cooldown period."""
        with self._lock:
            expiry = time.monotonic() + retry_after_seconds
            self._cooldowns[key_index] = expiry
            logger.info(
                f"🔑 Key #{key_index + 1} cooldown: {retry_after_seconds:.1f}s "
                f"(available at +{retry_after_seconds:.0f}s)"
            )

    def is_available(self, key_index: int) -> bool:
        """Check if a key is available (not in cooldown)."""
        with self._lock:
            expiry = self._cooldowns.get(key_index, 0.0)
            return time.monotonic() >= expiry

    def get_next_available_key(self, total_keys: int, current_index: int) -> Optional[int]:
        """Find the next available key, starting from current_index + 1.

        Returns key index or None if all keys are in cooldown.
        """
        with self._lock:
            now = time.monotonic()
            for offset in range(total_keys):
                idx = (current_index + offset) % total_keys
                expiry = self._cooldowns.get(idx, 0.0)
                if now >= expiry:
                    return idx
            return None

    def get_shortest_wait(self, total_keys: int) -> float:
        """Get the shortest wait time until any key becomes available."""
        with self._lock:
            now = time.monotonic()
            waits = []
            for idx in range(total_keys):
                expiry = self._cooldowns.get(idx, 0.0)
                remaining = expiry - now
                if remaining <= 0:
                    return 0.0
                waits.append(remaining)
            return min(waits) if waits else 0.0

    def clear_expired(self):
        """Clean up expired cooldowns."""
        with self._lock:
            now = time.monotonic()
            self._cooldowns = {k: v for k, v in self._cooldowns.items() if v > now}


# =========================================================================
# SINGLETON
# =========================================================================

_circuit_breaker: Optional[CircuitBreaker] = None
_cb_lock = threading.Lock()


def get_circuit_breaker(
    failure_threshold: int = 5,
    recovery_timeout_seconds: float = 45.0,
) -> CircuitBreaker:
    """Get or create the global circuit breaker singleton."""
    global _circuit_breaker
    if _circuit_breaker is None:
        with _cb_lock:
            if _circuit_breaker is None:
                _circuit_breaker = CircuitBreaker(
                    failure_threshold=failure_threshold,
                    recovery_timeout_seconds=recovery_timeout_seconds,
                )
                logger.info(
                    f"⚡ Circuit breaker initialized "
                    f"(threshold={failure_threshold}, "
                    f"recovery={recovery_timeout_seconds:.0f}s)"
                )
    return _circuit_breaker
