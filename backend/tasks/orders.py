"""
Order Background Tasks - Async Processing
Handles non-blocking operations:
- Google Sheets sync
- Notifications
- Analytics updates
- Webhook delivery

CRITICAL: Order creation is synchronous in the main flow.
These tasks are for secondary operations that should NOT block order creation.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

# Try to import Celery, fallback to synchronous execution
try:
    from celery_app import celery_app
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    celery_app = None

logger = logging.getLogger('reviseit.tasks.orders')


# =============================================================================
# Task Decorator Factory
# =============================================================================

def background_task(name: str, **task_options):
    """
    Decorator that creates a Celery task if available, otherwise runs synchronously.
    """
    def decorator(func):
        if CELERY_AVAILABLE and celery_app:
            return celery_app.task(name=name, **task_options)(func)
        else:
            # Fallback: Run synchronously
            def wrapper(*args, **kwargs):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    logger.error(f"Sync task failed: {name} - {e}")
                    return None
            wrapper.delay = lambda *a, **kw: wrapper(*a, **kw)
            wrapper.__name__ = func.__name__
            return wrapper
    return decorator


# =============================================================================
# Order Event Processing
# =============================================================================

@background_task(
    name="orders.process_event",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def process_order_event(
    self,
    event_type: str,
    order_id: str,
    user_id: str,
    data: Dict[str, Any],
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process order event asynchronously.
    
    This handles all secondary operations after order creation:
    - Google Sheets sync
    - Customer notifications
    - Analytics updates
    """
    results = {
        "event_type": event_type,
        "order_id": order_id,
        "processed_at": datetime.utcnow().isoformat(),
        "tasks": {},
    }
    
    logger.info(
        f"Processing order event: {event_type}",
        extra={
            "order_id": order_id,
            "user_id": user_id,
            "correlation_id": correlation_id,
        }
    )
    
    try:
        # 1. Sync to Google Sheets (if configured)
        if event_type in ("order_created", "order_updated", "order_cancelled"):
            sheets_result = sync_order_to_sheets(
                order_id=order_id,
                user_id=user_id,
                data=data,
                correlation_id=correlation_id,
            )
            results["tasks"]["sheets_sync"] = sheets_result
        
        # 2. Send notifications
        if event_type == "order_created":
            notif_result = send_order_notification(
                order_id=order_id,
                user_id=user_id,
                data=data,
                notification_type="new_order",
                correlation_id=correlation_id,
            )
            results["tasks"]["notification"] = notif_result
        
        # 3. Update analytics
        analytics_result = update_order_analytics(
            event_type=event_type,
            user_id=user_id,
            data=data,
            correlation_id=correlation_id,
        )
        results["tasks"]["analytics"] = analytics_result
        
        results["success"] = True
        
    except Exception as e:
        logger.error(
            f"Error processing order event: {e}",
            extra={"order_id": order_id, "correlation_id": correlation_id}
        )
        results["success"] = False
        results["error"] = str(e)
        
        # Retry if Celery available
        if CELERY_AVAILABLE and hasattr(self, 'retry'):
            raise self.retry(exc=e)
    
    return results


# =============================================================================
# Google Sheets Sync (Enterprise-Grade)
# =============================================================================

@background_task(
    name="orders.sync_to_sheets",
    bind=True,
    max_retries=5,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def sync_order_to_sheets(
    self=None,
    order_id: str = None,
    user_id: str = None,
    data: Dict[str, Any] = None,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Sync order to Google Sheets.
    
    Features:
    - Async/non-blocking
    - Retry-safe with exponential backoff
    - Idempotent (uses order_id as row key)
    - Failure does NOT affect order creation
    
    Sheet Structure:
    | Order ID | Date | Customer | Phone | Items | Total | Status |
    """
    result = {
        "synced": False,
        "order_id": order_id,
        "correlation_id": correlation_id,
    }
    
    if not data:
        logger.warning("No data provided for sheets sync")
        return result
    
    try:
        # Get sheets configuration for this business
        logger.info(f"📊 Getting sheets config for user {user_id}")
        sheets_config = _get_sheets_config(user_id)
        
        if not sheets_config or not sheets_config.get("enabled"):
            reason = sheets_config.get("reason", "not_enabled") if sheets_config else "no_config"
            logger.info(f"📊 Sheets sync skipped for user {user_id}: {reason}")
            result["reason"] = reason
            return result
        
        logger.info(f"📊 Sheets config found: spreadsheet_id={sheets_config.get('spreadsheet_id', '')[:20]}...")
        
        # Format data for sheets
        row_data = _format_order_for_sheets(data)
        
        # Connect to Google Sheets API
        sheets_client = _get_sheets_client(sheets_config)
        
        if not sheets_client:
            logger.warning(f"📊 Could not create sheets client for user {user_id}")
            result["reason"] = "client_unavailable"
            return result
        
        # Find or create row for this order (idempotent)
        spreadsheet_id = sheets_config.get("spreadsheet_id")
        sheet_name = sheets_config.get("sheet_name", "Orders")
        
        # Append or update row
        logger.info(f"📊 Upserting order {order_id} to sheet {sheet_name}")
        synced = _upsert_sheet_row(
            client=sheets_client,
            spreadsheet_id=spreadsheet_id,
            sheet_name=sheet_name,
            order_id=order_id,
            row_data=row_data,
        )
        
        result["synced"] = synced
        result["spreadsheet_id"] = spreadsheet_id
        
        if synced:
            logger.info(f"✅ Order {order_id} synced to Google Sheets successfully")
        else:
            logger.warning(f"⚠️ Order {order_id} sync returned False")
        
    except Exception as e:
        logger.error(f"❌ Sheets sync failed for order {order_id}: {e}")
        result["error"] = str(e)
        
        # Let retry mechanism handle it
        if CELERY_AVAILABLE and self and hasattr(self, 'retry'):
            raise
    
    return result


def _get_sheets_config(user_id: str) -> Optional[Dict[str, Any]]:
    """Get Google Sheets configuration for a business."""
    import os
    import re
    
    try:
        from supabase_client import get_supabase_client
        client = get_supabase_client()
        
        if not client:
            return None
        
        # Query using the correct field names (order_sheet_url, order_sheet_sync_enabled)
        result = client.table("ai_capabilities").select(
            "order_sheet_url, order_sheet_sync_enabled"
        ).eq("user_id", user_id).single().execute()
        
        if not result.data:
            return {"enabled": False}
        
        sheet_url = result.data.get("order_sheet_url")
        sync_enabled = result.data.get("order_sheet_sync_enabled", False)
        
        if not sync_enabled or not sheet_url:
            logger.debug(f"Sheets sync not enabled for user {user_id}: sync_enabled={sync_enabled}, has_url={bool(sheet_url)}")
            return {"enabled": False}
        
        # Extract spreadsheet ID from URL
        # URL format: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit...
        spreadsheet_id = None
        match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', sheet_url)
        if match:
            spreadsheet_id = match.group(1)
        else:
            logger.warning(f"Could not extract spreadsheet ID from URL: {sheet_url[:50]}...")
            return {"enabled": False}
        
        # Get credentials - try shared service account from env first
        credentials = None
        
        # Option 1: Shared service account from environment variable
        credentials_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
        if credentials_json:
            try:
                import json
                credentials = json.loads(credentials_json)
                logger.debug("Using shared Google Sheets credentials from env")
            except Exception as e:
                logger.warning(f"Failed to parse GOOGLE_SHEETS_CREDENTIALS: {e}")
        
        # Option 2: Try using Firebase service account (if it has Sheets API access)
        if not credentials:
            firebase_creds = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
            if firebase_creds:
                try:
                    import json
                    import base64
                    creds_json = base64.b64decode(firebase_creds).decode('utf-8')
                    credentials = json.loads(creds_json)
                    logger.debug("Using Firebase service account for Google Sheets")
                except Exception as e:
                    logger.warning(f"Failed to parse Firebase credentials for Sheets: {e}")
        
        if not credentials:
            logger.warning("No Google Sheets credentials available. Set GOOGLE_SHEETS_CREDENTIALS env var.")
            return {"enabled": False, "reason": "no_credentials"}
        
        return {
            "enabled": True,
            "spreadsheet_id": spreadsheet_id,
            "sheet_name": "Orders",  # Default sheet name
            "credentials": credentials,
        }
        
    except Exception as e:
        logger.warning(f"Could not get sheets config: {e}")
        return None


def _get_sheets_client(config: Dict[str, Any]):
    """Get Google Sheets API client."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        
        credentials_data = config.get("credentials")
        if not credentials_data:
            return None
        
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive',
        ]
        
        credentials = Credentials.from_service_account_info(
            credentials_data,
            scopes=scopes,
        )
        
        return gspread.authorize(credentials)
        
    except ImportError:
        logger.warning("gspread not installed, sheets sync unavailable")
        return None
    except Exception as e:
        logger.error(f"Failed to create sheets client: {e}")
        return None


def _format_order_for_sheets(data: Dict[str, Any]) -> List[Any]:
    """Format order data for Google Sheets row."""
    items = data.get("items", [])
    items_str = "; ".join([
        f"{i.get('quantity', 1)}x {i.get('name', 'Unknown')}"
        for i in items
    ])
    
    return [
        data.get("id", ""),                                    # Order ID
        data.get("created_at", "")[:10],                       # Date (YYYY-MM-DD)
        data.get("customer_name", ""),                         # Customer Name
        data.get("customer_phone", ""),                        # Phone
        items_str,                                              # Items
        data.get("total_quantity", 0),                         # Total Qty
        data.get("status", "pending").upper(),                 # Status
        data.get("source", "manual"),                          # Source
        data.get("notes", ""),                                 # Notes
    ]


def _upsert_sheet_row(
    client,
    spreadsheet_id: str,
    sheet_name: str,
    order_id: str,
    row_data: List[Any],
) -> bool:
    """Insert or update row in Google Sheet (idempotent)."""
    try:
        sheet = client.open_by_key(spreadsheet_id).worksheet(sheet_name)
        
        # Try to find existing row with this order ID
        try:
            cell = sheet.find(order_id)
            if cell:
                # Update existing row
                row_num = cell.row
                sheet.update(f"A{row_num}:I{row_num}", [row_data])
                return True
        except Exception:
            pass  # Not found, will append
        
        # Append new row
        sheet.append_row(row_data)
        return True
        
    except Exception as e:
        logger.error(f"Failed to upsert sheet row: {e}")
        return False


# =============================================================================
# Notifications
# =============================================================================

@background_task(name="orders.send_notification")
def send_order_notification(
    order_id: str,
    user_id: str,
    data: Dict[str, Any],
    notification_type: str = "new_order",
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Send notification for order event."""
    result = {"sent": False, "type": notification_type}
    
    try:
        # Send push notification to business owner
        from push_notification import send_push_to_user
        
        customer_name = data.get("customer_name", "Customer")
        total_qty = data.get("total_quantity", 0)
        
        title = "New Order Received! 🛒"
        body = f"{customer_name} placed an order with {total_qty} item(s)"
        
        push_data = {
            "type": "new_order",
            "order_id": order_id,
        }
        
        send_push_to_user(user_id, title, body, push_data)
        result["sent"] = True
        
    except ImportError:
        logger.debug("Push notifications not available")
    except Exception as e:
        logger.warning(f"Failed to send notification: {e}")
        result["error"] = str(e)
    
    return result


# =============================================================================
# Analytics
# =============================================================================

@background_task(name="orders.update_analytics")
def update_order_analytics(
    event_type: str,
    user_id: str,
    data: Dict[str, Any],
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Update order analytics."""
    result = {"updated": False}
    
    try:
        from supabase_client import get_supabase_client
        from datetime import date
        
        client = get_supabase_client()
        if not client:
            return result
        
        today = date.today().isoformat()
        
        # Determine increment fields
        increments = {}
        if event_type == "order_created":
            increments["orders_created"] = 1
            if data.get("source") == "ai":
                increments["ai_orders"] = 1
        elif event_type == "order_cancelled":
            increments["orders_cancelled"] = 1
        elif event_type == "order_completed":
            increments["orders_completed"] = 1
        
        if not increments:
            return result
        
        # Update or create analytics row
        existing = client.table("analytics_daily").select("*").eq(
            "user_id", user_id
        ).eq("date", today).execute()
        
        if existing.data:
            current = existing.data[0]
            updates = {
                k: (current.get(k, 0) or 0) + v
                for k, v in increments.items()
            }
            updates["updated_at"] = datetime.utcnow().isoformat()
            
            client.table("analytics_daily").update(updates).eq(
                "id", current["id"]
            ).execute()
        else:
            new_row = {
                "user_id": user_id,
                "date": today,
                **increments,
            }
            client.table("analytics_daily").insert(new_row).execute()
        
        result["updated"] = True
        
    except Exception as e:
        logger.warning(f"Failed to update analytics: {e}")
        result["error"] = str(e)
    
    return result

