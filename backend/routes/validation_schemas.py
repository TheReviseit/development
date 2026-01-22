"""
Validation Schemas for Payment Routes
Pydantic V2 schemas with stable idempotency key generation
"""

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field, field_validator


# =============================================================================
# Request ID Generation
# =============================================================================

def generate_request_id() -> str:
    """Generate a unique request ID for tracing."""
    return f"req_{uuid.uuid4().hex[:16]}"


def generate_stable_idempotency_key(
    user_id: str,
    plan_id: str,
    currency: str = "INR",
    interval: str = "monthly"
) -> str:
    """
    Generate a stable idempotency key for subscription creation.
    
    Key pattern: hash(user_id + plan_id + currency + interval)
    This ensures the same attempt always gets the same key,
    preventing accidental double-charges.
    """
    data = f"{user_id}:{plan_id}:{currency}:{interval}"
    return f"idem_{hashlib.sha256(data.encode()).hexdigest()[:24]}"


# =============================================================================
# Subscription Schemas
# =============================================================================

class CreateSubscriptionRequest(BaseModel):
    """Schema for subscription creation request."""
    plan_name: Literal["starter", "business", "pro"]
    customer_email: EmailStr
    customer_name: Optional[str] = Field(None, max_length=100)
    customer_phone: Optional[str] = Field(None, max_length=15)
    idempotency_key: Optional[str] = Field(
        None, 
        description="Client-provided idempotency key. If not provided, one will be generated."
    )
    
    @field_validator('customer_phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # Remove spaces and validate format
        v = v.replace(" ", "").replace("-", "")
        if v and not v.replace("+", "").isdigit():
            raise ValueError("Invalid phone number format")
        return v
    
    @field_validator('customer_name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # Sanitize name (remove special characters that could cause issues)
        return v.strip()[:100] if v else None


class VerifyPaymentRequest(BaseModel):
    """Schema for payment verification request."""
    razorpay_subscription_id: str = Field(..., min_length=10, max_length=50)
    razorpay_payment_id: str = Field(..., min_length=10, max_length=50)
    razorpay_signature: str = Field(..., min_length=64, max_length=128)
    
    @field_validator('razorpay_subscription_id')
    @classmethod
    def validate_subscription_id(cls, v: str) -> str:
        if not v.startswith('sub_'):
            raise ValueError("Invalid subscription ID format")
        return v
    
    @field_validator('razorpay_payment_id')
    @classmethod
    def validate_payment_id(cls, v: str) -> str:
        if not v.startswith('pay_'):
            raise ValueError("Invalid payment ID format")
        return v


class CancelSubscriptionRequest(BaseModel):
    """Schema for subscription cancellation request."""
    reason: Optional[str] = Field(None, max_length=500)
    cancel_immediately: bool = Field(
        False, 
        description="If true, cancel immediately. If false, cancel at period end."
    )


# =============================================================================
# Response Schemas
# =============================================================================

class SubscriptionStatus(BaseModel):
    """Subscription status enum with proper state machine."""
    status: Literal[
        "created",      # Initial state when subscription record created
        "pending",      # Waiting for payment
        "processing",   # Payment in progress (after verify, before webhook)
        "completed",    # Payment confirmed via webhook (ACTIVE)
        "active",       # Alias for completed (backward compatibility)
        "failed",       # Payment failed
        "cancelled",    # User cancelled
        "expired",      # Session expired (>15 min in pending/processing)
        "halted"        # Razorpay halted due to payment issues
    ]


class ErrorResponse(BaseModel):
    """Structured error response."""
    success: Literal[False] = False
    error: str
    error_code: str
    request_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    
    @classmethod
    def create(
        cls, 
        error: str, 
        error_code: str, 
        request_id: str
    ) -> "ErrorResponse":
        return cls(
            error=error,
            error_code=error_code,
            request_id=request_id
        )


class SuccessResponse(BaseModel):
    """Generic success response."""
    success: Literal[True] = True
    request_id: str
    data: dict = Field(default_factory=dict)
    

# =============================================================================
# Webhook Event Schema
# =============================================================================

class WebhookEventRecord(BaseModel):
    """Schema for storing processed webhook events."""
    event_id: str = Field(..., description="Razorpay event ID")
    event_type: str = Field(..., description="Event type e.g. subscription.activated")
    subscription_id: Optional[str] = None
    payment_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    processed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    
# =============================================================================
# State Machine Helpers
# =============================================================================

# Valid state transitions
VALID_TRANSITIONS = {
    "created": ["pending", "failed", "expired"],
    "pending": ["processing", "failed", "expired", "cancelled"],
    "processing": ["completed", "failed", "expired"],  # Note: NOT active
    "completed": ["cancelled", "halted"],  # completed = active
    "active": ["cancelled", "halted"],  # alias
    "failed": ["pending"],  # Allow retry
    "cancelled": [],  # Terminal
    "expired": ["pending"],  # Allow retry
    "halted": ["active", "cancelled"]  # Can resume or cancel
}


def can_transition(current_status: str, new_status: str) -> bool:
    """
    Check if a state transition is valid.
    
    CRITICAL: Only webhooks can set COMPLETED/ACTIVE status.
    Verify endpoint can only set PROCESSING.
    """
    current = current_status.lower()
    new = new_status.lower()
    
    # Normalize active/completed
    if current == "active":
        current = "completed"
    if new == "active":
        new = "completed"
    
    allowed = VALID_TRANSITIONS.get(current, [])
    return new in allowed


def is_terminal_state(status: str) -> bool:
    """Check if status is a terminal state (no further transitions)."""
    return status.lower() in ["cancelled"]


def should_ignore_webhook_event(current_status: str, event_type: str) -> bool:
    """
    Determine if a webhook event should be ignored based on current state.
    
    Implements event ordering safety:
    - If already COMPLETED, ignore downgrade events like pending/failed
    - Unless the event is a legitimate cancellation or halt
    """
    current = current_status.lower()
    
    # If already completed/active, ignore most events
    if current in ["completed", "active"]:
        # Only process these events for completed subscriptions
        allowed_events = [
            "subscription.cancelled",
            "subscription.halted",
            "subscription.charged",  # Recurring payment
            "payment.captured",      # Additional capture
            "refund.created"         # Refund
        ]
        return event_type not in allowed_events
    
    return False
