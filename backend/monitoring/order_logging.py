"""
Order Logging & Observability
Structured logging with correlation IDs for order lifecycle events.

Features:
- Correlation ID tracking across requests
- Structured JSON logging for log aggregation
- Order lifecycle event logging
- AI decision audit logging
- External integration logging
"""

import logging
import json
import time
import uuid
from typing import Dict, Any, Optional
from datetime import datetime
from functools import wraps
from dataclasses import dataclass, asdict
from contextvars import ContextVar

# Context variable for request-scoped correlation ID
_correlation_id: ContextVar[Optional[str]] = ContextVar('correlation_id', default=None)

logger = logging.getLogger('reviseit.orders')


# =============================================================================
# Correlation ID Management
# =============================================================================

def get_correlation_id() -> str:
    """Get current correlation ID or generate new one."""
    cid = _correlation_id.get()
    if not cid:
        cid = str(uuid.uuid4())[:8]
        _correlation_id.set(cid)
    return cid


def set_correlation_id(correlation_id: str) -> None:
    """Set correlation ID for current context."""
    _correlation_id.set(correlation_id)


def clear_correlation_id() -> None:
    """Clear correlation ID."""
    _correlation_id.set(None)


# =============================================================================
# Structured Log Event Types
# =============================================================================

@dataclass
class OrderEvent:
    """Structured order event for logging."""
    event_type: str
    order_id: Optional[str] = None
    user_id: Optional[str] = None
    customer_phone: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    correlation_id: Optional[str] = None
    duration_ms: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: str = None
    
    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat() + 'Z'
        if not self.correlation_id:
            self.correlation_id = get_correlation_id()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        return {k: v for k, v in asdict(self).items() if v is not None}
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class OrderLogger:
    """
    Structured logger for order events.
    
    Usage:
        order_logger = OrderLogger()
        
        # Log order creation
        order_logger.order_created(order_id, user_id, source="ai")
        
        # Log order update
        order_logger.order_updated(order_id, old_status="pending", new_status="confirmed")
        
        # Log AI decision
        order_logger.ai_decision(user_id, decision="confirm", confidence=0.95)
    """
    
    def __init__(self, logger_name: str = 'reviseit.orders'):
        self.logger = logging.getLogger(logger_name)
    
    def _log(self, level: int, event: OrderEvent) -> None:
        """Log event with structured data."""
        self.logger.log(
            level,
            f"[{event.event_type}] {event.order_id or 'N/A'}",
            extra={"event_data": event.to_dict()}
        )
    
    # =========================================================================
    # Order Lifecycle Events
    # =========================================================================
    
    def order_created(
        self,
        order_id: str,
        user_id: str,
        source: str = "manual",
        customer_phone: str = None,
        item_count: int = None,
        total_quantity: int = None,
        duration_ms: float = None,
    ) -> None:
        """Log order creation."""
        self._log(logging.INFO, OrderEvent(
            event_type="order_created",
            order_id=order_id,
            user_id=user_id,
            source=source,
            customer_phone=customer_phone,
            status="pending",
            duration_ms=duration_ms,
            metadata={
                "item_count": item_count,
                "total_quantity": total_quantity,
            } if item_count or total_quantity else None,
        ))
    
    def order_updated(
        self,
        order_id: str,
        user_id: str = None,
        old_status: str = None,
        new_status: str = None,
        changes: Dict[str, Any] = None,
    ) -> None:
        """Log order update."""
        self._log(logging.INFO, OrderEvent(
            event_type="order_updated",
            order_id=order_id,
            user_id=user_id,
            status=new_status,
            metadata={
                "old_status": old_status,
                "changes": changes,
            } if old_status or changes else None,
        ))
    
    def order_status_changed(
        self,
        order_id: str,
        old_status: str,
        new_status: str,
        user_id: str = None,
    ) -> None:
        """Log order status change."""
        self._log(logging.INFO, OrderEvent(
            event_type="order_status_changed",
            order_id=order_id,
            user_id=user_id,
            status=new_status,
            metadata={"from_status": old_status},
        ))
    
    def order_cancelled(
        self,
        order_id: str,
        user_id: str = None,
        reason: str = None,
    ) -> None:
        """Log order cancellation."""
        self._log(logging.INFO, OrderEvent(
            event_type="order_cancelled",
            order_id=order_id,
            user_id=user_id,
            status="cancelled",
            metadata={"reason": reason} if reason else None,
        ))
    
    # =========================================================================
    # AI Decision Events
    # =========================================================================
    
    def ai_order_started(
        self,
        user_id: str,
        customer_phone: str,
        session_id: str = None,
    ) -> None:
        """Log AI order session started."""
        self._log(logging.INFO, OrderEvent(
            event_type="ai_order_started",
            user_id=user_id,
            customer_phone=customer_phone,
            source="ai",
            metadata={"session_id": session_id},
        ))
    
    def ai_decision(
        self,
        user_id: str,
        decision: str,
        confidence: float = None,
        order_id: str = None,
        reason: str = None,
    ) -> None:
        """Log AI decision."""
        self._log(logging.INFO, OrderEvent(
            event_type="ai_decision",
            order_id=order_id,
            user_id=user_id,
            source="ai",
            metadata={
                "decision": decision,
                "confidence": confidence,
                "reason": reason,
            },
        ))
    
    def ai_guardrail_triggered(
        self,
        user_id: str,
        guardrail: str,
        action: str,
        order_id: str = None,
    ) -> None:
        """Log AI guardrail triggered."""
        self._log(logging.WARNING, OrderEvent(
            event_type="ai_guardrail_triggered",
            order_id=order_id,
            user_id=user_id,
            source="ai",
            metadata={
                "guardrail": guardrail,
                "action": action,
            },
        ))
    
    # =========================================================================
    # Error Events
    # =========================================================================
    
    def order_error(
        self,
        error_type: str,
        error_message: str,
        order_id: str = None,
        user_id: str = None,
        stack_trace: str = None,
    ) -> None:
        """Log order error."""
        self._log(logging.ERROR, OrderEvent(
            event_type="order_error",
            order_id=order_id,
            user_id=user_id,
            error=error_message,
            metadata={
                "error_type": error_type,
                "stack_trace": stack_trace[:500] if stack_trace else None,
            },
        ))
    
    def duplicate_order_blocked(
        self,
        user_id: str,
        customer_phone: str,
        idempotency_key: str = None,
        existing_order_id: str = None,
    ) -> None:
        """Log duplicate order blocked."""
        self._log(logging.WARNING, OrderEvent(
            event_type="duplicate_order_blocked",
            order_id=existing_order_id,
            user_id=user_id,
            customer_phone=customer_phone,
            metadata={
                "idempotency_key": idempotency_key,
                "existing_order_id": existing_order_id,
            },
        ))
    
    # =========================================================================
    # Integration Events
    # =========================================================================
    
    def sheets_sync_started(
        self,
        order_id: str,
        user_id: str,
    ) -> None:
        """Log Google Sheets sync started."""
        self._log(logging.DEBUG, OrderEvent(
            event_type="sheets_sync_started",
            order_id=order_id,
            user_id=user_id,
        ))
    
    def sheets_sync_completed(
        self,
        order_id: str,
        user_id: str,
        success: bool,
        duration_ms: float = None,
        error: str = None,
    ) -> None:
        """Log Google Sheets sync completed."""
        level = logging.INFO if success else logging.WARNING
        self._log(level, OrderEvent(
            event_type="sheets_sync_completed",
            order_id=order_id,
            user_id=user_id,
            duration_ms=duration_ms,
            error=error if not success else None,
            metadata={"success": success},
        ))


# =============================================================================
# Decorator for Timed Operations
# =============================================================================

def log_order_operation(operation_name: str):
    """
    Decorator to log order operations with timing.
    
    Usage:
        @log_order_operation("create_order")
        def create_order(order_data):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            order_logger = get_order_logger()
            
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                # Try to extract order_id from result
                order_id = None
                if hasattr(result, 'id'):
                    order_id = result.id
                elif isinstance(result, dict):
                    order_id = result.get('id') or result.get('order_id')
                
                logger.debug(
                    f"Operation {operation_name} completed in {duration_ms:.2f}ms",
                    extra={
                        "operation": operation_name,
                        "order_id": order_id,
                        "duration_ms": duration_ms,
                        "correlation_id": get_correlation_id(),
                    }
                )
                
                return result
                
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                
                order_logger.order_error(
                    error_type=type(e).__name__,
                    error_message=str(e),
                )
                
                raise
        
        return wrapper
    return decorator


# =============================================================================
# Singleton Logger
# =============================================================================

_order_logger: Optional[OrderLogger] = None


def get_order_logger() -> OrderLogger:
    """Get or create order logger instance."""
    global _order_logger
    if _order_logger is None:
        _order_logger = OrderLogger()
    return _order_logger

