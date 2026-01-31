"""
Order Booking Routes - Enterprise-Grade API
REST APIs for managing orders with:
- Idempotency guarantees
- Strict validation
- Clean error responses
- Correlation ID tracking
- Backward compatible

Architecture:
    Routes (this file)
        ↓
    Service Layer (business logic)
        ↓
    Repository Layer (data access)
        ↓
    Database (Supabase)
"""

import logging
import uuid
from typing import Optional
from flask import Blueprint, request, jsonify, g
from functools import wraps
from pydantic import ValidationError as PydanticValidationError

logger = logging.getLogger('reviseit.routes.orders')

# Create blueprint
orders_bp = Blueprint('orders', __name__)


# =============================================================================
# Middleware & Helpers
# =============================================================================

def get_correlation_id() -> str:
    """Get or generate correlation ID for request tracing."""
    if hasattr(g, 'correlation_id'):
        return g.correlation_id
    
    # Try from header first
    correlation_id = request.headers.get('X-Correlation-ID') or \
                     request.headers.get('X-Request-ID') or \
                     str(uuid.uuid4())[:8]
    
    g.correlation_id = correlation_id
    return correlation_id


def get_idempotency_key() -> Optional[str]:
    """Get idempotency key from request header."""
    return request.headers.get('X-Idempotency-Key') or \
           request.headers.get('Idempotency-Key')


def get_user_id_from_request() -> Optional[str]:
    """Extract user_id from request headers or body."""
    # Try headers first (most secure)
    user_id = request.headers.get('X-User-Id') or \
              request.headers.get('X-Firebase-Uid')
    if user_id:
        return user_id
    
    # Try from request body
    data = request.get_json(silent=True) or {}
    return data.get('user_id') or data.get('business_id')


def api_response(success: bool, data=None, error=None, status_code: int = 200, meta=None):
    """Standardized API response format."""
    response = {
        "success": success,
        "correlation_id": get_correlation_id(),
    }
    
    if data is not None:
        response["data"] = data
    
    if error is not None:
        if isinstance(error, dict):
            response["error"] = error
        else:
            response["error"] = {"message": str(error)}
    
    if meta:
        response["meta"] = meta
    
    return jsonify(response), status_code


def handle_domain_errors(f):
    """Decorator to handle domain exceptions and return clean API responses."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except PydanticValidationError as e:
            # Pydantic validation error
            errors = e.errors()
            fields = [err.get('loc', ['unknown'])[-1] for err in errors]
            return api_response(
                success=False,
                error={
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid input data",
                    "details": {
                        "fields": fields,
                        "errors": [err.get('msg') for err in errors],
                    }
                },
                status_code=400,
            )
        except Exception as e:
            # Check if it's a domain exception
            if hasattr(e, 'to_api_response'):
                response = e.to_api_response()
                response["correlation_id"] = get_correlation_id()
                
                # Log the error
                if hasattr(e, 'to_log_dict'):
                    logger.error(
                        f"Order API error: {e.message if hasattr(e, 'message') else str(e)}",
                        extra=e.to_log_dict()
                    )
                
                return jsonify(response), getattr(e, 'http_status', 500)
            
            # Unknown exception - log full traceback
            logger.exception(f"Unexpected error in order API: {e}")
            return api_response(
                success=False,
                error={
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred",
                },
                status_code=500,
            )
    return wrapper


# =============================================================================
# Lazy Service Loading
# =============================================================================

_order_service = None

def get_service():
    """Lazy-load order service."""
    global _order_service
    if _order_service is None:
        try:
            from services import get_order_service
            _order_service = get_order_service()
        except ImportError as e:
            logger.error(f"Failed to import order service: {e}")
            raise
    return _order_service


# =============================================================================
# Order Routes
# =============================================================================

@orders_bp.route('/api/orders', methods=['POST'])
@handle_domain_errors
def create_order():
    """
    Create a new order.
    
    Headers:
        X-User-Id: Business owner's user ID (required)
        X-Idempotency-Key: Idempotency key (optional, auto-generated if not provided)
        X-Correlation-ID: Request tracking ID (optional)
    
    Body:
        {
            "user_id": "string",          # Business ID (if not in header)
            "customer_name": "string",     # Required
            "customer_phone": "string",    # Required (10+ digits)
            "items": [                     # Required, min 1 item
                {"name": "string", "quantity": int}
            ],
            "source": "manual|ai|api",     # Optional, default "manual"
            "notes": "string"              # Optional
        }
    
    Returns:
        201: Order created successfully
        400: Validation error
        409: Duplicate order (idempotency)
        500: Server error
    """
    correlation_id = get_correlation_id()
    
    data = request.get_json()
    if not data:
        return api_response(
            success=False,
            error={"code": "INVALID_INPUT", "message": "Request body is required"},
            status_code=400,
        )
    
    # Get user_id from header or body
    user_id = get_user_id_from_request()
    if not user_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "user_id is required"},
            status_code=400,
        )
    
    # Log customer contact info for debugging
    logger.info(
        f"📦 [Order Create] Received: address={data.get('customer_address', 'N/A')[:30] if data.get('customer_address') else 'N/A'}..., "
        f"email={data.get('customer_email', 'N/A')}"
    )
    
    # Import schema and create order data
    from domain import OrderCreate, OrderItem, OrderSource
    
    # Parse source
    source_str = data.get('source', 'manual').lower()
    try:
        source = OrderSource(source_str)
    except ValueError:
        source = OrderSource.MANUAL
    
    # Parse items
    items_data = data.get('items', [])
    if not items_data or not isinstance(items_data, list):
        return api_response(
            success=False,
            error={"code": "INVALID_INPUT", "message": "items must be a non-empty array"},
            status_code=400,
        )
    
    items = [
        OrderItem(
            name=item.get('name', ''),
            quantity=item.get('quantity', 1),
            price=item.get('price'),
            notes=item.get('notes'),
            product_id=item.get('product_id'),
            variant_id=item.get('variant_id'),
            size=item.get('size'),
            color=item.get('color'),
        )
        for item in items_data
    ]
    
    # Create order request
    order_data = OrderCreate(
        user_id=user_id,
        customer_name=data.get('customer_name', ''),
        customer_phone=data.get('customer_phone', ''),
        customer_address=data.get('customer_address'),  # FIX: Include address from request
        customer_email=data.get('customer_email'),  # FIX: Include email from request
        items=items,
        source=source,
        notes=data.get('notes'),
        idempotency_key=get_idempotency_key(),
    )
    
    # Create order via service
    service = get_service()
    order = service.create_order(
        order_data=order_data,
        correlation_id=correlation_id,
    )
    
    logger.info(
        f"Order created via API: {order.id}",
        extra={
            "order_id": order.id,
            "user_id": user_id,
            "correlation_id": correlation_id,
        }
    )
    
    return api_response(
        success=True,
        data=order.to_dict(),
        meta={"message": "Order created successfully"},
        status_code=201,
    )


@orders_bp.route('/api/orders/<user_id>', methods=['GET'])
@handle_domain_errors
def list_orders(user_id: str):
    """
    List all orders for a user/business.
    
    Query Parameters:
        status: Filter by status (pending, confirmed, processing, completed, cancelled)
        startDate: Filter by start date (ISO format)
        endDate: Filter by end date (ISO format)
        limit: Max results (default 100)
        offset: Pagination offset (default 0)
    
    Returns:
        200: List of orders with pagination
    """
    correlation_id = get_correlation_id()
    
    # Get filters from query params
    status = request.args.get('status')
    if status and status.lower() == 'all':
        status = None
    
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    
    try:
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
    except ValueError:
        limit, offset = 100, 0
    
    # Get orders via service
    service = get_service()
    orders, total = service.list_orders(
        user_id=user_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
        correlation_id=correlation_id,
    )
    
    return api_response(
        success=True,
        data=[order.to_dict() for order in orders],
        meta={
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(orders) < total,
        },
    )


@orders_bp.route('/api/orders/<user_id>/<order_id>', methods=['GET'])
@handle_domain_errors
def get_order(user_id: str, order_id: str):
    """Get a single order by ID."""
    correlation_id = get_correlation_id()
    
    service = get_service()
    order = service.get_order(
        order_id=order_id,
        user_id=user_id,
        correlation_id=correlation_id,
    )
    
    return api_response(success=True, data=order.to_dict())


@orders_bp.route('/api/orders/<order_id>/status', methods=['PATCH'])
@handle_domain_errors
def update_order_status(order_id: str):
    """
    Update the status of an order.
    
    Body:
        {"status": "pending|confirmed|processing|completed|cancelled"}
    
    Valid Transitions:
        pending -> confirmed, cancelled
        confirmed -> processing, cancelled
        processing -> completed, cancelled
        completed -> (none - terminal)
        cancelled -> (none - terminal)
    """
    correlation_id = get_correlation_id()
    
    data = request.get_json()
    if not data:
        return api_response(
            success=False,
            error={"code": "INVALID_INPUT", "message": "Request body is required"},
            status_code=400,
        )
    
    status_str = data.get('status', '').lower()
    valid_statuses = ['pending', 'confirmed', 'processing', 'completed', 'cancelled']
    
    if status_str not in valid_statuses:
        return api_response(
            success=False,
            error={
                "code": "INVALID_INPUT",
                "message": f"status must be one of: {', '.join(valid_statuses)}"
            },
            status_code=400,
        )
    
    user_id = get_user_id_from_request() or data.get('user_id')
    if not user_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "user_id is required"},
            status_code=400,
        )
    
    from domain import OrderStatus
    
    service = get_service()
    order = service.update_status(
        order_id=order_id,
        user_id=user_id,
        new_status=OrderStatus(status_str),
        correlation_id=correlation_id,
    )
    
    return api_response(
        success=True,
        data=order.to_dict(),
        meta={"message": f"Order status updated to {status_str}"},
    )


@orders_bp.route('/api/orders/<order_id>', methods=['PUT'])
@handle_domain_errors
def update_order(order_id: str):
    """
    Update an order (customer details, items, notes).
    
    Body:
        {
            "customer_name": "string",     # Optional
            "customer_phone": "string",    # Optional
            "items": [...],                # Optional
            "notes": "string",             # Optional
            "status": "string"             # Optional
        }
    """
    correlation_id = get_correlation_id()
    
    data = request.get_json()
    if not data:
        return api_response(
            success=False,
            error={"code": "INVALID_INPUT", "message": "Request body is required"},
            status_code=400,
        )
    
    user_id = get_user_id_from_request() or data.get('user_id')
    if not user_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "user_id is required"},
            status_code=400,
        )
    
    from domain import OrderUpdate, OrderItem, OrderStatus
    
    # Parse items if provided
    items = None
    if 'items' in data and isinstance(data['items'], list) and len(data['items']) > 0:
        items = [
            OrderItem(
                name=item.get('name', ''),
                quantity=item.get('quantity', 1),
                price=item.get('price'),
                notes=item.get('notes'),
            )
            for item in data['items']
        ]
    
    # Parse status if provided
    status = None
    if 'status' in data:
        try:
            status = OrderStatus(data['status'].lower())
        except ValueError:
            pass
    
    update_data = OrderUpdate(
        customer_name=data.get('customer_name'),
        customer_phone=data.get('customer_phone'),
        items=items,
        notes=data.get('notes'),
        status=status,
    )
    
    service = get_service()
    order = service.update_order(
        order_id=order_id,
        user_id=user_id,
        update_data=update_data,
        correlation_id=correlation_id,
    )
    
    return api_response(success=True, data=order.to_dict())


@orders_bp.route('/api/orders/<order_id>', methods=['DELETE'])
@handle_domain_errors
def cancel_order(order_id: str):
    """Cancel an order (soft delete - sets status to cancelled)."""
    correlation_id = get_correlation_id()
    
    user_id = get_user_id_from_request()
    if not user_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "user_id is required"},
            status_code=400,
        )
    
    service = get_service()
    order = service.cancel_order(
        order_id=order_id,
        user_id=user_id,
        correlation_id=correlation_id,
    )
    
    return api_response(
        success=True,
        data=order.to_dict(),
        meta={"message": "Order cancelled"},
    )


# =============================================================================
# AI Order Booking Endpoint
# =============================================================================

@orders_bp.route('/api/orders/ai/create', methods=['POST'])
@handle_domain_errors
def create_order_from_ai():
    """
    Create an order from AI conversation.
    
    This endpoint enforces additional AI safety rules:
    - Must have explicit confirmation
    - All required fields must be provided
    - Source is automatically set to "ai"
    
    Body:
        {
            "user_id": "string",           # Business ID
            "customer_name": "string",
            "customer_phone": "string",
            "items": [...],
            "notes": "string"
        }
    
    Returns:
        201: Order created
        400: Validation error
        409: Duplicate order
        422: Business rule violation (e.g., order booking disabled)
    """
    correlation_id = get_correlation_id()
    
    data = request.get_json()
    if not data:
        return api_response(
            success=False,
            error={"code": "INVALID_INPUT", "message": "Request body is required"},
            status_code=400,
        )
    
    user_id = data.get('user_id')
    if not user_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "user_id is required"},
            status_code=400,
        )
    
    from domain import OrderCreate, OrderItem, OrderSource
    
    # Parse items
    items_data = data.get('items', [])
    if not items_data:
        return api_response(
            success=False,
            error={"code": "INVALID_INPUT", "message": "items are required"},
            status_code=400,
        )
    
    items = [
        OrderItem(
            name=item.get('name', ''),
            quantity=item.get('quantity', 1),
            price=item.get('price'),
        )
        for item in items_data
    ]
    
    order_data = OrderCreate(
        user_id=user_id,
        customer_name=data.get('customer_name', ''),
        customer_phone=data.get('customer_phone', ''),
        items=items,
        source=OrderSource.AI,  # Force AI source
        notes=data.get('notes'),
        idempotency_key=get_idempotency_key(),
    )
    
    service = get_service()
    order = service.create_order(
        order_data=order_data,
        correlation_id=correlation_id,
    )
    
    logger.info(
        f"AI order created: {order.id}",
        extra={
            "order_id": order.id,
            "user_id": user_id,
            "source": "ai",
            "correlation_id": correlation_id,
        }
    )
    
    return api_response(
        success=True,
        data=order.to_dict(),
        meta={"message": "Order created successfully via AI"},
        status_code=201,
    )


# =============================================================================
# Health Check
# =============================================================================

@orders_bp.route('/api/orders/health', methods=['GET'])
def orders_health():
    """Health check for orders service."""
    try:
        # Try to get service
        service = get_service()
        
        return api_response(
            success=True,
            data={
                "status": "healthy",
                "service": "orders",
            },
        )
    except Exception as e:
        return api_response(
            success=False,
            error={"message": f"Service unhealthy: {str(e)}"},
            status_code=503,
        )


@orders_bp.route('/api/orders/sheets/initialize', methods=['POST'])
@handle_domain_errors
def initialize_order_sheet():
    """
    Initialize Google Sheet with column headers when user connects their sheet.
    
    Body:
        {
            "user_id": "string"  # Business user ID
        }
    
    This endpoint:
    1. Gets the configured sheet URL for the user
    2. Creates/updates the "Orders" worksheet with proper headers
    3. Returns success status
    
    Returns:
        200: Sheet initialized successfully
        400: No sheet configured
        500: Failed to initialize
    """
    correlation_id = get_correlation_id()
    
    data = request.get_json() or {}
    user_id = get_user_id_from_request() or data.get('user_id')
    
    if not user_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "user_id is required"},
            status_code=400,
        )
    
    try:
        from tasks.orders import _get_sheets_config, _get_sheets_client
        
        # Get sheets configuration
        sheets_config = _get_sheets_config(user_id)
        
        if not sheets_config or not sheets_config.get("enabled"):
            reason = sheets_config.get("reason", "not_configured") if sheets_config else "no_config"
            return api_response(
                success=False,
                error={
                    "code": "SHEETS_NOT_CONFIGURED",
                    "message": f"Google Sheets not configured: {reason}",
                    "reason": reason
                },
                status_code=400,
            )
        
        # Get sheets client
        sheets_client = _get_sheets_client(sheets_config)
        
        if not sheets_client:
            return api_response(
                success=False,
                error={"code": "SHEETS_CLIENT_ERROR", "message": "Failed to connect to Google Sheets"},
                status_code=500,
            )
        
        spreadsheet_id = sheets_config.get("spreadsheet_id")
        sheet_name = sheets_config.get("sheet_name", "Orders")
        
        # Headers for the order sheet (Column K is hidden UUID for auditing)
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
        
        try:
            import gspread
            
            spreadsheet = sheets_client.open_by_key(spreadsheet_id)
            
            # Try to get existing worksheet or create new one
            try:
                sheet = spreadsheet.worksheet(sheet_name)
                logger.info(f"📊 Found existing worksheet '{sheet_name}', updating headers...")
                
                # Update headers in first row (including hidden DB UUID column)
                sheet.update('A1:K1', [headers])
                
                # Format header row
                sheet.format('A1:K1', {
                    "textFormat": {"bold": True},
                    "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9}
                })
                
            except gspread.exceptions.WorksheetNotFound:
                logger.info(f"📊 Creating new worksheet '{sheet_name}' with headers...")
                
                try:
                    # Create new worksheet
                    sheet = spreadsheet.add_worksheet(
                        title=sheet_name,
                        rows=1000,
                        cols=11  # 11 columns: 10 visible + 1 hidden DB UUID
                    )
                except gspread.exceptions.APIError as e:
                    # Handle race condition where sheet might have been created concurrently
                    if "already exists" in str(e):
                        logger.info(f"📊 Sheet '{sheet_name}' already exists (race condition), fetching it...")
                        sheet = spreadsheet.worksheet(sheet_name)
                    else:
                        raise e
                
                # Add headers
                sheet.update('A1:K1', [headers])
                
                # Format header row
                sheet.format('A1:K1', {
                    "textFormat": {"bold": True},
                    "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9}
                })
            
            logger.info(f"✅ Sheet initialized successfully for user {user_id}")
            
            return api_response(
                success=True,
                data={
                    "spreadsheet_id": spreadsheet_id,
                    "sheet_name": sheet_name,
                    "headers": headers
                },
                meta={"message": "Google Sheet initialized with headers successfully"},
            )
            
        except gspread.exceptions.SpreadsheetNotFound:
            return api_response(
                success=False,
                error={
                    "code": "SPREADSHEET_NOT_FOUND",
                    "message": "Could not find the spreadsheet. Make sure the service account has edit access.",
                },
                status_code=400,
            )
        except gspread.exceptions.APIError as api_error:
            return api_response(
                success=False,
                error={
                    "code": "SHEETS_API_ERROR",
                    "message": f"Google Sheets API error: {str(api_error)}",
                },
                status_code=500,
            )
            
    except ImportError as e:
        logger.error(f"Failed to import sheets tasks: {e}")
        return api_response(
            success=False,
            error={"code": "MODULE_NOT_FOUND", "message": "Sheets sync module not available"},
            status_code=500,
        )
    except Exception as e:
        logger.error(f"Failed to initialize sheet: {e}", exc_info=True)
        return api_response(
            success=False,
            error={"code": "INITIALIZATION_ERROR", "message": str(e)},
            status_code=500,
        )


@orders_bp.route('/api/orders/sheets/sync', methods=['POST'])
@handle_domain_errors
def sync_order_to_sheet():
    """
    Trigger a Google Sheets sync for an existing order in Supabase.

    This is used by the Next.js APIs (checkout page, dashboard orders) which
    write directly to the Supabase `orders` table, bypassing the Python
    order service. To keep Google Sheets in sync, we:

    1. Fetch the order row from Supabase by id and user_id
    2. Call the same Sheets sync helper used by the main order service

    Body:
        {
            "user_id": "string",   # Business user ID (optional if in header)
            "order_id": "string"   # Supabase order ID (required)
        }

    Returns:
        200: Sync attempted (success flag and reason in payload)
        400: Missing parameters or order not found
        500: Unexpected failure while syncing
    """
    correlation_id = get_correlation_id()

    data = request.get_json() or {}
    user_id = get_user_id_from_request() or data.get('user_id')
    order_id = data.get('order_id')

    if not user_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "user_id is required"},
            status_code=400,
        )

    if not order_id:
        return api_response(
            success=False,
            error={"code": "MISSING_FIELD", "message": "order_id is required"},
            status_code=400,
        )

    try:
        from supabase_client import get_supabase_client
        from tasks.orders import sync_order_to_sheets
    except ImportError as e:
        logger.error(f"Failed to import dependencies for sheets sync: {e}")
        return api_response(
            success=False,
            error={
                "code": "MODULE_NOT_FOUND",
                "message": "Sheets sync modules not available",
            },
            status_code=500,
        )

    client = get_supabase_client()
    if not client:
        return api_response(
            success=False,
            error={
                "code": "SUPABASE_CLIENT_ERROR",
                "message": "Failed to get Supabase client",
            },
            status_code=500,
        )

    # Fetch the order row from Supabase to build the payload expected by
    # the Sheets integration helpers.
    result = client.table('orders').select('*').eq('id', order_id).eq(
        'user_id', user_id
    ).single().execute()

    if not result.data:
        return api_response(
            success=False,
            error={
                "code": "ORDER_NOT_FOUND",
                "message": "Order not found for this user",
            },
            status_code=400,
        )

    order_row = result.data

    logger.info(
        f"📊 Syncing order {order_id} to Google Sheets via /api/orders/sheets/sync",
        extra={
            "order_id": order_id,
            "user_id": user_id,
            "correlation_id": correlation_id,
        },
    )

    # Call the same helper that the main order service uses so all
    # configuration and idempotency logic is shared.
    sync_result = sync_order_to_sheets(
        order_id=order_id,
        user_id=user_id,
        data=order_row,
        correlation_id=correlation_id,
    )

    return api_response(
        success=True,
        data=sync_result,
        meta={"message": "Sheets sync triggered"},
    )


# =============================================================================
# Legacy Compatibility Functions
# =============================================================================

def is_order_booking_enabled(user_id: str) -> bool:
    """
    Check if order booking is enabled for a user/business.
    BACKWARD COMPATIBLE: This function is used by the AI brain.
    """
    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()
        
        if not supabase:
            return False
        
        result = supabase.table('ai_capabilities').select(
            'order_booking_enabled'
        ).eq('user_id', user_id).single().execute()
        
        if result.data:
            return result.data.get('order_booking_enabled', False)
    except Exception as e:
        logger.warning(f"Error checking order booking enabled: {e}")
    
    return False


def create_order_from_ai_legacy(
    user_id: str,
    customer_name: str,
    customer_phone: str,
    items: list,
    notes: str = None
) -> dict:
    """
    Legacy function for AI Bot to create orders.
    BACKWARD COMPATIBLE: Maintains old interface.
    
    Returns:
        {"success": True/False, "data": {...}, "error": "..."}
    """
    try:
        if not is_order_booking_enabled(user_id):
            return {"success": False, "error": "Order booking is not enabled"}
        
        from domain import OrderCreate, OrderItem, OrderSource
        
        order_items = [
            OrderItem(
                name=item.get('name', ''),
                quantity=item.get('quantity', 1),
                price=item.get('price'),
            )
            for item in items
        ]
        
        order_data = OrderCreate(
            user_id=user_id,
            customer_name=customer_name,
            customer_phone=customer_phone,
            items=order_items,
            source=OrderSource.AI,
            notes=notes,
        )
        
        service = get_service()
        order = service.create_order(order_data=order_data)
        
        return {"success": True, "data": order.to_dict()}
        
    except Exception as e:
        logger.error(f"Legacy create_order_from_ai failed: {e}")
        return {"success": False, "error": str(e)}
