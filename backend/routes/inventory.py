"""
Inventory API Routes - Stock Management Endpoints
Provides endpoints for stock validation, reservation, and confirmation.

Endpoints:
- POST /api/inventory/reserve - Reserve stock for checkout
- POST /api/inventory/confirm - Confirm reservation (payment success)
- POST /api/inventory/release - Release reservation (payment failed)
- GET /api/inventory/<product_id> - Get stock availability
"""

import logging
from flask import Blueprint, request, jsonify, g
from typing import Optional, List

from domain import (
    StockItem,
    InsufficientStockError,
    ReservationError,
    ReservationExpiredError,
    ValidationError,
    ErrorCode,
)
from services.inventory_service import get_inventory_service
from routes.orders import handle_domain_errors, api_response, get_correlation_id

logger = logging.getLogger('reviseit.routes.inventory')

inventory_bp = Blueprint('inventory', __name__)


# =============================================================================
# RESERVE STOCK
# =============================================================================

@inventory_bp.route('/api/inventory/reserve', methods=['POST'])
@handle_domain_errors
def reserve_stock():
    """
    Reserve stock for checkout.
    
    Request:
    {
        "user_id": "business_owner_id",
        "session_id": "checkout_session_123",
        "source": "website" | "whatsapp" | "admin",
        "items": [
            {
                "product_id": "uuid",
                "variant_id": "uuid" (optional),
                "size": "M" (optional),
                "color": "Red" (optional),
                "name": "T-Shirt",
                "quantity": 2
            }
        ]
    }
    
    Response (success):
    {
        "success": true,
        "data": {
            "reservation_ids": ["uuid1", "uuid2"],
            "expires_at": "2024-01-30T12:15:00Z"
        }
    }
    
    Response (insufficient stock):
    {
        "success": false,
        "error": {
            "code": "INSUFFICIENT_STOCK",
            "message": "Only 2 units of T-Shirt (Red / M) available...",
            "insufficient_items": [...]
        }
    }
    """
    correlation_id = get_correlation_id()
    data = request.get_json()
    
    if not data:
        raise ValidationError(
            message="Request body required",
            code=ErrorCode.INVALID_INPUT,
            correlation_id=correlation_id
        )
    
    user_id = data.get('user_id')
    session_id = data.get('session_id')
    source = data.get('source', 'website')
    items_data = data.get('items', [])
    
    if not user_id:
        raise ValidationError(
            message="user_id is required",
            code=ErrorCode.MISSING_FIELD,
            correlation_id=correlation_id
        )
    
    if not session_id:
        raise ValidationError(
            message="session_id is required",
            code=ErrorCode.MISSING_FIELD,
            correlation_id=correlation_id
        )
    
    if not items_data:
        raise ValidationError(
            message="At least one item is required",
            code=ErrorCode.INVALID_INPUT,
            correlation_id=correlation_id
        )
    
    # Convert to StockItem objects
    items = []
    for item in items_data:
        if not item.get('product_id'):
            raise ValidationError(
                message="product_id is required for each item",
                code=ErrorCode.MISSING_FIELD,
                correlation_id=correlation_id
            )
        
        items.append(StockItem(
            product_id=item['product_id'],
            name=item.get('name', 'Unknown'),
            quantity=item.get('quantity', 1),
            variant_id=item.get('variant_id'),
            size=item.get('size'),
            color=item.get('color'),
            price=item.get('price'),
        ))
    
    service = get_inventory_service()
    
    result = service.validate_and_reserve(
        user_id=user_id,
        items=items,
        source=source,
        session_id=session_id,
        correlation_id=correlation_id
    )
    
    if not result.success:
        raise InsufficientStockError(
            message=result.message,
            insufficient_items=result.insufficient_items,
            correlation_id=correlation_id
        )
    
    return api_response(
        success=True,
        data={
            'reservation_ids': result.reservation_ids,
            'expires_at': result.expires_at.isoformat() if result.expires_at else None,
        },
        meta={'message': 'Stock reserved successfully'},
        status_code=200
    )


# =============================================================================
# CONFIRM RESERVATION (Payment Success)
# =============================================================================

@inventory_bp.route('/api/inventory/confirm', methods=['POST'])
@handle_domain_errors
def confirm_reservation():
    """
    Confirm reservation and deduct actual stock.
    Called when payment succeeds.
    
    Request:
    {
        "reservation_ids": ["uuid1", "uuid2"],
        "order_id": "order_uuid",
        "idempotency_key": "payment:razorpay_abc123"
    }
    """
    correlation_id = get_correlation_id()
    data = request.get_json()
    
    if not data:
        raise ValidationError(
            message="Request body required",
            correlation_id=correlation_id
        )
    
    reservation_ids = data.get('reservation_ids', [])
    order_id = data.get('order_id')
    idempotency_key = data.get('idempotency_key')
    
    if not reservation_ids:
        raise ValidationError(
            message="reservation_ids is required",
            correlation_id=correlation_id
        )
    
    if not order_id:
        raise ValidationError(
            message="order_id is required",
            correlation_id=correlation_id
        )
    
    if not idempotency_key:
        # Generate one from order_id if not provided
        idempotency_key = f"order:{order_id}:confirm"
    
    service = get_inventory_service()
    
    result = service.confirm_reservation(
        reservation_ids=reservation_ids,
        order_id=order_id,
        idempotency_key=idempotency_key,
        correlation_id=correlation_id
    )
    
    return api_response(
        success=True,
        data={'confirmed': result},
        meta={'message': 'Stock confirmed successfully'},
        status_code=200
    )


# =============================================================================
# RELEASE RESERVATION (Payment Failed / Cancel)
# =============================================================================

@inventory_bp.route('/api/inventory/release', methods=['POST'])
@handle_domain_errors
def release_reservation():
    """
    Release reservation without deducting stock.
    Called when payment fails or user abandons checkout.
    
    Request:
    {
        "reservation_ids": ["uuid1", "uuid2"],
        "reason": "payment_failed" | "timeout" | "cancelled" | "user_abandoned"
    }
    """
    correlation_id = get_correlation_id()
    data = request.get_json()
    
    if not data:
        raise ValidationError(
            message="Request body required",
            correlation_id=correlation_id
        )
    
    reservation_ids = data.get('reservation_ids', [])
    reason = data.get('reason', 'user_abandoned')
    
    if not reservation_ids:
        raise ValidationError(
            message="reservation_ids is required",
            correlation_id=correlation_id
        )
    
    service = get_inventory_service()
    
    result = service.release_reservation(
        reservation_ids=reservation_ids,
        reason=reason,
        correlation_id=correlation_id
    )
    
    return api_response(
        success=True,
        data={'released': result},
        meta={'message': 'Reservations released successfully'},
        status_code=200
    )


# =============================================================================
# GET STOCK AVAILABILITY
# =============================================================================

@inventory_bp.route('/api/inventory/<product_id>', methods=['GET'])
@handle_domain_errors
def get_stock(product_id):
    """
    Get stock availability for a product/variant/size.
    
    Query params:
    - user_id: Business owner ID (required)
    - variant_id: Variant UUID (optional)
    - size: Size string (optional)
    
    Response:
    {
        "success": true,
        "data": {
            "product_id": "uuid",
            "variant_id": "uuid",
            "size": "M",
            "available": 10,
            "reserved": 2,
            "effective_available": 8
        }
    }
    """
    correlation_id = get_correlation_id()
    
    user_id = request.args.get('user_id')
    variant_id = request.args.get('variant_id')
    size = request.args.get('size')
    
    if not user_id:
        raise ValidationError(
            message="user_id query parameter is required",
            correlation_id=correlation_id
        )
    
    service = get_inventory_service()
    
    stock = service.get_stock(
        user_id=user_id,
        product_id=product_id,
        variant_id=variant_id,
        size=size
    )
    
    return api_response(
        success=True,
        data={
            'product_id': stock.product_id,
            'variant_id': stock.variant_id,
            'size': stock.size,
            'available': stock.available,
            'reserved': stock.reserved,
            'effective_available': stock.effective_available,
        },
        status_code=200
    )


# =============================================================================
# VALIDATE STOCK (No reservation, just check)
# =============================================================================

@inventory_bp.route('/api/inventory/validate', methods=['POST'])
@handle_domain_errors
def validate_stock():
    """
    Validate stock availability without creating reservations.
    Useful for cart validation before checkout.
    
    Request:
    {
        "user_id": "business_owner_id",
        "items": [
            {
                "product_id": "uuid",
                "variant_id": "uuid",
                "size": "M",
                "name": "T-Shirt",
                "quantity": 2
            }
        ]
    }
    """
    correlation_id = get_correlation_id()
    data = request.get_json()
    
    if not data:
        raise ValidationError(
            message="Request body required",
            correlation_id=correlation_id
        )
    
    user_id = data.get('user_id')
    items_data = data.get('items', [])
    
    if not user_id:
        raise ValidationError(
            message="user_id is required",
            correlation_id=correlation_id
        )
    
    # Convert to StockItem objects
    items = [
        StockItem(
            product_id=item['product_id'],
            name=item.get('name', 'Unknown'),
            quantity=item.get('quantity', 1),
            variant_id=item.get('variant_id'),
            size=item.get('size'),
            color=item.get('color'),
        )
        for item in items_data
        if item.get('product_id')
    ]
    
    service = get_inventory_service()
    
    result = service.validate_stock(
        user_id=user_id,
        items=items,
        correlation_id=correlation_id
    )
    
    if result.success:
        return api_response(
            success=True,
            data={'valid': True, 'message': 'All items available'},
            status_code=200
        )
    else:
        return api_response(
            success=False,
            data={
                'valid': False,
                'message': result.message,
                'insufficient_items': [
                    {
                        'product_id': item.product_id,
                        'variant_id': item.variant_id,
                        'size': item.size,
                        'name': item.name,
                        'requested': item.requested,
                        'available': item.available,
                    }
                    for item in result.insufficient_items
                ]
            },
            status_code=422
        )
