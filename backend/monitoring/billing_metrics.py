"""
Billing Metrics for Prometheus Monitoring.
Tracks subscription creation, checkout polling, queue depth, webhook processing, and rate limiting.

Metrics Exposed:
  - billing_subscription_creations_total: Counter by status (initiated/completed/failed) and domain
  - billing_subscription_creation_duration_seconds: Histogram of create-subscription endpoint latency
  - billing_checkout_poll_duration_seconds: Histogram of checkout-status endpoint latency
  - billing_pending_checkouts: Gauge of checkout_requests with status='initiated' or 'processing'
  - billing_webhook_events_total: Counter by event_type and status (processed/duplicate/error)
  - billing_rate_limit_hits_total: Counter of rate-limited billing requests by scope
  - billing_queue_depth: Gauge tracking Celery task queue backlog

Prometheus Endpoint:
    GET /metrics (via services/observability.get_metrics_handler or monitoring/metrics)
"""

import time
import logging
from functools import wraps
from typing import Optional

logger = logging.getLogger('reviseit.billing.metrics')

# =============================================================================
# OpenTelemetry / Prometheus imports
# =============================================================================

try:
    from opentelemetry import metrics
    from opentelemetry.sdk.metrics import MeterProvider
    OTEL_AVAILABLE = True
except ImportError:
    OTEL_AVAILABLE = False

try:
    from prometheus_client import Counter, Histogram, Gauge
    PROMETHEUS_CLIENT_AVAILABLE = True
except ImportError:
    PROMETHEUS_CLIENT_AVAILABLE = False

# =============================================================================
# Metric Definitions (static, module-level)
# =============================================================================

# --- Counters ---

billing_subscription_creations: Optional[object] = None
billing_webhook_events: Optional[object] = None
billing_rate_limit_hits: Optional[object] = None

# --- Histograms ---

billing_creation_duration: Optional[object] = None
billing_checkout_poll_duration: Optional[object] = None

# --- Gauges ---

billing_pending_checkouts: Optional[object] = None
billing_queue_depth: Optional[object] = None

# =============================================================================
# Initialization
# =============================================================================


_metrics_initialized = False


def init_billing_metrics():
    global billing_subscription_creations, billing_webhook_events, billing_rate_limit_hits
    global billing_creation_duration, billing_checkout_poll_duration
    global billing_pending_checkouts, billing_queue_depth
    global _metrics_initialized

    if _metrics_initialized:
        return
    _metrics_initialized = True

    if OTEL_AVAILABLE:
        meter = metrics.get_meter("reviseit.billing", version="1.0.0")

        billing_subscription_creations = meter.create_counter(
            name="billing_subscription_creations_total",
            description="Total subscription creation requests by status and domain",
            unit="1",
        )
        billing_webhook_events = meter.create_counter(
            name="billing_webhook_events_total",
            description="Total webhook events processed by event_type and status",
            unit="1",
        )
        billing_rate_limit_hits = meter.create_counter(
            name="billing_rate_limit_hits_total",
            description="Total rate-limited billing requests by scope",
            unit="1",
        )
        billing_creation_duration = meter.create_histogram(
            name="billing_subscription_creation_duration_seconds",
            description="Latency of create-subscription endpoint (fast path, not Celery)",
            unit="s",
        )
        billing_checkout_poll_duration = meter.create_histogram(
            name="billing_checkout_poll_duration_seconds",
            description="Latency of checkout-status polling endpoint",
            unit="s",
        )
        billing_pending_checkouts = meter.create_gauge(
            name="billing_pending_checkouts",
            description="Number of checkout_requests with status initiated or processing",
            unit="1",
        )
        billing_queue_depth = meter.create_gauge(
            name="billing_queue_depth",
            description="Number of pending Celery billing tasks",
            unit="1",
        )

        logger.info("Billing OpenTelemetry metrics initialized")
        return

    if PROMETHEUS_CLIENT_AVAILABLE:
        billing_subscription_creations = Counter(
            "billing_subscription_creations_total",
            "Total subscription creation requests by status and domain",
            ["status", "domain"],
        )
        billing_webhook_events = Counter(
            "billing_webhook_events_total",
            "Total webhook events processed by event_type and status",
            ["event_type", "status"],
        )
        billing_rate_limit_hits = Counter(
            "billing_rate_limit_hits_total",
            "Total rate-limited billing requests by scope",
            ["scope"],
        )
        billing_creation_duration = Histogram(
            "billing_subscription_creation_duration_seconds",
            "Latency of create-subscription endpoint (fast path, not Celery)",
            buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
        )
        billing_checkout_poll_duration = Histogram(
            "billing_checkout_poll_duration_seconds",
            "Latency of checkout-status polling endpoint",
            buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
        )
        billing_pending_checkouts = Gauge(
            "billing_pending_checkouts",
            "Number of checkout_requests with status initiated or processing",
        )
        billing_queue_depth = Gauge(
            "billing_queue_depth",
            "Number of pending Celery billing tasks",
        )

        logger.info("Billing prometheus_client metrics initialized")
        return

    logger.warning("No metrics library available; billing metrics are no-ops")


# =============================================================================
# Recording Functions
# =============================================================================


def record_subscription_creation(status: str, domain: str = "unknown"):
    if billing_subscription_creations is not None:
        try:
            if OTEL_AVAILABLE:
                billing_subscription_creations.add(1, {"status": status, "domain": domain})
            else:
                billing_subscription_creations.labels(status=status, domain=domain).inc()
        except Exception as e:
            logger.error(f"Failed to record subscription creation metric: {e}")


def record_webhook_event(event_type: str, status: str):
    if billing_webhook_events is not None:
        try:
            if OTEL_AVAILABLE:
                billing_webhook_events.add(1, {"event_type": event_type, "status": status})
            else:
                billing_webhook_events.labels(event_type=event_type, status=status).inc()
        except Exception as e:
            logger.error(f"Failed to record webhook event metric: {e}")


def record_rate_limit_hit(scope: str):
    if billing_rate_limit_hits is not None:
        try:
            if OTEL_AVAILABLE:
                billing_rate_limit_hits.add(1, {"scope": scope})
            else:
                billing_rate_limit_hits.labels(scope=scope).inc()
        except Exception as e:
            logger.error(f"Failed to record rate limit hit metric: {e}")


def record_pending_checkouts(count: int):
    if billing_pending_checkouts is not None:
        try:
            if OTEL_AVAILABLE:
                billing_pending_checkouts.set(count)
            else:
                billing_pending_checkouts.set(count)
        except Exception as e:
            logger.error(f"Failed to record pending checkouts metric: {e}")


def record_queue_depth(count: int):
    if billing_queue_depth is not None:
        try:
            if OTEL_AVAILABLE:
                billing_queue_depth.set(count)
            else:
                billing_queue_depth.set(count)
        except Exception as e:
            logger.error(f"Failed to record queue depth metric: {e}")


# =============================================================================
# Decorator for endpoint latency tracking
# =============================================================================


def track_creation_latency(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            elapsed = time.time() - start
            if billing_creation_duration is not None:
                try:
                    if OTEL_AVAILABLE:
                        billing_creation_duration.record(elapsed)
                    else:
                        billing_creation_duration.observe(elapsed)
                except Exception as e:
                    logger.error(f"Failed to record creation latency: {e}")
            return result
        except Exception as e:
            elapsed = time.time() - start
            if billing_creation_duration is not None:
                try:
                    if OTEL_AVAILABLE:
                        billing_creation_duration.record(elapsed)
                    else:
                        billing_creation_duration.observe(elapsed)
                except Exception as e:
                    logger.error(f"Failed to record creation latency on error: {e}")
            raise
    return wrapper


def track_checkout_poll_latency(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            elapsed = time.time() - start
            if billing_checkout_poll_duration is not None:
                try:
                    if OTEL_AVAILABLE:
                        billing_checkout_poll_duration.record(elapsed)
                    else:
                        billing_checkout_poll_duration.observe(elapsed)
                except Exception as e:
                    logger.error(f"Failed to record poll latency: {e}")
            return result
        except Exception as e:
            elapsed = time.time() - start
            if billing_checkout_poll_duration is not None:
                try:
                    if OTEL_AVAILABLE:
                        billing_checkout_poll_duration.record(elapsed)
                    else:
                        billing_checkout_poll_duration.observe(elapsed)
                except Exception as e:
                    logger.error(f"Failed to record poll latency on error: {e}")
            raise
    return wrapper
