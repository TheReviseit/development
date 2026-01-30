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

from .inventory import (
    ReservationStatus,
    ReservationSource,
    InventoryAction,
    StockItem,
    StockAvailability,
    InsufficientStockItem,
    ValidationResult,
    Reservation,
    ReservationResult,
    InsufficientStockError,
    ReservationError,
    ReservationExpiredError,
    DuplicateReservationError,
    get_ttl_for_source,
    calculate_expiry,
    RESERVATION_TTL_BY_SOURCE,
)

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
    # Inventory Exceptions
    "InsufficientStockError",
    "ReservationError",
    "ReservationExpiredError",
    "DuplicateReservationError",
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
    # Inventory
    "ReservationStatus",
    "ReservationSource",
    "InventoryAction",
    "StockItem",
    "StockAvailability",
    "InsufficientStockItem",
    "ValidationResult",
    "Reservation",
    "ReservationResult",
    "get_ttl_for_source",
    "calculate_expiry",
    "RESERVATION_TTL_BY_SOURCE",
]


