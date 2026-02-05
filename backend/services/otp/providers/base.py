"""
OTP Provider Abstract Base Class
Defines the interface that all OTP delivery providers must implement.

Design Principles:
- Channel-agnostic interface
- Provider-specific retry configuration
- Destination validation inside provider
- Purpose support checking
"""

import os
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum


logger = logging.getLogger('otp.providers.base')


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class RetryConfig:
    """
    Provider-specific retry configuration.
    
    Different channels have different retry characteristics:
    - WhatsApp: Fast retries, higher max retries (transient failures common)
    - Email: Slower retries, fewer attempts (bounces are usually permanent)
    - SMS: Medium retries, carrier-dependent
    """
    max_retries: int = 3
    base_delay_seconds: float = 30.0
    max_delay_seconds: float = 300.0
    exponential_base: float = 2.0
    jitter: bool = True  # Add randomness to prevent thundering herd
    
    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt number."""
        import random
        delay = min(
            self.base_delay_seconds * (self.exponential_base ** attempt),
            self.max_delay_seconds
        )
        if self.jitter:
            delay = delay * (0.5 + random.random())  # 50-150% of delay
        return delay


class DeliveryStatus(str, Enum):
    """Delivery attempt status."""
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    REJECTED = "rejected"


@dataclass
class DeliveryResult:
    """
    Result of an OTP delivery attempt.
    
    Immutable record of delivery outcome for:
    - API response building
    - Audit logging
    - Billing decisions
    """
    success: bool
    status: DeliveryStatus
    provider: str
    channel: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    retryable: bool = False
    latency_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "status": self.status.value,
            "provider": self.provider,
            "channel": self.channel,
            "message_id": self.message_id,
            "error": self.error,
            "error_code": self.error_code,
            "retryable": self.retryable,
            "latency_ms": self.latency_ms,
            "timestamp": self.timestamp.isoformat() + "Z"
        }


@dataclass
class OTPContext:
    """
    Context for an OTP delivery request.
    
    Contains all information needed for delivery without
    exposing internal implementation details.
    """
    request_id: str
    destination: str
    destination_type: str  # "phone" | "email"
    otp: str
    purpose: str
    business_id: str
    business_name: Optional[str] = None
    template_name: Optional[str] = None
    language_code: str = "en"
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Credentials (populated by provider factory)
    phone_number_id: Optional[str] = None
    access_token: Optional[str] = None
    resend_api_key: Optional[str] = None


# =============================================================================
# ABSTRACT PROVIDER INTERFACE
# =============================================================================

class OTPProviderInterface(ABC):
    """
    Abstract base class for OTP delivery providers.
    
    All providers must implement:
    - send_otp(): Deliver OTP to destination
    - validate_destination(): Check destination format
    - get_channel_type(): Return channel identifier
    - get_retry_config(): Return retry configuration
    - supports_purpose(): Check if purpose is supported
    
    Optional overrides:
    - get_supported_purposes(): List of supported purposes
    - get_templates(): Available templates for provider
    """
    
    @abstractmethod
    def send_otp(self, context: OTPContext) -> DeliveryResult:
        """
        Send OTP to the destination.
        
        Args:
            context: OTPContext with all delivery information
            
        Returns:
            DeliveryResult with success/failure details
            
        Raises:
            OTPProviderError subclass for specific failures
        """
        pass
    
    @abstractmethod
    def validate_destination(self, destination: str) -> bool:
        """
        Validate destination format for this provider.
        
        Args:
            destination: Phone number or email address
            
        Returns:
            True if valid, False otherwise
            
        Raises:
            InvalidDestinationError: If format is invalid
            DestinationBlockedError: If destination is blocked
        """
        pass
    
    @abstractmethod
    def get_channel_type(self) -> str:
        """
        Get the channel type identifier.
        
        Returns:
            Channel type: "whatsapp" | "email" | "sms"
        """
        pass
    
    @abstractmethod
    def get_retry_config(self) -> RetryConfig:
        """
        Get retry configuration for this provider.
        
        Returns:
            RetryConfig with provider-specific settings
        """
        pass
    
    @abstractmethod
    def supports_purpose(self, purpose: str) -> bool:
        """
        Check if provider supports the given OTP purpose.
        
        WhatsApp templates may restrict purposes,
        while email typically supports all purposes.
        
        Args:
            purpose: OTP purpose (login, signup, password_reset, transaction)
            
        Returns:
            True if purpose is supported
        """
        pass
    
    def get_supported_purposes(self) -> List[str]:
        """
        Get list of supported OTP purposes.
        
        Returns:
            List of purpose strings
        """
        return ["login", "signup", "password_reset", "transaction"]
    
    def get_provider_name(self) -> str:
        """
        Get human-readable provider name.
        
        Returns:
            Provider name (e.g., "WhatsApp Cloud API", "Resend")
        """
        return self.__class__.__name__
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check provider health/configuration status.
        
        Returns:
            Dict with health status and any issues
        """
        return {
            "provider": self.get_provider_name(),
            "channel": self.get_channel_type(),
            "status": "unknown",
            "message": "Health check not implemented"
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def normalize_phone(phone: str) -> str:
    """
    Normalize phone number to E.164 format.
    
    Args:
        phone: Raw phone number input
        
    Returns:
        Normalized phone in E.164 format
    """
    # Remove spaces, dashes, parentheses
    phone = ''.join(c for c in phone if c.isdigit() or c == '+')
    
    # Ensure + prefix
    if not phone.startswith('+'):
        # Assume India if no country code and 10 digits
        if len(phone) == 10:
            phone = '+91' + phone
        else:
            phone = '+' + phone
    
    return phone


def normalize_email(email: str) -> str:
    """
    Normalize email address.
    
    Args:
        email: Raw email input
        
    Returns:
        Normalized lowercase email
    """
    return email.lower().strip()
