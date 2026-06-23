"""
Distributed Lock Utility — Redis-backed, non-blocking locks.
============================================================

Used by both payment verification routes and webhook processor
to prevent concurrent activation of the same subscription.

Usage:
    lock = acquire_lock("lock:payment:{payment_id}", ttl_seconds=30)
    if lock:
        try:
            # critical section
        finally:
            release_lock("lock:payment:{payment_id}", lock)
    else:
        # another worker is handling it
"""

import os
import uuid
import logging

logger = logging.getLogger('reviseit.redis_lock')

_redis_client = None
_redis_available: bool | None = None


def get_redis_client():
    """Get Redis client with lazy initialization."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client
    try:
        import redis
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        _redis_client = redis.from_url(redis_url, decode_responses=True)
        _redis_client.ping()
        _redis_available = True
        logger.info("Redis connection established for distributed locks")
        return _redis_client
    except Exception as e:
        logger.error(f"Redis unavailable for locks: {e}")
        _redis_client = None
        _redis_available = False
        return None


def is_redis_available() -> bool:
    """True when Redis is reachable — distinguishes outage from lock contention."""
    global _redis_available
    if _redis_available is None:
        get_redis_client()
    return bool(_redis_available)


def acquire_lock(lock_key: str, ttl_seconds: int = 30):
    """
    Acquire a non-blocking Redis lock.

    Returns a token string if acquired, None if already held.
    Raises no error when Redis is down — caller should use is_redis_available().
    """
    if not is_redis_available():
        return None
    client = get_redis_client()
    if not client:
        return None
    token = uuid.uuid4().hex
    try:
        ok = client.set(lock_key, token, nx=True, ex=ttl_seconds)
        return token if ok else None
    except Exception:
        return None


def release_lock(lock_key: str, token: str) -> None:
    """
    Release a lock only if we still hold the token (safe release).
    """
    client = get_redis_client()
    if not client:
        return
    try:
        current = client.get(lock_key)
        if current == token:
            client.delete(lock_key)
    except Exception:
        pass
