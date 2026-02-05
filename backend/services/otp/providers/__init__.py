"""
OTP Provider Factory
Centralized provider registry and factory for channel routing.
"""

import logging
from typing import Dict, Type, Optional

from .base import OTPProviderInterface, OTPContext
from .whatsapp import WhatsAppOTPProvider
from .email import EmailOTPProvider
from .errors import OTPProviderError


logger = logging.getLogger('otp.providers')


# =============================================================================
# PROVIDER REGISTRY
# =============================================================================

# Map channel types to provider classes
PROVIDER_REGISTRY: Dict[str, Type[OTPProviderInterface]] = {
    "whatsapp": WhatsAppOTPProvider,
    "email": EmailOTPProvider,
}

# Singleton instances for performance
_provider_instances: Dict[str, OTPProviderInterface] = {}


def get_provider(channel: str) -> OTPProviderInterface:
    """
    Get provider instance for the specified channel.
    
    Uses singleton pattern for efficiency.
    
    Args:
        channel: Channel type ("whatsapp", "email", "sms")
        
    Returns:
        Provider instance
        
    Raises:
        ValueError: If channel is not supported
    """
    channel = channel.lower().strip()
    
    if channel not in PROVIDER_REGISTRY:
        raise ValueError(
            f"Unsupported channel: {channel}. "
            f"Supported: {list(PROVIDER_REGISTRY.keys())}"
        )
    
    # Return cached instance or create new
    if channel not in _provider_instances:
        provider_class = PROVIDER_REGISTRY[channel]
        _provider_instances[channel] = provider_class()
        logger.debug(f"Created provider instance for channel: {channel}")
    
    return _provider_instances[channel]


def register_provider(channel: str, provider_class: Type[OTPProviderInterface]) -> None:
    """
    Register a new provider class.
    
    Allows extending with new channels without modifying core code.
    
    Args:
        channel: Channel type identifier
        provider_class: Provider class implementing OTPProviderInterface
    """
    if not issubclass(provider_class, OTPProviderInterface):
        raise TypeError(
            f"Provider class must implement OTPProviderInterface"
        )
    
    PROVIDER_REGISTRY[channel] = provider_class
    
    # Clear cached instance if re-registering
    if channel in _provider_instances:
        del _provider_instances[channel]
    
    logger.info(f"Registered provider: {channel} -> {provider_class.__name__}")


def get_supported_channels() -> list:
    """Get list of supported channel types."""
    return list(PROVIDER_REGISTRY.keys())


def get_provider_for_destination(
    destination: str,
    preferred_channel: Optional[str] = None
) -> OTPProviderInterface:
    """
    Get the appropriate provider based on destination type.
    
    Auto-detects email vs phone if preferred_channel not specified.
    
    Args:
        destination: Email address or phone number
        preferred_channel: Optional channel override
        
    Returns:
        Appropriate provider instance
    """
    if preferred_channel:
        return get_provider(preferred_channel)
    
    # Auto-detect based on destination format
    if '@' in destination:
        return get_provider("email")
    else:
        return get_provider("whatsapp")


def detect_destination_type(destination: str) -> str:
    """
    Detect destination type from format.
    
    Args:
        destination: Email address or phone number
        
    Returns:
        "email" or "phone"
    """
    if '@' in destination:
        return "email"
    else:
        return "phone"


def health_check_all() -> Dict[str, dict]:
    """
    Run health check on all registered providers.
    
    Returns:
        Dict mapping channel to health status
    """
    results = {}
    
    for channel in PROVIDER_REGISTRY:
        try:
            provider = get_provider(channel)
            results[channel] = provider.health_check()
        except Exception as e:
            results[channel] = {
                "provider": channel,
                "status": "error",
                "error": str(e)
            }
    
    return results


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    # Factory
    "get_provider",
    "register_provider",
    "get_supported_channels",
    "get_provider_for_destination",
    "detect_destination_type",
    "health_check_all",
    
    # Base classes
    "OTPProviderInterface",
    "OTPContext",
    
    # Providers
    "WhatsAppOTPProvider",
    "EmailOTPProvider",
    
    # Errors
    "OTPProviderError",
]
