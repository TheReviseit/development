"""
System Health State Machine — Explicit degradation modes.

FAANG-grade production pattern: instead of scattered health checks,
maintain a single source of truth for system state.

State Machine:
    NORMAL    → Full AI pipeline (classify + generate + self-check)
    DEGRADED  → Skip self-check, reduce token budgets
    HIGH_LOAD → LOW priority → local only, skip non-critical features
    CRITICAL  → ALL responses local (zero LLM calls)

Transitions are automatic based on circuit breaker state and recent 429 rates.
Thread-safe: all state reads/writes use threading.Lock.

v2.0 FIX: Added time-based auto-recovery to prevent CRITICAL deadlock.
  Previously: CRITICAL → blocks all LLM → no successes → never recovers.
  Now: After 90s without new failures, auto-steps down one level.
"""

import time
import threading
import logging
from enum import Enum
from typing import Dict, Any, Optional

logger = logging.getLogger('reviseit.system_health')


class SystemState(str, Enum):
    """System health states — determines processing strategy."""
    NORMAL = "normal"         # Full AI pipeline
    DEGRADED = "degraded"     # Skip self-check, reduce tokens
    HIGH_LOAD = "high_load"   # LOW priority → local only
    CRITICAL = "critical"     # ALL responses local


# =========================================================================
# STATE TRANSITION RULES
# =========================================================================

# Thresholds for automatic state transitions
_TRANSITIONS = {
    # (metric, threshold, target_state)
    "rate_limit_pct_critical": 80.0,   # >80% 429 rate → CRITICAL
    "rate_limit_pct_high": 40.0,       # >40% 429 rate → HIGH_LOAD
    "rate_limit_pct_degraded": 15.0,   # >15% 429 rate → DEGRADED
    
    # v3.0 FIX: Lowered thresholds for faster degradation/recovery
    "consecutive_failures_critical": 5, # Was 8. 5+ consecutive failures → CRITICAL
    "consecutive_failures_high": 3,     # Was 5. 3+ consecutive → HIGH_LOAD
    "auto_recovery_seconds": 45.0,     # Was 90.0. Auto-recover one level after 45s
}


class SystemHealthMonitor:
    """
    Centralized system health state machine.

    Automatically transitions between states based on:
    - Circuit breaker state
    - Recent 429 rate (from observability metrics)
    - Consecutive failure count
    - Manual overrides (kill switch)

    Usage:
        health = get_system_health()
        state = health.current_state

        if state == SystemState.CRITICAL:
            return local_fallback()
        if state == SystemState.HIGH_LOAD and priority == LOW:
            return local_fallback()
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._state = SystemState.NORMAL
        self._last_transition_time = time.monotonic()
        self._last_probe_time = 0.0  # Track probe calls independently to avoid deadlock
        self._manual_override: Optional[SystemState] = None

        # Tracking for automatic transitions
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._recent_429_count = 0
        self._recent_total_count = 0
        self._window_start = time.monotonic()
        self._window_seconds = 120.0  # 2-minute sliding window

        # Observability
        self._transition_history: list = []  # Last 20 transitions
        self._total_transitions = 0

        logger.info("⚡ SystemHealthMonitor initialized (state=NORMAL)")

    @property
    def current_state(self) -> SystemState:
        """
        Get current system state (respects manual override).

        v2.0: Now auto-recovers if no new failures for 90s.
        This prevents the CRITICAL deadlock where blocking LLM calls
        prevents the successes needed for recovery.
        """
        with self._lock:
            if self._manual_override is not None:
                return self._manual_override

            # v2.0: Time-based auto-recovery
            # If we've been in a degraded state with no new failures
            # for longer than the recovery window, step down one level.
            self._maybe_auto_recover()

            return self._state

    @property
    def is_healthy(self) -> bool:
        """Quick check: is the system in NORMAL state?"""
        return self.current_state == SystemState.NORMAL

    @property
    def should_skip_self_check(self) -> bool:
        """Should self-check be skipped? True for DEGRADED and above."""
        return self.current_state != SystemState.NORMAL

    @property
    def should_reduce_tokens(self) -> bool:
        """Should token budgets be reduced? True for DEGRADED and above."""
        return self.current_state != SystemState.NORMAL

    def allows_llm_call(self, priority: str = "medium") -> bool:
        """
        Check if an LLM call is allowed given the current state and priority.

        Args:
            priority: "critical", "high", "medium", "low"

        Returns:
            True if the LLM call should proceed, False if local fallback.
        """
        state = self.current_state

        if state == SystemState.NORMAL:
            return True

        if state == SystemState.DEGRADED:
            return True  # All priorities OK, just skip self-check

        if state == SystemState.HIGH_LOAD:
            # Only allow high/critical priority through
            return priority in ("critical", "high")

        if state == SystemState.CRITICAL:
            # ALWAYS allow critical priority (payments etc.)
            if priority == "critical":
                return True
                
            # v3.0 FIX: Deadlock prevention — allow 1 probe call every 30s
            # If we block ALL calls, we never get a success, so we never naturally
            # recover tracking stats. This "probe" pings the API occasionally.
            now = time.monotonic()
            if now - self._last_probe_time >= 30.0:
                logger.info(f"🔄 Passing PROBE call through CRITICAL state (30s elapsed)")
                # Update probe time to prevent multiple simultaneous probes
                # DO NOT update _last_transition_time, which breaks 45s auto-recovery
                self._last_probe_time = now
                return True
                
            return False

        return True

    # -----------------------------------------------------------------
    # EVENT RECORDING — Call these from the AI pipeline
    # -----------------------------------------------------------------

    def record_success(self):
        """Record a successful LLM call."""
        with self._lock:
            self._consecutive_successes += 1
            self._consecutive_failures = 0
            self._recent_total_count += 1
            self._maybe_prune_window()
            self._evaluate_state()

    def record_failure(self, is_rate_limit: bool = False):
        """Record a failed LLM call (429 or other)."""
        with self._lock:
            self._consecutive_failures += 1
            self._consecutive_successes = 0
            self._recent_total_count += 1
            if is_rate_limit:
                self._recent_429_count += 1
            self._maybe_prune_window()
            self._evaluate_state()

    def record_local_response(self):
        """Record a locally-handled response (no state change needed)."""
        pass  # No-op for state machine, tracked in observability

    # -----------------------------------------------------------------
    # MANUAL CONTROLS
    # -----------------------------------------------------------------

    def set_kill_switch(self, state: SystemState):
        """
        Manual override — force system into a specific state.
        Use for emergency situations.
        """
        with self._lock:
            self._manual_override = state
            logger.critical(
                f"🚨 KILL SWITCH ACTIVATED — system forced to {state.value}"
            )

    def clear_kill_switch(self):
        """Clear manual override, return to automatic state management."""
        with self._lock:
            self._manual_override = None
            logger.info("✅ Kill switch cleared — returning to automatic state management")

    # -----------------------------------------------------------------
    # INTERNAL STATE EVALUATION
    # -----------------------------------------------------------------

    def _maybe_prune_window(self):
        """Reset counters if window has elapsed."""
        now = time.monotonic()
        if now - self._window_start > self._window_seconds:
            self._recent_429_count = 0
            self._recent_total_count = 0
            self._consecutive_failures = 0  # v2.0: Also reset consecutive failures
            self._window_start = now

    def _maybe_auto_recover(self):
        """
        v2.0: Time-based auto-recovery — prevents CRITICAL deadlock.

        Problem: In CRITICAL state, ALL LLM calls are blocked,
        so record_success() never fires, and the 3-success recovery
        condition is impossible to meet. System stays stuck forever.

        Solution: After 90s with no new failures recorded, automatically
        step down one level (CRITICAL → HIGH_LOAD → DEGRADED → NORMAL).
        This gives the system a chance to attempt LLM calls again.
        """
        if self._state == SystemState.NORMAL:
            return  # Already healthy, nothing to do

        now = time.monotonic()
        time_since_last_failure = now - self._last_transition_time
        recovery_threshold = _TRANSITIONS["auto_recovery_seconds"]

        # Also prune stale window data
        if now - self._window_start > self._window_seconds:
            self._recent_429_count = 0
            self._recent_total_count = 0
            self._consecutive_failures = 0
            self._window_start = now

        if time_since_last_failure >= recovery_threshold:
            old_state = self._state

            # Step down one level
            step_down = {
                SystemState.CRITICAL: SystemState.HIGH_LOAD,
                SystemState.HIGH_LOAD: SystemState.DEGRADED,
                SystemState.DEGRADED: SystemState.NORMAL,
            }
            new_state = step_down.get(self._state, SystemState.NORMAL)
            self._state = new_state
            self._last_transition_time = now
            self._consecutive_failures = 0
            self._consecutive_successes = 0
            self._total_transitions += 1

            # Record transition
            transition = {
                "from": old_state.value,
                "to": new_state.value,
                "time": now,
                "reason": f"auto_recovery_after_{recovery_threshold:.0f}s",
            }
            self._transition_history.append(transition)
            if len(self._transition_history) > 20:
                self._transition_history = self._transition_history[-20:]

            logger.info(
                f"🟢 AUTO-RECOVERY: {old_state.value} → {new_state.value} "
                f"(no failures for {time_since_last_failure:.0f}s)"
            )

    def _evaluate_state(self):
        """Evaluate and potentially transition state based on current metrics."""
        old_state = self._state

        # Calculate current 429 rate
        rate_429 = (
            (self._recent_429_count / max(self._recent_total_count, 1)) * 100
            if self._recent_total_count > 0 else 0.0
        )

        # v2.0: Require a minimum number of requests before rate-based
        # state transitions. Without this, a single 429 (1/1 = 100%)
        # would immediately trigger CRITICAL — way too aggressive.
        has_enough_samples = self._recent_total_count >= 3

        # Determine new state based on thresholds
        if (has_enough_samples and rate_429 >= _TRANSITIONS["rate_limit_pct_critical"]
                or self._consecutive_failures >= _TRANSITIONS["consecutive_failures_critical"]):
            new_state = SystemState.CRITICAL

        elif (has_enough_samples and rate_429 >= _TRANSITIONS["rate_limit_pct_high"]
              or self._consecutive_failures >= _TRANSITIONS["consecutive_failures_high"]):
            new_state = SystemState.HIGH_LOAD

        elif has_enough_samples and rate_429 >= _TRANSITIONS["rate_limit_pct_degraded"]:
            new_state = SystemState.DEGRADED

        elif self._consecutive_successes >= 3:
            # Recovery: 3 consecutive successes → step down one level
            if self._state == SystemState.CRITICAL:
                new_state = SystemState.HIGH_LOAD
            elif self._state == SystemState.HIGH_LOAD:
                new_state = SystemState.DEGRADED
            elif self._state == SystemState.DEGRADED:
                new_state = SystemState.NORMAL
            else:
                new_state = SystemState.NORMAL
        else:
            new_state = self._state  # No change

        if new_state != old_state:
            self._state = new_state
            self._last_transition_time = time.monotonic()
            self._total_transitions += 1
            self._consecutive_successes = 0  # Reset on transition

            # Record transition for observability
            transition = {
                "from": old_state.value,
                "to": new_state.value,
                "time": time.monotonic(),
                "rate_429": round(rate_429, 1),
                "consecutive_failures": self._consecutive_failures,
            }
            self._transition_history.append(transition)
            if len(self._transition_history) > 20:
                self._transition_history = self._transition_history[-20:]

            # Log level depends on severity
            if new_state in (SystemState.CRITICAL, SystemState.HIGH_LOAD):
                logger.warning(
                    f"🔴 System health: {old_state.value} → {new_state.value} "
                    f"(429_rate={rate_429:.0f}%, consecutive_failures={self._consecutive_failures})"
                )
            elif new_state == SystemState.NORMAL:
                logger.info(
                    f"🟢 System health RECOVERED: {old_state.value} → NORMAL "
                    f"(consecutive_successes={self._consecutive_successes})"
                )
            else:
                logger.info(
                    f"🟡 System health: {old_state.value} → {new_state.value} "
                    f"(429_rate={rate_429:.0f}%)"
                )

    def get_stats(self) -> Dict[str, Any]:
        """Get observability stats."""
        with self._lock:
            rate_429 = (
                (self._recent_429_count / max(self._recent_total_count, 1)) * 100
                if self._recent_total_count > 0 else 0.0
            )
            return {
                "state": self.current_state.value,
                "manual_override": self._manual_override.value if self._manual_override else None,
                "consecutive_failures": self._consecutive_failures,
                "consecutive_successes": self._consecutive_successes,
                "window_429_rate_pct": round(rate_429, 1),
                "window_total_requests": self._recent_total_count,
                "total_transitions": self._total_transitions,
                "last_transition_age_s": round(
                    time.monotonic() - self._last_transition_time, 1
                ),
                "recent_transitions": self._transition_history[-5:],
            }


# =========================================================================
# SINGLETON
# =========================================================================

_system_health: Optional[SystemHealthMonitor] = None
_health_lock = threading.Lock()


def get_system_health() -> SystemHealthMonitor:
    """Get or create the global system health monitor singleton."""
    global _system_health
    if _system_health is None:
        with _health_lock:
            if _system_health is None:
                _system_health = SystemHealthMonitor()
    return _system_health
