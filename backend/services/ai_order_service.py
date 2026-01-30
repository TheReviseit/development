"""
AI Order Service - Safe AI-Driven Order Booking
Implements strict guardrails for AI-initiated orders.

AI Safety Rules (CRITICAL):
1. AI must NEVER book without explicit customer confirmation
2. AI must NEVER guess item details
3. AI must ALWAYS summarize order before confirmation
4. AI must collect all required fields before booking
5. AI must respect business capability flags
"""

import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from domain import (
    Order,
    OrderCreate,
    OrderItem,
    OrderStatus,
    OrderSource,
    ValidationError,
    BusinessRuleError,
    ErrorCode,
    # Inventory
    StockItem,
    InsufficientStockError,
)
from .order_service import OrderService, get_order_service

logger = logging.getLogger('reviseit.services.ai_order')


class AIOrderState(str, Enum):
    """States for AI order booking flow."""
    IDLE = "idle"
    COLLECTING_ITEMS = "collecting_items"
    CONFIRMING_ITEMS = "confirming_items"
    COLLECTING_DETAILS = "collecting_details"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass
class AIOrderContext:
    """
    Context for AI order booking session.
    Tracks collected information and flow state.
    """
    session_id: str
    user_id: str  # Business owner ID
    customer_phone: str
    
    # Flow state
    state: AIOrderState = AIOrderState.IDLE
    
    # Collected data
    items: List[Dict[str, Any]] = field(default_factory=list)
    customer_name: Optional[str] = None
    notes: Optional[str] = None
    
    # Product references (for inventory)
    product_ids: Dict[str, str] = field(default_factory=dict)  # item_name -> product_id
    variant_ids: Dict[str, str] = field(default_factory=dict)  # item_name -> variant_id
    sizes: Dict[str, str] = field(default_factory=dict)        # item_name -> size
    
    # Reservation tracking
    reservation_ids: List[str] = field(default_factory=list)
    
    # Safety tracking
    items_confirmed: bool = False
    details_confirmed: bool = False
    final_confirmation: bool = False
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    
    def add_item(self, name: str, quantity: int = 1, price: float = None) -> None:
        """Add item to order."""
        self.items.append({
            "name": name,
            "quantity": quantity,
            "price": price,
        })
        self.items_confirmed = False  # Reset confirmation
        self.last_activity = datetime.utcnow()
    
    def clear_items(self) -> None:
        """Clear all items."""
        self.items = []
        self.items_confirmed = False
    
    def confirm_items(self) -> None:
        """Mark items as confirmed by customer."""
        self.items_confirmed = True
        self.state = AIOrderState.COLLECTING_DETAILS
    
    def set_customer_details(self, name: str) -> None:
        """Set customer details."""
        self.customer_name = name
        self.details_confirmed = True
        self.state = AIOrderState.AWAITING_CONFIRMATION
    
    def is_ready_for_booking(self) -> bool:
        """Check if all requirements are met for booking."""
        return (
            len(self.items) > 0 and
            self.items_confirmed and
            self.customer_name is not None and
            self.details_confirmed and
            self.final_confirmation
        )
    
    def get_missing_fields(self) -> List[str]:
        """Get list of missing required fields."""
        missing = []
        if not self.items:
            missing.append("items")
        if not self.items_confirmed:
            missing.append("items_confirmation")
        if not self.customer_name:
            missing.append("customer_name")
        if not self.final_confirmation:
            missing.append("final_confirmation")
        return missing


@dataclass
class AIOrderResult:
    """Result from AI order operation."""
    success: bool
    message: str
    order: Optional[Order] = None
    context: Optional[AIOrderContext] = None
    next_action: Optional[str] = None
    suggested_response: Optional[str] = None


class AIOrderService:
    """
    AI-Safe Order Booking Service.
    
    Enforces strict guardrails to prevent:
    - Accidental bookings
    - Incomplete orders
    - Missing confirmations
    
    Usage:
        ai_service = AIOrderService()
        
        # Start order flow
        result = ai_service.start_order(user_id, customer_phone)
        
        # Add items (customer provided)
        result = ai_service.add_item(session_id, "Pizza", 2)
        
        # Confirm items (REQUIRED)
        result = ai_service.confirm_items(session_id)
        
        # Set customer details
        result = ai_service.set_customer(session_id, "John Doe")
        
        # Final confirmation (REQUIRED)
        result = ai_service.confirm_order(session_id)
    """
    
    # Session storage (in production, use Redis)
    _sessions: Dict[str, AIOrderContext] = {}
    
    def __init__(self, order_service: OrderService = None):
        self.order_service = order_service or get_order_service()
    
    def start_order(
        self,
        user_id: str,
        customer_phone: str,
        correlation_id: Optional[str] = None,
    ) -> AIOrderResult:
        """
        Start a new AI order session.
        
        Returns a session that must go through the full flow
        before an order can be created.
        """
        # Check if order booking is enabled
        if not self._is_order_enabled(user_id):
            return AIOrderResult(
                success=False,
                message="Order booking is not enabled for this business",
                next_action="inform_customer",
            )
        
        # Create session
        import uuid
        session_id = f"ai_order_{uuid.uuid4().hex[:12]}"
        
        context = AIOrderContext(
            session_id=session_id,
            user_id=user_id,
            customer_phone=customer_phone,
            state=AIOrderState.COLLECTING_ITEMS,
        )
        
        self._sessions[session_id] = context
        
        logger.info(
            f"AI order session started: {session_id}",
            extra={
                "session_id": session_id,
                "user_id": user_id,
                "correlation_id": correlation_id,
            }
        )
        
        return AIOrderResult(
            success=True,
            message="Order session started",
            context=context,
            next_action="collect_items",
            suggested_response="What would you like to order today? 📦",
        )
    
    def add_item(
        self,
        session_id: str,
        item_name: str,
        quantity: int = 1,
        price: float = None,
        correlation_id: Optional[str] = None,
    ) -> AIOrderResult:
        """
        Add item to order.
        
        SAFETY: This only adds to the context, does NOT create an order.
        """
        context = self._get_session(session_id)
        if not context:
            return AIOrderResult(
                success=False,
                message="Order session not found. Please start a new order.",
                next_action="start_new_session",
            )
        
        # Validate item
        if not item_name or len(item_name.strip()) < 2:
            return AIOrderResult(
                success=False,
                message="Please provide a valid item name",
                context=context,
                next_action="retry_item",
            )
        
        if quantity < 1:
            quantity = 1
        
        context.add_item(
            name=item_name.strip(),
            quantity=quantity,
            price=price,
        )
        
        logger.debug(
            f"Item added to AI order: {item_name} x{quantity}",
            extra={"session_id": session_id}
        )
        
        return AIOrderResult(
            success=True,
            message=f"Added {quantity}x {item_name}",
            context=context,
            next_action="ask_for_more_items",
            suggested_response=f"Added {quantity}x {item_name} ✓\n\nAnything else you'd like to add?",
        )
    
    def get_order_summary(self, session_id: str) -> AIOrderResult:
        """
        Generate order summary for confirmation.
        
        SAFETY: AI must show this to customer before confirming.
        """
        context = self._get_session(session_id)
        if not context:
            return AIOrderResult(
                success=False,
                message="Session not found",
            )
        
        if not context.items:
            return AIOrderResult(
                success=False,
                message="No items in order",
                context=context,
                next_action="collect_items",
            )
        
        # Build summary
        summary_lines = ["📋 *Order Summary*\n"]
        total_qty = 0
        
        for item in context.items:
            qty = item.get("quantity", 1)
            name = item.get("name", "Unknown")
            total_qty += qty
            summary_lines.append(f"• {qty}x {name}")
        
        summary_lines.append(f"\n*Total Items:* {total_qty}")
        
        if context.customer_name:
            summary_lines.append(f"*Name:* {context.customer_name}")
        summary_lines.append(f"*Phone:* {context.customer_phone}")
        
        summary_lines.append("\n_Is this correct?_")
        
        return AIOrderResult(
            success=True,
            message="Order summary generated",
            context=context,
            next_action="await_confirmation",
            suggested_response="\n".join(summary_lines),
        )
    
    def confirm_items(
        self,
        session_id: str,
        correlation_id: Optional[str] = None,
    ) -> AIOrderResult:
        """
        Confirm items list.
        
        SAFETY: This is a REQUIRED step before proceeding.
        """
        context = self._get_session(session_id)
        if not context:
            return AIOrderResult(
                success=False,
                message="Session not found",
            )
        
        if not context.items:
            return AIOrderResult(
                success=False,
                message="No items to confirm. Please add items first.",
                context=context,
                next_action="collect_items",
            )
        
        context.confirm_items()
        
        logger.info(
            f"AI order items confirmed: {session_id}",
            extra={"session_id": session_id, "item_count": len(context.items)}
        )
        
        return AIOrderResult(
            success=True,
            message="Items confirmed",
            context=context,
            next_action="collect_customer_name",
            suggested_response="Great! May I have your name for the order?",
        )
    
    def set_customer(
        self,
        session_id: str,
        customer_name: str,
        correlation_id: Optional[str] = None,
    ) -> AIOrderResult:
        """Set customer name."""
        context = self._get_session(session_id)
        if not context:
            return AIOrderResult(
                success=False,
                message="Session not found",
            )
        
        if not context.items_confirmed:
            return AIOrderResult(
                success=False,
                message="Please confirm items first",
                context=context,
                next_action="confirm_items",
            )
        
        context.set_customer_details(customer_name.strip())
        
        # Generate final confirmation request
        summary = self.get_order_summary(session_id)
        
        return AIOrderResult(
            success=True,
            message="Customer details set",
            context=context,
            next_action="await_final_confirmation",
            suggested_response=f"{summary.suggested_response}\n\n*Reply YES to confirm or NO to cancel*",
        )
    
    def confirm_order(
        self,
        session_id: str,
        correlation_id: Optional[str] = None,
    ) -> AIOrderResult:
        """
        Final confirmation and order creation.
        
        SAFETY: This is the ONLY method that creates an actual order.
        All safety checks must pass before this is called.
        """
        context = self._get_session(session_id)
        if not context:
            return AIOrderResult(
                success=False,
                message="Session not found",
            )
        
        # SAFETY CHECKS (CRITICAL)
        if not context.items:
            return AIOrderResult(
                success=False,
                message="❌ No items in order",
                context=context,
                next_action="collect_items",
            )
        
        if not context.items_confirmed:
            return AIOrderResult(
                success=False,
                message="❌ Items not confirmed by customer",
                context=context,
                next_action="confirm_items",
            )
        
        if not context.customer_name:
            return AIOrderResult(
                success=False,
                message="❌ Customer name not provided",
                context=context,
                next_action="collect_customer_name",
            )
        
        # Mark final confirmation
        context.final_confirmation = True
        
        # Generate idempotency key for WhatsApp retries
        idempotency_key = self._generate_idempotency_key(context)
        
        # Validate and reserve stock BEFORE creating order
        reservation_result = self._validate_and_reserve_stock(
            context=context,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id
        )
        
        if reservation_result and not reservation_result.get('success', True):
            return AIOrderResult(
                success=False,
                message=reservation_result.get('message', 'Insufficient stock'),
                context=context,
                suggested_response=reservation_result.get('suggested_response'),
                next_action="adjust_quantity"
            )
        
        # All checks passed - create order
        try:
            items = [
                OrderItem(
                    name=item["name"],
                    quantity=item.get("quantity", 1),
                    price=item.get("price"),
                    product_id=context.product_ids.get(item["name"]),
                    variant_id=context.variant_ids.get(item["name"]),
                    size=context.sizes.get(item["name"]),
                )
                for item in context.items
            ]
            
            order_data = OrderCreate(
                user_id=context.user_id,
                customer_name=context.customer_name,
                customer_phone=context.customer_phone,
                items=items,
                source=OrderSource.AI,
                notes=context.notes,
            )
            
            # Pass reservation IDs to skip re-validation
            order = self.order_service.create_order(
                order_data=order_data,
                reservation_ids=context.reservation_ids,
                skip_stock_check=bool(context.reservation_ids),
                correlation_id=correlation_id,
            )
            
            # Clean up session
            context.state = AIOrderState.COMPLETED
            self._remove_session(session_id)
            
            logger.info(
                f"AI order created: {order.id}",
                extra={
                    "order_id": order.id,
                    "session_id": session_id,
                    "user_id": context.user_id,
                    "reservation_ids": context.reservation_ids,
                    "correlation_id": correlation_id,
                }
            )
            
            return AIOrderResult(
                success=True,
                message="Order created successfully!",
                order=order,
                suggested_response=f"✅ *Order Confirmed!*\n\nOrder ID: {order.id[:8]}...\n\nThank you, {context.customer_name}! Your order has been received and will be processed shortly. 🎉",
            )
            
        except InsufficientStockError as e:
            # Deterministic stock error message for WhatsApp
            return AIOrderResult(
                success=False,
                message=e.message,
                context=context,
                suggested_response=self._format_whatsapp_stock_error(e),
                next_action="adjust_quantity",
            )
        except ValidationError as e:
            return AIOrderResult(
                success=False,
                message=f"Validation error: {e.message}",
                context=context,
            )
        except BusinessRuleError as e:
            return AIOrderResult(
                success=False,
                message=f"Cannot create order: {e.message}",
                context=context,
            )
        except Exception as e:
            logger.error(f"Error creating AI order: {e}")
            # Release reservations on failure
            if context.reservation_ids:
                self._release_reservations(context.reservation_ids, "order_creation_failed")
            return AIOrderResult(
                success=False,
                message="An error occurred. Please try again.",
                context=context,
            )
    
    def cancel_order(
        self,
        session_id: str,
        correlation_id: Optional[str] = None,
    ) -> AIOrderResult:
        """Cancel order session."""
        context = self._get_session(session_id)
        if context:
            context.state = AIOrderState.CANCELLED
            self._remove_session(session_id)
        
        return AIOrderResult(
            success=True,
            message="Order cancelled",
            suggested_response="Order cancelled. Is there anything else I can help you with? 😊",
        )
    
    def get_session(self, session_id: str) -> Optional[AIOrderContext]:
        """Get order session context."""
        return self._get_session(session_id)
    
    # =========================================================================
    # Private Methods
    # =========================================================================
    
    def _get_session(self, session_id: str) -> Optional[AIOrderContext]:
        """Get session from storage."""
        return self._sessions.get(session_id)
    
    def _remove_session(self, session_id: str) -> None:
        """Remove session from storage."""
        if session_id in self._sessions:
            del self._sessions[session_id]
    
    def _is_order_enabled(self, user_id: str) -> bool:
        """Check if order booking is enabled for business."""
        # This would query the ai_capabilities table
        return True
    
    # =========================================================================
    # Inventory Helpers (Stock Validation for WhatsApp)
    # =========================================================================
    
    def _generate_idempotency_key(self, context: AIOrderContext) -> str:
        """
        Generate idempotency key for WhatsApp retries.
        Format: {session_id}:{product_ids}:{quantities}
        """
        item_keys = []
        for item in context.items:
            product_id = context.product_ids.get(item['name'], 'unknown')
            variant_id = context.variant_ids.get(item['name'], '')
            size = context.sizes.get(item['name'], '')
            qty = item.get('quantity', 1)
            item_keys.append(f"{product_id}:{variant_id}:{size}:{qty}")
        
        return f"{context.session_id}:{':'.join(item_keys)}"
    
    def _validate_and_reserve_stock(
        self,
        context: AIOrderContext,
        idempotency_key: str,
        correlation_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Validate and reserve stock for WhatsApp order.
        Uses idempotency to handle message retries.
        """
        try:
            from .inventory_service import get_inventory_service
            inventory = get_inventory_service()
            
            # Build stock items from context
            stock_items = []
            for item in context.items:
                product_id = context.product_ids.get(item['name'])
                if not product_id:
                    continue  # Skip items without product mapping
                
                stock_items.append(StockItem(
                    product_id=product_id,
                    name=item['name'],
                    quantity=item.get('quantity', 1),
                    variant_id=context.variant_ids.get(item['name']),
                    size=context.sizes.get(item['name']),
                ))
            
            if not stock_items:
                # No product mappings - skip stock validation
                return {'success': True}
            
            # Reserve stock with WhatsApp TTL (5 minutes)
            result = inventory.validate_and_reserve(
                user_id=context.user_id,
                items=stock_items,
                source='whatsapp',
                session_id=context.session_id,
                correlation_id=correlation_id
            )
            
            if not result.success:
                return {
                    'success': False,
                    'message': result.message,
                    'suggested_response': inventory.format_stock_error(result, for_whatsapp=True)
                }
            
            # Store reservation IDs in context
            context.reservation_ids = result.reservation_ids
            
            logger.info(
                f"Stock reserved for WhatsApp order: {len(result.reservation_ids)} items",
                extra={
                    "session_id": context.session_id,
                    "reservation_ids": result.reservation_ids,
                    "correlation_id": correlation_id
                }
            )
            
            return {'success': True, 'reservation_ids': result.reservation_ids}
            
        except ImportError as e:
            logger.warning(f"Inventory service not available: {e}")
            return {'success': True}  # Don't block if inventory service unavailable
        except Exception as e:
            logger.error(f"Error validating stock: {e}", exc_info=True)
            return {'success': True}  # Don't block orders on inventory errors
    
    def _release_reservations(
        self,
        reservation_ids: List[str],
        reason: str = "cancelled"
    ) -> None:
        """Release stock reservations on cancellation/failure."""
        try:
            from .inventory_service import get_inventory_service
            inventory = get_inventory_service()
            inventory.release_reservation(
                reservation_ids=reservation_ids,
                reason=reason
            )
        except Exception as e:
            logger.warning(f"Error releasing reservations: {e}")
    
    def _format_whatsapp_stock_error(self, error: InsufficientStockError) -> str:
        """Format stock error for WhatsApp user."""
        if not error.insufficient_items:
            return "Sorry, some items are out of stock. Please adjust your order."
        
        item = error.insufficient_items[0]
        variant_info = ""
        if item.color and item.size:
            variant_info = f" in {item.color} / {item.size}"
        elif item.color:
            variant_info = f" in {item.color}"
        elif item.size:
            variant_info = f" in Size {item.size}"
        
        return (
            f"Sorry! Only {item.available} units of *{item.name}*{variant_info} "
            f"are available. You requested {item.requested}.\n\n"
            f"Would you like to order {item.available} instead? Reply YES or adjust your quantity."
        )


# =============================================================================
# Factory Function
# =============================================================================

_ai_order_service: Optional[AIOrderService] = None


def get_ai_order_service() -> AIOrderService:
    """Get or create AI order service instance."""
    global _ai_order_service
    
    if _ai_order_service is None:
        _ai_order_service = AIOrderService()
    
    return _ai_order_service


