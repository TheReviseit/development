"""
Celery Application Configuration for Background Task Processing.
Handles async tasks like bulk messaging, analytics, image processing, etc.
"""

import os
from celery import Celery
from kombu import Queue, Exchange

# =============================================================================
# Celery Configuration
# =============================================================================

# Redis URL from environment
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/1")

# Create Celery app
celery_app = Celery(
    "whatsapp_chatbot",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "tasks.messaging",
        "tasks.analytics",
        "tasks.media",
        "tasks.notifications",
        "tasks.maintenance",
    ]
)

# =============================================================================
# Task Queues with Priorities
# =============================================================================

# Define exchanges
default_exchange = Exchange("default", type="direct")
high_priority_exchange = Exchange("high", type="direct")
low_priority_exchange = Exchange("low", type="direct")

# Define queues
celery_app.conf.task_queues = (
    # High priority: User-facing responses (< 200ms target)
    Queue("high", high_priority_exchange, routing_key="high"),
    
    # Default: Standard tasks (1-5 seconds)
    Queue("default", default_exchange, routing_key="default"),
    
    # Low priority: Background analytics, reports (30+ seconds OK)
    Queue("low", low_priority_exchange, routing_key="low"),
)

celery_app.conf.task_default_queue = "default"
celery_app.conf.task_default_exchange = "default"
celery_app.conf.task_default_routing_key = "default"

# =============================================================================
# Task Routing
# =============================================================================

celery_app.conf.task_routes = {
    # High priority tasks
    "tasks.messaging.send_message": {"queue": "high"},
    "tasks.messaging.send_reply": {"queue": "high"},
    "tasks.notifications.send_push": {"queue": "high"},
    
    # Default priority tasks
    "tasks.messaging.send_bulk_message": {"queue": "default"},
    "tasks.media.process_image": {"queue": "default"},
    "tasks.media.upload_media": {"queue": "default"},
    
    # Low priority tasks
    "tasks.analytics.aggregate_daily": {"queue": "low"},
    "tasks.analytics.generate_report": {"queue": "low"},
    "tasks.maintenance.cleanup_sessions": {"queue": "low"},
    "tasks.maintenance.warm_cache": {"queue": "low"},
}

# =============================================================================
# Serialization
# =============================================================================

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.result_accept_content = ["json"]

# =============================================================================
# Time Limits
# =============================================================================

# Soft time limit (raises SoftTimeLimitExceeded)
celery_app.conf.task_soft_time_limit = 300  # 5 minutes

# Hard time limit (kills the task)
celery_app.conf.task_time_limit = 600  # 10 minutes

# Per-task overrides
celery_app.conf.task_annotations = {
    "tasks.messaging.send_message": {
        "rate_limit": "100/s",  # 100 messages per second max
        "time_limit": 30,
    },
    "tasks.analytics.generate_report": {
        "time_limit": 1800,  # 30 minutes for large reports
    },
    "tasks.messaging.send_bulk_message": {
        "rate_limit": "10/s",  # Rate limit bulk operations
    },
}

# =============================================================================
# Worker Configuration
# =============================================================================

celery_app.conf.worker_concurrency = int(os.getenv("CELERY_CONCURRENCY", 4))
celery_app.conf.worker_prefetch_multiplier = 4

# Disable task result expiration (keep for analytics)
celery_app.conf.result_expires = 86400  # 24 hours

# =============================================================================
# Retry Configuration
# =============================================================================

celery_app.conf.task_default_retry_delay = 60  # 1 minute
celery_app.conf.task_max_retries = 3

# Exponential backoff
celery_app.conf.broker_transport_options = {
    "visibility_timeout": 3600,  # 1 hour
    "max_retries": 3,
}

# =============================================================================
# Monitoring
# =============================================================================

# Enable task events for monitoring
celery_app.conf.worker_send_task_events = True
celery_app.conf.task_send_sent_event = True

# =============================================================================
# Timezone
# =============================================================================

celery_app.conf.timezone = "UTC"
celery_app.conf.enable_utc = True

# =============================================================================
# Beat Schedule (Periodic Tasks)
# =============================================================================

celery_app.conf.beat_schedule = {
    # Aggregate analytics daily at midnight UTC
    "aggregate-analytics-daily": {
        "task": "tasks.analytics.aggregate_daily",
        "schedule": 86400.0,  # Every 24 hours
        "options": {"queue": "low"},
    },
    
    # Cleanup expired sessions every hour
    "cleanup-expired-sessions": {
        "task": "tasks.maintenance.cleanup_sessions",
        "schedule": 3600.0,  # Every hour
        "options": {"queue": "low"},
    },
    
    # Warm cache with common queries every 30 minutes
    "warm-cache": {
        "task": "tasks.maintenance.warm_cache",
        "schedule": 1800.0,  # Every 30 minutes
        "options": {"queue": "low"},
    },
    
    # Health check every 5 minutes
    "health-check": {
        "task": "tasks.maintenance.health_check",
        "schedule": 300.0,  # Every 5 minutes
        "options": {"queue": "default"},
    },
}


# =============================================================================
# Flask Integration Helper
# =============================================================================

def init_celery(app):
    """
    Initialize Celery with Flask app context.
    
    Usage in app.py:
        from celery_app import celery_app, init_celery
        init_celery(app)
    """
    class ContextTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)
    
    celery_app.Task = ContextTask
    return celery_app


if __name__ == "__main__":
    celery_app.start()

