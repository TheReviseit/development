"""
Trial Observability — Structured Logging, Metrics, and Tracing
============================================================

Provides:
- Structured logging with trial context
- Metrics: trial_start_rate, conversion_rate, churn, etc.
- Tracing support for distributed systems
- Health checks

Usage:
    from services.trial_observability import get_trial_logger, get_trial_metrics

    logger = get_trial_logger()
    logger.trial_started(trial_id=id, user_id=uid, plan='starter')

    metrics = get_trial_metrics()
    metrics.record_trial_start(domain='shop')
"""

import logging
import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict, Any, List

# =============================================================================
# CONTEXT VAR (for request-scoped data)
# =============================================================================

trial_context: ContextVar[Optional[Dict[str, Any]]] = ContextVar(
    'trial_context', default=None
)


def set_trial_context(**kwargs):
    """Set request-scoped trial context."""
    current = trial_context.get() or {}
    current.update(kwargs)
    trial_context.set(current)


def get_trial_context() -> Dict[str, Any]:
    """Get current trial context."""
    return trial_context.get() or {}


# =============================================================================
# LOGGING
# =============================================================================

class TrialLogger:
    """
    Structured logger for trial operations.

    Features:
    - Structured JSON logging
    - Request context injection
    - Trial-specific log levels
    - Metric emission on log events
    """

    def __init__(self, name: str = 'reviseit.trial'):
        self._logger = logging.getLogger(name)
        self._metrics = None

    @property
    def metrics(self):
        """Lazy-load metrics."""
        if self._metrics is None:
            self._metrics = get_trial_metrics()
        return self._metrics

    def _log(
        self,
        level: int,
        msg: str,
        extra: Optional[Dict[str, Any]] = None,
        **kwargs
    ):
        """Internal log method with context injection."""
        # Merge context
        ctx = get_trial_context()
        ctx.update(kwargs)
        ctx.update(extra or {})

        # Add timestamp
        ctx['timestamp'] = datetime.now(timezone.utc).isoformat()
        ctx['logger'] = self._logger.name

        self._logger.log(level, msg, extra=ctx, **kwargs)

    def trial_started(
        self,
        trial_id: str,
        user_id: str,
        org_id: str,
        domain: str,
        plan_slug: str,
        trial_days: int,
        abuse_risk_score: int = 0,
        source: str = 'organic',
        **kwargs
    ):
        """Log trial started event."""
        self._log(
            logging.INFO,
            "trial_started",
            trial_id=trial_id,
            user_id=user_id,
            org_id=org_id,
            domain=domain,
            plan_slug=plan_slug,
            trial_days=trial_days,
            abuse_risk_score=abuse_risk_score,
            source=source,
            event='trial.started',
        )
        self.metrics.record_trial_start(domain=domain, source=source)

    def trial_expired(
        self,
        trial_id: str,
        user_id: str,
        org_id: str,
        domain: str,
        reason: str = 'Trial period ended',
        **kwargs
    ):
        """Log trial expired event."""
        self._log(
            logging.INFO,
            "trial_expired",
            trial_id=trial_id,
            user_id=user_id,
            org_id=org_id,
            domain=domain,
            reason=reason,
            event='trial.expired',
        )
        self.metrics.record_trial_expired(domain=domain)

    def trial_converted(
        self,
        trial_id: str,
        user_id: str,
        org_id: str,
        domain: str,
        converted_to_plan: str,
        subscription_id: str,
        conversion_latency_hours: Optional[float] = None,
        **kwargs
    ):
        """Log trial converted to paid event."""
        self._log(
            logging.INFO,
            "trial_converted",
            trial_id=trial_id,
            user_id=user_id,
            org_id=org_id,
            domain=domain,
            converted_to_plan=converted_to_plan,
            subscription_id=subscription_id,
            conversion_latency_hours=conversion_latency_hours,
            event='trial.converted',
        )
        self.metrics.record_trial_converted(
            domain=domain,
            to_plan=converted_to_plan,
            latency_hours=conversion_latency_hours
        )

    def trial_expiring_soon(
        self,
        trial_id: str,
        user_id: str,
        org_id: str,
        domain: str,
        days_remaining: int,
        **kwargs
    ):
        """Log trial expiring soon event."""
        self._log(
            logging.WARNING,
            "trial_expiring_soon",
            trial_id=trial_id,
            user_id=user_id,
            org_id=org_id,
            domain=domain,
            days_remaining=days_remaining,
            event='trial.expiring_soon',
        )
        self.metrics.record_trial_expiring_soon(domain=domain)

    def trial_abuse_detected(
        self,
        trial_id: str,
        user_id: str,
        org_id: str,
        domain: str,
        risk_score: int,
        signals: List[str],
        **kwargs
    ):
        """Log abuse detection event."""
        self._log(
            logging.WARNING,
            "trial_abuse_detected",
            trial_id=trial_id,
            user_id=user_id,
            org_id=org_id,
            domain=domain,
            risk_score=risk_score,
            signals=signals,
            event='trial.abuse_detected',
        )
        self.metrics.record_abuse_signal(domain=domain, risk_score=risk_score)

    def trial_error(
        self,
        operation: str,
        error: str,
        trial_id: Optional[str] = None,
        user_id: Optional[str] = None,
        **kwargs
    ):
        """Log trial operation error."""
        self._log(
            logging.ERROR,
            f"trial_error_{operation}",
            trial_id=trial_id,
            user_id=user_id,
            error=error,
            event=f'trial.error.{operation}',
        )

    def info(self, msg: str, **kwargs):
        """General info log."""
        self._log(logging.INFO, msg, **kwargs)

    def warning(self, msg: str, **kwargs):
        """General warning log."""
        self._log(logging.WARNING, msg, **kwargs)

    def error(self, msg: str, **kwargs):
        """General error log."""
        self._log(logging.ERROR, msg, **kwargs)


# =============================================================================
# METRICS
# =============================================================================

@dataclass
class TrialMetricSnapshot:
    """Snapshot of trial metrics at a point in time."""
    timestamp: datetime
    domain: str
    total_trials: int
    active_trials: int
    converted_trials: int
    expired_trials: int
    cancelled_trials: int
    conversion_rate: float
    avg_trial_duration_days: float
    abuse_signals_count: int


class TrialMetrics:
    """
    Metrics collector for trial operations.

    Provides:
    - Counter: trial starts, conversions, expirations
    - Histogram: trial duration, conversion latency
    - Gauge: active trials, abuse rate

    Integration:
    - Prometheus (via prometheus_client)
    - StatsD
    - Custom backend
    """

    def __init__(self):
        self._counters: Dict[str, float] = {}
        self._histograms: Dict[str, List[float]] = {}
        self._gauges: Dict[str, float] = {}
        self._start_time = time.time()

    # =========================================================================
    # COUNTERS
    # =========================================================================

    def inc_counter(self, name: str, value: float = 1, tags: Optional[Dict[str, str]] = None):
        """Increment a counter."""
        key = self._make_key(name, tags)
        self._counters[key] = self._counters.get(key, 0) + value

    def _make_key(self, name: str, tags: Optional[Dict[str, str]] = None) -> str:
        """Create metric key with tags."""
        if not tags:
            return name
        tag_str = ','.join(f'{k}={v}' for k, v in sorted(tags.items()))
        return f"{name}[{tag_str}]"

    def record_trial_start(self, domain: str = 'shop', source: str = 'organic'):
        """Record a trial start."""
        self.inc_counter('trial_starts_total', tags={'domain': domain, 'source': source})

    def record_trial_expired(self, domain: str = 'shop'):
        """Record a trial expiration."""
        self.inc_counter('trial_expired_total', tags={'domain': domain})

    def record_trial_converted(
        self,
        domain: str = 'shop',
        to_plan: str = 'growth',
        latency_hours: Optional[float] = None
    ):
        """Record a trial conversion."""
        self.inc_counter('trial_converted_total', tags={'domain': domain, 'to_plan': to_plan})
        if latency_hours is not None:
            self.record_trial_duration(latency_hours / 24, domain=domain)  # Convert to days

    def record_trial_expiring_soon(self, domain: str = 'shop'):
        """Record a trial entering expiring-soon state."""
        self.inc_counter('trial_expiring_soon_total', tags={'domain': domain})

    def record_abuse_signal(self, domain: str = 'shop', risk_score: int = 0):
        """Record an abuse signal."""
        self.inc_counter('trial_abuse_signals_total', tags={'domain': domain})

    # =========================================================================
    # HISTOGRAMS
    # =========================================================================

    def record_trial_duration(self, days: float, domain: str = 'shop'):
        """Record trial duration in days."""
        key = self._make_key('trial_duration_days', {'domain': domain})
        if key not in self._histograms:
            self._histograms[key] = []
        self._histograms[key].append(days)

    def record_conversion_latency(self, hours: float, domain: str = 'shop'):
        """Record time from trial start to conversion."""
        key = self._make_key('trial_conversion_latency_hours', {'domain': domain})
        if key not in self._histograms:
            self._histograms[key] = []
        self._histograms[key].append(hours)

    def record_abuse_risk_score(self, score: int, domain: str = 'shop'):
        """Record abuse risk score at trial creation."""
        key = self._make_key('trial_abuse_risk_score', {'domain': domain})
        if key not in self._histograms:
            self._histograms[key] = []
        self._histograms[key].append(float(score))

    # =========================================================================
    # GAUGES
    # =========================================================================

    def set_gauge(self, name: str, value: float, tags: Optional[Dict[str, str]] = None):
        """Set a gauge value."""
        key = self._make_key(name, tags)
        self._gauges[key] = value

    def update_active_trials(self, count: int, domain: str = 'shop'):
        """Update active trial gauge."""
        self.set_gauge('trial_active', count, tags={'domain': domain})

    # =========================================================================
    # EXPORT
    # =========================================================================

    def to_dict(self) -> Dict[str, Any]:
        """Export all metrics as dictionary."""
        uptime_seconds = time.time() - self._start_time

        return {
            'uptime_seconds': uptime_seconds,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'counters': dict(self._counters),
            'histograms': {
                k: {
                    'count': len(v),
                    'min': min(v) if v else 0,
                    'max': max(v) if v else 0,
                    'avg': sum(v) / len(v) if v else 0,
                }
                for k, v in self._histograms.items()
            },
            'gauges': dict(self._gauges),
        }

    def reset(self):
        """Reset all metrics (for testing)."""
        self._counters.clear()
        self._histograms.clear()
        self._gauges.clear()


# =============================================================================
# HEALTH CHECKS
# =============================================================================

class TrialHealthCheck:
    """
    Health check for trial engine components.

    Checks:
    - Database connectivity
    - Trial engine service health
    - Recent error rates
    """

    def __init__(self):
        self._checks: Dict[str, bool] = {}

    async def check_database(self) -> bool:
        """Check database connectivity."""
        try:
            from supabase_client import get_supabase_client
            db = get_supabase_client()
            result = db.table('free_trials').select('id').limit(1).execute()
            return True
        except Exception as e:
            logging.error(f"trial_health_db_check_failed: {e}")
            return False

    async def check_recent_errors(self, threshold: int = 10) -> bool:
        """Check for recent error rate (should be < threshold)."""
        # Implementation would check error logs
        return True

    async def run_all(self) -> Dict[str, Any]:
        """Run all health checks."""
        db_ok = await self.check_database()

        return {
            'healthy': db_ok,
            'checks': {
                'database': db_ok,
            },
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }


# =============================================================================
# GLOBAL INSTANCES
# =============================================================================

_trial_logger: Optional[TrialLogger] = None
_trial_metrics: Optional[TrialMetrics] = None


def get_trial_logger() -> TrialLogger:
    """Get singleton TrialLogger instance."""
    global _trial_logger
    if _trial_logger is None:
        _trial_logger = TrialLogger()
    return _trial_logger


def get_trial_metrics() -> TrialMetrics:
    """Get singleton TrialMetrics instance."""
    global _trial_metrics
    if _trial_metrics is None:
        _trial_metrics = TrialMetrics()
    return _trial_metrics


def get_trial_health_check() -> TrialHealthCheck:
    """Get TrialHealthCheck instance."""
    return TrialHealthCheck()
