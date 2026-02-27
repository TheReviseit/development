"""
Feature Usage Events — Celery Task
====================================
Async event processing for feature gate decisions.

Consumed by: analytics, billing, abuse detection.
Queue: low priority (non-blocking).

Usage:
    from tasks.usage_events import process_feature_usage_event

    process_feature_usage_event.delay({
        "user_id": "...",
        "domain": "shop",
        "feature_key": "create_product",
        "allowed": True,
        "used": 124,
        "hard_limit": 500,
        "soft_limit_exceeded": False,
        "timestamp": 1707900000.0,
    })
"""

import logging

logger = logging.getLogger('reviseit.usage_events')

# Celery task decorator (graceful fallback if Celery unavailable)
try:
    from celery_app import celery_app

    @celery_app.task(
        queue="low",
        name="tasks.usage_events.process_feature_usage_event",
        bind=True,
        max_retries=2,
        default_retry_delay=30,
        acks_late=True,
        reject_on_worker_lost=True,
    )
    def process_feature_usage_event(self, event_data: dict):
        """
        Process a feature usage event asynchronously.

        This task runs on the 'low' priority queue and is consumed by:
        - Analytics aggregation
        - Billing usage tracking
        - Abuse detection patterns

        Args:
            event_data: {
                "user_id": str,
                "domain": str,
                "feature_key": str,
                "allowed": bool,
                "used": int,
                "hard_limit": int or None,
                "soft_limit_exceeded": bool,
                "timestamp": float,
            }
        """
        try:
            user_id = event_data.get("user_id", "unknown")
            domain = event_data.get("domain", "unknown")
            feature_key = event_data.get("feature_key", "unknown")
            allowed = event_data.get("allowed", False)

            logger.info(
                f"📊 Feature usage event: user={user_id}, domain={domain}, "
                f"feature={feature_key}, allowed={allowed}, "
                f"used={event_data.get('used', 0)}"
            )

            # ─── Analytics aggregation ───────────────────────────
            # Future: Write to analytics_events table or time-series DB
            # for dashboard visualizations and usage trend analysis.

            # ─── Abuse detection ─────────────────────────────────
            # Future: Check for unusual patterns:
            # - Rapid-fire requests from single user
            # - Requests near limit boundary (probing)
            # - Requests from suspended accounts

            # ─── Billing sync ────────────────────────────────────
            # Future: For metered billing models, aggregate usage
            # and sync with Razorpay or internal billing system.

        except Exception as e:
            logger.error(
                f"Feature usage event processing failed: {e}",
                extra={"event_data": event_data},
                exc_info=True
            )
            # Retry on transient errors
            raise self.retry(exc=e)

except ImportError:
    # Celery not available — provide a no-op fallback
    logger.warning("⚠️ Celery unavailable, usage events will be logged only")

    class _FallbackTask:
        def delay(self, event_data: dict):
            logger.info(
                f"📊 Feature usage event (no-celery): "
                f"user={event_data.get('user_id')}, "
                f"feature={event_data.get('feature_key')}, "
                f"allowed={event_data.get('allowed')}"
            )

    process_feature_usage_event = _FallbackTask()
