"""
Domain Schemas - Pydantic Models for Strict Validation
Provides type-safe data structures with automatic validation.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from enum import Enum
from pydantic import BaseModel, Field, field_validator, model_validator
import re
import hashlib
import json


class OrderStatus(str, Enum):
    """Valid order states with transition rules."""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    
    @classmethod
    def valid_transitions(cls) -> Dict["OrderStatus", List["OrderStatus"]]:
        """Define valid state transitions."""
        return {
            cls.PENDING: [cls.CONFIRMED, cls.CANCELLED],
            cls.CONFIRMED: [cls.PROCESSING, cls.CANCELLED],
            cls.PROCESSING: [cls.COMPLETED, cls.CANCELLED],
            cls.COMPLETED: [],  # Terminal state
            cls.CANCELLED: [],  # Terminal state
        }
    
    def can_transition_to(self, target: "OrderStatus") -> bool:
        """Check if transition is valid."""
        return target in self.valid_transitions().get(self, [])


class OrderSource(str, Enum):
    """Order creation source for tracking."""
    MANUAL = "manual"      # Dashboard/admin
    AI = "ai"              # AI chatbot
    API = "api"            # External API
    WEBHOOK = "webhook"    # WhatsApp/integration
    COD = "cod"            # Cash on Delivery orders


class OrderItem(BaseModel):
    """
    Individual item in an order.
    Strictly validated with business rules.
    """
    name: str = Field(..., min_length=1, max_length=255)
    quantity: int = Field(..., ge=1, le=9999)
    price: Optional[Decimal] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=500)
    sku: Optional[str] = Field(None, max_length=100)
    # Stable product references for inventory/reporting
    product_id: Optional[str] = Field(None, max_length=255, description="Stable product identifier")
    variant_id: Optional[str] = Field(None, max_length=255, description="Variant identifier (size/color combo)")
    variant_display: Optional[str] = Field(None, max_length=255, description="Human-readable variant (e.g., 'Size: L, Color: Blue')")
    # Explicit size and color fields for database storage
    size: Optional[str] = Field(None, max_length=50, description="Selected size")
    color: Optional[str] = Field(None, max_length=50, description="Selected color")
    
    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        """Sanitize item name."""
        return v.strip()[:255]
    
    @field_validator("quantity", mode="before")
    @classmethod
    def validate_quantity(cls, v):
        """Ensure quantity is positive integer."""
        if isinstance(v, float):
            v = int(v)
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "name": self.name,
            "quantity": self.quantity,
            "price": float(self.price) if self.price else None,
            "unit": self.unit,
            "notes": self.notes,
            "sku": self.sku,
            "product_id": self.product_id,
            "variant_id": self.variant_id,
            "variant_display": self.variant_display,
            "size": self.size,
            "color": self.color,
        }


class IdempotencyKey(BaseModel):
    """
    Idempotency key for preventing duplicate orders.
    
    Can be:
    1. Client-provided (X-Idempotency-Key header)
    2. Hash-based fingerprint (computed from order data)
    """
    key: str = Field(..., min_length=16, max_length=255)
    source: str = Field("client")  # "client" or "fingerprint"
    
    @classmethod
    def from_header(cls, header_value: str) -> "IdempotencyKey":
        """Create from client-provided header."""
        return cls(key=header_value.strip(), source="client")
    
    @classmethod
    def from_fingerprint(
        cls,
        user_id: str,
        customer_phone: str,
        items: List[Dict],
        window_minutes: int = 5
    ) -> "IdempotencyKey":
        """
        Generate fingerprint-based idempotency key.
        
        Creates a hash from:
        - user_id (business)
        - customer_phone
        - sorted items
        - time window (rounded to prevent slight timing differences)
        """
        # Create deterministic item representation
        sorted_items = sorted(
            [{"name": i.get("name", "").lower().strip(), "qty": i.get("quantity", 1)} 
             for i in items],
            key=lambda x: x["name"]
        )
        
        # Round timestamp to window
        now = datetime.utcnow()
        window_start = now.replace(
            minute=(now.minute // window_minutes) * window_minutes,
            second=0,
            microsecond=0
        )
        
        # Build fingerprint
        fingerprint_data = {
            "user_id": user_id,
            "phone": customer_phone,
            "items": sorted_items,
            "window": window_start.isoformat(),
        }
        
        fingerprint = hashlib.sha256(
            json.dumps(fingerprint_data, sort_keys=True).encode()
        ).hexdigest()[:32]
        
        return cls(key=f"fp_{fingerprint}", source="fingerprint")


class OrderCreate(BaseModel):
    """
    Order creation request schema.
    Validates all input before processing.
    """
    user_id: str = Field(..., min_length=1, max_length=255)
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_phone: str = Field(..., min_length=10, max_length=20)
    customer_address: Optional[str] = Field(None, max_length=500)
    items: List[OrderItem] = Field(..., min_length=1, max_length=100)
    status: OrderStatus = OrderStatus.PENDING
    source: OrderSource = OrderSource.MANUAL
    notes: Optional[str] = Field(None, max_length=2000)
    
    # Idempotency (optional - will be auto-generated if not provided)
    idempotency_key: Optional[str] = Field(None, max_length=255)
    
    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        """Validate and normalize phone number."""
        phone = re.sub(r'[\s\-\(\)\+]', '', v)
        if not phone.isdigit():
            raise ValueError("Phone number must contain only digits")
        if len(phone) < 10:
            raise ValueError("Phone number must be at least 10 digits")
        return phone
    
    @field_validator("customer_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Sanitize customer name."""
        return v.strip()[:255]
    
    @model_validator(mode="after")
    def validate_items_not_empty(self) -> "OrderCreate":
        """Ensure items list is not empty."""
        if not self.items:
            raise ValueError("At least one item is required")
        return self
    
    def get_total_quantity(self) -> int:
        """Calculate total quantity across all items."""
        return sum(item.quantity for item in self.items)
    
    def get_idempotency_key(self) -> IdempotencyKey:
        """Get or generate idempotency key."""
        if self.idempotency_key:
            return IdempotencyKey.from_header(self.idempotency_key)
        return IdempotencyKey.from_fingerprint(
            user_id=self.user_id,
            customer_phone=self.customer_phone,
            items=[i.model_dump() for i in self.items]
        )


class OrderUpdate(BaseModel):
    """Order update request schema."""
    customer_name: Optional[str] = Field(None, min_length=1, max_length=255)
    customer_phone: Optional[str] = Field(None, min_length=10, max_length=20)
    customer_address: Optional[str] = Field(None, max_length=500)
    items: Optional[List[OrderItem]] = Field(None, min_length=1, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    status: Optional[OrderStatus] = None
    
    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        phone = re.sub(r'[\s\-\(\)\+]', '', v)
        if not phone.isdigit():
            raise ValueError("Phone number must contain only digits")
        return phone


class OrderResponse(BaseModel):
    """Order API response schema."""
    id: str
    user_id: str
    customer_name: str
    customer_phone: str
    customer_address: Optional[str] = None
    items: List[Dict[str, Any]]
    total_quantity: int
    status: OrderStatus
    source: OrderSource
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Idempotency tracking
    idempotency_key: Optional[str] = None
    
    class Config:
        from_attributes = True

