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


# =============================================================================
# WHATSAPP ORDER NOTIFICATION TASKS
# Production-grade async notification processing
# =============================================================================

@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    rate_limit="30/m",
)
def send_order_whatsapp_notification(
    self,
    order_id: str,
    customer_name: str,
    customer_phone: str,
    status: str,
    previous_status: Optional[str],
    business_name: str,
    business_user_id: str,
    items: Optional[List[Dict[str, Any]]] = None,
    total_quantity: Optional[int] = None
) -> Dict[str, Any]:
    """
    Send WhatsApp notification for order status update.
    
    This is a Celery task with:
    - Auto-retry with exponential backoff
    - Rate limiting (30 per minute)
    - Jitter to prevent thundering herd
    
    Args:
        order_id: Order identifier
        customer_name: Customer's name
        customer_phone: Customer's phone number
        status: New order status
        previous_status: Previous status
        business_name: Name of the business
        business_user_id: Firebase UID of business owner
        items: Order items list
        total_quantity: Total item count
        
    Returns:
        Result with success status and message_id
    """
    import uuid
    correlation_id = str(uuid.uuid4())[:8]
    
    logger.info(
        f"📱 [{correlation_id}] Task: Sending WhatsApp notification for order #{order_id} "
        f"({previous_status} → {status})"
    )
    
    try:
        # Skip notification for pending status (initial state)
        if status == "pending":
            logger.info(f"⏭️ [{correlation_id}] Skipping notification for pending status")
            return {"success": True, "skipped": True, "reason": "pending_status"}
        
        # Skip if status unchanged
        if status == previous_status:
            logger.info(f"⏭️ [{correlation_id}] Skipping notification - status unchanged")
            return {"success": True, "skipped": True, "reason": "status_unchanged"}
        
        # Get credentials
        from supabase_client import get_whatsapp_credentials_unified
        credentials = get_whatsapp_credentials_unified(firebase_uid=business_user_id)
        
        if not credentials:
            logger.error(f"❌ [{correlation_id}] No WhatsApp credentials found")
            return {
                "success": False,
                "error": "No WhatsApp credentials found",
                "retry": False
            }
        
        phone_number_id = credentials.get('phone_number_id')
        access_token = credentials.get('access_token')
        
        if not phone_number_id or not access_token:
            logger.error(f"❌ [{correlation_id}] Incomplete credentials")
            return {
                "success": False,
                "error": "Incomplete credentials",
                "retry": False
            }
        
        # Format message
        message = _format_order_status_message(
            order_id=order_id,
            customer_name=customer_name,
            status=status,
            business_name=business_name,
            items=items,
            total_quantity=total_quantity
        )
        
        # Normalize phone number
        to = customer_phone.replace('+', '').replace(' ', '').replace('-', '')
        
        # Send via WhatsApp service
        from whatsapp_service import WhatsAppService
        whatsapp_service = WhatsAppService()
        
        result = whatsapp_service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=message
        )
        
        if result.get('success'):
            logger.info(
                f"✅ [{correlation_id}] WhatsApp sent to {to} "
                f"(message_id: {result.get('message_id', 'N/A')})"
            )
            return {
                "success": True,
                "message_id": result.get('message_id'),
                "order_id": order_id,
                "status": status,
                "source": credentials.get('source')
            }
        else:
            error = result.get('error', 'Unknown error')
            error_code = result.get('error_code') or result.get('status_code')
            
            # Check if retryable
            non_retryable_codes = [400, 401, 403, 404]
            if error_code in non_retryable_codes:
                logger.error(f"❌ [{correlation_id}] Non-retryable error: {error}")
                return {
                    "success": False,
                    "error": error,
                    "error_code": error_code,
                    "retry": False
                }
            
            # Retryable error - raise to trigger retry
            logger.warning(f"⚠️ [{correlation_id}] Retryable error: {error}")
            raise Exception(f"WhatsApp API error: {error}")
            
    except Exception as e:
        logger.error(f"❌ [{correlation_id}] Task error: {e}")
        # Re-raise for Celery retry mechanism
        raise self.retry(exc=e)


def _format_order_status_message(
    order_id: str,
    customer_name: str,
    status: str,
    business_name: str,
    items: Optional[List[Dict[str, Any]]] = None,
    total_quantity: Optional[int] = None
) -> str:
    """Format order status message for WhatsApp."""
    STATUS_TEMPLATES = {
        "pending": ("🕐", "Order Received", "Your order has been received and is awaiting confirmation."),
        "confirmed": ("✅", "Order Confirmed", "Great news! Your order has been confirmed and is being prepared."),
        "processing": ("📦", "Order Processing", "Your order is being packed and will be dispatched soon."),
        "completed": ("🎉", "Order Completed", "Your order has been successfully delivered. Thank you for shopping with us!"),
        "cancelled": ("❌", "Order Cancelled", "Your order has been cancelled. If you have any questions, please contact us."),
    }
    
    emoji, title, description = STATUS_TEMPLATES.get(status, ("📋", "Order Update", "Your order status has been updated."))
    
    # Build items summary
    items_text = ""
    if items and len(items) > 0:
        items_text = "\n\n📦 *Items:*"
        for item in items[:5]:
            items_text += f"\n• {item.get('name', 'Item')} × {item.get('quantity', 1)}"
        if len(items) > 5:
            items_text += f"\n• ...and {len(items) - 5} more items"
    
    message = f"""
{emoji} *{title}*

Hi {customer_name},

{description}

🆔 *Order ID:* #{order_id}
📊 *Status:* {status.capitalize()}
{f"🛒 *Items:* {total_quantity} item{'s' if total_quantity != 1 else ''}" if total_quantity else ""}
{items_text}

Thank you for choosing *{business_name}*!
""".strip()
    
    return message


@shared_task(rate_limit="10/m")
def send_order_notification_batch(notifications: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Send batch of order notifications.
    
    Args:
        notifications: List of notification dicts with order details
        
    Returns:
        Summary of sent notifications
    """
    results = {"sent": 0, "failed": 0, "skipped": 0, "errors": []}
    
    for notif in notifications:
        try:
            result = send_order_whatsapp_notification.delay(
                order_id=notif.get('order_id'),
                customer_name=notif.get('customer_name'),
                customer_phone=notif.get('customer_phone'),
                status=notif.get('status'),
                previous_status=notif.get('previous_status'),
                business_name=notif.get('business_name'),
                business_user_id=notif.get('business_user_id'),
                items=notif.get('items'),
                total_quantity=notif.get('total_quantity')
            )
            results["sent"] += 1
            
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({
                "order_id": notif.get('order_id'),
                "error": str(e)
            })
    
    logger.info(f"Batch notification: {results['sent']} queued, {results['failed']} failed")
    return results


