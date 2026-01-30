"""
Flowauxi Services Package.

Production-grade service modules for:
- Notification handling (WhatsApp, Email, Push)
- Inventory management (Stock reservations)
- Order management (Business logic orchestration)
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

from .inventory_service import (
    InventoryService,
    get_inventory_service,
    reset_inventory_service,
)

from .order_service import (
    OrderService,
    get_order_service,
)

__all__ = [
    # Notifications
    "NotificationService",
    "NotificationResult", 
    "NotificationRequest",
    "NotificationChannel",
    "NotificationStatus",
    "get_notification_service",
    "send_order_notification",
    # Inventory
    "InventoryService",
    "get_inventory_service",
    "reset_inventory_service",
    # Orders
    "OrderService",
    "get_order_service",
]

