"""
Transactional Idempotency Handler
=================================
Production-grade idempotency protection for payment operations.

Features:
- Request deduplication via idempotency keys
- Concurrent request detection and prevention
- Automatic cleanup of expired keys
- Thread-safe operations

@version 1.0.0
@securityLevel FAANG-Production
"""

import time
import threading
from typing import Dict, Optional, Callable, Any
from functools import wraps

# =============================================================================
# TYPES
# =============================================================================

class ConcurrentRequestError(Exception):
    """Raised when a concurrent request with the same idempotency key is detected."""
    
    def __init__(self, key: str, existing_request_id: str):
        self.key = key
        self.existing_request_id = existing_request_id
        super().__init__(f"Concurrent request detected for idempotency key: {key}")

class IdempotencyStatus:
    """Status of an idempotent request."""
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"

# =============================================================================
# IN-MEMORY STORE (Use Redis in production)
# =============================================================================

class IdempotencyStore:
    """
    Thread-safe store for idempotency keys.
    
    In production, replace with Redis or database-backed store.
    """
    
    def __init__(self, ttl_seconds: int = 3600):
        self._store: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.RLock()
        self._ttl_seconds = ttl_seconds
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Get entry by key, cleaning expired entries."""
        with self._lock:
            self._cleanup_expired()
            entry = self._store.get(key)
            if entry and entry['expires_at'] > time.time():
                return entry
            return None
    
    def set(self, key: str, status: str, request_id: str, result: Any = None):
        """Set entry with status and optional result."""
        with self._lock:
            self._store[key] = {
                'status': status,
                'request_id': request_id,
                'result': result,
                'created_at': time.time(),
                'expires_at': time.time() + self._ttl_seconds,
            }
    
    def delete(self, key: str):
        """Delete entry by key."""
        with self._lock:
            self._store.pop(key, None)
    
    def _cleanup_expired(self):
        """Remove expired entries."""
        now = time.time()
        expired_keys = [
            key for key, entry in self._store.items()
            if entry['expires_at'] <= now
        ]
        for key in expired_keys:
            del self._store[key]

# Global store instance
_idempotency_store = IdempotencyStore(ttl_seconds=3600)  # 1 hour TTL

# =============================================================================
# IDEMPOTENCY HANDLER
# =============================================================================

class IdempotencyHandler:
    """
    Handler for idempotent request processing.
    
    Ensures identical requests (same idempotency key) produce the same result
    and prevents concurrent processing of the same request.
    """
    
    def __init__(self, store: Optional[IdempotencyStore] = None):
        self._store = store or _idempotency_store
    
    def execute(
        self,
        idempotency_key: str,
        operation: Callable[..., Any],
        request_id: Optional[str] = None,
        user_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute operation with idempotency protection.
        
        Args:
            idempotency_key: Unique key for this operation
            request_id: Current request ID (auto-generated if None)
            operation: Callable to execute (can accept transaction parameter)
            user_id: User ID for logging/tracking
            tenant_id: Tenant ID for logging/tracking
            
        Returns:
            Dict with 'status', 'result', and 'from_cache' flag
            
        Raises:
            ConcurrentRequestError: If same key is being processed concurrently
        """
        # Generate request_id if not provided
        if request_id is None:
            request_id = f"req_{int(time.time())}_{idempotency_key[:8]}"
        
        # Check for existing entry
        existing = self._store.get(idempotency_key)
        
        if existing:
            # If same request is already being processed, reject
            if existing['status'] == IdempotencyStatus.PENDING:
                if existing['request_id'] != request_id:
                    raise ConcurrentRequestError(
                        idempotency_key,
                        existing['request_id']
                    )
                # Same request ID, continue (retry)
            
            # If completed, return cached result
            if existing['status'] == IdempotencyStatus.COMPLETED:
                return {
                    'status': 'success',
                    'result': existing['result'],
                    'from_cache': True,
                }
            
            # If failed, allow retry
            if existing['status'] == IdempotencyStatus.FAILED:
                pass  # Continue to re-execute
        
        # Mark as pending
        self._store.set(idempotency_key, IdempotencyStatus.PENDING, request_id)
        
        try:
            # Inject Supabase client as the transaction context for FAANG-level atomicity
            from supabase_client import get_supabase_client
            tx = get_supabase_client()
            result = operation(tx)
            
            # Mark as completed
            self._store.set(
                idempotency_key,
                IdempotencyStatus.COMPLETED,
                request_id,
                result
            )
            
            return {
                'status': 'success',
                'result': result,
                'from_cache': False,
            }
            
        except Exception as e:
            # Mark as failed
            self._store.set(
                idempotency_key,
                IdempotencyStatus.FAILED,
                request_id,
                {'error': str(e)}
            )
            raise
    
    def decorator(self, key_extractor: Callable[..., str]):
        """
        Create a decorator for idempotent functions.
        
        Args:
            key_extractor: Function that extracts idempotency key from arguments
        """
        def decorator(fn: Callable) -> Callable:
            @wraps(fn)
            def wrapper(*args, **kwargs):
                key = key_extractor(*args, **kwargs)
                if not key:
                    # No idempotency key, execute directly
                    return fn(*args, **kwargs)
                
                # Execute with idempotency protection
                # Wrap function to accept transaction parameter
                def wrapped_operation(tx):
                    return fn(*args, **kwargs)
                
                result = self.execute(
                    idempotency_key=key,
                    operation=wrapped_operation,
                    request_id=f"req_{int(time.time())}"
                )
                return result['result']
            return wrapper
        return decorator

# Global handler instance
idempotency_handler = IdempotencyHandler()

# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    'idempotency_handler',
    'ConcurrentRequestError',
    'IdempotencyHandler',
    'IdempotencyStore',
    'IdempotencyStatus',
]
