"""
Celery background worker for retry queue processing.
Handles rate-limited messages asynchronously.

To run the worker:
    celery -A ai_brain.retry_worker worker --loglevel=info

To run periodic tasks:
    celery -A ai_brain.retry_worker beat --loglevel=info
"""
import os
import logging
from typing import Optional

logger = logging.getLogger('reviseit.retry_worker')

# Celery app (optional - only used if Redis is available)
try:
    from celery import Celery
    from celery.schedules import crontab
    
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    celery = Celery(
        'ai_brain',
        broker=redis_url,
        backend=redis_url
    )
    
    # Configure Celery
    celery.conf.update(
        task_serializer='json',
        accept_content=['json'],
        result_serializer='json',
        timezone='Asia/Kolkata',
        enable_utc=True,
        task_soft_time_limit=60,  # 60 second timeout
        task_time_limit=90,
    )
    
    # Periodic tasks
    celery.conf.beat_schedule = {
        'process-retry-queue-every-30-seconds': {
            'task': 'ai_brain.retry_worker.process_retry_queue',
            'schedule': 30.0,  # Every 30 seconds
        },
    }
    
    CELERY_AVAILABLE = True
    
except ImportError:
    CELERY_AVAILABLE = False
    celery = None
    logger.warning("Celery not available. Retry queue will use synchronous fallback.")


def _get_dependencies():
    """Lazy import dependencies to avoid circular imports."""
    from llm_usage_tracker import get_usage_tracker
    from ai_brain import AIBrain
    from whatsapp_service import WhatsAppService
    
    return get_usage_tracker(), AIBrain(), WhatsAppService()


if CELERY_AVAILABLE:
    @celery.task(bind=True, max_retries=3, default_retry_delay=30)
    def process_retry_queue(self):
        """
        Process all pending retry items from the queue.
        Called periodically by Celery beat.
        """
        try:
            tracker, brain, whatsapp = _get_dependencies()
        except Exception as e:
            logger.error(f"Failed to load dependencies: {e}")
            return {"status": "error", "message": str(e)}
        
        items = tracker.get_retry_items()
        if not items:
            return {"status": "ok", "processed": 0}
        
        logger.info(f"Processing {len(items)} retry items")
        processed = 0
        failed = 0
        
        for item in items:
            try:
                # Check if now within budget
                status = tracker.can_use_llm(item.business_id)
                if status.can_use:
                    # Generate response
                    response = brain.generate_reply(
                        business_id=item.business_id,
                        user_message=item.message,
                        user_id=item.user_id
                    )
                    # Send to user
                    whatsapp.send_message(item.user_id, response['reply'])
                    tracker.remove_from_queue(item)
                    processed += 1
                    logger.info(f"✅ Retry succeeded for {item.business_id}")
                else:
                    # Still over limit, increment attempt
                    item.attempt += 1
                    if item.attempt >= tracker._max_retries:
                        tracker.remove_from_queue(item)
                        logger.warning(f"❌ Retry exhausted for {item.business_id}")
                        failed += 1
            except Exception as e:
                logger.error(f"Retry failed for {item.business_id}: {e}")
                item.attempt += 1
                failed += 1
        
        return {"status": "ok", "processed": processed, "failed": failed}
    

    @celery.task
    def alert_usage_limit(business_id: str, usage_percent: float):
        """
        Send alert when business approaches or exceeds limit.
        Can be extended to send email/Slack notifications.
        """
        if usage_percent >= 100:
            logger.critical(f"🚨 ALERT: {business_id} exceeded LLM limit ({usage_percent:.1f}%)")
            # TODO: Send email/Slack alert to admin
            # send_email_alert(business_id, "LLM Limit Exceeded", ...)
            # send_slack_alert(f"🚨 {business_id} exceeded LLM limit!")
        elif usage_percent >= 80:
            logger.warning(f"⚠️ ALERT: {business_id} at {usage_percent:.1f}% of LLM limit")
        
        return {"business_id": business_id, "usage_percent": usage_percent}


# Synchronous fallback for when Celery is not available
def process_retry_queue_sync() -> dict:
    """
    Synchronous version of retry queue processing.
    Used when Celery/Redis is not available.
    """
    try:
        from llm_usage_tracker import get_usage_tracker
        from ai_brain import AIBrain
        from whatsapp_service import WhatsAppService
        
        tracker = get_usage_tracker()
        brain = AIBrain()
        whatsapp = WhatsAppService()
        
        items = tracker.get_retry_items()
        processed = 0
        
        for item in items:
            try:
                status = tracker.can_use_llm(item.business_id)
                if status.can_use:
                    response = brain.generate_reply(
                        business_id=item.business_id,
                        user_message=item.message,
                        user_id=item.user_id
                    )
                    whatsapp.send_message(item.user_id, response['reply'])
                    tracker.remove_from_queue(item)
                    processed += 1
                else:
                    item.attempt += 1
                    if item.attempt >= 3:
                        tracker.remove_from_queue(item)
            except Exception as e:
                logger.error(f"Sync retry failed: {e}")
        
        return {"processed": processed}
        
    except Exception as e:
        logger.error(f"Sync retry queue failed: {e}")
        return {"error": str(e)}
