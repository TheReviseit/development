"""
Notification Tasks for Celery.
Handles push notifications, email alerts, etc.
"""

import logging
from typing import Dict, Any, List, Optional
from celery import shared_task

logger = logging.getLogger('reviseit.tasks.notifications')


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    rate_limit="50/s",
)
def send_push(
    self,
    user_id: str,
    title: str,
    body: str,
    data: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Send push notification to a user.
    
    Args:
        user_id: User ID to send notification to
        title: Notification title
        body: Notification body
        data: Additional data payload
    
    Returns:
        Result with success status
    """
    try:
        from push_notification import send_push_to_user
        
        result = send_push_to_user(
            user_id=user_id,
            title=title,
            body=body,
            data=data or {}
        )
        
        logger.info(f"Push sent to {user_id}: {result}")
        return {"success": True, "user_id": user_id}
        
    except Exception as e:
        logger.error(f"Error sending push to {user_id}: {e}")
        raise self.retry(exc=e)


@shared_task(rate_limit="100/m")
def send_bulk_push(
    user_ids: List[str],
    title: str,
    body: str,
    data: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Send push notifications to multiple users.
    
    Args:
        user_ids: List of user IDs
        title: Notification title
        body: Notification body
        data: Additional data payload
    
    Returns:
        Summary of sent notifications
    """
    from push_notification import send_push_to_user
    
    results = {"sent": 0, "failed": 0, "errors": []}
    
    for user_id in user_ids:
        try:
            send_push_to_user(user_id, title, body, data or {})
            results["sent"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"user_id": user_id, "error": str(e)})
    
    logger.info(
        f"Bulk push: {results['sent']}/{len(user_ids)} sent"
    )
    return results


@shared_task(bind=True, max_retries=3)
def send_email(
    self,
    to: str,
    subject: str,
    body_html: str,
    body_text: str = None
) -> Dict[str, Any]:
    """
    Send email notification.
    
    Args:
        to: Recipient email
        subject: Email subject
        body_html: HTML body
        body_text: Plain text body (optional)
    
    Returns:
        Result with success status
    """
    try:
        # Placeholder for email sending logic
        # Would integrate with SendGrid, AWS SES, etc.
        logger.info(f"Email sent to {to}: {subject}")
        
        return {
            "success": True,
            "to": to,
            "subject": subject,
        }
        
    except Exception as e:
        logger.error(f"Error sending email to {to}: {e}")
        raise self.retry(exc=e)


@shared_task
def send_alert(
    alert_type: str,
    message: str,
    severity: str = "info",
    metadata: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Send system alert (Slack, PagerDuty, etc.).
    
    Args:
        alert_type: Type of alert (error, warning, info)
        message: Alert message
        severity: Severity level
        metadata: Additional context
    
    Returns:
        Alert result
    """
    try:
        import os
        import requests
        
        slack_webhook = os.getenv("SLACK_WEBHOOK_URL")
        
        if slack_webhook:
            emoji = {"error": "🚨", "warning": "⚠️", "info": "ℹ️"}.get(severity, "📢")
            
            payload = {
                "text": f"{emoji} *{alert_type.upper()}*: {message}",
                "attachments": [
                    {
                        "color": {"error": "danger", "warning": "warning"}.get(severity, "good"),
                        "fields": [
                            {"title": k, "value": str(v), "short": True}
                            for k, v in (metadata or {}).items()
                        ]
                    }
                ] if metadata else None
            }
            
            requests.post(slack_webhook, json=payload, timeout=10)
        
        logger.info(f"Alert sent: {alert_type} - {message}")
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Error sending alert: {e}")
        return {"error": str(e)}

