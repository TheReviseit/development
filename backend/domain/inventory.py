"""
Inventory Domain - Stock Management Models and Exceptions
Implements Reserve → Confirm → Release pattern for enterprise-grade inventory.
"""

from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

from .exceptions import BusinessRuleError, ErrorCode


# =============================================================================
# ENUMS
# =============================================================================

class ReservationStatus(str, Enum):
    """Status of a stock reservation."""
    RESERVED = "reserved"
    CONFIRMED = "confirmed"
    RELEASED = "released"
    EXPIRED = "expired"


class ReservationSource(str, Enum):
    """Source channel of the reservation."""
    WEBSITE = "website"
    WHATSAPP = "whatsapp"
    ADMIN = "admin"
    API = "api"


class InventoryAction(str, Enum):
    """Types of inventory events for idempotency tracking."""
    RESERVE = "reserve"
    CONFIRM = "confirm"
    RELEASE = "release"
    CLEANUP = "cleanup"


# =============================================================================
# CONFIGURATION
# =============================================================================

# TTL (time-to-live) per source channel - in minutes
RESERVATION_TTL_BY_SOURCE: Dict[str, int] = {
    "website": 15,      # Website checkout has 15 minutes
    "whatsapp": 5,      # WhatsApp sessions are shorter
    "admin": 30,        # Admin has more time
    "api": 10,          # API integrations
}

DEFAULT_RESERVATION_TTL = 15  # Minutes


# =============================================================================
# VALUE OBJECTS
# =============================================================================

@dataclass(frozen=True)
class StockItem:
    """
    Represents an item for stock operations.
    Immutable value object that identifies a specific stock unit.
    """
    product_id: str
    name: str
    quantity: int
    variant_id: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    price: Optional[float] = None
    
    def get_stock_key(self) -> str:
        """Generate unique key for this stock unit."""
        parts = [self.product_id]
        if self.variant_id:
            parts.append(self.variant_id)
        if self.size:
            parts.append(self.size)
        return ":".join(parts)
    
    def get_idempotency_key(self, session_id: str, action: str) -> str:
        """Generate idempotency key for this item in a session."""
        return f"{session_id}:{self.product_id}:{self.variant_id or 'base'}:{self.size or 'default'}:{action}"


@dataclass
class StockAvailability:
    """Stock availability for a specific item."""
    product_id: str
    variant_id: Optional[str]
    size: Optional[str]
    available: int
    reserved: int  # Currently reserved (not yet confirmed)
    
    @property
    def effective_available(self) -> int:
        """Available minus pending reservations."""
        return max(0, self.available - self.reserved)


# =============================================================================
# RESULT OBJECTS
# =============================================================================

@dataclass
class InsufficientStockItem:
    """Details about an item with insufficient stock."""
    product_id: str
    variant_id: Optional[str]
    size: Optional[str]
    color: Optional[str]
    name: str
    requested: int
    available: int
    
    def format_message(self) -> str:
        """Generate user-friendly deterministic error message."""
        variant_info = ""
        if self.color and self.size:
            variant_info = f" ({self.color} / {self.size})"
        elif self.color:
            variant_info = f" ({self.color})"
        elif self.size:
            variant_info = f" ({self.size})"
        
        return (
            f"Only {self.available} units of {self.name}{variant_info} available. "
            f"You requested {self.requested}."
        )


@dataclass
class ValidationResult:
    """Result of stock validation check."""
    success: bool
    message: str = ""
    insufficient_items: List[InsufficientStockItem] = field(default_factory=list)
    checked_items: List[StockItem] = field(default_factory=list)
    
    @staticmethod
    def all_available(items: List[StockItem]) -> 'ValidationResult':
        """Create success result."""
        return ValidationResult(
            success=True,
            message="All items available",
            checked_items=items
        )
    
    @staticmethod
    def insufficient(items: List[InsufficientStockItem]) -> 'ValidationResult':
        """Create failure result with insufficient items."""
        messages = [item.format_message() for item in items]
        return ValidationResult(
            success=False,
            message=" ".join(messages),
            insufficient_items=items
        )


@dataclass
class Reservation:
    """A stock reservation record."""
    id: str
    user_id: str
    product_id: str
    variant_id: Optional[str]
    size: Optional[str]
    color: Optional[str]
    product_name: str
    quantity: int
    available_snapshot: int  # Stock at reservation time
    status: ReservationStatus
    source: ReservationSource
    expires_at: datetime
    customer_session_id: Optional[str] = None
    order_id: Optional[str] = None
    created_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    release_reason: Optional[str] = None
    
    @property
    def is_active(self) -> bool:
        """Check if reservation is still active."""
        return self.status == ReservationStatus.RESERVED
    
    @property
    def is_expired(self) -> bool:
        """Check if reservation has expired."""
        return self.expires_at < datetime.utcnow() and self.is_active
    
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> 'Reservation':
        """Create from database row."""
        return Reservation(
            id=data['id'],
            user_id=data['user_id'],
            product_id=data['product_id'],
            variant_id=data.get('variant_id'),
            size=data.get('size'),
            color=data.get('color'),
            product_name=data.get('product_name', ''),
            quantity=data['quantity'],
            available_snapshot=data.get('available_snapshot', 0),
            status=ReservationStatus(data['status']),
            source=ReservationSource(data.get('source', 'website')),
            expires_at=data['expires_at'] if isinstance(data['expires_at'], datetime) 
                       else datetime.fromisoformat(data['expires_at'].replace('Z', '+00:00')),
            customer_session_id=data.get('customer_session_id'),
            order_id=data.get('order_id'),
            created_at=data.get('created_at'),
            confirmed_at=data.get('confirmed_at'),
            released_at=data.get('released_at'),
            release_reason=data.get('release_reason'),
        )


@dataclass
class ReservationResult:
    """Result of a reserve operation."""
    success: bool
    reservations: List[Reservation] = field(default_factory=list)
    reservation_ids: List[str] = field(default_factory=list)
    message: str = ""
    insufficient_items: List[InsufficientStockItem] = field(default_factory=list)
    expires_at: Optional[datetime] = None
    
    @staticmethod
    def reserved(reservations: List[Reservation]) -> 'ReservationResult':
        """Create success result with reservations."""
        return ReservationResult(
            success=True,
            reservations=reservations,
            reservation_ids=[r.id for r in reservations],
            message="Stock reserved successfully",
            expires_at=min(r.expires_at for r in reservations) if reservations else None
        )
    
    @staticmethod
    def failed(insufficient: List[InsufficientStockItem]) -> 'ReservationResult':
        """Create failure result."""
        messages = [item.format_message() for item in insufficient]
        return ReservationResult(
            success=False,
            message=" ".join(messages),
            insufficient_items=insufficient
        )


# =============================================================================
# EXCEPTIONS
# =============================================================================

@dataclass
class InsufficientStockError(BusinessRuleError):
    """
    Raised when ordered quantity exceeds available stock.
    Provides deterministic error messages with specific item details.
    """
    code: ErrorCode = field(default=ErrorCode.INVALID_INPUT)
    http_status: int = 422
    insufficient_items: List[InsufficientStockItem] = field(default_factory=list)
    
    def __post_init__(self):
        if self.insufficient_items:
            self.details["insufficient_items"] = [
                {
                    "product_id": item.product_id,
                    "variant_id": item.variant_id,
                    "size": item.size,
                    "name": item.name,
                    "requested": item.requested,
                    "available": item.available,
                }
                for item in self.insufficient_items
            ]
        super().__post_init__()
    
    def to_api_response(self) -> Dict[str, Any]:
        """Override to include item details."""
        response = super().to_api_response()
        response["error"]["insufficient_items"] = self.details.get("insufficient_items", [])
        return response


@dataclass
class ReservationError(BusinessRuleError):
    """Raised when reservation operation fails."""
    code: ErrorCode = field(default=ErrorCode.INTERNAL_ERROR)
    http_status: int = 500
    reservation_id: Optional[str] = None
    
    def __post_init__(self):
        if self.reservation_id:
            self.details["reservation_id"] = self.reservation_id
        super().__post_init__()


@dataclass
class ReservationExpiredError(ReservationError):
    """Raised when trying to confirm an expired reservation."""
    code: ErrorCode = field(default=ErrorCode.INVALID_STATE_TRANSITION)
    http_status: int = 410  # Gone
    expired_at: Optional[datetime] = None
    
    def __post_init__(self):
        if self.expired_at:
            self.details["expired_at"] = self.expired_at.isoformat()
        super().__post_init__()


@dataclass
class DuplicateReservationError(BusinessRuleError):
    """Raised when a duplicate reservation is attempted."""
    code: ErrorCode = field(default=ErrorCode.DUPLICATE_ORDER)
    http_status: int = 409
    existing_reservation_id: Optional[str] = None
    
    def __post_init__(self):
        if self.existing_reservation_id:
            self.details["existing_reservation_id"] = self.existing_reservation_id
        super().__post_init__()


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_ttl_for_source(source: str) -> int:
    """Get reservation TTL in minutes for a source channel."""
    return RESERVATION_TTL_BY_SOURCE.get(source.lower(), DEFAULT_RESERVATION_TTL)


def calculate_expiry(source: str) -> datetime:
    """Calculate expiry datetime for a reservation."""
    ttl_minutes = get_ttl_for_source(source)
    return datetime.utcnow() + timedelta(minutes=ttl_minutes)
