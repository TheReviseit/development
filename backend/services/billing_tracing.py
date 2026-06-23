"""
Billing Distributed Tracing — OpenTelemetry for Subscription Flow
==================================================================
FAANG-grade: Single trace across Frontend → Proxy → Flask → Celery → Razorpay → Webhook.

Spans:
  - POST  /api/billing/create-subscription    (Flask endpoint)
  - GET   /api/billing/checkout-status/<token> (Flask polling)
  - subscription_worker.execute               (Celery)
  - subscription_worker.claim                 (DB atomic claim)
  - subscription_worker.razorpay_customer     (Razorpay customer API)
  - subscription_worker.razorpay_subscription (Razorpay subscription API)
  - webhook_processor.process                 (Razorpay event)
  - lifecycle_engine.transition               (DB state transition)

Trace context is propagated via X-Correlation-ID header.
"""

import os
import uuid
import time
import logging
from functools import wraps
from contextlib import contextmanager
from typing import Optional, Dict, Any, Callable

logger = logging.getLogger('reviseit.billing.tracing')

# =============================================================================
# OpenTelemetry imports
# =============================================================================

TRACING_AVAILABLE = False
_tracer = None

try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import (
        BatchSpanProcessor,
        ConsoleSpanExporter,
    )
    from opentelemetry.trace import SpanKind, Status, StatusCode
    from opentelemetry import propagate

    TRACING_AVAILABLE = True
except ImportError:
    trace = None
    SpanKind = None
    Status = None
    StatusCode = None
    propagate = None
    logger.warning(
        "OpenTelemetry SDK not installed. "
        "Install: pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http"
    )

# =============================================================================
# Global state
# =============================================================================

_initialized = False
_otlp_endpoint = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', '')
_service_name = os.getenv('OTEL_SERVICE_NAME', 'reviseit-billing')

# =============================================================================
# Initialization
# =============================================================================


def init_billing_tracing(app=None):
    """
    Initialize the billing tracer provider.

    If OTEL_EXPORTER_OTLP_ENDPOINT is set, exports spans via OTLP HTTP.
    Otherwise, falls back to ConsoleSpanExporter (stdout) for development.
    Falls back to no-op tracer if OpenTelemetry is not installed.
    """
    global _tracer, _initialized

    if _initialized:
        return _tracer
    _initialized = True

    if not TRACING_AVAILABLE:
        _tracer = _NoopTracer()
        logger.info("Billing tracing: no-op (OpenTelemetry SDK not available)")
        return _tracer

    try:
        provider = TracerProvider(
            resource=trace.Resource.create({
                'service.name': _service_name,
                'service.version': '1.0.0',
            })
        )

        if _otlp_endpoint:
            try:
                from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                    OTLPSpanExporter,
                )

                otlp_exporter = OTLPSpanExporter(endpoint=f"{_otlp_endpoint}/v1/traces")
                provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
                logger.info(f"Billing tracing: OTLP exporter → {_otlp_endpoint}")
            except ImportError:
                logger.warning(
                    "OTLP exporter not installed, falling back to console. "
                    "Install: pip install opentelemetry-exporter-otlp-proto-http"
                )
                provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        else:
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
            logger.info("Billing tracing: console exporter (dev mode)")

        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer("reviseit.billing", "1.0.0")

        if app:
            _register_flask_middleware(app)

        logger.info("✅ Billing tracing initialized")
    except Exception as e:
        logger.warning(f"Billing tracing init failed, using no-op: {e}")
        _tracer = _NoopTracer()

    return _tracer


# =============================================================================
# No-op fallback when OpenTelemetry not available
# =============================================================================


class _NoopSpan:
    """No-op span that does nothing."""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def set_attribute(self, key, value):
        pass

    def set_attributes(self, attributes):
        pass

    def add_event(self, name, attributes=None):
        pass

    def set_status(self, status, description=None):
        pass

    def record_exception(self, exception, attributes=None):
        pass

    def end(self):
        pass

    def get_span_context(self):
        return None


class _NoopTracer:
    """No-op tracer that returns no-op spans."""

    def start_span(self, name, *args, **kwargs):
        return _NoopSpan()

    def start_as_current_span(self, name, *args, **kwargs):
        return _NoopSpan()

    def force_flush(self, timeout_millis=30000):
        return True


# =============================================================================
# Public API
# =============================================================================


def get_tracer():
    """Get the billing tracer (initializes on first call if needed)."""
    global _tracer
    if _tracer is None:
        _tracer = init_billing_tracing()
    return _tracer


def traced(
    span_name: str = None,
    span_kind=None,
    attributes: Dict[str, Any] = None,
):
    """
    Decorator that wraps a function in an OpenTelemetry span.

    Usage:
        @traced("razorpay.create_subscription", attributes={"domain": "shop"})
        def create_subscription(...):
            ...

    The span is automatically ended when the function returns.
    Exceptions are recorded and the span status is set to ERROR.
    If span_name is None, uses function's qualified name.
    """
    if span_kind is None and SpanKind is not None:
        span_kind = SpanKind.INTERNAL

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            name = span_name or f"{func.__module__}.{func.__qualname__}"
            tracer = get_tracer()

            # Build attributes from args/kwargs if callable
            resolved_attrs = attributes
            if callable(attributes):
                try:
                    resolved_attrs = attributes(*args, **kwargs)
                except Exception:
                    resolved_attrs = attributes

            with tracer.start_as_current_span(name, kind=span_kind) as span:
                if resolved_attrs:
                    span.set_attributes(resolved_attrs)
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    if TRACING_AVAILABLE and Status is not None and StatusCode is not None:
                        span.set_status(Status(StatusCode.ERROR, str(e)))
                        span.record_exception(e)
                    raise

        return wrapper

    return decorator


@contextmanager
def span_context(
    name: str,
    kind=None,
    attributes: Dict[str, Any] = None,
):
    """
    Context manager for manual span creation.

    Usage:
        with span_context("db.query", attributes={"table": "checkout_requests"}):
            supabase.table(...).execute()
    """
    if kind is None and SpanKind is not None:
        kind = SpanKind.INTERNAL

    tracer = get_tracer()
    with tracer.start_as_current_span(name, kind=kind) as span:
        if attributes:
            span.set_attributes(attributes)
        try:
            yield span
        except Exception as e:
            if TRACING_AVAILABLE and Status is not None and StatusCode is not None:
                span.set_status(Status(StatusCode.ERROR, str(e)))
                span.record_exception(e)
            raise


# =============================================================================
# Correlation ID helpers
# =============================================================================

CORRELATION_ID_HEADER = 'X-Correlation-ID'


def get_or_create_correlation_id(headers: Optional[Dict] = None) -> str:
    """
    Extract correlation ID from headers or generate a new one.

    Used at every boundary: frontend, proxy, Flask, Celery, Razorpay.
    """
    if headers:
        cid = headers.get(CORRELATION_ID_HEADER) or headers.get('X-Request-ID')
        if cid:
            return cid
    return str(uuid.uuid4())


def inject_correlation_id(headers: Dict[str, str], correlation_id: str) -> Dict[str, str]:
    """Inject correlation ID into a headers dict."""
    headers[CORRELATION_ID_HEADER] = correlation_id
    return headers


# =============================================================================
# Span attribute shortcuts for billing context
# =============================================================================


def billing_attributes(
    domain: str = None,
    plan_slug: str = None,
    checkout_token: str = None,
    subscription_id: str = None,
    status: str = None,
    error_code: str = None,
) -> Dict[str, str]:
    """Build standard billing attributes for a span."""
    attrs = {}
    if domain:
        attrs['billing.domain'] = domain
    if plan_slug:
        attrs['billing.plan_slug'] = plan_slug
    if checkout_token:
        attrs['billing.checkout_token'] = checkout_token[:16]
    if subscription_id:
        attrs['billing.subscription_id'] = subscription_id
    if status:
        attrs['billing.status'] = status
    if error_code:
        attrs['billing.error_code'] = error_code
    return attrs


# =============================================================================
# Flask middleware (optional, applied when app is provided to init)
# =============================================================================


def _register_flask_middleware(app):
    """Register before_request / after_request hooks for span management."""
    from flask import g, request

    @app.before_request
    def _billing_tracing_before():
        """Set correlation ID on Flask g object for every request."""
        if not request.path.startswith('/api/billing/'):
            return
        cid = get_or_create_correlation_id(dict(request.headers))
        g.correlation_id = cid

    @app.after_request
    def _billing_tracing_after(response):
        """Inject correlation ID into every billing response."""
        cid = getattr(g, 'correlation_id', None)
        if cid:
            response.headers[CORRELATION_ID_HEADER] = cid
        return response


# =============================================================================
# Force flush (call before shutdown to ensure spans are exported)
# =============================================================================


def force_flush(timeout_millis: int = 30000) -> bool:
    """Force flush all pending spans."""
    tracer = get_tracer()
    if hasattr(tracer, 'force_flush'):
        return tracer.force_flush(timeout_millis)
    return True
