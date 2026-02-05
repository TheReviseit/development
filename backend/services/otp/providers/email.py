"""
Email OTP Provider (Resend)
Resend API integration for Email OTP delivery.

Features:
- Resend SDK integration with idempotency
- Email format validation
- Disposable email blocking
- Email-specific retry logic (fewer, slower)
- Bounce handling ready
"""

import os
import re
import time
import logging
from typing import Dict, Any, List, Optional, Set

from .base import (
    OTPProviderInterface,
    OTPContext,
    DeliveryResult,
    DeliveryStatus,
    RetryConfig,
    normalize_email
)
from .errors import (
    InvalidDestinationError,
    DestinationBlockedError,
    CredentialsMissingError,
    ProviderUnavailableError,
    ProviderRateLimitedError
)


logger = logging.getLogger('otp.providers.email')


# Email validation regex (RFC 5322 simplified)
EMAIL_REGEX = re.compile(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
)

# Common disposable email domains (extend as needed)
DISPOSABLE_EMAIL_DOMAINS: Set[str] = {
    'mailinator.com', 'tempmail.com', 'throwaway.email', 'guerrillamail.com',
    'yopmail.com', '10minutemail.com', 'trashmail.com', 'fakeinbox.com',
    'getnada.com', 'temp-mail.org', 'dispostable.com', 'mailnesia.com',
    'tempinbox.com', 'mintemail.com', 'mailcatch.com', 'spamgourmet.com',
    'maildrop.cc', 'inboxbear.com', 'sharklasers.com', 'spam4.me',
    'grr.la', 'discard.email', 'discardmail.com', 'spambox.us',
    'mailslurp.com', 'mohmal.com', 'emailondeck.com', 'tempmailaddress.com',
}

# Risky domains that might indicate abuse
RISKY_DOMAINS: Set[str] = {
    # Add patterns for corporate/enterprise blocking if needed
}


def is_disposable_email(email: str) -> bool:
    """Check if email is from a known disposable email provider."""
    domain = email.split('@')[-1].lower()
    return domain in DISPOSABLE_EMAIL_DOMAINS


def is_risky_email(email: str) -> bool:
    """Check if email domain is considered risky."""
    domain = email.split('@')[-1].lower()
    return domain in RISKY_DOMAINS


class EmailOTPProvider(OTPProviderInterface):
    """
    Resend-based Email OTP provider.
    
    Features:
    - HTML and text email templates
    - Disposable email domain blocking
    - Idempotency headers for retry safety
    - Delivery status tracking via webhooks
    """
    
    def __init__(self):
        """Initialize Email provider with Resend configuration."""
        self.api_key = os.getenv('RESEND_API_KEY')
        self.from_email = os.getenv('OTP_FROM_EMAIL', 'otp@flowauxi.com')
        self.from_name = os.getenv('OTP_FROM_NAME', 'Flowauxi')
        self.reply_to = os.getenv('OTP_REPLY_TO')
        
        # Template configuration
        self.template_id = os.getenv('RESEND_OTP_TEMPLATE_ID')
        
        # Block disposable emails by default
        self.block_disposable = os.getenv('OTP_BLOCK_DISPOSABLE_EMAIL', 'true').lower() == 'true'
        
        # Resend client (lazy loaded)
        self._client = None
    
    @property
    def client(self):
        """Lazy-load Resend client."""
        if self._client is None:
            try:
                import resend
                resend.api_key = self.api_key
                self._client = resend.Emails
            except ImportError:
                raise CredentialsMissingError(
                    "Resend SDK not installed. Run: pip install resend",
                    provider=self.get_provider_name()
                )
        return self._client
    
    def get_channel_type(self) -> str:
        return "email"
    
    def get_provider_name(self) -> str:
        return "Resend"
    
    def get_retry_config(self) -> RetryConfig:
        """
        Email retry config: Fewer retries, longer delays.
        
        Email failures (bounces, invalid addresses) are often permanent.
        Only retry on transient errors (rate limits, network).
        """
        return RetryConfig(
            max_retries=2,
            base_delay_seconds=120.0,
            max_delay_seconds=600.0,
            exponential_base=2.0,
            jitter=True
        )
    
    def get_supported_purposes(self) -> List[str]:
        """Email supports all OTP purposes."""
        return ["login", "signup", "password_reset", "transaction"]
    
    def supports_purpose(self, purpose: str) -> bool:
        """Email supports all standard OTP purposes."""
        return purpose in self.get_supported_purposes()
    
    def validate_destination(self, destination: str) -> bool:
        """
        Validate email address format and check blocklists.
        
        Args:
            destination: Email address to validate
            
        Returns:
            True if valid and allowed
            
        Raises:
            InvalidDestinationError: If format is invalid
            DestinationBlockedError: If email domain is blocked
        """
        email = normalize_email(destination)
        
        # Format validation
        if not EMAIL_REGEX.match(email):
            raise InvalidDestinationError(
                f"Invalid email format: {destination}",
                destination_type="email"
            )
        
        # Disposable email check
        if self.block_disposable and is_disposable_email(email):
            raise DestinationBlockedError(
                "Disposable email addresses are not allowed",
                reason="disposable_email"
            )
        
        # Risky domain check
        if is_risky_email(email):
            raise DestinationBlockedError(
                "Email domain is not allowed",
                reason="risky_domain"
            )
        
        return True
    
    def send_otp(self, context: OTPContext) -> DeliveryResult:
        """
        Send OTP via Resend email API.
        
        Uses idempotency key to prevent duplicate sends on retries.
        
        Args:
            context: OTPContext with delivery information
            
        Returns:
            DeliveryResult with success/failure details
        """
        start_time = time.time()
        
        # Validate API key
        if not self.api_key:
            raise CredentialsMissingError(
                "RESEND_API_KEY not configured",
                provider=self.get_provider_name()
            )
        
        # Validate destination
        try:
            self.validate_destination(context.destination)
        except (InvalidDestinationError, DestinationBlockedError) as e:
            return DeliveryResult(
                success=False,
                status=DeliveryStatus.REJECTED,
                provider=self.get_provider_name(),
                channel=self.get_channel_type(),
                error=str(e),
                error_code=e.error_code,
                retryable=False
            )
        
        email = normalize_email(context.destination)
        
        # Build email content
        subject = self._get_subject(context.purpose, context.business_name)
        html_body = self._get_html_body(context)
        text_body = self._get_text_body(context)
        
        # Prepare email params
        email_params = {
            "from": f"{self.from_name} <{self.from_email}>",
            "to": [email],
            "subject": subject,
            "html": html_body,
            "text": text_body,
            "headers": {
                # Idempotency key prevents duplicate sends on retries
                "X-Entity-Ref-ID": context.request_id
            }
        }
        
        if self.reply_to:
            email_params["reply_to"] = self.reply_to
        
        logger.info(
            f"Sending Email OTP: request_id={context.request_id}, "
            f"to={email[:3]}***@{email.split('@')[1]}"
        )
        
        try:
            # Send via Resend
            response = self.client.send(email_params)
            latency_ms = (time.time() - start_time) * 1000
            
            # Resend returns {'id': 'email_id'} on success
            if isinstance(response, dict) and response.get('id'):
                message_id = response['id']
                logger.info(f"Email OTP sent: id={message_id}")
                
                return DeliveryResult(
                    success=True,
                    status=DeliveryStatus.SENT,
                    provider=self.get_provider_name(),
                    channel=self.get_channel_type(),
                    message_id=message_id,
                    latency_ms=latency_ms,
                    metadata={"email_id": message_id, "purpose": context.purpose}
                )
            else:
                # Unexpected response format
                logger.error(f"Unexpected Resend response: {response}")
                return DeliveryResult(
                    success=False,
                    status=DeliveryStatus.FAILED,
                    provider=self.get_provider_name(),
                    channel=self.get_channel_type(),
                    error="Unexpected response from Resend",
                    error_code="UNEXPECTED_RESPONSE",
                    retryable=True,
                    latency_ms=latency_ms
                )
                
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            error_str = str(e)
            
            # Determine if error is retryable
            retryable = self._is_retryable_error(e)
            
            logger.error(f"Resend API error: {error_str}")
            
            return DeliveryResult(
                success=False,
                status=DeliveryStatus.FAILED,
                provider=self.get_provider_name(),
                channel=self.get_channel_type(),
                error=error_str,
                error_code="RESEND_ERROR",
                retryable=retryable,
                latency_ms=latency_ms
            )
    
    def _get_subject(self, purpose: str, business_name: Optional[str] = None) -> str:
        """Generate email subject based on purpose."""
        brand = business_name or "Flowauxi"
        
        subjects = {
            "login": f"Your {brand} login code",
            "signup": f"Verify your {brand} account",
            "password_reset": f"Reset your {brand} password",
            "transaction": f"Confirm your {brand} transaction",
        }
        
        return subjects.get(purpose, f"Your {brand} verification code")
    
    def _get_html_body(self, context: OTPContext) -> str:
        """Generate HTML email body."""
        brand = context.business_name or "Flowauxi"
        purpose_text = self._get_purpose_text(context.purpose)
        
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                    <tr>
                        <td style="padding: 40px 32px; text-align: center;">
                            <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #111827;">
                                {brand}
                            </h1>
                            <p style="margin: 0 0 32px 0; font-size: 15px; color: #6b7280;">
                                {purpose_text}
                            </p>
                            
                            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                                <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                    Your verification code
                                </p>
                                <p style="margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827; font-family: monospace;">
                                    {context.otp}
                                </p>
                            </div>
                            
                            <p style="margin: 0 0 8px 0; font-size: 13px; color: #9ca3af;">
                                This code expires in 5 minutes.
                            </p>
                            <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                                If you didn't request this code, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                                Sent by {brand} • Do not share this code with anyone
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    
    def _get_text_body(self, context: OTPContext) -> str:
        """Generate plain text email body."""
        brand = context.business_name or "Flowauxi"
        purpose_text = self._get_purpose_text(context.purpose)
        
        return f"""{brand}

{purpose_text}

Your verification code: {context.otp}

This code expires in 5 minutes.

If you didn't request this code, you can safely ignore this email.

--
Sent by {brand}
Do not share this code with anyone.
"""
    
    def _get_purpose_text(self, purpose: str) -> str:
        """Get human-readable purpose description."""
        texts = {
            "login": "Use this code to log in to your account",
            "signup": "Use this code to verify your email address",
            "password_reset": "Use this code to reset your password",
            "transaction": "Use this code to confirm your transaction",
        }
        return texts.get(purpose, "Use this code to verify your identity")
    
    def _is_retryable_error(self, error: Exception) -> bool:
        """Determine if error is retryable."""
        error_str = str(error).lower()
        
        # Rate limit errors are retryable
        if 'rate' in error_str or '429' in error_str:
            return True
        
        # Network errors are retryable
        if 'timeout' in error_str or 'connection' in error_str:
            return True
        
        # Server errors are retryable
        if '500' in error_str or '502' in error_str or '503' in error_str:
            return True
        
        # Invalid email, auth errors are not retryable
        return False
    
    def health_check(self) -> Dict[str, Any]:
        """Check Resend configuration status."""
        health = {
            "provider": self.get_provider_name(),
            "channel": self.get_channel_type(),
            "status": "ok",
            "issues": []
        }
        
        if not self.api_key:
            health["status"] = "error"
            health["issues"].append("RESEND_API_KEY not configured")
        
        if not self.from_email:
            health["status"] = "warning"
            health["issues"].append("OTP_FROM_EMAIL not configured, using default")
        
        health["from_email"] = self.from_email
        health["block_disposable"] = self.block_disposable
        
        return health
