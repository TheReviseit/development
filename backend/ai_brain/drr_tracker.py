"""
DRRTracker — Domain Response Rate monitoring.

DRR = % of responses that used real business data (not generic fallbacks).
Target: 95%+.

Without this metric, you have no way to know if code fixes
actually improved response quality after deployment.

Architecture:
    Every response → drr.record() → sliding window deque → get_drr()
                                                        → alert_if_below_threshold()
"""

import time
import logging
from collections import deque
from typing import Optional

logger = logging.getLogger(__name__)


class DRRTracker:
    """
    Tracks Domain Response Rate in a sliding time window.
    
    Thread-safe via append-only deque (CPython GIL guarantees atomicity).
    Memory-bounded via maxlen.
    """

    # ── Methods that count as "domain-aware" (used real business data) ──
    DOMAIN_METHODS = frozenset({
        # DomainAnswerer
        "domain_answerer",
        # LocalResponder
        "local_pricing", "local_fuzzy_pricing", "local_greeting",
        "local_hours", "local_location", "local_faq",
        "local_goodbye", "local_thanks",
        # LLM (uses business data in prompt context)
        "llm", "chatgpt",
        # Order flow
        "flow_started", "flow_next_step", "flow_awaiting_confirmation",
        "flow_smart_extraction", "order_flow", "order_completed",
        "payment_link",
        # Appointment flow
        "booking_success", "booking_complete",
        "appointment_flow", "appointment_started",
        # QualityGate rebuilt (upgraded generic → domain)
        "quality_gate_rebuilt",
        # Global interrupt (cancel/stop)
        "global_interrupt_cancel",
    })

    # ── Methods that count as "generic" (no real business data used) ──
    GENERIC_METHODS = frozenset({
        "error",
        "safety_net",
        "template_fallback",
        "rate_limit",
        "rate_limited",
        "hardcoded",
        "human_escalation",
        "out_of_scope_filter",
        "out_of_scope",
        "degraded",
        "unknown",
    })

    def __init__(self, max_events: int = 10000):
        """
        Args:
            max_events: Max events to keep in memory. At 100 msg/min,
                        10000 events = ~100 minutes of history.
        """
        self._events: deque = deque(maxlen=max_events)
        self._alert_threshold: float = 0.95
        self._last_alert_time: float = 0.0

    def record(
        self,
        generation_method: str,
        had_business_data: bool,
        response_was_generic: bool,
    ) -> None:
        """
        Record a response event for DRR calculation.
        
        Args:
            generation_method: From response["metadata"]["generation_method"]
            had_business_data: Whether business_data was available and non-empty
            response_was_generic: Whether QualityGate flagged it as generic
        """
        is_domain = (
            generation_method in self.DOMAIN_METHODS
            and had_business_data
            and not response_was_generic
        )

        self._events.append((time.time(), is_domain))

        # Check alert after recording
        self.alert_if_below_threshold()

    def get_drr(self, window_minutes: int = 60) -> float:
        """
        Returns % of responses that used real business data
        in the given time window.
        
        Returns 1.0 if no data (avoid false alerts on startup).
        """
        if not self._events:
            return 1.0

        cutoff = time.time() - (window_minutes * 60)
        window_events = [
            is_domain for ts, is_domain in self._events if ts >= cutoff
        ]

        if not window_events:
            return 1.0

        domain_count = sum(1 for d in window_events if d)
        return round(domain_count / len(window_events), 4)

    def alert_if_below_threshold(
        self, threshold: float = None
    ) -> Optional[str]:
        """
        Check if DRR is below threshold. Returns alert message or None.
        Rate-limited to 1 alert per 5 minutes to avoid log spam.
        """
        threshold = threshold or self._alert_threshold

        # 15-min window for alerts (more responsive than 1h)
        drr = self.get_drr(window_minutes=15)

        # Count events in window
        cutoff = time.time() - 900  # 15 min
        total = sum(1 for ts, _ in self._events if ts >= cutoff)

        # Need minimum sample size to avoid noisy alerts
        if total < 10:
            return None

        if drr >= threshold:
            return None

        # Rate limit alerts
        now = time.time()
        if now - self._last_alert_time < 300:  # 5 min cooldown
            return None

        self._last_alert_time = now
        alert_msg = (
            f"🚨 DRR ALERT: Domain Response Rate is {drr:.1%} "
            f"(threshold: {threshold:.0%}) over last 15 min "
            f"({total} responses). Generic responses are leaking through."
        )
        logger.critical(alert_msg)
        return alert_msg

    def get_stats(self) -> dict:
        """Full stats for monitoring dashboard / API endpoint."""
        return {
            "drr_15m": self.get_drr(15),
            "drr_1h": self.get_drr(60),
            "drr_24h": self.get_drr(1440),
            "total_events": len(self._events),
            "threshold": self._alert_threshold,
        }


# ═══════════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════════

_drr_tracker: Optional[DRRTracker] = None


def get_drr_tracker() -> DRRTracker:
    """Get the DRRTracker singleton."""
    global _drr_tracker
    if _drr_tracker is None:
        _drr_tracker = DRRTracker()
    return _drr_tracker
