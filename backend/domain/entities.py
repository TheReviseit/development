"""
Domain Entities - Core Business Objects
Rich domain models with business logic encapsulated.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from dataclasses import dataclass, field
import hashlib
import json
import uuid

from .schemas import OrderStatus, OrderSource, OrderItem


@dataclass
class OrderFingerprint:
    """
    Order fingerprint for duplicate detection.
    Used to identify semantically identical orders.
    """
    hash: str
    components: Dict[str, Any]
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    @classmethod
    def create(
        cls,
        user_id: str,
        customer_phone: str,
        items: List[Dict[str, Any]],
        window_minutes: int = 5
    ) -> "OrderFingerprint":
        """
        Create fingerprint from order data.
        
        Orders within the same window with same:
        - business (user_id)
        - customer phone
        - items (name + quantity)
        
        ...are considered duplicates.
        """
        # Normalize items for comparison
        normalized_items = sorted(
            [
                {
                    "name": str(i.get("name", "")).lower().strip(),
                    "quantity": int(i.get("quantity", 1))
                }
                for i in items
            ],
            key=lambda x: x["name"]
        )
        
        # Create time window bucket
        now = datetime.utcnow()
        window_bucket = now.replace(
            minute=(now.minute // window_minutes) * window_minutes,
            second=0,
            microsecond=0
        )
        
        components = {
            "user_id": user_id,
            "customer_phone": customer_phone,
            "items": normalized_items,
            "window": window_bucket.isoformat(),
        }
        
        fingerprint_hash = hashlib.sha256(
            json.dumps(components, sort_keys=True).encode()
        ).hexdigest()
        
        return cls(hash=fingerprint_hash, components=components)
    
    def __eq__(self, other: "OrderFingerprint") -> bool:
        return self.hash == other.hash
    
    def __hash__(self) -> int:
        return hash(self.hash)


@dataclass
class Order:
    """
    Order domain entity with business logic.
    
    This is the core domain object that encapsulates:
    - Order data
    - State transitions
    - Business rules
    """
    id: str
    user_id: str
    customer_name: str
    customer_phone: str
    customer_address: Optional[str]
    customer_email: Optional[str]
    items: List[Dict[str, Any]]
    total_quantity: int
    status: OrderStatus
    source: OrderSource
    notes: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    # Idempotency tracking
    idempotency_key: Optional[str] = None
    fingerprint: Optional[str] = None
    
    # Human-readable short order ID (e.g., "28C2CF22")
    order_id: Optional[str] = None
    
    # Audit fields
    version: int = 1
    created_by: Optional[str] = None
    
    @classmethod
    def create(
        cls,
        user_id: str,
        customer_name: str,
        customer_phone: str,
        items: List[OrderItem],
        customer_address: Optional[str] = None,
        customer_email: Optional[str] = None,
        source: OrderSource = OrderSource.MANUAL,
        notes: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> "Order":
        """
        Factory method to create new order.
        Calculates derived fields automatically.
        """
        now = datetime.utcnow()
        order_id = str(uuid.uuid4())
        
        items_data = [item.to_dict() for item in items]
        total_qty = sum(item.quantity for item in items)
        
        # Generate fingerprint
        fingerprint = OrderFingerprint.create(
            user_id=user_id,
            customer_phone=customer_phone,
            items=items_data
        )
        
        # Generate short human-readable order ID (first 8 chars of UUID, uppercase)
        short_order_id = order_id[:8].upper()
        
        return cls(
            id=order_id,
            user_id=user_id,
            customer_name=customer_name,
            customer_phone=customer_phone,
            customer_address=customer_address,
            customer_email=customer_email,
            items=items_data,
            total_quantity=total_qty,
            status=OrderStatus.PENDING,
            source=source,
            notes=notes,
            created_at=now,
            updated_at=now,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint.hash,
            order_id=short_order_id,
        )
    
    def can_transition_to(self, new_status: OrderStatus) -> bool:
        """Check if state transition is allowed."""
        return self.status.can_transition_to(new_status)
    
    def transition_to(self, new_status: OrderStatus) -> None:
        """
        Transition to new status with validation.
        Raises InvalidOrderStateError if transition not allowed.
        """
        from .exceptions import InvalidOrderStateError
        
        if not self.can_transition_to(new_status):
            raise InvalidOrderStateError(
                message=f"Cannot transition from {self.status.value} to {new_status.value}",
                current_state=self.status.value,
                target_state=new_status.value,
            )
        
        self.status = new_status
        self.updated_at = datetime.utcnow()
        self.version += 1
    
    def update(
        self,
        customer_name: Optional[str] = None,
        customer_phone: Optional[str] = None,
        customer_address: Optional[str] = None,
        customer_email: Optional[str] = None,
        items: Optional[List[OrderItem]] = None,
        notes: Optional[str] = None,
    ) -> None:
        """Update order fields."""
        if customer_name is not None:
            self.customer_name = customer_name
        if customer_phone is not None:
            self.customer_phone = customer_phone
        if customer_address is not None:
            self.customer_address = customer_address
        if customer_email is not None:
            self.customer_email = customer_email
        if items is not None:
            self.items = [item.to_dict() for item in items]
            self.total_quantity = sum(item.quantity for item in items)
        if notes is not None:
            self.notes = notes
        
        self.updated_at = datetime.utcnow()
        self.version += 1
    
    def cancel(self) -> None:
        """Cancel the order."""
        self.transition_to(OrderStatus.CANCELLED)
    
    def confirm(self) -> None:
        """Confirm the order."""
        self.transition_to(OrderStatus.CONFIRMED)
    
    def is_terminal(self) -> bool:
        """Check if order is in terminal state."""
        return self.status in (OrderStatus.COMPLETED, OrderStatus.CANCELLED)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "id": self.id,
            "order_id": self.order_id,  # Short human-readable ID
            "user_id": self.user_id,
            "customer_name": self.customer_name,
            "customer_phone": self.customer_phone,
            "customer_address": self.customer_address,
            "customer_email": self.customer_email,
            "items": self.items,
            "total_quantity": self.total_quantity,
            "status": self.status.value,
            "source": self.source.value,
            "notes": self.notes,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "idempotency_key": self.idempotency_key,
            "fingerprint": self.fingerprint,
            "version": self.version,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Order":
        """Create from dictionary (database row)."""
        # Generate order_id from id if not present (for backward compatibility)
        order_id = data.get("order_id")
        if not order_id and data.get("id"):
            order_id = data["id"][:8].upper()
        
        return cls(
            id=data["id"],
            user_id=data["user_id"],
            customer_name=data["customer_name"],
            customer_phone=data["customer_phone"],
            customer_address=data.get("customer_address"),
            customer_email=data.get("customer_email"),
            items=data.get("items", []),
            total_quantity=data.get("total_quantity", 0),
            status=OrderStatus(data.get("status", "pending")),
            source=OrderSource(data.get("source", "manual")),
            notes=data.get("notes"),
            created_at=cls._parse_datetime(data.get("created_at")),
            updated_at=cls._parse_datetime(data.get("updated_at")),
            idempotency_key=data.get("idempotency_key"),
            fingerprint=data.get("fingerprint"),
            order_id=order_id,
            version=data.get("version", 1),
        )
    
    @staticmethod
    def _parse_datetime(value) -> datetime:
        """Parse datetime from various formats."""
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return datetime.utcnow()
        return datetime.utcnow()

