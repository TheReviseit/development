"""
Domain Layer - Core Business Logic
Contains: Entities, Value Objects, Exceptions, Validation Schemas
"""

from .exceptions import (
    ErrorCode,
    OrderError,
    ValidationError,
    BusinessRuleError,
    IntegrationError,
    SystemError,
    DuplicateOrderError,
    OrderNotFoundError,
    InvalidOrderStateError,
    SlotUnavailableError,
)

from .schemas import (
    OrderItem,
    OrderCreate,
    OrderUpdate,
    OrderResponse,
    OrderStatus,
    OrderSource,
    IdempotencyKey,
)

from .entities import Order, OrderFingerprint

__all__ = [
    # Error Codes
    "ErrorCode",
    # Exceptions
    "OrderError",
    "ValidationError", 
    "BusinessRuleError",
    "IntegrationError",
    "SystemError",
    "DuplicateOrderError",
    "OrderNotFoundError",
    "InvalidOrderStateError",
    "SlotUnavailableError",
    # Schemas
    "OrderItem",
    "OrderCreate",
    "OrderUpdate",
    "OrderResponse",
    "OrderStatus",
    "OrderSource",
    "IdempotencyKey",
    # Entities
    "Order",
    "OrderFingerprint",
]

