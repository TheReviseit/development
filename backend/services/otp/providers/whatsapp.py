"""
WhatsApp OTP Provider
WhatsApp Cloud API integration for OTP delivery.

Features:
- Meta authentication template support
- E.164 phone number validation
- WhatsApp-specific retry logic
- Delivery receipt handling
"""

import os
import re
import time
import logging
import requests
from typing import Dict, Any, List, Optional

from .base import (
    OTPProviderInterface,
    OTPContext,
    DeliveryResult,
    DeliveryStatus,
    RetryConfig,
    normalize_phone
)
from .errors import (
    InvalidDestinationError,
    CredentialsMissingError,
    TemplateError,
    DeliveryRejectedError,
    ProviderUnavailableError,
    ProviderRateLimitedError,
    PurposeNotSupportedError
)


logger = logging.getLogger('otp.providers.whatsapp')


# Phone number validation regex (E.164 format)
E164_REGEX = re.compile(r'^\+[1-9]\d{6,14}$')

# WhatsApp template configuration
DEFAULT_OTP_TEMPLATE = os.getenv('WHATSAPP_OTP_TEMPLATE', 'auth_otps')
DEFAULT_LANGUAGE = os.getenv('WHATSAPP_OTP_LANGUAGE', 'en')

# Purpose to template mapping (if different templates per purpose)
PURPOSE_TEMPLATES = {
    "login": os.getenv('WHATSAPP_OTP_TEMPLATE', 'auth_otps').strip(),
    "signup": os.getenv('WHATSAPP_OTP_TEMPLATE', 'auth_otps').strip(),
    "password_reset": os.getenv('WHATSAPP_OTP_TEMPLATE', 'auth_otps').strip(),
    "transaction": os.getenv('WHATSAPP_OTP_TEMPLATE', 'auth_otps').strip(),
}


class WhatsAppOTPProvider(OTPProviderInterface):
    """
    WhatsApp Cloud API OTP provider.
    
    Uses Meta's authentication template for OTP delivery.
    Supports both platform (shared) and customer (BYOC) credentials.
    """
    
    def __init__(self):
        """Initialize WhatsApp provider with environment configuration."""
        self.api_version = os.getenv('WHATSAPP_API_VERSION', 'v24.0')
        self.base_url = f"https://graph.facebook.com/{self.api_version}"
        self.timeout = 30  # seconds
        
        # Default credentials (platform mode)
        self.default_phone_number_id = (os.getenv('WHATSAPP_PHONE_NUMBER_ID') or "").strip()
        self.default_access_token = (os.getenv('WHATSAPP_ACCESS_TOKEN') or "").strip()
    
    def get_channel_type(self) -> str:
        return "whatsapp"
    
    def get_provider_name(self) -> str:
        return "WhatsApp Cloud API"
    
    def get_retry_config(self) -> RetryConfig:
        """
        WhatsApp retry config: Fast retries, moderate max attempts.
        
        WhatsApp failures are often transient (rate limits, network).
        """
        return RetryConfig(
            max_retries=3,
            base_delay_seconds=30.0,
            max_delay_seconds=300.0,
            exponential_base=2.0,
            jitter=True
        )
    
    def get_supported_purposes(self) -> List[str]:
        """Get purposes supported by available templates."""
        return list(PURPOSE_TEMPLATES.keys())
    
    def supports_purpose(self, purpose: str) -> bool:
        """
        Check if WhatsApp template supports the purpose.
        
        Currently all purposes use the same auth template,
        but this allows for future purpose-specific templates.
        """
        return purpose in PURPOSE_TEMPLATES
    
    def validate_destination(self, destination: str) -> bool:
        """
        Validate phone number format.
        
        Args:
            destination: Phone number to validate
            
        Returns:
            True if valid E.164 format
            
        Raises:
            InvalidDestinationError: If format is invalid
        """
        # Normalize first
        normalized = normalize_phone(destination)
        
        if not E164_REGEX.match(normalized):
            raise InvalidDestinationError(
                f"Invalid phone number format: {destination}. Must be E.164 format (e.g., +919876543210)",
                destination_type="phone"
            )
        
        return True
    
    def send_otp(self, context: OTPContext) -> DeliveryResult:
        """
        Send OTP via WhatsApp Cloud API.
        
        Uses authentication template with copy_code button.
        
        Args:
            context: OTPContext with delivery information
            
        Returns:
            DeliveryResult with success/failure details
        """
        start_time = time.time()
        
        # Validate destination
        try:
            self.validate_destination(context.destination)
        except InvalidDestinationError as e:
            return DeliveryResult(
                success=False,
                status=DeliveryStatus.REJECTED,
                provider=self.get_provider_name(),
                channel=self.get_channel_type(),
                error=str(e),
                error_code=e.error_code,
                retryable=False
            )
        
        # Check purpose support
        if not self.supports_purpose(context.purpose):
            raise PurposeNotSupportedError(
                f"Purpose '{context.purpose}' not supported by WhatsApp templates",
                provider=self.get_provider_name(),
                purpose=context.purpose
            )
        
        # Get credentials (from context or defaults)
        phone_number_id = context.phone_number_id or self.default_phone_number_id
        access_token = context.access_token or self.default_access_token
        
        if not phone_number_id or not access_token:
            raise CredentialsMissingError(
                "WhatsApp credentials not configured",
                provider=self.get_provider_name()
            )
        
        # Get template for purpose
        template_name = context.template_name or PURPOSE_TEMPLATES.get(
            context.purpose, DEFAULT_OTP_TEMPLATE
        )
        
        # Validate OTP
        if not context.otp or not context.otp.isdigit() or not 4 <= len(context.otp) <= 8:
            raise TemplateError(
                f"OTP must be 4-8 digits, got: '{context.otp}'",
                provider=self.get_provider_name(),
                template_name=template_name
            )
        
        # Format phone for WhatsApp API (remove + prefix)
        whatsapp_phone = normalize_phone(context.destination).lstrip('+')
        
        # Build request
        url = f"{self.base_url}/{phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        # WhatsApp authentication template payload
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": whatsapp_phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": context.language_code or DEFAULT_LANGUAGE},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": context.otp}]
                    },
                    {
                        "type": "button",
                        "sub_type": "url",
                        "index": 0,
                        "parameters": [{"type": "text", "text": context.otp}]
                    }
                ]
            }
        }
        
        logger.info(
            f"Sending WhatsApp OTP: request_id={context.request_id}, "
            f"template={template_name}, to={whatsapp_phone[:6]}***"
        )
        
        try:
            response = requests.post(
                url, headers=headers, json=payload, timeout=self.timeout
            )
            latency_ms = (time.time() - start_time) * 1000
            data = response.json()
            
            if response.status_code == 200:
                # Validate message ID presence
                messages = data.get("messages", [])
                if not messages or not messages[0].get("id"):
                    return DeliveryResult(
                        success=False,
                        status=DeliveryStatus.REJECTED,
                        provider=self.get_provider_name(),
                        channel=self.get_channel_type(),
                        error="WhatsApp accepted but no message ID returned",
                        error_code="WHATSAPP_NO_WAMID",
                        retryable=False,
                        latency_ms=latency_ms
                    )
                
                message_id = messages[0]["id"]
                logger.info(f"WhatsApp OTP sent: wamid={message_id}")
                
                return DeliveryResult(
                    success=True,
                    status=DeliveryStatus.SENT,
                    provider=self.get_provider_name(),
                    channel=self.get_channel_type(),
                    message_id=message_id,
                    latency_ms=latency_ms,
                    metadata={"template": template_name}
                )
            else:
                # Parse WhatsApp error
                error_obj = data.get("error", {})
                error_code = str(error_obj.get("code", "UNKNOWN"))
                error_message = error_obj.get("message", response.text)
                error_subcode = error_obj.get("error_subcode", "")
                
                # Determine if retryable
                retryable = response.status_code in (429, 500, 502, 503, 504)
                
                logger.error(
                    f"WhatsApp API error: code={error_code}, "
                    f"subcode={error_subcode}, message={error_message}"
                )
                
                return DeliveryResult(
                    success=False,
                    status=DeliveryStatus.FAILED,
                    provider=self.get_provider_name(),
                    channel=self.get_channel_type(),
                    error=error_message,
                    error_code=error_code,
                    retryable=retryable,
                    latency_ms=latency_ms,
                    metadata={"http_status": response.status_code}
                )
                
        except requests.Timeout:
            latency_ms = (time.time() - start_time) * 1000
            logger.error(f"WhatsApp API timeout after {self.timeout}s")
            return DeliveryResult(
                success=False,
                status=DeliveryStatus.FAILED,
                provider=self.get_provider_name(),
                channel=self.get_channel_type(),
                error="WhatsApp API timeout",
                error_code="TIMEOUT",
                retryable=True,
                latency_ms=latency_ms
            )
            
        except requests.RequestException as e:
            latency_ms = (time.time() - start_time) * 1000
            logger.error(f"WhatsApp request failed: {e}")
            return DeliveryResult(
                success=False,
                status=DeliveryStatus.FAILED,
                provider=self.get_provider_name(),
                channel=self.get_channel_type(),
                error=f"Network error: {str(e)}",
                error_code="NETWORK_ERROR",
                retryable=True,
                latency_ms=latency_ms
            )
    
    def health_check(self) -> Dict[str, Any]:
        """Check WhatsApp API configuration status."""
        health = {
            "provider": self.get_provider_name(),
            "channel": self.get_channel_type(),
            "status": "ok",
            "issues": []
        }
        
        if not self.default_phone_number_id:
            health["status"] = "error"
            health["issues"].append("WHATSAPP_PHONE_NUMBER_ID not configured")
        
        if not self.default_access_token:
            health["status"] = "error"
            health["issues"].append("WHATSAPP_ACCESS_TOKEN not configured")
        elif len(self.default_access_token) < 50:
            health["status"] = "warning"
            health["issues"].append("WHATSAPP_ACCESS_TOKEN appears invalid (too short)")
        
        health["template"] = DEFAULT_OTP_TEMPLATE
        health["language"] = DEFAULT_LANGUAGE
        
        return health
