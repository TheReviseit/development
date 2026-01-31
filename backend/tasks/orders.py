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

# Import gspread for exception handling
try:
    import gspread
    GSPREAD_AVAILABLE = True
except ImportError:
    GSPREAD_AVAILABLE = False
    gspread = None

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
            
            # 2b. Send invoice via WhatsApp (for AI/WhatsApp orders only)
            # NON-BLOCKING: This triggers a separate background task
            order_source = data.get("source")
            logger.info(f"📄 Invoice check: source='{order_source}', expected='ai', match={order_source == 'ai'}")
            
            if order_source == "ai":
                try:
                    # Get business data for invoice generation
                    business_data = _get_business_data_for_invoice(user_id)
                    
                    if business_data:
                        # Trigger invoice task (async, non-blocking)
                        invoice_result = send_invoice_whatsapp.delay(
                            order_id=order_id,
                            user_id=user_id,
                            customer_phone=data.get("customer_phone"),
                            order_data=data,
                            business_data=business_data,
                            correlation_id=correlation_id,
                        )
                        results["tasks"]["invoice"] = {"triggered": True, "task_id": str(invoice_result)}
                        logger.info(f"📄 Invoice task triggered for order {order_id}")
                    else:
                        logger.warning(f"No business data for invoice, skipping for order {order_id}")
                        results["tasks"]["invoice"] = {"triggered": False, "reason": "no_business_data"}
                except Exception as inv_err:
                    # Invoice failure should NEVER block order processing
                    logger.warning(f"Invoice trigger failed for order {order_id}: {inv_err}")
                    results["tasks"]["invoice"] = {"triggered": False, "error": str(inv_err)}
        
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


def _get_business_data_for_invoice(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get business profile data for invoice generation.
    
    Returns business profile with:
    - businessName
    - brandColor
    - logoUrl
    - contact info
    - location
    
    Note: The businesses table uses Firebase UIDs as user_id.
    """
    try:
        from supabase_client import get_supabase_client
        
        client = get_supabase_client()
        if not client:
            logger.warning("No Supabase client for business data lookup")
            return None
        
        # Query the correct 'businesses' table (not 'business_profiles')
        # contact and location are JSONB objects in the schema
        # Note: businesses table uses Firebase UID as user_id (TEXT type)
        result = client.table("businesses").select(
            "business_name, brand_color, logo_url, contact, location"
        ).eq("user_id", user_id).single().execute()
        
        if not result.data:
            logger.warning(f"No business profile found for user {user_id}")
            return None
        
        profile = result.data
        
        # Extract contact info from JSONB
        contact = profile.get("contact", {}) or {}
        
        # Extract location info from JSONB
        location = profile.get("location", {}) or {}
        
        # Format for invoice generator
        # Note: user_id IS the store slug (Firebase UID = store identifier)
        return {
            "businessName": profile.get("business_name", "Store"),
            "brandColor": profile.get("brand_color", "#22c55e"),
            "logoUrl": profile.get("logo_url"),
            "phone": contact.get("phone") or contact.get("whatsapp"),
            "address": location.get("address"),
            "location": {
                "city": location.get("city"),
                "state": location.get("state"),
                "pincode": location.get("pincode"),
            },
            "storeSlug": user_id,  # user_id IS the store slug
        }
        
    except Exception as e:
        logger.warning(f"Failed to get business data for invoice: {e}")
        return None


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
        
        # =======================================================================
        # CRITICAL FIX: Use the SHORT order_id that matches what's stored in sheet
        # The sheet stores the 8-char short ID (e.g., "28C2CF22") in Column A.
        # The API may receive the full UUID. We must use the short ID for lookup.
        # =======================================================================
        sheet_order_id = row_data[0] if row_data else order_id
        
        # Defensive guard: Ensure we're using the short ID format (8 chars)
        # This prevents future regressions if someone accidentally passes a UUID
        if len(str(sheet_order_id)) > 8:
            logger.warning(
                f"⚠️ [Sheets] Order ID '{sheet_order_id}' is longer than 8 chars. "
                f"Truncating to short format for sheet lookup."
            )
            sheet_order_id = str(sheet_order_id)[:8].upper()
        
        assert len(str(sheet_order_id)) <= 8, f"Sheet order_id must be short ID (8 chars max), got: {sheet_order_id}"
        
        # Add hidden DB UUID column (Column K) for auditing/reconciliation
        # This stores the full UUID but is NOT used for matching
        db_uuid = data.get("id", order_id) if data else order_id
        row_data_with_uuid = row_data + [db_uuid] if row_data else [db_uuid]
        
        # Append or update row
        logger.info(f"📊 Upserting order {sheet_order_id} (db_id={order_id}) to sheet {sheet_name}")
        synced = _upsert_sheet_row(
            client=sheets_client,
            spreadsheet_id=spreadsheet_id,
            sheet_name=sheet_name,
            order_id=sheet_order_id,
            row_data=row_data_with_uuid,
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
    
    logger.info(f"📊 [Sheets Config] Fetching configuration for user: {user_id}")
    
    try:
        from supabase_client import get_supabase_client
        client = get_supabase_client()
        
        if not client:
            logger.error("❌ [Sheets Config] Failed to get Supabase client")
            return None
        
        # Query BOTH old and new field names for compatibility
        # Frontend uses: order_sheet_url, order_sheet_sync_enabled
        # Migration 007 created: sheets_sync_enabled, sheets_spreadsheet_id
        logger.debug(f"📊 [Sheets Config] Querying ai_capabilities table for user {user_id}")
        result = client.table("ai_capabilities").select(
            "order_sheet_url, order_sheet_sync_enabled, sheets_sync_enabled, sheets_spreadsheet_id, sheets_sheet_name"
        ).eq("user_id", user_id).single().execute()
        
        if not result.data:
            logger.warning(f"⚠️ [Sheets Config] No ai_capabilities record found for user {user_id}")
            return {"enabled": False, "reason": "no_config"}
        
        # Try frontend fields first (order_sheet_url, order_sheet_sync_enabled)
        sheet_url = result.data.get("order_sheet_url")
        sync_enabled_frontend = result.data.get("order_sheet_sync_enabled", False)
        
        # Try backend fields (sheets_sync_enabled, sheets_spreadsheet_id)
        sync_enabled_backend = result.data.get("sheets_sync_enabled", False)
        spreadsheet_id_direct = result.data.get("sheets_spreadsheet_id")
        sheet_name = result.data.get("sheets_sheet_name", "Orders")
        
        # Merge sync enabled from both sources
        sync_enabled = sync_enabled_frontend or sync_enabled_backend
        
        logger.info(f"📊 [Sheets Config] Retrieved from DB: "
                   f"sync_enabled={sync_enabled}, "
                   f"has_url={bool(sheet_url)}, "
                   f"has_direct_id={bool(spreadsheet_id_direct)}")
        
        if not sync_enabled:
            logger.info(f"📊 [Sheets Config] Sheets sync is disabled for user {user_id}")
            return {"enabled": False, "reason": "sync_disabled"}
        
        # Determine spreadsheet_id (prefer direct ID, fallback to extracting from URL)
        final_spreadsheet_id = None
        
        if spreadsheet_id_direct:
            # Direct spreadsheet ID from DB (backend field)
            final_spreadsheet_id = spreadsheet_id_direct
            logger.info(f"📊 [Sheets Config] Using direct spreadsheet ID from DB")
        elif sheet_url:
            # Extract spreadsheet ID from URL (frontend field)
            # URL format: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit...
            match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', sheet_url)
            if match:
                final_spreadsheet_id = match.group(1)
                logger.info(f"📊 [Sheets Config] Extracted spreadsheet ID from URL: {final_spreadsheet_id[:20]}...")
            else:
                logger.error(f"❌ [Sheets Config] Could not extract spreadsheet ID from URL: {sheet_url[:50]}...")
                return {"enabled": False, "reason": "invalid_url"}
        else:
            logger.warning(f"⚠️ [Sheets Config] No spreadsheet_id or URL in database for user {user_id}")
            return {"enabled": False, "reason": "no_spreadsheet_id"}
        
        # Get credentials - priority order: JSON file → ENV var → Firebase fallback
        credentials = None
        credential_source = None
        
        # Option 1: Load from JSON file path specified in environment variable
        credentials_path = os.getenv("GOOGLE_SHEETS_CREDENTIALS_PATH")
        if credentials_path:
            try:
                import json
                # Resolve path relative to backend directory
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                full_path = os.path.join(backend_dir, credentials_path)
                
                if os.path.exists(full_path):
                    with open(full_path, 'r') as f:
                        credentials = json.load(f)
                    credential_source = "json_file"
                    logger.info(f"📊 [Sheets Config] Using credentials from JSON file: {credentials_path}")
                else:
                    logger.warning(f"⚠️ [Sheets Config] Credentials file not found: {full_path}")
            except Exception as e:
                logger.error(f"❌ [Sheets Config] Failed to load credentials from JSON file: {e}")
        
        # Option 2: Fallback to inline JSON in environment variable
        if not credentials:
            credentials_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
            if credentials_json:
                try:
                    import json
                    credentials = json.loads(credentials_json)
                    credential_source = "env_var"
                    logger.info("📊 [Sheets Config] Using shared credentials from GOOGLE_SHEETS_CREDENTIALS env var")
                except Exception as e:
                    logger.error(f"❌ [Sheets Config] Failed to parse GOOGLE_SHEETS_CREDENTIALS env var: {e}")
        
        # Option 3: Try using Firebase service account (if it has Sheets API access)
        if not credentials:
            firebase_creds = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
            if firebase_creds:
                try:
                    import json
                    import base64
                    creds_json = base64.b64decode(firebase_creds).decode('utf-8')
                    credentials = json.loads(creds_json)
                    credential_source = "firebase"
                    logger.info("📊 [Sheets Config] Using Firebase service account for Google Sheets")
                except Exception as e:
                    logger.warning(f"⚠️ [Sheets Config] Failed to parse Firebase credentials for Sheets: {e}")
        
        if not credentials:
            logger.error(
                "❌ [Sheets Config] No Google Sheets credentials available. "
                "Set GOOGLE_SHEETS_CREDENTIALS_PATH or GOOGLE_SHEETS_CREDENTIALS env var. "
                f"User: {user_id}"
            )
            return {"enabled": False, "reason": "no_credentials"}
        
        logger.info(f"✅ [Sheets Config] Configuration complete for user {user_id}: "
                   f"spreadsheet_id={final_spreadsheet_id[:20]}..., "
                   f"sheet_name={sheet_name}, credential_source={credential_source}")
        
        return {
            "enabled": True,
            "spreadsheet_id": final_spreadsheet_id,
            "sheet_name": sheet_name,
            "credentials": credentials,
            "credential_source": credential_source,
        }
        
    except Exception as e:
        logger.error(f"❌ [Sheets Config] Unexpected error getting config for user {user_id}: {e}", exc_info=True)
        return None




def _get_sheets_client(config: Dict[str, Any]):
    """Get Google Sheets API client."""
    logger.info(f"📊 [Sheets Client] Creating Google Sheets client (credential_source={config.get('credential_source', 'unknown')})")
    
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        
        logger.debug("📊 [Sheets Client] Successfully imported gspread and google.auth packages")
        
        credentials_data = config.get("credentials")
        if not credentials_data:
            logger.error("❌ [Sheets Client] No credentials provided in config")
            return None
        
        # Validate credential structure
        if not isinstance(credentials_data, dict):
            logger.error(f"❌ [Sheets Client] Credentials must be a dict, got {type(credentials_data)}")
            return None
        
        required_fields = ["type", "project_id", "private_key", "client_email"]
        missing_fields = [f for f in required_fields if f not in credentials_data]
        if missing_fields:
            logger.error(f"❌ [Sheets Client] Credentials missing required fields: {missing_fields}")
            return None
        
        logger.info(f"📊 [Sheets Client] Valid credentials structure detected "
                   f"(project_id={credentials_data.get('project_id', 'unknown')[:30]}...)")
        
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive',
        ]
        
        logger.debug(f"📊 [Sheets Client] Creating credentials with scopes: {scopes}")
        credentials = Credentials.from_service_account_info(
            credentials_data,
            scopes=scopes,
        )
        
        logger.debug(f"📊 [Sheets Client] Authorizing gspread client with service account: "
                    f"{credentials_data.get('client_email', 'unknown')}")
        client = gspread.authorize(credentials)
        
        logger.info("✅ [Sheets Client] Google Sheets client created successfully")
        return client
        
    except ImportError as e:
        logger.error(f"❌ [Sheets Client] Required package not installed: {e}. "
                    f"Run: pip install gspread google-auth google-auth-oauthlib google-auth-httplib2")
        return None
    except Exception as e:
        logger.error(f"❌ [Sheets Client] Failed to create sheets client: {e}", exc_info=True)
        return None



def _format_order_for_sheets(data: Dict[str, Any]) -> List[Any]:
    """Format order data for Google Sheets row.
    
    Columns: Order ID | Date | Customer | Phone | Address | Items (with size/color) | Total Qty | Status | Source | Notes
    """
    items = data.get("items", [])
    
    # Build items string with size/color variants
    items_parts = []
    for i in items:
        qty = i.get('quantity', 1)
        name = i.get('name', 'Unknown')
        item_str = f"{qty}x {name}"
        
        # Add variant details (size, color, price)
        variant_parts = []
        if i.get('size'):
            variant_parts.append(f"Size: {i.get('size')}")
        if i.get('color'):
            variant_parts.append(f"Color: {i.get('color')}")
        elif i.get('variant_display'):
            variant_parts.append(i.get('variant_display'))
        
        price = i.get('price')
        if price is not None:
            try:
                price_value = float(price)
                variant_parts.append(f"Price: ₹{price_value:.0f}")
            except (TypeError, ValueError):
                # Fallback to raw value if it can't be parsed
                variant_parts.append(f"Price: {price}")
        
        if variant_parts:
            item_str += f" ({', '.join(variant_parts)})"
        
        items_parts.append(item_str)
    
    items_str = "; ".join(items_parts)
    
    # Use order_id (short human-readable) if available, otherwise fallback to first 8 chars of id
    order_id = data.get("order_id") or (data.get("id", "")[:8].upper() if data.get("id") else "")
    
    return [
        order_id,                                               # Order ID (short, e.g., "28C2CF22")
        data.get("created_at", "")[:10] if data.get("created_at") else "",  # Date (YYYY-MM-DD)
        data.get("customer_name", ""),                         # Customer Name
        data.get("customer_phone", ""),                        # Phone
        data.get("customer_address", ""),                      # Delivery Address
        items_str,                                              # Items (with variants)
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
    """Insert or update row in Google Sheet (idempotent).
    
    CRITICAL FIX: Properly searches for existing order to prevent duplicates.
    """
    logger.info(f"📊 [Sheets Upsert] Starting upsert for order {order_id} to "
               f"spreadsheet {spreadsheet_id[:20]}..., sheet '{sheet_name}'")
    try:
        logger.debug(f"📊 [Sheets Upsert] Opening spreadsheet by key: {spreadsheet_id[:20]}...")
        spreadsheet = client.open_by_key(spreadsheet_id)
        logger.debug(f"📊 [Sheets Upsert] Successfully opened spreadsheet: {spreadsheet.title}")
        
        logger.debug(f"📊 [Sheets Upsert] Accessing worksheet: {sheet_name}")
        sheet = spreadsheet.worksheet(sheet_name)
        logger.info(f"📊 [Sheets Upsert] Successfully accessed worksheet '{sheet_name}' "
                   f"({sheet.row_count} rows, {sheet.col_count} cols)")
        
        # CRITICAL FIX: Get ALL values in column A (Order ID column) to find exact match
        logger.debug(f"📊 [Sheets Upsert] Fetching all Order IDs from column A...")
        try:
            # Get all values in column A (Order ID column)
            order_id_column = sheet.col_values(1)  # Column A = index 1
            logger.debug(f"📊 [Sheets Upsert] Found {len(order_id_column)} rows in Order ID column")
            
            # Search for exact match (case-sensitive)
            existing_row_num = None
            for idx, cell_value in enumerate(order_id_column, start=1):
                if str(cell_value).strip() == str(order_id).strip():
                    existing_row_num = idx
                    logger.info(f"📊 [Sheets Upsert] Found existing order '{order_id}' at row {existing_row_num}")
                    break
            
            if existing_row_num and existing_row_num > 1:  # Skip header row
                # Update existing row (including hidden DB UUID column K)
                logger.info(f"📊 [Sheets Upsert] Updating existing order at row {existing_row_num}...")
                range_notation = f"A{existing_row_num}:K{existing_row_num}"
                logger.debug(f"📊 [Sheets Upsert] Updating range: {range_notation}")
                sheet.update(range_notation, [row_data])
                logger.info(f"✅ [Sheets Upsert] Successfully updated existing order {order_id} at row {existing_row_num}")
                return True
            else:
                logger.debug(f"📊 [Sheets Upsert] Order ID '{order_id}' not found in existing rows")
                
        except Exception as col_error:
            logger.warning(f"⚠️ [Sheets Upsert] Error reading column values: {col_error}, will append new row")
        
        # Append new row (order not found)
        logger.info(f"📊 [Sheets Upsert] Appending new row for order {order_id}")
        logger.debug(f"📊 [Sheets Upsert] Row data: {row_data}")
        sheet.append_row(row_data)
        logger.info(f"✅ [Sheets Upsert] Successfully appended new order {order_id}")
        return True
        
    except gspread.exceptions.WorksheetNotFound:
        # Auto-create the missing worksheet
        logger.warning(f"⚠️ [Sheets Upsert] Worksheet '{sheet_name}' not found in spreadsheet {spreadsheet_id[:20]}...")
        logger.info(f"🔧 [Sheets Upsert] Attempting to auto-create worksheet '{sheet_name}' with headers...")
        
        try:
            # Create new worksheet with appropriate size
            new_sheet = spreadsheet.add_worksheet(
                title=sheet_name,
                rows=1000,  # Start with 1000 rows
                cols=11     # 11 columns: 10 visible + 1 hidden DB UUID for auditing
            )
            
            # Add header row (Column K is hidden UUID for auditing/reconciliation)
            headers = [
                "Order ID",
                "Date", 
                "Customer",
                "Phone",
                "Address",
                "Items",
                "Total Qty",
                "Status",
                "Source",
                "Notes",
                "DB Order ID"  # Hidden column for full UUID (auditing only)
            ]
            new_sheet.update('A1:K1', [headers])
            
            # Format header row (bold)
            new_sheet.format('A1:K1', {
                "textFormat": {"bold": True},
                "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9}
            })
            
            logger.info(f"✅ [Sheets Upsert] Successfully created worksheet '{sheet_name}' with headers")
            
            # Retry the append operation
            logger.info(f"📊 [Sheets Upsert] Retrying append for order {order_id} on new worksheet")
            new_sheet.append_row(row_data)
            logger.info(f"✅ [Sheets Upsert] Successfully appended order {order_id} to new worksheet")
            return True
            
        except Exception as create_error:
            logger.error(
                f"❌ [Sheets Upsert] Failed to auto-create worksheet '{sheet_name}': {create_error}. "
                f"Please manually create a sheet named '{sheet_name}' in the spreadsheet.",
                exc_info=True
            )
            return False
    except gspread.exceptions.SpreadsheetNotFound:
        logger.error(f"❌ [Sheets Upsert] Spreadsheet not found: {spreadsheet_id[:20]}... "
                    f"Check if the spreadsheet exists and service account has access")
        return False
    except gspread.exceptions.APIError as api_error:
        logger.error(f"❌ [Sheets Upsert] Google Sheets API error: {api_error}. "
                    f"Status: {getattr(api_error.response, 'status_code', 'unknown')}, "
                    f"Details: {getattr(api_error, 'message', str(api_error))}")
        return False
    except Exception as e:
        logger.error(f"❌ [Sheets Upsert] Failed to upsert sheet row for order {order_id}: {e}", exc_info=True)
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
    """
    Update order analytics with proper Firebase UID → Supabase UUID resolution.
    
    The analytics_daily table uses Supabase UUIDs, so we must translate
    Firebase UIDs before querying.
    """
    result = {"updated": False}
    
    try:
        from supabase_client import get_supabase_client, resolve_user_id
        from datetime import date
        
        client = get_supabase_client()
        if not client:
            return result
        
        # CRITICAL: Resolve Firebase UID → Supabase UUID
        # The analytics_daily table uses Supabase UUIDs in the user_id column
        resolved_user_id = resolve_user_id(user_id)
        if not resolved_user_id:
            logger.warning(f"Cannot update analytics: no Supabase UUID for {user_id[:15]}...")
            result["error"] = "user_id_resolution_failed"
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
        
        # Update or create analytics row (using resolved UUID)
        existing = client.table("analytics_daily").select("*").eq(
            "user_id", resolved_user_id
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
                "user_id": resolved_user_id,  # Use resolved UUID
                "date": today,
                **increments,
            }
            client.table("analytics_daily").insert(new_row).execute()
        
        result["updated"] = True
        logger.info(f"📊 Analytics updated for user {resolved_user_id[:8]}...")
        
    except Exception as e:
        logger.warning(f"Failed to update analytics: {e}")
        result["error"] = str(e)
    
    return result


# =============================================================================
# Invoice Generation & WhatsApp Delivery (NO STORAGE)
# =============================================================================

@background_task(
    name="orders.send_invoice_whatsapp",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_invoice_whatsapp(
    self=None,
    order_id: str = None,
    user_id: str = None,
    customer_phone: str = None,
    order_data: Dict[str, Any] = None,
    business_data: Dict[str, Any] = None,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    NON-BLOCKING INVOICE PIPELINE (NO STORAGE)
    
    Flow:
    1. Generate PDF in memory (pure function)
    2. Upload to WhatsApp Media API
    3. Send document message
    4. Discard PDF bytes
    
    CRITICAL:
    - Order creation MUST NOT wait for this task
    - Idempotent: Check if invoice already sent before processing
    - No filesystem access, no storage
    """
    result = {
        "sent": False,
        "order_id": order_id,
        "correlation_id": correlation_id,
    }
    
    if not order_data or not business_data:
        logger.warning(f"Invoice task missing order_data or business_data for {order_id}")
        result["error"] = "Missing required data"
        return result
    
    if not customer_phone:
        logger.info(f"No customer phone for order {order_id}, skipping invoice")
        result["reason"] = "no_customer_phone"
        return result
    
    try:
        # Import invoice modules
        from utils.invoice_generator import generate_invoice_pdf, generate_invoice_number
        from services.whatsapp_media import upload_and_send_document
        
        logger.info(f"📄 Starting invoice generation for order {order_id}")
        
        # Step 1: Generate PDF in memory
        pdf_bytes = generate_invoice_pdf(order_data, business_data)
        
        if not pdf_bytes:
            logger.error(f"Failed to generate PDF for order {order_id}")
            result["error"] = "PDF generation failed"
            return result
        
        logger.info(f"✅ PDF generated: {len(pdf_bytes)} bytes for order {order_id}")
        
        # Step 2: Get WhatsApp credentials
        wa_creds = _get_whatsapp_credentials(user_id)
        
        if not wa_creds:
            logger.warning(f"No WhatsApp credentials for user {user_id}, skipping invoice send")
            result["reason"] = "no_whatsapp_credentials"
            return result
        
        # Step 3: Generate invoice filename
        invoice_number = generate_invoice_number(order_data.get("order_id", order_id))
        filename = f"Invoice_{invoice_number}.pdf"
        
        # Step 4: Upload and send via WhatsApp
        business_name = business_data.get("businessName", "Store")
        caption = f"Your invoice from {business_name}\nThank you for your order! ❤️"
        
        send_result = upload_and_send_document(
            phone_number_id=wa_creds["phone_number_id"],
            access_token=wa_creds["access_token"],
            to=customer_phone,
            pdf_bytes=pdf_bytes,
            filename=filename,
            caption=caption,
        )
        
        if send_result.get("success"):
            logger.info(f"✅ Invoice sent to {customer_phone} for order {order_id}")
            result["sent"] = True
            result["message_id"] = send_result.get("message_id")
            result["media_id"] = send_result.get("media_id")
        else:
            logger.error(f"❌ Failed to send invoice: {send_result.get('error')}")
            result["error"] = send_result.get("error")
            
            # Retry if Celery available
            if CELERY_AVAILABLE and self and hasattr(self, 'retry'):
                raise Exception(send_result.get("error", "WhatsApp send failed"))
        
        # Step 5: Discard PDF bytes (auto - goes out of scope)
        del pdf_bytes
        
    except ImportError as e:
        logger.error(f"Invoice module import failed: {e}")
        result["error"] = f"Import error: {e}"
    except Exception as e:
        logger.error(f"Invoice send failed for order {order_id}: {e}")
        result["error"] = str(e)
        
        if CELERY_AVAILABLE and self and hasattr(self, 'retry'):
            raise self.retry(exc=e)
    
    return result


def _get_whatsapp_credentials(user_id: str) -> Optional[Dict[str, str]]:
    """
    Get WhatsApp credentials for a business.
    
    This follows the table chain:
    connected_phone_numbers → connected_whatsapp_accounts → 
    connected_business_managers → connected_facebook_accounts
    
    CRITICAL: The connected_phone_numbers table uses Supabase UUIDs,
    so we must resolve Firebase UIDs first.
    """
    try:
        from supabase_client import get_supabase_client, resolve_user_id
        
        client = get_supabase_client()
        if not client:
            return None
        
        # CRITICAL: Resolve Firebase UID → Supabase UUID
        # The connected_phone_numbers table uses Supabase UUIDs in the user_id column
        resolved_user_id = resolve_user_id(user_id)
        if not resolved_user_id:
            logger.warning(f"Cannot get WhatsApp credentials: no Supabase UUID for {user_id[:15]}...")
            return None
        
        # Step 1: Find the phone number for this user
        # user_id was Firebase UID, now resolved to Supabase UUID
        phone_result = client.table("connected_phone_numbers").select(
            "phone_number_id, display_phone_number, whatsapp_account_id"
        ).eq("user_id", resolved_user_id).eq("is_active", True).limit(1).execute()
        
        if not phone_result.data:
            logger.warning(f"No connected phone numbers for user {user_id}")
            return None
        
        phone_data = phone_result.data[0]
        phone_number_id = phone_data.get("phone_number_id")
        whatsapp_account_id = phone_data.get("whatsapp_account_id")
        
        # Step 2: Get WhatsApp account to find business manager
        waba_result = client.table("connected_whatsapp_accounts").select(
            "business_manager_id"
        ).eq("id", whatsapp_account_id).eq("is_active", True).single().execute()
        
        if not waba_result.data:
            logger.warning(f"No WhatsApp account for phone {phone_number_id}")
            return None
        
        business_manager_id = waba_result.data.get("business_manager_id")
        
        # Step 3: Get business manager to find Facebook account
        bm_result = client.table("connected_business_managers").select(
            "facebook_account_id"
        ).eq("id", business_manager_id).eq("is_active", True).single().execute()
        
        if not bm_result.data:
            logger.warning("No business manager found")
            return None
        
        facebook_account_id = bm_result.data.get("facebook_account_id")
        
        # Step 4: Get Facebook account with access token
        fb_result = client.table("connected_facebook_accounts").select(
            "access_token"
        ).eq("id", facebook_account_id).single().execute()
        
        if not fb_result.data or not fb_result.data.get("access_token"):
            logger.warning("No access token found")
            return None
        
        access_token = fb_result.data.get("access_token")
        
        # Try to decrypt the token if crypto is available
        try:
            from crypto_utils import decrypt_token
            decrypted = decrypt_token(access_token)
            if decrypted:
                access_token = decrypted
        except ImportError:
            pass  # crypto_utils not available, use token as-is
        except Exception as e:
            logger.warning(f"Token decryption failed: {e}")
        
        return {
            "phone_number_id": phone_number_id,
            "access_token": access_token,
            "business_phone": phone_data.get("display_phone_number"),
        }
        
    except Exception as e:
        logger.warning(f"Failed to get WhatsApp credentials for {user_id}: {e}")
        return None

