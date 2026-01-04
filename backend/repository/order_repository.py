"""
Order Repository - Data Access Layer
Handles all database operations for orders with:
- Atomic writes
- Idempotency checks
- Optimistic locking
- Proper error handling
"""

import logging
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from dataclasses import dataclass

from domain import (
    Order,
    OrderStatus,
    OrderSource,
    ValidationError,
    DuplicateOrderError,
    OrderNotFoundError,
    SystemError,
    ErrorCode,
)
from .idempotency_store import IdempotencyStore, get_idempotency_store

logger = logging.getLogger('reviseit.repository.order')


@dataclass
class OrderFilter:
    """Filter criteria for order queries."""
    status: Optional[OrderStatus] = None
    source: Optional[OrderSource] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    customer_phone: Optional[str] = None
    limit: int = 100
    offset: int = 0


class OrderRepository:
    """
    Order data access with safety guarantees.
    
    Features:
    - Atomic create with idempotency
    - Optimistic concurrency control
    - Fingerprint-based duplicate detection
    - Proper isolation per business
    """
    
    TABLE_NAME = "orders"
    
    def __init__(self, supabase_client, idempotency_store: IdempotencyStore = None):
        self.db = supabase_client
        self.idempotency = idempotency_store or get_idempotency_store(supabase_client)
    
    def create(
        self,
        order: Order,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> Order:
        """
        Create order with idempotency guarantee.
        
        Process:
        1. Check idempotency key for existing operation
        2. Check fingerprint for duplicate order
        3. Lock idempotency key
        4. Insert order atomically
        5. Complete idempotency record
        
        Raises:
            DuplicateOrderError: If order already exists
            SystemError: If database operation fails
        """
        key = idempotency_key or order.idempotency_key or order.fingerprint
        
        if key:
            # Check for existing completed operation
            existing = self.idempotency.get(key, "create_order")
            if existing and existing.is_completed():
                logger.info(f"Returning cached order for idempotency key: {key[:16]}...")
                return Order.from_dict(existing.result_data)
            
            # Try to acquire lock
            if existing and not existing.is_expired():
                raise DuplicateOrderError(
                    message="Order creation already in progress",
                    idempotency_key=key,
                    correlation_id=correlation_id,
                )
            
            # Lock the key
            if not self.idempotency.lock(key, "create_order"):
                raise DuplicateOrderError(
                    message="Duplicate order detected",
                    idempotency_key=key,
                    correlation_id=correlation_id,
                )
        
        try:
            # Check for duplicate by fingerprint (catch even if no idempotency key)
            if order.fingerprint:
                existing_order = self._find_by_fingerprint(
                    order.user_id, 
                    order.fingerprint
                )
                if existing_order:
                    if key:
                        self.idempotency.complete(key, existing_order.id, existing_order.to_dict())
                    raise DuplicateOrderError(
                        message="Similar order already exists within time window",
                        existing_order_id=existing_order.id,
                        correlation_id=correlation_id,
                    )
            
            # Insert order
            order_data = order.to_dict()
            result = self.db.table(self.TABLE_NAME).insert(order_data).execute()
            
            if not result.data:
                if key:
                    self.idempotency.fail(key, "Insert returned no data")
                raise SystemError(
                    message="Failed to create order",
                    code=ErrorCode.DATABASE_ERROR,
                    correlation_id=correlation_id,
                )
            
            created_order = Order.from_dict(result.data[0])
            
            # Mark idempotency as complete
            if key:
                self.idempotency.complete(key, created_order.id, created_order.to_dict())
            
            logger.info(
                f"Order created: {created_order.id}",
                extra={
                    "order_id": created_order.id,
                    "user_id": created_order.user_id,
                    "source": created_order.source.value,
                    "correlation_id": correlation_id,
                }
            )
            
            return created_order
            
        except DuplicateOrderError:
            raise
        except Exception as e:
            if key:
                self.idempotency.fail(key, str(e))
            
            # Check if it's a DB duplicate error
            if '23505' in str(e) or 'duplicate' in str(e).lower():
                raise DuplicateOrderError(
                    message="Order already exists",
                    correlation_id=correlation_id,
                )
            
            logger.error(f"Error creating order: {e}", extra={"correlation_id": correlation_id})
            raise SystemError(
                message="Failed to create order",
                code=ErrorCode.DATABASE_ERROR,
                details={"error": str(e)},
                correlation_id=correlation_id,
            )
    
    def get_by_id(
        self,
        order_id: str,
        user_id: str,
        correlation_id: Optional[str] = None
    ) -> Order:
        """
        Get order by ID with business isolation.
        
        Raises:
            OrderNotFoundError: If order doesn't exist or belongs to different business
        """
        try:
            result = self.db.table(self.TABLE_NAME).select("*").eq(
                "id", order_id
            ).eq("user_id", user_id).single().execute()
            
            if not result.data:
                raise OrderNotFoundError(
                    message="Order not found",
                    order_id=order_id,
                    correlation_id=correlation_id,
                )
            
            return Order.from_dict(result.data)
            
        except OrderNotFoundError:
            raise
        except Exception as e:
            if 'PGRST116' in str(e):
                raise OrderNotFoundError(
                    message="Order not found",
                    order_id=order_id,
                    correlation_id=correlation_id,
                )
            
            logger.error(f"Error getting order: {e}")
            raise SystemError(
                message="Failed to fetch order",
                code=ErrorCode.DATABASE_ERROR,
                correlation_id=correlation_id,
            )
    
    def list(
        self,
        user_id: str,
        filter: OrderFilter = None,
        correlation_id: Optional[str] = None
    ) -> Tuple[List[Order], int]:
        """
        List orders for a business with filtering.
        
        Returns:
            Tuple of (orders, total_count)
        """
        filter = filter or OrderFilter()
        
        try:
            query = self.db.table(self.TABLE_NAME).select("*", count="exact").eq(
                "user_id", user_id
            )
            
            # Apply filters
            if filter.status:
                query = query.eq("status", filter.status.value)
            
            if filter.source:
                query = query.eq("source", filter.source.value)
            
            if filter.start_date:
                query = query.gte("created_at", filter.start_date)
            
            if filter.end_date:
                query = query.lte("created_at", filter.end_date)
            
            if filter.customer_phone:
                query = query.eq("customer_phone", filter.customer_phone)
            
            # Pagination and ordering
            query = query.order("created_at", desc=True)
            query = query.range(filter.offset, filter.offset + filter.limit - 1)
            
            result = query.execute()
            
            orders = [Order.from_dict(row) for row in (result.data or [])]
            total = result.count if hasattr(result, 'count') else len(orders)
            
            return orders, total
            
        except Exception as e:
            logger.error(f"Error listing orders: {e}")
            raise SystemError(
                message="Failed to list orders",
                code=ErrorCode.DATABASE_ERROR,
                correlation_id=correlation_id,
            )
    
    def update(
        self,
        order: Order,
        correlation_id: Optional[str] = None
    ) -> Order:
        """
        Update order with optimistic locking.
        
        Uses version field to prevent concurrent updates.
        """
        try:
            update_data = order.to_dict()
            update_data["version"] = order.version  # Increment version
            
            # Optimistic locking: only update if version matches
            result = self.db.table(self.TABLE_NAME).update(update_data).eq(
                "id", order.id
            ).eq("version", order.version - 1).execute()  # Previous version
            
            if not result.data:
                # Check if order exists
                existing = self._get_raw(order.id)
                if not existing:
                    raise OrderNotFoundError(
                        message="Order not found",
                        order_id=order.id,
                        correlation_id=correlation_id,
                    )
                # Concurrent modification
                raise SystemError(
                    message="Order was modified by another request. Please retry.",
                    code=ErrorCode.DATABASE_ERROR,
                    details={"expected_version": order.version - 1, "current_version": existing.get("version")},
                    correlation_id=correlation_id,
                )
            
            updated = Order.from_dict(result.data[0])
            
            logger.info(
                f"Order updated: {order.id}",
                extra={
                    "order_id": order.id,
                    "status": order.status.value,
                    "version": order.version,
                    "correlation_id": correlation_id,
                }
            )
            
            return updated
            
        except (OrderNotFoundError, SystemError):
            raise
        except Exception as e:
            logger.error(f"Error updating order: {e}")
            raise SystemError(
                message="Failed to update order",
                code=ErrorCode.DATABASE_ERROR,
                correlation_id=correlation_id,
            )
    
    def update_status(
        self,
        order_id: str,
        user_id: str,
        new_status: OrderStatus,
        correlation_id: Optional[str] = None
    ) -> Order:
        """Update order status with transition validation."""
        order = self.get_by_id(order_id, user_id, correlation_id)
        order.transition_to(new_status)
        return self.update(order, correlation_id)
    
    def _find_by_fingerprint(
        self,
        user_id: str,
        fingerprint: str
    ) -> Optional[Order]:
        """Find order by fingerprint (for duplicate detection)."""
        try:
            result = self.db.table(self.TABLE_NAME).select("*").eq(
                "user_id", user_id
            ).eq("fingerprint", fingerprint).limit(1).execute()
            
            if result.data:
                return Order.from_dict(result.data[0])
            return None
            
        except Exception as e:
            logger.warning(f"Error checking fingerprint: {e}")
            return None
    
    def _get_raw(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Get raw order data (for internal checks)."""
        try:
            result = self.db.table(self.TABLE_NAME).select("*").eq(
                "id", order_id
            ).single().execute()
            return result.data
        except Exception:
            return None


# =============================================================================
# Factory Function
# =============================================================================

_order_repository: Optional[OrderRepository] = None


def get_order_repository(supabase_client=None) -> OrderRepository:
    """Get or create order repository instance."""
    global _order_repository
    
    if _order_repository is not None:
        return _order_repository
    
    if not supabase_client:
        try:
            from supabase_client import get_supabase_client
            supabase_client = get_supabase_client()
        except ImportError:
            raise SystemError(
                message="Database not configured",
                code=ErrorCode.CONFIGURATION_ERROR,
            )
    
    _order_repository = OrderRepository(supabase_client)
    return _order_repository

