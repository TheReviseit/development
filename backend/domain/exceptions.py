"""
Domain Exceptions - Typed Error Hierarchy
Provides structured error handling with clean API responses.

Exception Hierarchy:
    OrderError (base)
    ├── ValidationError      - Invalid input data
    ├── BusinessRuleError    - Business logic violations
    │   ├── DuplicateOrderError
    │   ├── InvalidOrderStateError
    │   └── SlotUnavailableError
    ├── IntegrationError     - External service failures
    └── SystemError          - Infrastructure failures
"""

from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum


class ErrorCode(str, Enum):
    """Standardized error codes for API responses."""
    # Validation errors (400)
    INVALID_INPUT = "INVALID_INPUT"
    MISSING_FIELD = "MISSING_FIELD"
    INVALID_FORMAT = "INVALID_FORMAT"
    INVALID_ITEM = "INVALID_ITEM"
    
    # Business rule errors (409, 422)
    DUPLICATE_ORDER = "DUPLICATE_ORDER"
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION"
    SLOT_UNAVAILABLE = "SLOT_UNAVAILABLE"
    ORDER_LIMIT_EXCEEDED = "ORDER_LIMIT_EXCEEDED"
    CAPABILITY_DISABLED = "CAPABILITY_DISABLED"
    
    # Integration errors (502, 503)
    EXTERNAL_SERVICE_UNAVAILABLE = "EXTERNAL_SERVICE_UNAVAILABLE"
    SHEETS_SYNC_FAILED = "SHEETS_SYNC_FAILED"
    AI_SERVICE_ERROR = "AI_SERVICE_ERROR"
    
    # System errors (500)
    DATABASE_ERROR = "DATABASE_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"


@dataclass
class OrderError(Exception):
    """
    Base exception for all order-related errors.
    
    Provides structured error information for:
    - Clean API responses (no stack traces leaked)
    - Logging with context
    - Error categorization for monitoring
    """
    message: str
    code: ErrorCode = ErrorCode.INTERNAL_ERROR
    details: Dict[str, Any] = field(default_factory=dict)
    correlation_id: Optional[str] = None
    http_status: int = 500
    
    def __post_init__(self):
        super().__init__(self.message)
    
    def to_api_response(self) -> Dict[str, Any]:
        """Convert to clean API response (safe for clients)."""
        response = {
            "success": False,
            "error": {
                "code": self.code.value,
                "message": self.message,
            }
        }
        
        # Only include safe details
        if self.details:
            safe_details = {
                k: v for k, v in self.details.items()
                if k in ("field", "expected", "received", "missing_fields", "order_id")
            }
            if safe_details:
                response["error"]["details"] = safe_details
        
        if self.correlation_id:
            response["correlation_id"] = self.correlation_id
        
        return response
    
    def to_log_dict(self) -> Dict[str, Any]:
        """Convert to logging dict (includes all context).
        
        Note: Uses 'error_message' instead of 'message' to avoid
        conflict with Python logging's reserved LogRecord keys.
        """
        return {
            "error_type": self.__class__.__name__,
            "code": self.code.value,
            "error_message": self.message,  # Renamed to avoid LogRecord conflict
            "details": self.details,
            "correlation_id": self.correlation_id,
            "http_status": self.http_status,
        }


@dataclass
class ValidationError(OrderError):
    """
    Invalid input data errors.
    
    Examples:
    - Missing required fields
    - Invalid field formats
    - Schema violations
    """
    code: ErrorCode = ErrorCode.INVALID_INPUT
    http_status: int = 400
    invalid_fields: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        if self.invalid_fields:
            self.details["invalid_fields"] = self.invalid_fields
        super().__post_init__()


@dataclass
class BusinessRuleError(OrderError):
    """
    Business logic violation errors.
    
    Examples:
    - Order limits exceeded
    - Invalid state transitions
    - Capability not enabled
    """
    code: ErrorCode = ErrorCode.INVALID_STATE_TRANSITION
    http_status: int = 422


@dataclass
class DuplicateOrderError(BusinessRuleError):
    """Duplicate order detected via idempotency key or fingerprint."""
    code: ErrorCode = ErrorCode.DUPLICATE_ORDER
    http_status: int = 409
    existing_order_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    
    def __post_init__(self):
        if self.existing_order_id:
            self.details["existing_order_id"] = self.existing_order_id
        if self.idempotency_key:
            self.details["idempotency_key"] = self.idempotency_key
        super().__post_init__()


@dataclass
class OrderNotFoundError(OrderError):
    """Order does not exist."""
    code: ErrorCode = ErrorCode.INVALID_INPUT
    http_status: int = 404
    order_id: Optional[str] = None
    
    def __post_init__(self):
        if self.order_id:
            self.details["order_id"] = self.order_id
        super().__post_init__()


@dataclass
class InvalidOrderStateError(BusinessRuleError):
    """Invalid order state transition."""
    current_state: Optional[str] = None
    target_state: Optional[str] = None
    
    def __post_init__(self):
        if self.current_state:
            self.details["current_state"] = self.current_state
        if self.target_state:
            self.details["target_state"] = self.target_state
        super().__post_init__()


@dataclass
class SlotUnavailableError(BusinessRuleError):
    """Time slot is not available for booking."""
    code: ErrorCode = ErrorCode.SLOT_UNAVAILABLE
    http_status: int = 409
    requested_date: Optional[str] = None
    requested_time: Optional[str] = None
    available_slots: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        if self.requested_date:
            self.details["requested_date"] = self.requested_date
        if self.requested_time:
            self.details["requested_time"] = self.requested_time
        if self.available_slots:
            self.details["available_slots"] = self.available_slots
        super().__post_init__()


@dataclass
class IntegrationError(OrderError):
    """External service failure."""
    code: ErrorCode = ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE
    http_status: int = 502
    service_name: Optional[str] = None
    
    def __post_init__(self):
        if self.service_name:
            self.details["service"] = self.service_name
        super().__post_init__()


@dataclass  
class SystemError(OrderError):
    """Infrastructure/system failure."""
    code: ErrorCode = ErrorCode.INTERNAL_ERROR
    http_status: int = 500

