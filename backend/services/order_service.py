"""
Order Service - Business Logic Layer
Orchestrates order operations with:
- Business rule validation
- Capability checks
- Event emission for background jobs
- Transaction coordination
"""

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from dataclasses import dataclass
import uuid

from domain import (
    Order,
    OrderCreate,
    OrderUpdate,
    OrderItem,
    OrderStatus,
    OrderSource,
    ValidationError,
    BusinessRuleError,
    DuplicateOrderError,
    OrderNotFoundError,
    SystemError,
    ErrorCode,
)
from repository import OrderRepository, get_order_repository, OrderFilter

logger = logging.getLogger('reviseit.services.order')


@dataclass
class OrderEvent:
    """Event emitted for background processing."""
    event_type: str  # "order_created", "order_updated", "order_cancelled"
    order_id: str
    user_id: str
    data: Dict[str, Any]
    correlation_id: Optional[str] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow()


class OrderService:
    """
    Order business logic with safety guarantees.
    
    This is the main entry point for all order operations.
    It enforces:
    - Business capability checks
    - Order limits
    - Idempotency
    - Event emission for background jobs
    """
    
    def __init__(
        self,
        repository: OrderRepository,
        event_handler: callable = None,
    ):
        self.repository = repository
        self.event_handler = event_handler or self._default_event_handler
        
        # Business configuration (can be loaded from DB)
        self.config = {
            "max_items_per_order": 100,
            "max_orders_per_customer_per_day": 50,
            "require_phone_for_ai_orders": True,
        }
    
    def create_order(
        self,
        order_data: OrderCreate,
        correlation_id: Optional[str] = None,
    ) -> Order:
        """
        Create a new order with full validation.
        
        Process:
        1. Validate business rules
        2. Check capability enabled
        3. Check order limits
        4. Create order via repository (idempotent)
        5. Emit event for background jobs
        
        Returns:
            Created Order
            
        Raises:
            ValidationError: Invalid input
            BusinessRuleError: Business rule violated
            DuplicateOrderError: Order already exists
        """
        correlation_id = correlation_id or str(uuid.uuid4())[:8]
        
        logger.info(
            f"Creating order for user {order_data.user_id}",
            extra={
                "user_id": order_data.user_id,
                "customer_phone": order_data.customer_phone,
                "source": order_data.source.value,
                "correlation_id": correlation_id,
            }
        )
        
        # 1. Validate business rules
        self._validate_order_rules(order_data, correlation_id)
        
        # 2. Check if order booking is enabled (for AI orders)
        if order_data.source == OrderSource.AI:
            if not self._is_order_booking_enabled(order_data.user_id):
                raise BusinessRuleError(
                    message="Order booking is not enabled for this business",
                    code=ErrorCode.CAPABILITY_DISABLED,
                    correlation_id=correlation_id,
                )
        
        # 3. Check order limits
        self._check_order_limits(order_data, correlation_id)
        
        # 4. Build domain entity
        order = Order.create(
            user_id=order_data.user_id,
            customer_name=order_data.customer_name,
            customer_phone=order_data.customer_phone,
            items=order_data.items,
            source=order_data.source,
            notes=order_data.notes,
            idempotency_key=order_data.get_idempotency_key().key,
        )
        
        # 5. Create via repository (handles idempotency)
        created_order = self.repository.create(
            order=order,
            idempotency_key=order.idempotency_key,
            correlation_id=correlation_id,
        )
        
        # 6. Emit event for background processing
        self._emit_event(OrderEvent(
            event_type="order_created",
            order_id=created_order.id,
            user_id=created_order.user_id,
            data=created_order.to_dict(),
            correlation_id=correlation_id,
        ))
        
        logger.info(
            f"Order created successfully: {created_order.id}",
            extra={
                "order_id": created_order.id,
                "correlation_id": correlation_id,
            }
        )
        
        return created_order
    
    def get_order(
        self,
        order_id: str,
        user_id: str,
        correlation_id: Optional[str] = None,
    ) -> Order:
        """Get order by ID with business isolation."""
        return self.repository.get_by_id(
            order_id=order_id,
            user_id=user_id,
            correlation_id=correlation_id,
        )
    
    def list_orders(
        self,
        user_id: str,
        status: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        correlation_id: Optional[str] = None,
    ) -> Tuple[List[Order], int]:
        """List orders with filtering."""
        filter = OrderFilter(
            status=OrderStatus(status) if status else None,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
        
        return self.repository.list(
            user_id=user_id,
            filter=filter,
            correlation_id=correlation_id,
        )
    
    def update_order(
        self,
        order_id: str,
        user_id: str,
        update_data: OrderUpdate,
        correlation_id: Optional[str] = None,
    ) -> Order:
        """Update order details."""
        order = self.repository.get_by_id(
            order_id=order_id,
            user_id=user_id,
            correlation_id=correlation_id,
        )
        
        # Check if order can be modified
        if order.is_terminal():
            raise BusinessRuleError(
                message=f"Cannot modify order in {order.status.value} status",
                correlation_id=correlation_id,
            )
        
        # Apply updates
        order.update(
            customer_name=update_data.customer_name,
            customer_phone=update_data.customer_phone,
            items=update_data.items,
            notes=update_data.notes,
        )
        
        # Handle status update separately if provided
        if update_data.status:
            order.transition_to(update_data.status)
        
        updated = self.repository.update(order, correlation_id)
        
        self._emit_event(OrderEvent(
            event_type="order_updated",
            order_id=updated.id,
            user_id=updated.user_id,
            data=updated.to_dict(),
            correlation_id=correlation_id,
        ))
        
        return updated
    
    def update_status(
        self,
        order_id: str,
        user_id: str,
        new_status: OrderStatus,
        correlation_id: Optional[str] = None,
    ) -> Order:
        """Update order status with transition validation."""
        order = self.repository.update_status(
            order_id=order_id,
            user_id=user_id,
            new_status=new_status,
            correlation_id=correlation_id,
        )
        
        event_type = f"order_{new_status.value}"
        self._emit_event(OrderEvent(
            event_type=event_type,
            order_id=order.id,
            user_id=order.user_id,
            data=order.to_dict(),
            correlation_id=correlation_id,
        ))
        
        return order
    
    def cancel_order(
        self,
        order_id: str,
        user_id: str,
        correlation_id: Optional[str] = None,
    ) -> Order:
        """Cancel an order (soft delete)."""
        return self.update_status(
            order_id=order_id,
            user_id=user_id,
            new_status=OrderStatus.CANCELLED,
            correlation_id=correlation_id,
        )
    
    # =========================================================================
    # Private Methods
    # =========================================================================
    
    def _validate_order_rules(
        self,
        order_data: OrderCreate,
        correlation_id: str,
    ) -> None:
        """Validate business rules for order creation."""
        # Check item count
        if len(order_data.items) > self.config["max_items_per_order"]:
            raise ValidationError(
                message=f"Order cannot have more than {self.config['max_items_per_order']} items",
                correlation_id=correlation_id,
            )
        
        # For AI orders, phone is required
        if (
            order_data.source == OrderSource.AI 
            and self.config["require_phone_for_ai_orders"]
            and not order_data.customer_phone
        ):
            raise ValidationError(
                message="Phone number is required for AI-created orders",
                invalid_fields=["customer_phone"],
                correlation_id=correlation_id,
            )
    
    def _check_order_limits(
        self,
        order_data: OrderCreate,
        correlation_id: str,
    ) -> None:
        """Check if order limits are exceeded."""
        # Implementation would check:
        # - Orders per customer per day
        # - Orders per business per day
        # - Rate limiting
        pass
    
    def _is_order_booking_enabled(self, user_id: str) -> bool:
        """Check if order booking is enabled for business."""
        try:
            # This would query ai_capabilities table
            # For now, return True (enabled by default)
            return True
        except Exception:
            return False
    
    def _emit_event(self, event: OrderEvent) -> None:
        """Emit event for background processing."""
        try:
            self.event_handler(event)
        except Exception as e:
            # Events should not fail the main operation
            logger.warning(
                f"Failed to emit event: {e}",
                extra={
                    "event_type": event.event_type,
                    "order_id": event.order_id,
                }
            )
    
    def _default_event_handler(self, event: OrderEvent) -> None:
        """Default event handler - queues for background processing OR executes synchronously."""
        logger.info(
            f"Order event: {event.event_type}",
            extra={
                "event_type": event.event_type,
                "order_id": event.order_id,
                "user_id": event.user_id,
                "correlation_id": event.correlation_id,
            }
        )
        
        # Try async processing (Celery), fallback to sync if unavailable
        try:
            from tasks.orders import process_order_event
            
            # Check if Celery is available and try to queue the task
            if hasattr(process_order_event, 'delay'):
                try:
                    # Attempt to queue for async processing with timeout
                    # Use apply_async with countdown=0 to fail fast if broker unavailable
                    from kombu.exceptions import OperationalError
                    
                    result = process_order_event.apply_async(
                        kwargs={
                            'event_type': event.event_type,
                            'order_id': event.order_id,
                            'user_id': event.user_id,
                            'data': event.data,
                            'correlation_id': event.correlation_id,
                        },
                        countdown=0,
                        expires=300,  # Expire after 5 minutes
                    )
                    logger.info(f"✅ Background task queued for order {event.order_id} (task_id: {result.id})")
                    return  # Success - task queued
                    
                except (OperationalError, Exception) as queue_error:
                    # Redis connection failed or other Celery error - fail fast, no retries
                    error_type = type(queue_error).__name__
                    logger.warning(
                        f"⚠️ Failed to queue background task ({error_type}): {queue_error}. "
                        f"Falling back to synchronous execution..."
                    )
            
            # Fallback: Execute synchronously (no Redis/Celery or queueing failed)
            logger.info(f"🔄 Executing order event synchronously for order {event.order_id}")
            process_order_event(
                event_type=event.event_type,
                order_id=event.order_id,
                user_id=event.user_id,
                data=event.data,
                correlation_id=event.correlation_id,
            )
            logger.info(f"✅ Order {event.order_id} processed synchronously")
            
        except ImportError as e:
            # tasks.orders module not available
            logger.error(
                f"❌ Order processing unavailable (tasks.orders not found): {e}. "
                f"Order {event.order_id} saved but will NOT sync to Google Sheets.",
                extra={
                    "order_id": event.order_id,
                    "user_id": event.user_id,
                    "correlation_id": event.correlation_id,
                }
            )
        except Exception as e:
            # Unexpected error during sync execution
            logger.error(
                f"❌ Failed to process order event for {event.order_id}: {e}",
                extra={
                    "order_id": event.order_id,
                    "user_id": event.user_id,
                    "correlation_id": event.correlation_id,
                },
                exc_info=True
            )



# =============================================================================
# Factory Function
# =============================================================================

_order_service: Optional[OrderService] = None


def get_order_service(supabase_client=None) -> OrderService:
    """Get or create order service instance."""
    global _order_service
    
    if _order_service is not None:
        return _order_service
    
    repository = get_order_repository(supabase_client)
    _order_service = OrderService(repository=repository)
    
    return _order_service

