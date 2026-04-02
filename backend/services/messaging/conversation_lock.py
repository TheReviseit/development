"""
Distributed Conversation Lock — FAANG Fix #3
=============================================

Prevents race conditions when multiple messages arrive simultaneously
for the same conversation. Without this lock:

    Message A arrives → Flow engine processes → Sets state to step_3
    Message B arrives → Flow engine processes → Reads state (still step_2!)
    → State corruption, double replies, broken flows

Solution: Redis-based distributed lock per conversation_id.

Implementation:
    - Redis SETNX with auto-expiry TTL (prevents deadlocks)
    - Spin-wait with configurable timeout (prevents indefinite blocking)
    - Owner validation on release (prevents releasing someone else's lock)
    - Context manager interface (Pythonic, exception-safe)

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from contextlib import contextmanager
from typing import Generator, Optional

logger = logging.getLogger('flowauxi.messaging.conversation_lock')


class ConversationLockTimeout(Exception):
    """Failed to acquire distributed lock on a conversation."""
    def __init__(self, conversation_id: str, timeout: float):
        super().__init__(
            f"Failed to acquire lock for conversation {conversation_id} "
            f"after {timeout}s"
        )
        self.conversation_id = conversation_id
        self.timeout = timeout


class ConversationLock:
    """
    Distributed lock using Redis SETNX with auto-release TTL.
    
    Guarantees:
    - Only ONE worker processes a conversation at any time
    - Locks auto-release after TTL (no deadlocks on worker crash)
    - Owner validation prevents accidental release of another's lock
    - Spin-wait with configurable timeout and backoff
    
    Usage:
        lock = get_conversation_lock()
        
        with lock.acquire(conversation_id):
            # Safe: only one worker processes this conversation
            flow_engine.process(message)
    
    With Celery (in task):
        @celery_app.task(bind=True, max_retries=3)
        def process_inbound_message(self, message_id):
            msg = load_message(message_id)
            lock = get_conversation_lock()
            
            try:
                with lock.acquire(msg.conversation_id):
                    flow_engine.process(msg)
            except ConversationLockTimeout:
                # Another worker has this conversation — retry
                self.retry(countdown=2)
    """
    
    # Configuration
    LOCK_TTL = 30              # Max lock hold time (seconds)
    ACQUIRE_TIMEOUT = 10       # Max wait to acquire (seconds)
    RETRY_INTERVAL = 0.1       # Initial spin interval (seconds)
    MAX_RETRY_INTERVAL = 1.0   # Max spin interval with backoff
    
    # Key prefix
    KEY_PREFIX = "conv_lock"
    
    def __init__(self, redis_client):
        """
        Args:
            redis_client: Redis connection instance
        """
        self._redis = redis_client
        # Unique worker identity for owner validation
        self._worker_id = f"{os.getpid()}:{threading.get_ident()}:{uuid.uuid4().hex[:8]}"
    
    def _make_key(self, conversation_id: str) -> str:
        """Generate Redis key for a conversation lock."""
        return f"{self.KEY_PREFIX}:{conversation_id}"
    
    def _make_value(self) -> str:
        """Generate unique lock value for owner validation."""
        return f"{self._worker_id}:{time.monotonic()}"
    
    @contextmanager
    def acquire(
        self,
        conversation_id: str,
        timeout: Optional[float] = None,
        ttl: Optional[int] = None,
    ) -> Generator[None, None, None]:
        """
        Acquire exclusive lock on a conversation (context manager).
        
        Args:
            conversation_id: The conversation to lock
            timeout: Max seconds to wait for lock (default: ACQUIRE_TIMEOUT)
            ttl: Lock auto-release time in seconds (default: LOCK_TTL)
            
        Raises:
            ConversationLockTimeout: If lock cannot be acquired within timeout
            
        Yields:
            None — use as context manager
        """
        timeout = timeout if timeout is not None else self.ACQUIRE_TIMEOUT
        ttl = ttl if ttl is not None else self.LOCK_TTL
        
        lock_key = self._make_key(conversation_id)
        lock_value = self._make_value()
        acquired = False
        
        try:
            # ─── Spin-Wait with Exponential Backoff ───
            deadline = time.monotonic() + timeout
            retry_interval = self.RETRY_INTERVAL
            attempts = 0
            
            while time.monotonic() < deadline:
                attempts += 1
                
                # Atomic set-if-not-exists with TTL
                acquired = self._redis.set(
                    lock_key,
                    lock_value,
                    nx=True,     # Only set if NOT exists
                    ex=ttl,      # Auto-expire after TTL
                )
                
                if acquired:
                    logger.debug(
                        f"conv_lock_acquired conversation={conversation_id} "
                        f"attempts={attempts}"
                    )
                    break
                
                # Lock held by another worker — wait with backoff
                time.sleep(retry_interval)
                retry_interval = min(
                    retry_interval * 1.5,
                    self.MAX_RETRY_INTERVAL,
                )
            
            if not acquired:
                logger.warning(
                    f"conv_lock_timeout conversation={conversation_id} "
                    f"timeout={timeout}s attempts={attempts}"
                )
                raise ConversationLockTimeout(conversation_id, timeout)
            
            yield  # === Critical section ===
            
        finally:
            if acquired:
                self._safe_release(lock_key, lock_value)
    
    def _safe_release(self, lock_key: str, lock_value: str) -> bool:
        """
        Release lock ONLY if we still own it.
        
        Uses a Lua script for atomic check-and-delete to prevent:
        1. Lock expired while we were processing
        2. Another worker acquired it
        3. We accidentally release their lock
        
        Returns:
            True if we released the lock, False if someone else owns it
        """
        # Lua script: atomic compare-and-delete
        lua_script = """
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
        """
        
        try:
            result = self._redis.eval(lua_script, 1, lock_key, lock_value)
            
            if result == 0:
                logger.warning(
                    f"conv_lock_stolen key={lock_key} "
                    f"(lock expired while processing — increase TTL?)"
                )
                return False
            
            logger.debug(f"conv_lock_released key={lock_key}")
            return True
            
        except Exception as e:
            # Redis error during release — lock will auto-expire via TTL
            logger.error(
                f"conv_lock_release_error key={lock_key}: {e} "
                f"(will auto-expire in {self.LOCK_TTL}s)"
            )
            return False
    
    def is_locked(self, conversation_id: str) -> bool:
        """Check if a conversation is currently locked (for monitoring)."""
        try:
            return self._redis.exists(self._make_key(conversation_id)) > 0
        except Exception:
            return False
    
    def force_release(self, conversation_id: str) -> bool:
        """
        Force-release a conversation lock (admin action).
        
        Use only for stuck locks that won't auto-expire.
        """
        try:
            key = self._make_key(conversation_id)
            result = self._redis.delete(key)
            if result:
                logger.warning(
                    f"conv_lock_force_released conversation={conversation_id}"
                )
            return bool(result)
        except Exception as e:
            logger.error(f"conv_lock_force_release_error: {e}")
            return False
    
    def get_active_locks(self) -> int:
        """Count currently held conversation locks (for monitoring)."""
        try:
            cursor = 0
            count = 0
            while True:
                cursor, keys = self._redis.scan(
                    cursor=cursor,
                    match=f"{self.KEY_PREFIX}:*",
                    count=100,
                )
                count += len(keys)
                if cursor == 0:
                    break
            return count
        except Exception:
            return -1


# =============================================================================
# Singleton
# =============================================================================

_lock_instance: Optional[ConversationLock] = None


def get_conversation_lock() -> ConversationLock:
    """Get singleton ConversationLock instance."""
    global _lock_instance
    if _lock_instance is None:
        import os
        
        try:
            import redis
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/1')
            redis_client = redis.from_url(
                redis_url,
                decode_responses=False,
                socket_timeout=3.0,
                socket_connect_timeout=3.0,
                retry_on_timeout=True,
                max_connections=5,
            )
            redis_client.ping()
            _lock_instance = ConversationLock(redis_client)
            logger.info("🔒 ConversationLock initialized")
        except Exception as e:
            logger.error(f"❌ ConversationLock init failed: {e}")
            raise
    
    return _lock_instance
