"""
OTP Provider Exceptions
Provider-specific exceptions for clean error handling and retry decisions.
"""

from typing import Optional


class OTPProviderError(Exception):
    """Base exception for all provider errors."""
    
    def __init__(
        self,
        message: str,
        error_code: str = "PROVIDER_ERROR",
        retryable: bool = False,
        provider: str = "unknown"
    ):
        super().__init__(message)
        self.error_code = error_code
        self.retryable = retryable
        self.provider = provider
    
    def to_dict(self) -> dict:
        return {
            "error": self.error_code,
            "message": str(self),
            "retryable": self.retryable,
            "provider": self.provider
        }


class DestinationBlockedError(OTPProviderError):
    """Raised when destination is blocked (blocklist, disposable email, etc.)."""
    
    def __init__(self, message: str, reason: str = "blocked"):
        super().__init__(
            message=message,
            error_code="DESTINATION_BLOCKED",
            retryable=False,
            provider="validation"
        )
        self.reason = reason


class InvalidDestinationError(OTPProviderError):
    """Raised when destination format is invalid."""
    
    def __init__(self, message: str, destination_type: str = "unknown"):
        super().__init__(
            message=message,
            error_code="INVALID_DESTINATION",
            retryable=False,
            provider="validation"
        )
        self.destination_type = destination_type


class ProviderUnavailableError(OTPProviderError):
    """Raised when provider is temporarily unavailable (network, circuit open)."""
    
    def __init__(self, message: str, provider: str):
        super().__init__(
            message=message,
            error_code="PROVIDER_UNAVAILABLE",
            retryable=True,
            provider=provider
        )


class ProviderRateLimitedError(OTPProviderError):
    """Raised when provider rate limits the request."""
    
    def __init__(self, message: str, provider: str, retry_after: Optional[int] = None):
        super().__init__(
            message=message,
            error_code="PROVIDER_RATE_LIMITED",
            retryable=True,
            provider=provider
        )
        self.retry_after = retry_after


class CredentialsMissingError(OTPProviderError):
    """Raised when provider credentials are not configured."""
    
    def __init__(self, message: str, provider: str):
        super().__init__(
            message=message,
            error_code="CREDENTIALS_MISSING",
            retryable=False,
            provider=provider
        )


class TemplateError(OTPProviderError):
    """Raised when template is invalid or not found."""
    
    def __init__(self, message: str, provider: str, template_name: str):
        super().__init__(
            message=message,
            error_code="TEMPLATE_ERROR",
            retryable=False,
            provider=provider
        )
        self.template_name = template_name


class DeliveryRejectedError(OTPProviderError):
    """Raised when provider accepts request but rejects delivery."""
    
    def __init__(self, message: str, provider: str, rejection_code: Optional[str] = None):
        super().__init__(
            message=message,
            error_code="DELIVERY_REJECTED",
            retryable=False,
            provider=provider
        )
        self.rejection_code = rejection_code


class PurposeNotSupportedError(OTPProviderError):
    """Raised when provider doesn't support the requested OTP purpose."""
    
    def __init__(self, message: str, provider: str, purpose: str):
        super().__init__(
            message=message,
            error_code="PURPOSE_NOT_SUPPORTED",
            retryable=False,
            provider=provider
        )
        self.purpose = purpose
