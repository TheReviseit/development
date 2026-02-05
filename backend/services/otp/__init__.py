"""
OTP Service Package
Enterprise-grade multi-channel OTP platform.
"""

from .providers import (
    get_provider,
    get_supported_channels,
    detect_destination_type,
    OTPProviderInterface,
    OTPContext,
)

__all__ = [
    "get_provider",
    "get_supported_channels", 
    "detect_destination_type",
    "OTPProviderInterface",
    "OTPContext",
]
