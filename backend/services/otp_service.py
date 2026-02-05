"""
OTP Service - Core Business Logic
Production-Grade OTP Platform

Features:
- Cryptographically secure OTP generation
- HMAC-SHA256 OTP hashing (never store plaintext)
- Purpose-scoped verification
- Idempotency support
- Rate limiting with auto-blacklist
- Channel escalation for resends
- Webhook notifications
"""

import os
import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger('otp.service')

# =============================================================================
# CONFIGURATION
# =============================================================================

OTP_SALT = os.getenv('OTP_HASH_SALT', 'flowauxi-otp-salt-change-in-production')
DEFAULT_OTP_LENGTH = 6
DEFAULT_TTL_SECONDS = 300  # 5 minutes
MAX_VERIFY_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
MAX_RESENDS = 3

# Rate limit configuration (hybrid approach)
RATE_LIMIT_GLOBAL_PER_HOUR = 10
RATE_LIMIT_PER_PURPOSE_COUNT = 3
RATE_LIMIT_PER_PURPOSE_WINDOW = 300  # 5 minutes

# Blacklist configuration
RATE_VIOLATION_THRESHOLD = 3  # Auto-block after 3 violations
BLOCK_DURATION_HOURS = 24


class OTPPurpose(str, Enum):
    LOGIN = "login"
    SIGNUP = "signup"
    PASSWORD_RESET = "password_reset"
    TRANSACTION = "transaction"


class OTPStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    EXPIRED = "expired"


class DeliveryStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"


class DeliveryChannel(str, Enum):
    WHATSAPP = "whatsapp"
    SMS = "sms"
    EMAIL = "email"


@dataclass
class OTPRequest:
    """Represents an OTP request."""
    request_id: str
    business_id: str
    phone: str
    purpose: str
    otp_hash: str
    expires_at: datetime
    status: str = OTPStatus.PENDING
    delivery_status: str = DeliveryStatus.QUEUED
    channel: str = DeliveryChannel.WHATSAPP
    resend_count: int = 0
    attempts: int = 0


# =============================================================================
# OTP GENERATION & HASHING
# =============================================================================

def generate_otp(length: int = DEFAULT_OTP_LENGTH) -> str:
    """
    Generate a cryptographically secure numeric OTP.
    
    Uses secrets.randbelow() for secure random number generation.
    
    Args:
        length: Number of digits (4-8, default 6)
        
    Returns:
        Numeric OTP string with leading zeros preserved
    """
    if not 4 <= length <= 8:
        length = DEFAULT_OTP_LENGTH
    
    # Generate random number in range [0, 10^length)
    max_value = 10 ** length
    otp_num = secrets.randbelow(max_value)
    
    # Format with leading zeros
    return str(otp_num).zfill(length)


def hash_otp(otp: str, phone: str, purpose: str) -> str:
    """
    Hash OTP using HMAC-SHA256.
    
    Includes phone and purpose in hash to prevent cross-context attacks.
    
    Args:
        otp: The plaintext OTP
        phone: Phone number (normalized)
        purpose: OTP purpose (login, signup, etc.)
        
    Returns:
        Hex-encoded HMAC-SHA256 hash
    """
    message = f"{otp}:{phone}:{purpose}"
    return hmac.new(
        OTP_SALT.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()


def verify_otp_hash(otp: str, phone: str, purpose: str, stored_hash: str) -> bool:
    """
    Verify OTP against stored hash using constant-time comparison.
    
    Args:
        otp: User-provided OTP
        phone: Phone number
        purpose: OTP purpose
        stored_hash: Hash from database
        
    Returns:
        True if OTP matches
    """
    computed_hash = hash_otp(otp, phone, purpose)
    return hmac.compare_digest(computed_hash, stored_hash)


def generate_request_id() -> str:
    """Generate unique request ID in format: otp_req_xxxxxxxxxxxx"""
    random_part = secrets.token_hex(6)  # 12 hex chars
    return f"otp_req_{random_part}"


def generate_api_key(is_test: bool = False) -> Tuple[str, str, str]:
    """
    Generate a new API key.
    
    Returns:
        Tuple of (full_key, key_prefix, key_hash)
    """
    prefix = "otp_test_" if is_test else "otp_live_"
    random_part = secrets.token_urlsafe(24)  # ~32 chars
    full_key = f"{prefix}{random_part}"
    
    # Prefix for lookup (first 16 chars)
    key_prefix = full_key[:16]
    
    # Hash for verification
    key_hash = hashlib.sha256(full_key.encode('utf-8')).hexdigest()
    
    return full_key, key_prefix, key_hash


# =============================================================================
# OTP SERVICE CLASS
# =============================================================================

class OTPService:
    """
    Core OTP service handling the full lifecycle.
    
    Usage:
        service = OTPService(supabase_client)
        
        # Send OTP
        result = await service.send_otp(
            business_id="...",
            phone="+919876543210",
            purpose="login"
        )
        
        # Verify OTP
        result = await service.verify_otp(
            request_id="otp_req_xxx",
            otp="123456"
        )
    """
    
    def __init__(self, supabase_client):
        self.db = supabase_client
        self._whatsapp_service = None
    
    @property
    def whatsapp_service(self):
        """Lazy load WhatsApp service."""
        if self._whatsapp_service is None:
            from whatsapp_service import WhatsAppService
            self._whatsapp_service = WhatsAppService()
        return self._whatsapp_service
    
    # -------------------------------------------------------------------------
    # SEND OTP
    # -------------------------------------------------------------------------
    
    async def send_otp(
        self,
        business_id: str,
        phone: str,
        purpose: str,
        channel: str = "whatsapp",
        otp_length: int = DEFAULT_OTP_LENGTH,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        idempotency_key: Optional[str] = None,
        metadata: Optional[Dict] = None,
        is_sandbox: bool = False
    ) -> Dict[str, Any]:
        """
        Generate and send an OTP.
        
        Args:
            business_id: Business UUID
            phone: Recipient phone number (E.164 format)
            purpose: OTP purpose (login, signup, password_reset, transaction)
            channel: Delivery channel (whatsapp, sms)
            otp_length: Number of digits (4-8)
            ttl_seconds: Time-to-live in seconds
            idempotency_key: Optional key for retry safety
            metadata: Optional metadata to store
            is_sandbox: If True, return OTP in response (no delivery)
            
        Returns:
            Dict with request_id, expires_in, and optionally otp (sandbox)
        """
        # Detect destination type and normalize accordingly
        from services.otp.providers import detect_destination_type
        destination_type = detect_destination_type(phone)
        
        # CHANNEL-DESTINATION VALIDATION (Critical for preventing DATABASE_ERROR)
        # WhatsApp/SMS require phone, Email requires email address
        channel_destination_valid = (
            (channel in ('whatsapp', 'sms') and destination_type == 'phone') or
            (channel == 'email' and destination_type == 'email')
        )
        if not channel_destination_valid:
            logger.error(f"Channel/destination mismatch: channel={channel}, destination_type={destination_type}")
            return {
                "success": False,
                "error": "INVALID_DESTINATION",
                "message": f"Channel '{channel}' is not compatible with destination type '{destination_type}'. "
                           f"WhatsApp/SMS require phone numbers, Email requires email addresses."
            }
        
        # Only normalize phone numbers, NOT email addresses
        if destination_type == 'phone':
            phone = self._normalize_phone(phone)
        else:
            # For email, just lowercase and strip whitespace
            phone = phone.strip().lower()
        
        # Validate purpose
        if purpose not in [p.value for p in OTPPurpose]:
            return {
                "success": False,
                "error": "INVALID_PURPOSE",
                "message": f"Purpose must be one of: {[p.value for p in OTPPurpose]}"
            }
        
        # Check if phone is blocked
        block_check = await self._check_blocked(phone)
        if block_check["blocked"]:
            return {
                "success": False,
                "error": "PHONE_BLOCKED",
                "message": "This phone number is temporarily blocked",
                "expires_at": block_check.get("expires_at")
            }
        
        # Check rate limits
        rate_check = await self._check_rate_limits(phone, purpose, destination_type)
        if not rate_check["allowed"]:
            # Record violation for potential auto-block
            await self._record_rate_violation(phone)
            return {
                "success": False,
                "error": "RATE_LIMITED",
                "message": rate_check["message"],
                "retry_after": rate_check.get("retry_after")
            }
        
        # Check idempotency
        if idempotency_key:
            existing = await self._check_idempotency(business_id, idempotency_key)
            if existing:
                return {
                    "success": True,
                    "request_id": existing["request_id"],
                    "expires_in": existing["expires_in"],
                    "cached": True
                }
        
        # Generate OTP
        otp = generate_otp(otp_length)
        otp_hash = hash_otp(otp, phone, purpose)
        request_id = generate_request_id()
        expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
        
        # Store OTP request with proper column separation
        try:
            # Build insert data with proper column separation
            insert_data = {
                "request_id": request_id,
                "project_id": business_id,
                "business_id": business_id,  # Keep for backward compatibility
                "purpose": purpose,
                "otp_hash": otp_hash,
                "otp_length": otp_length,
                "channel": channel,
                "destination_type": destination_type,  # 'phone' or 'email'
                "expires_at": expires_at.isoformat(),
                "next_allowed_resend_at": (datetime.utcnow() + timedelta(seconds=RESEND_COOLDOWN_SECONDS)).isoformat(),
                "metadata": metadata or {}
            }
            
            # Store in appropriate column based on destination type
            # CRITICAL: Do NOT set columns to None - simply omit them to avoid NOT NULL violations
            if destination_type == 'email':
                insert_data["email"] = phone  # phone variable contains the email address
                # DO NOT set phone key - omit it entirely for email destinations
            else:
                insert_data["phone"] = phone
                # DO NOT set email key - omit it entirely for phone destinations
            
            self.db.table("otp_requests").insert(insert_data).execute()
        except Exception as e:
            logger.error(f"Failed to store OTP request: {e}")
            return {
                "success": False,
                "error": "DATABASE_ERROR",
                "message": "Failed to create OTP request"
            }
        
        # Store idempotency key if provided
        if idempotency_key:
            await self._store_idempotency(business_id, idempotency_key, request_id)
        
        # Update rate limit counters
        await self._increment_rate_limits(phone, purpose)
        
        # Queue delivery (unless sandbox)
        delivery_result = None
        if not is_sandbox:
            delivery_result = self._queue_delivery(request_id, business_id, phone, otp, channel)
            
            # CRITICAL: Propagate delivery failures to API response
            if delivery_result and delivery_result.get("status") == "failed":
                logger.error(f"OTP delivery failed for {request_id}: {delivery_result.get('error')}")
                await self._audit_log(business_id, request_id, "send_delivery_failed", phone, False, delivery_result.get("error_code"))
                return {
                    "success": False,
                    "error": "OTP_DELIVERY_FAILED",
                    "message": f"Failed to deliver OTP: {delivery_result.get('error', 'Unknown error')}",
                    "request_id": request_id,  # Include for retry/status checking
                    "retryable": delivery_result.get("retryable", True)
                }
        
        # Build response
        response = {
            "success": True,
            "request_id": request_id,
            "expires_in": ttl_seconds
        }
        
        # Include delivery status info for transparency
        if delivery_result:
            response["delivery_status"] = delivery_result.get("status", "queued")
        
        # Include OTP in sandbox mode only
        if is_sandbox:
            response["sandbox"] = True
            response["otp"] = otp
        
        # Audit log
        await self._audit_log(business_id, request_id, "send", phone, True)
        
        return response
    
    # -------------------------------------------------------------------------
    # VERIFY OTP
    # -------------------------------------------------------------------------
    
    async def verify_otp(
        self,
        request_id: str,
        otp: str,
        business_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify a user-submitted OTP.
        
        Args:
            request_id: The OTP request ID
            otp: User-provided OTP code
            business_id: Optional business ID for validation
            
        Returns:
            Dict with success status and verification result
        """
        # Fetch OTP request
        try:
            result = self.db.table("otp_requests").select("*").eq(
                "request_id", request_id
            ).single().execute()
            otp_request = result.data
        except Exception:
            return {
                "success": False,
                "error": "REQUEST_NOT_FOUND",
                "message": "OTP request not found"
            }
        
        if not otp_request:
            return {
                "success": False,
                "error": "REQUEST_NOT_FOUND",
                "message": "OTP request not found"
            }
        
        # Validate business ownership if provided
        if business_id and otp_request["business_id"] != business_id:
            return {
                "success": False,
                "error": "UNAUTHORIZED",
                "message": "Request does not belong to this business"
            }
        
        # Check if already verified
        if otp_request["status"] == OTPStatus.VERIFIED:
            return {
                "success": False,
                "error": "ALREADY_VERIFIED",
                "message": "OTP has already been verified"
            }
        
        # Check if expired
        expires_at = datetime.fromisoformat(otp_request["expires_at"].replace("Z", "+00:00"))
        if datetime.utcnow() > expires_at.replace(tzinfo=None):
            # Mark as expired
            self.db.table("otp_requests").update({
                "status": OTPStatus.EXPIRED
            }).eq("request_id", request_id).execute()
            
            return {
                "success": False,
                "error": "OTP_EXPIRED",
                "message": "OTP has expired"
            }
        
        # Check max attempts
        if otp_request["attempts"] >= MAX_VERIFY_ATTEMPTS:
            return {
                "success": False,
                "error": "MAX_ATTEMPTS_EXCEEDED",
                "message": "Maximum verification attempts exceeded"
            }
        
        # Increment attempt counter
        self.db.table("otp_requests").update({
            "attempts": otp_request["attempts"] + 1
        }).eq("request_id", request_id).execute()
        
        # Get the correct destination for verification (phone or email)
        destination = otp_request.get("phone") or otp_request.get("email")
        if not destination:
            logger.error(f"OTP request {request_id} has no destination (phone or email)")
            return {
                "success": False,
                "error": "INVALID_REQUEST",
                "message": "OTP request has invalid destination data"
            }
        
        # Verify OTP hash using destination (works for both phone and email)
        is_valid = verify_otp_hash(
            otp,
            destination,
            otp_request["purpose"],
            otp_request["otp_hash"]
        )
        
        if not is_valid:
            await self._audit_log(
                otp_request["business_id"],
                request_id,
                "verify_failed",
                destination,
                False
            )
            return {
                "success": False,
                "verified": False,
                "error": "INVALID_OTP",
                "message": "Invalid OTP code",
                "attempts_remaining": MAX_VERIFY_ATTEMPTS - otp_request["attempts"] - 1
            }
        
        # Mark as verified
        self.db.table("otp_requests").update({
            "status": OTPStatus.VERIFIED,
            "verified_at": datetime.utcnow().isoformat()
        }).eq("request_id", request_id).execute()
        
        await self._audit_log(
            otp_request["business_id"],
            request_id,
            "verify_success",
            destination,  # Use destination (phone or email)
            True
        )
        
        return {
            "success": True,
            "verified": True
        }
    
    # -------------------------------------------------------------------------
    # RESEND OTP
    # -------------------------------------------------------------------------
    
    async def resend_otp(
        self,
        request_id: str,
        business_id: Optional[str] = None,
        force_channel: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Resend an OTP with channel escalation.
        
        Channel escalation:
        - 1st send: WhatsApp
        - 1st resend: WhatsApp
        - 2nd resend: SMS (if available)
        
        Args:
            request_id: The OTP request ID
            business_id: Optional business ID for validation
            force_channel: Force specific channel (overrides escalation)
            
        Returns:
            Dict with success status
        """
        # Fetch OTP request
        try:
            result = self.db.table("otp_requests").select("*").eq(
                "request_id", request_id
            ).single().execute()
            otp_request = result.data
        except Exception:
            return {
                "success": False,
                "error": "REQUEST_NOT_FOUND",
                "message": "OTP request not found"
            }
        
        if not otp_request:
            return {
                "success": False,
                "error": "REQUEST_NOT_FOUND"
            }
        
        # Check business ownership
        if business_id and otp_request["business_id"] != business_id:
            return {
                "success": False,
                "error": "UNAUTHORIZED"
            }
        
        # Check if already verified
        if otp_request["status"] == OTPStatus.VERIFIED:
            return {
                "success": False,
                "error": "ALREADY_VERIFIED"
            }
        
        # Check cooldown
        next_allowed = otp_request.get("next_allowed_resend_at")
        if next_allowed:
            next_allowed_dt = datetime.fromisoformat(next_allowed.replace("Z", "+00:00"))
            if datetime.utcnow() < next_allowed_dt.replace(tzinfo=None):
                wait_seconds = int((next_allowed_dt.replace(tzinfo=None) - datetime.utcnow()).total_seconds())
                return {
                    "success": False,
                    "error": "COOLDOWN_ACTIVE",
                    "message": f"Please wait {wait_seconds} seconds before resending",
                    "retry_after": wait_seconds
                }
        
        # Check max resends
        if otp_request["resend_count"] >= MAX_RESENDS:
            return {
                "success": False,
                "error": "MAX_RESENDS_EXCEEDED",
                "message": "Maximum resend attempts exceeded"
            }
        
        # Get destination (phone or email) for hash and delivery
        destination = otp_request.get("phone") or otp_request.get("email")
        if not destination:
            return {
                "success": False,
                "error": "INVALID_REQUEST",
                "message": "OTP request has no destination"
            }
        
        # Determine channel (escalation logic)
        if force_channel:
            channel = force_channel
        elif otp_request["resend_count"] >= 2:
            # Escalate to SMS on 2nd resend
            channel = DeliveryChannel.SMS
        else:
            channel = otp_request["channel"]
        
        # Generate new OTP (same request_id, new code)
        otp = generate_otp(otp_request.get("otp_length", DEFAULT_OTP_LENGTH))
        otp_hash = hash_otp(otp, destination, otp_request["purpose"])
        
        # Extend expiry
        new_expires_at = datetime.utcnow() + timedelta(seconds=DEFAULT_TTL_SECONDS)
        
        # Update request
        self.db.table("otp_requests").update({
            "otp_hash": otp_hash,
            "expires_at": new_expires_at.isoformat(),
            "resend_count": otp_request["resend_count"] + 1,
            "last_resend_at": datetime.utcnow().isoformat(),
            "next_allowed_resend_at": (datetime.utcnow() + timedelta(seconds=RESEND_COOLDOWN_SECONDS)).isoformat(),
            "delivery_status": DeliveryStatus.QUEUED,
            "delivery_attempts": 0
        }).eq("request_id", request_id).execute()
        
        # Queue delivery
        self._queue_delivery(
            request_id,
            otp_request["business_id"],
            destination,
            otp,
            channel
        )
        
        await self._audit_log(
            otp_request["business_id"],
            request_id,
            "resend",
            destination,
            True
        )
        
        return {
            "success": True,
            "request_id": request_id,
            "expires_in": DEFAULT_TTL_SECONDS,
            "channel": channel,
            "resend_count": otp_request["resend_count"] + 1
        }
    
    # -------------------------------------------------------------------------
    # STATUS CHECK
    # -------------------------------------------------------------------------
    
    async def get_status(
        self,
        request_id: str,
        business_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get OTP request status.
        
        Args:
            request_id: The OTP request ID
            business_id: Optional business ID for validation
            
        Returns:
            Dict with status information
        """
        try:
            result = self.db.table("otp_requests").select(
                "request_id, status, delivery_status, expires_at, attempts, resend_count, created_at"
            ).eq("request_id", request_id).single().execute()
            
            otp_request = result.data
        except Exception:
            return {
                "success": False,
                "error": "REQUEST_NOT_FOUND"
            }
        
        if not otp_request:
            return {
                "success": False,
                "error": "REQUEST_NOT_FOUND"
            }
        
        return {
            "success": True,
            "request_id": otp_request["request_id"],
            "status": otp_request["status"],
            "delivery_status": otp_request["delivery_status"],
            "expires_at": otp_request["expires_at"],
            "attempts": otp_request["attempts"],
            "resend_count": otp_request["resend_count"]
        }
    
    # -------------------------------------------------------------------------
    # PRIVATE HELPER METHODS
    # -------------------------------------------------------------------------
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number to E.164 format."""
        # Remove spaces, dashes, parentheses
        phone = ''.join(c for c in phone if c.isdigit() or c == '+')
        
        # Ensure + prefix
        if not phone.startswith('+'):
            # Assume India if no country code
            if len(phone) == 10:
                phone = '+91' + phone
            else:
                phone = '+' + phone
        
        return phone
    
    async def _check_blocked(self, phone: str) -> Dict[str, Any]:
        """Check if phone number is blocked."""
        try:
            result = self.db.table("otp_blocked_destinations").select("*").eq(
                "phone", phone
            ).gt("expires_at", datetime.utcnow().isoformat()).execute()
            
            if result.data and len(result.data) > 0:
                block = result.data[0]
                if block.get("is_permanent") or block["expires_at"] > datetime.utcnow().isoformat():
                    return {
                        "blocked": True,
                        "reason": block["reason"],
                        "expires_at": block["expires_at"]
                    }
        except Exception as e:
            logger.warning(f"Error checking blocked status: {e}")
        
        return {"blocked": False}
    
    async def _check_rate_limits(self, phone: str, purpose: str, destination_type: str = 'phone') -> Dict[str, Any]:
        """
        Check hybrid rate limits (channel-aware).
        
        - Global: 10 OTPs per hour per destination
        - Per-purpose: 3 OTPs per 5 minutes per purpose
        
        Args:
            phone: The destination (phone number or email address)
            purpose: OTP purpose (login, signup, etc.)
            destination_type: 'phone' or 'email' to query correct column
        """
        now = datetime.utcnow()
        
        # Determine which column to query based on destination type
        destination_column = "email" if destination_type == "email" else "phone"
        
        # Check global limit (10/hour)
        hour_ago = now - timedelta(hours=1)
        try:
            result = self.db.table("otp_requests").select("id").eq(
                destination_column, phone
            ).gt("created_at", hour_ago.isoformat()).execute()
            
            global_count = len(result.data) if result.data else 0
            if global_count >= RATE_LIMIT_GLOBAL_PER_HOUR:
                return {
                    "allowed": False,
                    "message": "Hourly limit exceeded",
                    "retry_after": 3600
                }
        except Exception as e:
            logger.warning(f"Error checking global rate limit: {e}")
        
        # Check per-purpose limit (3/5min)
        window_start = now - timedelta(seconds=RATE_LIMIT_PER_PURPOSE_WINDOW)
        try:
            result = self.db.table("otp_requests").select("id").eq(
                destination_column, phone
            ).eq("purpose", purpose).gt("created_at", window_start.isoformat()).execute()
            
            purpose_count = len(result.data) if result.data else 0
            if purpose_count >= RATE_LIMIT_PER_PURPOSE_COUNT:
                return {
                    "allowed": False,
                    "message": f"Too many {purpose} OTPs requested",
                    "retry_after": RATE_LIMIT_PER_PURPOSE_WINDOW
                }
        except Exception as e:
            logger.warning(f"Error checking purpose rate limit: {e}")
        
        return {"allowed": True}
    
    async def _record_rate_violation(self, phone: str) -> None:
        """Record rate limit violation and auto-block if threshold reached."""
        try:
            # Check existing violations
            result = self.db.table("otp_blocked_destinations").select("*").eq(
                "phone", phone
            ).eq("reason", "rate_limit_abuse").execute()
            
            if result.data and len(result.data) > 0:
                block = result.data[0]
                new_count = block["rate_limit_violations"] + 1
                
                if new_count >= RATE_VIOLATION_THRESHOLD:
                    # Auto-block for 24 hours
                    self.db.table("otp_blocked_destinations").update({
                        "rate_limit_violations": new_count,
                        "blocked_at": datetime.utcnow().isoformat(),
                        "expires_at": (datetime.utcnow() + timedelta(hours=BLOCK_DURATION_HOURS)).isoformat()
                    }).eq("id", block["id"]).execute()
                    logger.warning(f"Phone {phone} auto-blocked for rate limit abuse")
                else:
                    self.db.table("otp_blocked_destinations").update({
                        "rate_limit_violations": new_count
                    }).eq("id", block["id"]).execute()
            else:
                # Create new record
                self.db.table("otp_blocked_destinations").insert({
                    "phone": phone,
                    "reason": "rate_limit_abuse",
                    "rate_limit_violations": 1,
                    "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat()  # Short expiry for tracking
                }).execute()
        except Exception as e:
            logger.error(f"Error recording rate violation: {e}")
    
    async def _increment_rate_limits(self, phone: str, purpose: str) -> None:
        """Increment rate limit counters."""
        # Rate limiting is handled by counting in otp_requests table
        # This method can be extended for Redis-based counters
        pass
    
    async def _check_idempotency(
        self,
        business_id: str,
        idempotency_key: str
    ) -> Optional[Dict]:
        """Check if idempotency key exists and return cached response."""
        try:
            result = self.db.table("otp_idempotency_keys").select(
                "request_id, created_at, expires_at"
            ).eq("business_id", business_id).eq(
                "idempotency_key", idempotency_key
            ).single().execute()
            
            if result.data:
                expires_at = datetime.fromisoformat(result.data["expires_at"].replace("Z", "+00:00"))
                if datetime.utcnow() < expires_at.replace(tzinfo=None):
                    created_at = datetime.fromisoformat(result.data["created_at"].replace("Z", "+00:00"))
                    expires_in = int((expires_at - datetime.utcnow().replace(tzinfo=None)).total_seconds())
                    return {
                        "request_id": result.data["request_id"],
                        "expires_in": max(0, expires_in)
                    }
        except Exception:
            pass
        
        return None
    
    async def _store_idempotency(
        self,
        business_id: str,
        idempotency_key: str,
        request_id: str
    ) -> None:
        """Store idempotency key."""
        try:
            self.db.table("otp_idempotency_keys").insert({
                "project_id": business_id,  # Use project_id
                "idempotency_key": idempotency_key,
                "request_id": request_id,
                "request_hash": hashlib.sha256(idempotency_key.encode()).hexdigest()
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to store idempotency key: {e}")
    
    def _queue_delivery(
        self,
        request_id: str,
        business_id: str,
        phone: str,
        otp: str,
        channel: str
    ) -> Dict[str, Any]:
        """
        Queue OTP delivery via Celery task, fallback to synchronous delivery.
        
        Returns delivery result to propagate failures to API response.
        
        Returns:
            Dict with 'queued' or 'delivered' status, or 'failed' with error details
        """
        try:
            from tasks.otp_delivery import deliver_otp
            deliver_otp.delay(
                request_id=request_id,
                business_id=business_id,
                phone=phone,
                otp=otp,
                channel=channel
            )
            logger.info(f"OTP {request_id} queued for async delivery via Celery")
            return {"status": "queued", "async": True}
        except Exception as e:
            logger.warning(f"Celery queue failed, trying synchronous delivery: {e}")
            # Fallback: Send synchronously when Celery is not available
            try:
                result = self._send_otp_sync(request_id, business_id, phone, otp, channel)
                return result
            except Exception as sync_error:
                logger.error(f"Synchronous delivery also failed: {sync_error}")
                self.db.table("otp_requests").update({
                    "delivery_status": DeliveryStatus.FAILED,
                    "last_delivery_error": str(sync_error)
                }).eq("request_id", request_id).execute()
                # Return failure for API propagation
                return {
                    "status": "failed",
                    "error": str(sync_error),
                    "error_code": "OTP_DELIVERY_FAILED",
                    "retryable": True
                }
    
    def _send_otp_sync(
        self,
        request_id: str,
        business_id: str,
        phone: str,
        otp: str,
        channel: str
    ) -> Dict[str, Any]:
        """
        Send OTP synchronously via provider abstraction (fallback when Celery unavailable).
        
        Uses the same provider abstraction as the async Celery task for consistency.
        
        Returns:
            Dict with delivery status and message_id or error details
        """
        import os
        from services.otp.providers import get_provider, OTPContext, detect_destination_type
        
        # Update status to 'sent'
        self.db.table("otp_requests").update({
            "delivery_status": DeliveryStatus.SENT,
            "delivery_channel": channel
        }).eq("request_id", request_id).execute()
        
        # Auto-detect destination type
        destination_type = detect_destination_type(phone)
        
        # Get business config for credentials
        try:
            result = self.db.table("otp_projects").select("*").eq(
                "id", business_id
            ).single().execute()
            business = result.data or {}
        except Exception:
            business = {}
        
        # Build OTP context
        context = OTPContext(
            request_id=request_id,
            destination=phone,
            destination_type=destination_type,
            otp=otp,
            purpose="verification",
            business_id=business_id,
            business_name=business.get("name"),
            phone_number_id=business.get("whatsapp_phone_number_id") or os.getenv("WHATSAPP_PHONE_NUMBER_ID"),
            access_token=os.getenv("WHATSAPP_ACCESS_TOKEN"),
            resend_api_key=os.getenv('RESEND_API_KEY')
        )
        
        try:
            # Get provider for channel
            provider = get_provider(channel)
            
            logger.info(f"Sending OTP synchronously to {phone[:6]}*** via {channel}")
            result = provider.send_otp(context)
            
            if result.success:
                self.db.table("otp_requests").update({
                    "delivery_status": DeliveryStatus.DELIVERED,
                    "message_id": result.message_id
                }).eq("request_id", request_id).execute()
                logger.info(f"OTP delivered synchronously via {channel}, message_id={result.message_id}")
                return {"status": "delivered", "message_id": result.message_id}
            else:
                raise Exception(f"{provider.get_provider_name()} error: {result.error}")
                
        except ValueError as e:
            # Unsupported channel - this shouldn't happen if validation is correct
            raise Exception(f"Unsupported channel '{channel}': {e}")
    
    async def _audit_log(
        self,
        business_id: str,
        request_id: str,
        action: str,
        phone: str,
        success: bool,
        error_code: Optional[str] = None
    ) -> None:
        """Record audit log entry."""
        try:
            self.db.table("otp_audit_logs").insert({
                "project_id": business_id,  # Use project_id
                "request_id": request_id,
                "action": action,
                "phone": phone,
                "success": success,
                "error_code": error_code
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to record audit log: {e}")


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_otp_service: Optional[OTPService] = None


def get_otp_service() -> OTPService:
    """Get or create OTP service instance."""
    global _otp_service
    
    if _otp_service is None:
        from supabase_client import get_supabase_client
        _otp_service = OTPService(get_supabase_client())
    
    return _otp_service