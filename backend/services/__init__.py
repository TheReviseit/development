"""
Flowauxi Services Package.

Production-grade service modules for:
- Notification handling (WhatsApp, Email, Push)
- Business logic orchestration
- API integrations
"""

from .notification_service import (
    NotificationService,
    NotificationResult,
    NotificationRequest,
    NotificationChannel,
    NotificationStatus,
    get_notification_service,
    send_order_notification,
)

__all__ = [
    "NotificationService",
    "NotificationResult", 
    "NotificationRequest",
    "NotificationChannel",
    "NotificationStatus",
    "get_notification_service",
    "send_order_notification",
]
