"""
Observability Service - OpenTelemetry Metrics for Feature Gate Engine
======================================================================
Provides Prometheus-compatible metrics for monitoring feature gate decisions.

Metrics Exposed:
  - feature_gate_checks_total: Counter of all feature checks
  - feature_gate_denials_total: Counter of denials with reason
  - feature_gate_check_duration_ms: Histogram of check latency
  - feature_gate_cache_hits_total: Counter of cache hits by type

Usage:
    from services.observability import record_feature_check

    decision = engine.check_feature_access(...)
    record_feature_check(decision, latency_ms=42, cache_hit=True)

Prometheus Endpoint:
    GET /metrics → returns all metrics in Prometheus format
"""

import logging
from typing import Optional
from dataclasses import dataclass

# OpenTelemetry imports (install via: pip install opentelemetry-sdk opentelemetry-exporter-prometheus)
try:
    from opentelemetry import metrics
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.exporter.prometheus import PrometheusMetricReader

    OPENTELEMETRY_AVAILABLE = True
except ImportError:
    OPENTELEMETRY_AVAILABLE = False
    logging.warning("OpenTelemetry not installed. Metrics disabled. Install: pip install opentelemetry-sdk opentelemetry-exporter-prometheus")

logger = logging.getLogger('reviseit.observability')

# =============================================================================
# OpenTelemetry Setup (Prometheus Exporter)
# =============================================================================
if OPENTELEMETRY_AVAILABLE:
    # Create Prometheus metric reader
    prometheus_reader = PrometheusMetricReader()

    # Create MeterProvider with Prometheus exporter
    provider = MeterProvider(metric_readers=[prometheus_reader])
    metrics.set_meter_provider(provider)

    # Get meter for feature gate metrics
    meter = metrics.get_meter("reviseit.feature_gate", version="1.0.0")

    # =============================================================================
    # Metric Definitions
    # =============================================================================

    # Counter: Total feature gate checks
    feature_check_counter = meter.create_counter(
        name="feature_gate_checks_total",
        description="Total number of feature gate checks performed",
        unit="1",
    )

    # Counter: Total denials (with reason as label)
    feature_denial_counter = meter.create_counter(
        name="feature_gate_denials_total",
        description="Total number of feature gate denials",
        unit="1",
    )

    # Histogram: Feature check latency distribution
    feature_check_latency = meter.create_histogram(
        name="feature_gate_check_duration_ms",
        description="Feature gate check latency in milliseconds",
        unit="ms",
    )

    # Counter: Cache hits by type
    cache_hit_counter = meter.create_counter(
        name="feature_gate_cache_hits_total",
        description="Total number of cache hits",
        unit="1",
    )

    # Counter: Override usage
    override_usage_counter = meter.create_counter(
        name="feature_gate_overrides_used_total",
        description="Total number of times plan overrides were applied",
        unit="1",
    )

else:
    # Stub implementations if OpenTelemetry not available
    feature_check_counter = None
    feature_denial_counter = None
    feature_check_latency = None
    cache_hit_counter = None
    override_usage_counter = None


# =============================================================================
# Recording Functions
# =============================================================================

def record_feature_check(
    decision,
    latency_ms: float,
    cache_hit: bool = False,
    override_used: bool = False
):
    """
    Record metrics for a feature gate decision.

    Args:
        decision: PolicyDecision object with feature check result
        latency_ms: Latency of the check in milliseconds
        cache_hit: Whether subscription data came from cache
        override_used: Whether a plan override was applied

    Example:
        decision = engine.check_feature_access('user123', 'shop', 'create_product')
        record_feature_check(decision, latency_ms=42, cache_hit=True)
    """
    if not OPENTELEMETRY_AVAILABLE:
        return  # Silently skip if metrics not available

    try:
        # Labels for metrics (dimensions)
        labels = {
            "feature_key": getattr(decision, 'feature_key', 'unknown'),
            "domain": getattr(decision, 'domain', 'unknown'),
            "plan_slug": getattr(decision, 'plan_slug', 'unknown'),
        }

        # Record total checks
        feature_check_counter.add(1, labels)

        # Record denials (if not allowed)
        if not getattr(decision, 'allowed', True):
            denial_labels = {
                **labels,
                "denial_reason": getattr(decision, 'denial_reason', 'unknown'),
                "upgrade_required": str(getattr(decision, 'upgrade_required', False)),
            }
            feature_denial_counter.add(1, denial_labels)

        # Record latency
        feature_check_latency.record(latency_ms, labels)

        # Record cache hit
        if cache_hit:
            cache_hit_counter.add(1, {"cache_type": "subscription"})

        # Record override usage
        if override_used:
            override_usage_counter.add(1, labels)

    except Exception as e:
        logger.error(f"Failed to record feature check metrics: {e}")


def record_cache_hit(cache_type: str):
    """
    Record a cache hit for a specific cache type.

    Args:
        cache_type: Type of cache ('subscription', 'plan_features', 'feature_flags', etc.)
    """
    if not OPENTELEMETRY_AVAILABLE:
        return

    try:
        cache_hit_counter.add(1, {"cache_type": cache_type})
    except Exception as e:
        logger.error(f"Failed to record cache hit: {e}")


# =============================================================================
# Prometheus Metrics Endpoint (for Prometheus scraping)
# =============================================================================

def get_metrics_handler():
    """
    Get Prometheus metrics in text format for /metrics endpoint.

    Returns:
        str: Prometheus-formatted metrics text

    Example (Flask):
        from flask import Response
        from services.observability import get_metrics_handler

        @app.route('/metrics')
        def metrics():
            return Response(get_metrics_handler(), mimetype='text/plain')
    """
    if not OPENTELEMETRY_AVAILABLE:
        return "# OpenTelemetry not available\n"

    try:
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
        return generate_latest()
    except ImportError:
        return "# prometheus_client not installed\n"


# =============================================================================
# Health Check
# =============================================================================

def is_metrics_enabled() -> bool:
    """Check if metrics collection is enabled."""
    return OPENTELEMETRY_AVAILABLE


# =============================================================================
# Example Metrics Output (Prometheus Format)
# =============================================================================
"""
# HELP feature_gate_checks_total Total number of feature gate checks performed
# TYPE feature_gate_checks_total counter
feature_gate_checks_total{domain="shop",feature_key="create_product",plan_slug="starter"} 1247.0

# HELP feature_gate_denials_total Total number of feature gate denials
# TYPE feature_gate_denials_total counter
feature_gate_denials_total{denial_reason="hard_limit_exceeded",domain="shop",feature_key="create_product",plan_slug="starter",upgrade_required="True"} 89.0

# HELP feature_gate_check_duration_ms Feature gate check latency in milliseconds
# TYPE feature_gate_check_duration_ms histogram
feature_gate_check_duration_ms_bucket{domain="shop",feature_key="create_product",le="10.0",plan_slug="starter"} 950.0
feature_gate_check_duration_ms_bucket{domain="shop",feature_key="create_product",le="50.0",plan_slug="starter"} 1200.0
feature_gate_check_duration_ms_bucket{domain="shop",feature_key="create_product",le="+Inf",plan_slug="starter"} 1247.0
feature_gate_check_duration_ms_sum{domain="shop",feature_key="create_product",plan_slug="starter"} 42350.0
feature_gate_check_duration_ms_count{domain="shop",feature_key="create_product",plan_slug="starter"} 1247.0

# HELP feature_gate_cache_hits_total Total number of cache hits
# TYPE feature_gate_cache_hits_total counter
feature_gate_cache_hits_total{cache_type="subscription"} 1156.0

# HELP feature_gate_overrides_used_total Total number of times plan overrides were applied
# TYPE feature_gate_overrides_used_total counter
feature_gate_overrides_used_total{domain="shop",feature_key="create_product",plan_slug="starter"} 23.0
"""
