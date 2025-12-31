"""
Prometheus Metrics for Production Monitoring.
Tracks request latency, cache performance, AI response times, etc.
"""

import os
import time
import logging
from typing import Dict, Any, Optional
from functools import wraps
from dataclasses import dataclass, field
from threading import Lock
from collections import defaultdict

logger = logging.getLogger('reviseit.monitoring')

# Try to import prometheus client
try:
    from prometheus_flask_exporter import PrometheusMetrics
    from prometheus_client import Counter, Histogram, Gauge
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False
    PrometheusMetrics = None


@dataclass
class MetricsSummary:
    """Summary of collected metrics."""
    request_count: int = 0
    error_count: int = 0
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    cache_hit_rate: float = 0.0
    ai_response_avg_ms: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_count": self.request_count,
            "error_count": self.error_count,
            "avg_latency_ms": round(self.avg_latency_ms, 2),
            "p95_latency_ms": round(self.p95_latency_ms, 2),
            "p99_latency_ms": round(self.p99_latency_ms, 2),
            "cache_hit_rate": round(self.cache_hit_rate, 3),
            "ai_response_avg_ms": round(self.ai_response_avg_ms, 2),
        }


class InMemoryMetrics:
    """
    In-memory metrics collector when Prometheus is not available.
    Provides basic metrics tracking with percentile calculations.
    """
    
    def __init__(self):
        self._lock = Lock()
        self._latencies: list = []
        self._ai_latencies: list = []
        self._cache_hits: int = 0
        self._cache_misses: int = 0
        self._request_count: int = 0
        self._error_count: int = 0
        self._max_samples: int = 10000
    
    def record_latency(self, latency_ms: float, endpoint: str = None):
        """Record request latency."""
        with self._lock:
            self._request_count += 1
            self._latencies.append(latency_ms)
            
            # Trim if too many samples
            if len(self._latencies) > self._max_samples:
                self._latencies = self._latencies[-self._max_samples:]
    
    def record_error(self, endpoint: str = None, error_type: str = None):
        """Record an error."""
        with self._lock:
            self._error_count += 1
    
    def record_ai_latency(self, latency_ms: float, intent: str = None):
        """Record AI response latency."""
        with self._lock:
            self._ai_latencies.append(latency_ms)
            if len(self._ai_latencies) > self._max_samples:
                self._ai_latencies = self._ai_latencies[-self._max_samples:]
    
    def record_cache_hit(self):
        """Record cache hit."""
        with self._lock:
            self._cache_hits += 1
    
    def record_cache_miss(self):
        """Record cache miss."""
        with self._lock:
            self._cache_misses += 1
    
    def _percentile(self, data: list, p: float) -> float:
        """Calculate percentile of data."""
        if not data:
            return 0.0
        sorted_data = sorted(data)
        k = (len(sorted_data) - 1) * (p / 100)
        f = int(k)
        c = f + 1 if f + 1 < len(sorted_data) else f
        return sorted_data[f] + (sorted_data[c] - sorted_data[f]) * (k - f)
    
    def get_summary(self) -> MetricsSummary:
        """Get metrics summary."""
        with self._lock:
            total_cache = self._cache_hits + self._cache_misses
            
            return MetricsSummary(
                request_count=self._request_count,
                error_count=self._error_count,
                avg_latency_ms=sum(self._latencies) / len(self._latencies) if self._latencies else 0,
                p95_latency_ms=self._percentile(self._latencies, 95),
                p99_latency_ms=self._percentile(self._latencies, 99),
                cache_hit_rate=self._cache_hits / total_cache if total_cache > 0 else 0,
                ai_response_avg_ms=sum(self._ai_latencies) / len(self._ai_latencies) if self._ai_latencies else 0,
            )


# Global metrics instance
_metrics: Optional[InMemoryMetrics] = None
_prometheus_metrics = None


def init_metrics(app):
    """
    Initialize metrics collection.
    
    Args:
        app: Flask application
    
    Returns:
        Metrics instance
    """
    global _metrics, _prometheus_metrics
    
    _metrics = InMemoryMetrics()
    
    if PROMETHEUS_AVAILABLE:
        try:
            _prometheus_metrics = PrometheusMetrics(app)
            
            # Register custom metrics
            _prometheus_metrics.info(
                "app_info",
                "Application information",
                version="1.0.0"
            )
            
            logger.info("Prometheus metrics initialized at /metrics")
            
        except Exception as e:
            logger.warning(f"Prometheus init failed, using in-memory: {e}")
    else:
        logger.info("Using in-memory metrics (Prometheus not available)")
    
    return _metrics


def get_metrics() -> InMemoryMetrics:
    """Get the metrics instance."""
    global _metrics
    if _metrics is None:
        _metrics = InMemoryMetrics()
    return _metrics


def track_request_latency(endpoint: str = None):
    """
    Decorator to track request latency.
    
    Usage:
        @track_request_latency("generate_reply")
        def generate_reply():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                elapsed_ms = (time.time() - start_time) * 1000
                get_metrics().record_latency(elapsed_ms, endpoint)
                return result
            except Exception as e:
                elapsed_ms = (time.time() - start_time) * 1000
                get_metrics().record_latency(elapsed_ms, endpoint)
                get_metrics().record_error(endpoint, type(e).__name__)
                raise
        return wrapper
    return decorator


def track_ai_response(
    latency_ms: float,
    intent: str = None,
    cached: bool = False
):
    """Track AI response metrics."""
    metrics = get_metrics()
    metrics.record_ai_latency(latency_ms, intent)
    
    if cached:
        metrics.record_cache_hit()
    else:
        metrics.record_cache_miss()


def track_cache_operation(hit: bool):
    """Track cache hit/miss."""
    metrics = get_metrics()
    if hit:
        metrics.record_cache_hit()
    else:
        metrics.record_cache_miss()


def get_metrics_summary() -> Dict[str, Any]:
    """Get current metrics summary."""
    return get_metrics().get_summary().to_dict()


# =============================================================================
# KPI Tracking for Dashboard
# =============================================================================

KPI_THRESHOLDS = {
    "response_time_p95_ms": 200,
    "response_time_p99_ms": 500,
    "error_rate": 0.05,
    "cache_hit_rate": 0.40,
}


def check_kpis() -> Dict[str, Any]:
    """
    Check current KPIs against thresholds.
    
    Returns:
        Dict with KPI status (pass/fail) and current values
    """
    summary = get_metrics().get_summary()
    
    results = {
        "status": "healthy",
        "kpis": {},
    }
    
    # Check response time p95
    kpi_name = "response_time_p95"
    current = summary.p95_latency_ms
    threshold = KPI_THRESHOLDS["response_time_p95_ms"]
    passed = current <= threshold
    results["kpis"][kpi_name] = {
        "current": current,
        "threshold": threshold,
        "passed": passed,
    }
    if not passed:
        results["status"] = "degraded"
    
    # Check response time p99
    kpi_name = "response_time_p99"
    current = summary.p99_latency_ms
    threshold = KPI_THRESHOLDS["response_time_p99_ms"]
    passed = current <= threshold
    results["kpis"][kpi_name] = {
        "current": current,
        "threshold": threshold,
        "passed": passed,
    }
    if not passed:
        results["status"] = "degraded"
    
    # Check error rate
    kpi_name = "error_rate"
    current = summary.error_count / summary.request_count if summary.request_count > 0 else 0
    threshold = KPI_THRESHOLDS["error_rate"]
    passed = current <= threshold
    results["kpis"][kpi_name] = {
        "current": round(current, 4),
        "threshold": threshold,
        "passed": passed,
    }
    if not passed:
        results["status"] = "critical"
    
    # Check cache hit rate
    kpi_name = "cache_hit_rate"
    current = summary.cache_hit_rate
    threshold = KPI_THRESHOLDS["cache_hit_rate"]
    passed = current >= threshold
    results["kpis"][kpi_name] = {
        "current": round(current, 4),
        "threshold": threshold,
        "passed": passed,
    }
    
    return results

