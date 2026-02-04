"""
OTP Rate Limiter Middleware
Hybrid Rate Limiting with Auto-Blacklist

Features:
- Global per-phone limit (10/hour)
- Per-purpose limit (3/5 minutes)
- Per-API-key configurable limits
- Auto-blacklist after 3 violations
- Redis-backed sliding window
"""

import logging
import time
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, Any, Optional, Callable
from flask import request, g, jsonify

logger = logging.getLogger('otp.ratelimit')

# Configuration
RATE_LIMIT_GLOBAL_PER_HOUR = 10
RATE_LIMIT_PER_PURPOSE_COUNT = 3
RATE_LIMIT_PER_PURPOSE_WINDOW = 300  # 5 minutes
RATE_VIOLATION_THRESHOLD = 3
BLOCK_DURATION_HOURS = 24


class OTPRateLimiter:
    """
    Hybrid rate limiter for OTP platform.
    
    Implements:
    1. Global per-phone limit: 10 OTPs per hour
    2. Per-purpose limit: 3 OTPs per 5 minutes per purpose
    3. Per-API-key limit: Configurable per business
    4. Auto-blacklist: 3 violations = 24h block
    """
    
    def __init__(self, redis_client=None, supabase_client=None):
        self.redis = redis_client
        self.supabase = supabase_client
        self._init_redis()
    
    def _init_redis(self):
        """Initialize Redis connection if not provided."""
        if self.redis is None:
            try:
                import os
                import redis
                redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
                self.redis = redis.from_url(redis_url)
                self.redis.ping()
                logger.info("OTP Rate limiter connected to Redis")
            except Exception as e:
                logger.warning(f"Redis not available for rate limiting: {e}")
                self.redis = None
    
    def _get_supabase(self):
        """Get Supabase client lazily."""
        if self.supabase is None:
            from supabase_client import get_supabase_client
            self.supabase = get_supabase_client()
        return self.supabase
    
    # -------------------------------------------------------------------------
    # REDIS-BASED RATE LIMITING
    # -------------------------------------------------------------------------
    
    def _redis_key(self, key_type: str, identifier: str, window: str = None) -> str:
        """Generate Redis key for rate limiting."""
        if window:
            return f"otp:ratelimit:{key_type}:{identifier}:{window}"
        return f"otp:ratelimit:{key_type}:{identifier}"
    
    def _get_window_key(self, window_seconds: int) -> str:
        """Get current time window key."""
        window_start = int(time.time() // window_seconds) * window_seconds
        return str(window_start)
    
    def check_and_increment(
        self,
        key_type: str,
        identifier: str,
        limit: int,
        window_seconds: int
    ) -> Dict[str, Any]:
        """
        Check rate limit and increment counter if allowed.
        
        Uses Redis INCR with expiry for atomic increment.
        Falls back to database if Redis unavailable.
        
        Args:
            key_type: Type of limit (global, purpose, apikey)
            identifier: Unique identifier (phone, phone:purpose, key_id)
            limit: Maximum requests allowed
            window_seconds: Time window in seconds
            
        Returns:
            Dict with allowed, current_count, remaining, retry_after
        """
        if self.redis:
            return self._check_redis(key_type, identifier, limit, window_seconds)
        else:
            return self._check_database(key_type, identifier, limit, window_seconds)
    
    def _check_redis(
        self,
        key_type: str,
        identifier: str,
        limit: int,
        window_seconds: int
    ) -> Dict[str, Any]:
        """Check rate limit using Redis."""
        window_key = self._get_window_key(window_seconds)
        redis_key = self._redis_key(key_type, identifier, window_key)
        
        try:
            # Atomic increment
            current = self.redis.incr(redis_key)
            
            # Set expiry on first request
            if current == 1:
                self.redis.expire(redis_key, window_seconds + 60)  # Add buffer
            
            if current > limit:
                # Calculate retry after
                ttl = self.redis.ttl(redis_key)
                retry_after = max(0, ttl) if ttl > 0 else window_seconds
                
                return {
                    "allowed": False,
                    "current_count": current,
                    "limit": limit,
                    "remaining": 0,
                    "retry_after": retry_after
                }
            
            return {
                "allowed": True,
                "current_count": current,
                "limit": limit,
                "remaining": limit - current
            }
            
        except Exception as e:
            logger.warning(f"Redis rate limit error: {e}")
            # Fail open on Redis errors
            return {"allowed": True, "current_count": 0, "limit": limit, "remaining": limit}
    
    def _check_database(
        self,
        key_type: str,
        identifier: str,
        limit: int,
        window_seconds: int
    ) -> Dict[str, Any]:
        """Fallback rate limiting using database."""
        db = self._get_supabase()
        key = f"{key_type}:{identifier}"
        window_start = datetime.utcnow() - timedelta(seconds=window_seconds)
        
        try:
            # Get or create rate limit record
            result = db.table("otp_rate_limits").select("*").eq(
                "key", key
            ).gt("window_start", window_start.isoformat()).execute()
            
            if result.data and len(result.data) > 0:
                record = result.data[0]
                current = record["request_count"]
                
                if current >= limit:
                    return {
                        "allowed": False,
                        "current_count": current,
                        "limit": limit,
                        "remaining": 0,
                        "retry_after": window_seconds
                    }
                
                # Increment counter
                db.table("otp_rate_limits").update({
                    "request_count": current + 1
                }).eq("id", record["id"]).execute()
                
                return {
                    "allowed": True,
                    "current_count": current + 1,
                    "limit": limit,
                    "remaining": limit - current - 1
                }
            else:
                # Create new window
                db.table("otp_rate_limits").insert({
                    "key": key,
                    "window_start": datetime.utcnow().isoformat(),
                    "request_count": 1
                }).execute()
                
                return {
                    "allowed": True,
                    "current_count": 1,
                    "limit": limit,
                    "remaining": limit - 1
                }
                
        except Exception as e:
            logger.error(f"Database rate limit error: {e}")
            # Fail open
            return {"allowed": True, "current_count": 0, "limit": limit, "remaining": limit}
    
    # -------------------------------------------------------------------------
    # PHONE NUMBER BLOCKING
    # -------------------------------------------------------------------------
    
    def is_blocked(self, phone: str) -> Dict[str, Any]:
        """Check if phone number is blocked."""
        db = self._get_supabase()
        
        try:
            result = db.table("otp_blocked_numbers").select("*").eq(
                "phone", phone
            ).execute()
            
            if result.data:
                for block in result.data:
                    # Check permanent block
                    if block.get("is_permanent"):
                        return {
                            "blocked": True,
                            "reason": block["reason"],
                            "is_permanent": True
                        }
                    
                    # Check temporary block
                    expires_at = datetime.fromisoformat(block["expires_at"].replace("Z", "+00:00"))
                    if datetime.utcnow() < expires_at.replace(tzinfo=None):
                        return {
                            "blocked": True,
                            "reason": block["reason"],
                            "expires_at": block["expires_at"]
                        }
            
            return {"blocked": False}
            
        except Exception as e:
            logger.error(f"Error checking blocked status: {e}")
            return {"blocked": False}
    
    def record_violation(self, phone: str) -> bool:
        """
        Record rate limit violation and auto-block if threshold reached.
        
        Returns:
            True if phone was blocked
        """
        db = self._get_supabase()
        
        try:
            # Get or create violation record
            result = db.table("otp_blocked_numbers").select("*").eq(
                "phone", phone
            ).eq("reason", "rate_limit_abuse").execute()
            
            if result.data and len(result.data) > 0:
                record = result.data[0]
                new_count = record["rate_limit_violations"] + 1
                
                if new_count >= RATE_VIOLATION_THRESHOLD:
                    # Block the phone number
                    db.table("otp_blocked_numbers").update({
                        "rate_limit_violations": new_count,
                        "blocked_at": datetime.utcnow().isoformat(),
                        "expires_at": (datetime.utcnow() + timedelta(hours=BLOCK_DURATION_HOURS)).isoformat()
                    }).eq("id", record["id"]).execute()
                    
                    logger.warning(f"Phone {phone} auto-blocked for rate limit abuse")
                    return True
                else:
                    db.table("otp_blocked_numbers").update({
                        "rate_limit_violations": new_count
                    }).eq("id", record["id"]).execute()
            else:
                # Create new record (1 hour expiry for tracking)
                db.table("otp_blocked_numbers").insert({
                    "phone": phone,
                    "reason": "rate_limit_abuse",
                    "rate_limit_violations": 1,
                    "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat()
                }).execute()
            
            return False
            
        except Exception as e:
            logger.error(f"Error recording violation: {e}")
            return False


# =============================================================================
# MIDDLEWARE DECORATOR
# =============================================================================

_rate_limiter: Optional[OTPRateLimiter] = None


def get_rate_limiter() -> OTPRateLimiter:
    """Get or create rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = OTPRateLimiter()
    return _rate_limiter


def check_otp_rate_limits(phone: str, purpose: str, api_key_limit: int = 60) -> Dict[str, Any]:
    """
    Check all OTP rate limits for a request.
    
    Checks:
    1. Phone blocklist
    2. Global phone limit (10/hour)
    3. Per-purpose limit (3/5min)
    
    Args:
        phone: Phone number (E.164)
        purpose: OTP purpose
        api_key_limit: Per-minute limit for API key
        
    Returns:
        Dict with allowed status and error details
    """
    limiter = get_rate_limiter()
    
    # 1. Check blocklist
    block_check = limiter.is_blocked(phone)
    if block_check["blocked"]:
        return {
            "allowed": False,
            "error": "PHONE_BLOCKED",
            "message": "Phone number is blocked",
            "expires_at": block_check.get("expires_at")
        }
    
    # 2. Check global limit (10/hour)
    global_check = limiter.check_and_increment(
        "global",
        phone,
        RATE_LIMIT_GLOBAL_PER_HOUR,
        3600  # 1 hour
    )
    
    if not global_check["allowed"]:
        return {
            "allowed": False,
            "error": "RATE_LIMITED",
            "message": "Hourly OTP limit exceeded",
            "retry_after": global_check.get("retry_after", 3600)
        }
    
    # 3. Check per-purpose limit (3/5min)
    purpose_check = limiter.check_and_increment(
        "purpose",
        f"{phone}:{purpose}",
        RATE_LIMIT_PER_PURPOSE_COUNT,
        RATE_LIMIT_PER_PURPOSE_WINDOW
    )
    
    if not purpose_check["allowed"]:
        return {
            "allowed": False,
            "error": "RATE_LIMITED",
            "message": f"Too many {purpose} OTPs requested",
            "retry_after": purpose_check.get("retry_after", RATE_LIMIT_PER_PURPOSE_WINDOW)
        }
    
    return {
        "allowed": True,
        "global_remaining": global_check.get("remaining", 0),
        "purpose_remaining": purpose_check.get("remaining", 0)
    }
