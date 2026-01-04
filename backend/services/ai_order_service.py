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
        
        # All checks passed - create order
        try:
            items = [
                OrderItem(
                    name=item["name"],
                    quantity=item.get("quantity", 1),
                    price=item.get("price"),
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
            
            order = self.order_service.create_order(
                order_data=order_data,
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
                    "correlation_id": correlation_id,
                }
            )
            
            return AIOrderResult(
                success=True,
                message="Order created successfully!",
                order=order,
                suggested_response=f"✅ *Order Confirmed!*\n\nOrder ID: {order.id[:8]}...\n\nThank you, {context.customer_name}! Your order has been received and will be processed shortly. 🎉",
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

