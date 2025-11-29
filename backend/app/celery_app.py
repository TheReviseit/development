from celery import Celery
from app.config import settings

celery_app = Celery(
    "reviseit",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.whatsapp_tasks",
        "app.tasks.campaign_tasks",
    ]
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
)

# Beat schedule for periodic tasks
celery_app.conf.beat_schedule = {
    "check-followups-every-hour": {
        "task": "app.tasks.campaign_tasks.check_and_schedule_followups",
        "schedule": 3600.0,  # Every hour
    },
}
