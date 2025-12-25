"""
Rate Limiting Middleware for WhatsApp Automation API.
Uses Redis for distributed rate limiting across multiple workers.
Falls back to in-memory for development.
"""

import os
import time
import hashlib
from functools import wraps
from typing import Dict, Tuple, Optional
from flask import request, jsonify, g
from threading import Lock

# Try to import Redis
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None


class RateLimiter:
    """
    Sliding window rate limiter with Redis backend.
    Falls back to in-memory storage if Redis not available.
    """
    
    def __init__(
        self,
        redis_url: str = None,
        default_limit: int = 60,
        default_window: int = 60
    ):
        self.default_limit = default_limit
        self.default_window = default_window
        
        self.redis_client = None
        self._memory_store: Dict[str, list] = {}
        self._lock = Lock()
        
        # Try to connect to Redis
        redis_url = redis_url or os.getenv('REDIS_URL')
        if redis_url and REDIS_AVAILABLE:
            try:
                self.redis_client = redis.from_url(redis_url)
                self.redis_client.ping()
                print("✅ Rate limiter connected to Redis")
            except Exception as e:
                print(f"⚠️ Redis connection failed, using in-memory: {e}")
                self.redis_client = None
        else:
            print("⚠️ Rate limiter using in-memory storage (not suitable for production)")
    
    def _get_key(self, identifier: str, endpoint: str) -> str:
        """Generate a unique key for the rate limit bucket."""
        return f"ratelimit:{identifier}:{endpoint}"
    
    def check(
        self,
        identifier: str,
        endpoint: str,
        limit: int = None,
        window: int = None
    ) -> Tuple[bool, Dict[str, int]]:
        """
        Check if request is allowed.
        
        Args:
            identifier: User ID, API key, or IP address
            endpoint: API endpoint being accessed
            limit: Max requests per window
            window: Time window in seconds
        
        Returns:
            Tuple of (allowed: bool, info: dict with remaining, reset, limit)
        """
        limit = limit or self.default_limit
        window = window or self.default_window
        key = self._get_key(identifier, endpoint)
        now = time.time()
        
        if self.redis_client:
            return self._check_redis(key, limit, window, now)
        else:
            return self._check_memory(key, limit, window, now)
    
    def _check_redis(
        self, key: str, limit: int, window: int, now: float
    ) -> Tuple[bool, Dict[str, int]]:
        """Check rate limit using Redis."""
        try:
            pipe = self.redis_client.pipeline()
            
            # Remove old entries
            window_start = now - window
            pipe.zremrangebyscore(key, 0, window_start)
            
            # Count current entries
            pipe.zcard(key)
            
            # Add current request (will be rolled back if over limit)
            pipe.zadd(key, {f"{now}": now})
            
            # Set expiry
            pipe.expire(key, window + 1)
            
            results = pipe.execute()
            current_count = results[1]
            
            if current_count >= limit:
                # Over limit - remove the entry we just added
                self.redis_client.zrem(key, f"{now}")
                
                # Get time until oldest entry expires
                oldest = self.redis_client.zrange(key, 0, 0, withscores=True)
                reset_at = int(oldest[0][1] + window) if oldest else int(now + window)
                
                return False, {
                    'limit': limit,
                    'remaining': 0,
                    'reset': reset_at,
                    'retry_after': max(0, reset_at - int(now))
                }
            
            return True, {
                'limit': limit,
                'remaining': limit - current_count - 1,
                'reset': int(now + window),
                'retry_after': 0
            }
            
        except Exception as e:
            print(f"⚠️ Redis rate limit error: {e}")
            # Allow request on error (fail open)
            return True, {'limit': limit, 'remaining': limit, 'reset': int(now + window), 'retry_after': 0}
    
    def _check_memory(
        self, key: str, limit: int, window: int, now: float
    ) -> Tuple[bool, Dict[str, int]]:
        """Check rate limit using in-memory storage."""
        with self._lock:
            window_start = now - window
            
            # Get or create bucket
            if key not in self._memory_store:
                self._memory_store[key] = []
            
            # Clean old entries
            self._memory_store[key] = [
                t for t in self._memory_store[key] if t > window_start
            ]
            
            current_count = len(self._memory_store[key])
            
            if current_count >= limit:
                oldest = min(self._memory_store[key]) if self._memory_store[key] else now
                reset_at = int(oldest + window)
                
                return False, {
                    'limit': limit,
                    'remaining': 0,
                    'reset': reset_at,
                    'retry_after': max(0, reset_at - int(now))
                }
            
            # Add current request
            self._memory_store[key].append(now)
            
            return True, {
                'limit': limit,
                'remaining': limit - current_count - 1,
                'reset': int(now + window),
                'retry_after': 0
            }
    
    def reset(self, identifier: str, endpoint: str):
        """Reset rate limit for a specific key."""
        key = self._get_key(identifier, endpoint)
        
        if self.redis_client:
            self.redis_client.delete(key)
        else:
            with self._lock:
                if key in self._memory_store:
                    del self._memory_store[key]


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get global rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


def rate_limit(
    limit: int = 60,
    window: int = 60,
    key_func=None,
    scope: str = 'endpoint'
):
    """
    Rate limiting decorator for Flask routes.
    
    Args:
        limit: Maximum requests per window
        window: Time window in seconds
        key_func: Function to extract identifier (default: user_id or IP)
        scope: 'endpoint' (per route) or 'global' (all routes)
    
    Usage:
        @app.route('/api/messages')
        @rate_limit(limit=100, window=60)
        def send_message():
            ...
    """
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            limiter = get_rate_limiter()
            
            # Get identifier
            if key_func:
                identifier = key_func()
            else:
                # Try user_id first (authenticated), then IP
                identifier = (
                    getattr(request, 'user_id', None) or
                    request.headers.get('X-User-ID') or
                    request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or
                    request.remote_addr or
                    'anonymous'
                )
            
            # Determine endpoint scope
            if scope == 'global':
                endpoint = 'global'
            else:
                endpoint = request.endpoint or request.path
            
            # Check rate limit
            allowed, info = limiter.check(identifier, endpoint, limit, window)
            
            # Add rate limit headers to response
            g.rate_limit_info = info
            
            if not allowed:
                response = jsonify({
                    'success': False,
                    'error': 'Rate limit exceeded',
                    'retry_after': info['retry_after']
                })
                response.status_code = 429
                response.headers['X-RateLimit-Limit'] = str(info['limit'])
                response.headers['X-RateLimit-Remaining'] = str(info['remaining'])
                response.headers['X-RateLimit-Reset'] = str(info['reset'])
                response.headers['Retry-After'] = str(info['retry_after'])
                return response
            
            # Execute the function
            result = f(*args, **kwargs)
            
            # Add headers to successful response
            if hasattr(result, 'headers'):
                result.headers['X-RateLimit-Limit'] = str(info['limit'])
                result.headers['X-RateLimit-Remaining'] = str(info['remaining'])
                result.headers['X-RateLimit-Reset'] = str(info['reset'])
            
            return result
        
        return wrapped
    return decorator


def rate_limit_by_api_key(limit: int = 1000, window: int = 3600):
    """Rate limit by API key (for external integrations)."""
    def key_func():
        return request.headers.get('X-API-Key', 'no-key')
    
    return rate_limit(limit=limit, window=window, key_func=key_func, scope='global')


def rate_limit_by_ip(limit: int = 30, window: int = 60):
    """Rate limit by IP address (for unauthenticated endpoints)."""
    def key_func():
        return (
            request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or
            request.remote_addr or
            'unknown'
        )
    
    return rate_limit(limit=limit, window=window, key_func=key_func)


# =====================================================
# WEBHOOK SECURITY
# =====================================================

class WebhookSecurityMiddleware:
    """
    Webhook security checks including:
    - Signature verification
    - Timestamp validation (replay prevention)
    - Idempotency (duplicate prevention)
    """
    
    def __init__(self, app_secret: str = None, redis_client=None):
        self.app_secret = app_secret or os.getenv('FACEBOOK_APP_SECRET', '')
        self.redis_client = redis_client
        self._processed_ids = set()  # In-memory fallback
        self._lock = Lock()
        self._max_age = 300  # 5 minutes
    
    def verify_signature(self, raw_body: bytes, signature: str) -> bool:
        """Verify webhook signature from Meta."""
        if not self.app_secret:
            print("⚠️ No app secret configured, skipping signature verification")
            return True
        
        if not signature or not signature.startswith('sha256='):
            return False
        
        import hmac
        expected = 'sha256=' + hmac.new(
            self.app_secret.encode(),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected)
    
    def validate_timestamp(self, timestamp: int) -> bool:
        """Check if webhook timestamp is within acceptable range."""
        if not timestamp:
            return True  # Allow if no timestamp
        
        now = int(time.time())
        age = abs(now - timestamp)
        
        return age <= self._max_age
    
    def check_idempotency(self, message_id: str) -> bool:
        """
        Check if message has already been processed.
        Returns True if new (should process), False if duplicate.
        """
        if not message_id:
            return True
        
        if self.redis_client:
            try:
                # Try to set with NX (only if not exists)
                key = f"webhook:processed:{message_id}"
                result = self.redis_client.set(key, '1', ex=86400, nx=True)
                return bool(result)
            except Exception as e:
                print(f"⚠️ Redis idempotency check failed: {e}")
        
        # In-memory fallback
        with self._lock:
            if message_id in self._processed_ids:
                return False
            
            self._processed_ids.add(message_id)
            
            # Limit memory usage
            if len(self._processed_ids) > 10000:
                # Remove oldest (approximately)
                to_remove = list(self._processed_ids)[:5000]
                for item in to_remove:
                    self._processed_ids.discard(item)
            
            return True


# Global webhook security instance
_webhook_security: Optional[WebhookSecurityMiddleware] = None


def get_webhook_security() -> WebhookSecurityMiddleware:
    """Get global webhook security instance."""
    global _webhook_security
    if _webhook_security is None:
        limiter = get_rate_limiter()
        _webhook_security = WebhookSecurityMiddleware(
            redis_client=limiter.redis_client if hasattr(limiter, 'redis_client') else None
        )
    return _webhook_security
