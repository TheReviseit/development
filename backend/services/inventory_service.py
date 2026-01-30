"""
Inventory Service - Centralized Stock Management
Implements Reserve → Confirm → Release pattern for enterprise-grade inventory.

╔══════════════════════════════════════════════════════════════════════════════╗
║  SINGLE SOURCE OF TRUTH                                                       ║
║  This InventoryService is the ONLY authority allowed to mutate stock.        ║
║  Direct writes to product_variants.size_stocks outside this service are      ║
║  FORBIDDEN and will cause data inconsistencies.                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

CRITICAL INVARIANT:
    Stock is deducted ONLY during confirm_reservation().
    No other code path reduces stock.
    Stock is intentionally not deducted until payment confirmation.

Features:
- Atomic stock validation and reservation
- Configurable TTL per source channel
- Idempotent operations
- Full observability via audit logs
- SKIP LOCKED for deadlock prevention

Non-Goals (Intentional):
- No guarantee of fairness under extreme contention (throughput > ordering)
- No indefinite reservations (TTL prevents phantom holds)
- Frontend stock checks are advisory only (backend is authoritative)
"""


import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from domain import (
    StockItem,
    StockAvailability,
    InsufficientStockItem,
    Reservation,
    ReservationStatus,
    ReservationSource,
    InventoryAction,
    ValidationResult,
    ReservationResult,
    InsufficientStockError,
    ReservationError,
    ReservationExpiredError,
    DuplicateReservationError,
    get_ttl_for_source,
    calculate_expiry,
    RESERVATION_TTL_BY_SOURCE,
    SystemError,
    ErrorCode,
)
from repository import InventoryRepository, get_inventory_repository


logger = logging.getLogger('reviseit.service.inventory')


class InventoryService:
    """
    Centralized inventory authority with Reserve→Confirm→Release pattern.
    
    Usage:
        service = get_inventory_service()
        
        # Step 1: Reserve stock (during checkout initiation)
        result = service.validate_and_reserve(
            user_id="business_123",
            items=[StockItem(product_id="...", quantity=2, ...)],
            source="website",
            session_id="checkout_abc"
        )
        
        # Step 2a: On payment success - Confirm
        service.confirm_reservation(
            reservation_ids=result.reservation_ids,
            order_id="order_456",
            idempotency_key="payment:razorpay_xyz"
        )
        
        # Step 2b: On payment failure - Release
        service.release_reservation(
            reservation_ids=result.reservation_ids,
            reason="payment_failed"
        )
    """
    
    def __init__(self, repository: InventoryRepository):
        self.repository = repository
        self.db = repository.db
    
    # =========================================================================
    # STOCK VALIDATION
    # =========================================================================
    
    def validate_stock(
        self,
        user_id: str,
        items: List[StockItem],
        correlation_id: Optional[str] = None
    ) -> ValidationResult:
        """
        Validate stock availability for all items.
        Does NOT create reservations - just checks.
        """
        insufficient = []
        
        for item in items:
            stock = self.repository.get_available_stock(
                user_id=user_id,
                product_id=item.product_id,
                variant_id=item.variant_id,
                size=item.size
            )
            
            effective = stock.available - stock.reserved
            
            if effective < item.quantity:
                insufficient.append(InsufficientStockItem(
                    product_id=item.product_id,
                    variant_id=item.variant_id,
                    size=item.size,
                    color=item.color,
                    name=item.name,
                    requested=item.quantity,
                    available=effective
                ))
        
        if insufficient:
            return ValidationResult.insufficient(insufficient)
        
        return ValidationResult.all_available(items)
    
    # =========================================================================
    # RESERVE STOCK
    # =========================================================================
    
    def validate_and_reserve(
        self,
        user_id: str,
        items: List[StockItem],
        source: str,
        session_id: str,
        correlation_id: Optional[str] = None
    ) -> ReservationResult:
        """
        Validate stock + create reservations atomically.
        Uses batch RPC for best performance.
        
        Args:
            user_id: Business owner ID
            items: List of items to reserve
            source: Channel (website, whatsapp, admin)
            session_id: Checkout or chat session ID
            correlation_id: For tracing
            
        Returns:
            ReservationResult with reservation_ids on success
        """
        if not items:
            return ReservationResult(success=True, message="No items to reserve")
        
        try:
            # CRITICAL: Map source to valid DB values
            # DB constraint allows: 'website', 'whatsapp', 'admin', 'api'
            source_mapping = {
                'cod': 'website',
                'online': 'website',
                'manual': 'admin',
                'ai': 'whatsapp',
                'webhook': 'whatsapp',
            }
            mapped_source = source_mapping.get(source, source)
            if mapped_source not in ('website', 'whatsapp', 'admin', 'api'):
                mapped_source = 'website'
            
            # Use batch RPC for atomic reservation
            ttl = get_ttl_for_source(mapped_source)
            
            items_json = [
                {
                    "product_id": item.product_id,
                    "variant_id": item.variant_id,
                    "size": item.size,
                    "color": item.color,
                    "name": item.name,
                    "quantity": item.quantity
                }
                for item in items
            ]
            
            result = self.db.rpc('reserve_stock_batch', {
                'p_user_id': user_id,
                'p_session_id': session_id,
                'p_source': mapped_source,
                'p_items': items_json,
                'p_ttl_minutes': ttl
            }).execute()
            
            if not result.data:
                raise ReservationError(
                    message="Failed to reserve stock",
                    correlation_id=correlation_id
                )
            
            data = result.data
            
            if not data.get('success'):
                # Validation failed - return insufficient items
                insufficient = [
                    InsufficientStockItem(
                        product_id=item['product_id'],
                        variant_id=item.get('variant_id'),
                        size=item.get('size'),
                        color=item.get('color'),
                        name=item.get('name', 'Unknown'),
                        requested=item['requested'],
                        available=item['available']
                    )
                    for item in data.get('insufficient_items', [])
                ]
                return ReservationResult.failed(insufficient)
            
            # Success - parse reservation IDs
            reservation_ids = [
                r['reservation_id'] for r in data.get('reservations', [])
            ]
            
            expires_at = None
            if data.get('expires_at'):
                expires_at = datetime.fromisoformat(
                    data['expires_at'].replace('Z', '+00:00')
                )
            
            logger.info(
                f"✅ Reserved {len(items)} items for session {session_id}",
                extra={
                    "session_id": session_id,
                    "reservation_ids": reservation_ids,
                    "source": source,
                    "expires_at": expires_at.isoformat() if expires_at else None,
                    "correlation_id": correlation_id
                }
            )
            
            return ReservationResult(
                success=True,
                reservation_ids=reservation_ids,
                message="Stock reserved successfully",
                expires_at=expires_at
            )
            
        except Exception as e:
            if "Insufficient stock" in str(e):
                raise InsufficientStockError(
                    message=str(e),
                    correlation_id=correlation_id
                )
            
            logger.error(f"Error reserving stock: {e}", exc_info=True)
            raise ReservationError(
                message=f"Failed to reserve stock: {str(e)}",
                correlation_id=correlation_id
            )
    
    # =========================================================================
    # CONFIRM RESERVATION (Payment Success)
    # =========================================================================
    
    def confirm_reservation(
        self,
        reservation_ids: List[str],
        order_id: str,
        idempotency_key: str,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Confirm reservations and deduct actual stock.
        Called when payment succeeds.
        
        Args:
            reservation_ids: IDs from validate_and_reserve
            order_id: The confirmed order ID
            idempotency_key: Payment reference for idempotency
            correlation_id: For tracing
            
        Returns:
            True if confirmed (including idempotent repeat calls)
        """
        if not reservation_ids:
            return True
        
        try:
            result = self.db.rpc('confirm_reservations_batch', {
                'p_reservation_ids': reservation_ids,
                'p_order_id': order_id,
                'p_idempotency_key': idempotency_key
            }).execute()
            
            if not result.data:
                raise ReservationError(
                    message="Failed to confirm reservations",
                    correlation_id=correlation_id
                )
            
            data = result.data
            
            if data.get('idempotent'):
                logger.info(f"Idempotent: Order {order_id} already confirmed")
            else:
                logger.info(
                    f"✅ Confirmed {len(reservation_ids)} reservations for order {order_id}",
                    extra={
                        "order_id": order_id,
                        "reservation_ids": reservation_ids,
                        "correlation_id": correlation_id
                    }
                )
            
            return True
            
        except Exception as e:
            logger.error(f"Error confirming reservations: {e}", exc_info=True)
            raise ReservationError(
                message=f"Failed to confirm reservations: {str(e)}",
                correlation_id=correlation_id
            )
    
    # =========================================================================
    # RELEASE RESERVATION (Payment Failed / Timeout / Cancel)
    # =========================================================================
    
    def release_reservation(
        self,
        reservation_ids: List[str],
        reason: str = "user_abandoned",
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Release reservations without deducting stock.
        Called when payment fails or user abandons checkout.
        
        Args:
            reservation_ids: IDs to release
            reason: Why released (payment_failed, timeout, cancelled, user_abandoned)
            idempotency_key: Optional for idempotent release
            correlation_id: For tracing
        """
        if not reservation_ids:
            return True
        
        try:
            for res_id in reservation_ids:
                self.repository.release_reservation(
                    reservation_id=res_id,
                    reason=reason,
                    idempotency_key=f"{idempotency_key}:{res_id}" if idempotency_key else None,
                    correlation_id=correlation_id
                )
            
            logger.info(
                f"✅ Released {len(reservation_ids)} reservations (reason: {reason})",
                extra={
                    "reservation_ids": reservation_ids,
                    "reason": reason,
                    "correlation_id": correlation_id
                }
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Error releasing reservations: {e}", exc_info=True)
            # Release errors should not fail the operation
            return True
    
    # =========================================================================
    # CLEANUP EXPIRED
    # =========================================================================
    
    def cleanup_expired(self) -> int:
        """
        Release all expired reservations.
        Should be called by a background job every 5 minutes.
        """
        return self.repository.cleanup_expired_reservations()
    
    # =========================================================================
    # STOCK QUERIES
    # =========================================================================
    
    def get_stock(
        self,
        user_id: str,
        product_id: str,
        variant_id: Optional[str] = None,
        size: Optional[str] = None
    ) -> StockAvailability:
        """Get current stock availability for an item."""
        result = self.repository.get_available_stock(
            user_id=user_id,
            product_id=product_id,
            variant_id=variant_id,
            size=size
        )
        
        return StockAvailability(
            product_id=product_id,
            variant_id=variant_id,
            size=size,
            available=result.available,
            reserved=result.reserved
        )
    
    # =========================================================================
    # HELPERS
    # =========================================================================
    
    def format_stock_error(
        self,
        result: ReservationResult,
        for_whatsapp: bool = False
    ) -> str:
        """
        Format deterministic stock error message.
        
        Args:
            result: Failed ReservationResult
            for_whatsapp: Use WhatsApp-friendly format
        """
        if not result.insufficient_items:
            return result.message
        
        if for_whatsapp:
            # Single item, friendly format for chat
            item = result.insufficient_items[0]
            variant_info = ""
            if item.color and item.size:
                variant_info = f" in {item.color} / {item.size}"
            elif item.color:
                variant_info = f" in {item.color}"
            elif item.size:
                variant_info = f" in {item.size}"
            
            return (
                f"Sorry! Only {item.available} units of {item.name}{variant_info} "
                f"are available. Would you like to order {item.available} instead?"
            )
        
        # Website format - all items
        messages = [item.format_message() for item in result.insufficient_items]
        return " ".join(messages)


# =============================================================================
# FACTORY
# =============================================================================

_inventory_service: Optional[InventoryService] = None


def get_inventory_service() -> InventoryService:
    """Get or create inventory service instance."""
    global _inventory_service
    
    if _inventory_service is not None:
        return _inventory_service
    
    repository = get_inventory_repository()
    _inventory_service = InventoryService(repository)
    return _inventory_service


def reset_inventory_service():
    """Reset singleton (for testing)."""
    global _inventory_service
    _inventory_service = None
