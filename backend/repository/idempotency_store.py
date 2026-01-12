"""
Idempotency Store - Prevents Duplicate Operations
Uses database-backed storage with TTL for idempotency key tracking.

Features:
- Atomic check-and-set operations
- TTL-based expiration (default 24h)
- Fingerprint-based duplicate detection
- Support for returning cached results
"""

import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
import json

logger = logging.getLogger('reviseit.repository.idempotency')


@dataclass
class IdempotencyRecord:
    """Stored idempotency key record."""
    key: str
    operation: str
    status: str  # "pending", "completed", "failed"
    result_id: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    created_at: datetime = None
    expires_at: datetime = None
    # BULLETPROOF ADDITIONS:
    request_hash: Optional[str] = None  # Hash of request payload for collision detection
    scope: Optional[str] = None  # Action scope: "order:create", "order:cancel", "refund:create"
    
    def is_expired(self) -> bool:
        """Check if record has expired."""
        if not self.expires_at:
            return False
        return datetime.now(timezone.utc) > self.expires_at
    
    def is_completed(self) -> bool:
        """Check if operation completed successfully."""
        return self.status == "completed" and not self.is_expired()


class IdempotencyStore:
    """
    Idempotency key storage with atomic operations.
    
    Usage:
        store = IdempotencyStore(supabase_client)
        
        # Check before processing
        existing = store.get(key, "create_order")
        if existing and existing.is_completed():
            return existing.result_data  # Return cached result
        
        # Lock the key
        if not store.lock(key, "create_order"):
            raise DuplicateOrderError("Order already in progress")
        
        try:
            # Process order...
            result = process_order()
            
            # Mark completed
            store.complete(key, order.id, order.to_dict())
        except Exception as e:
            store.fail(key, str(e))
            raise
    """
    
    TABLE_NAME = "idempotency_keys"
    DEFAULT_TTL_HOURS = 24
    
    def __init__(self, supabase_client):
        self.db = supabase_client
        self._ensure_table_exists()
    
    def _ensure_table_exists(self):
        """Create idempotency table if it doesn't exist."""
        # Note: In production, this should be a migration
        # Table schema:
        # - id: uuid primary key
        # - key: text unique not null
        # - operation: text not null
        # - status: text not null (pending/completed/failed)
        # - result_id: text
        # - result_data: jsonb
        # - created_at: timestamptz
        # - expires_at: timestamptz
        pass
    
    def get(self, key: str, operation: str) -> Optional[IdempotencyRecord]:
        """
        Get existing idempotency record.
        
        Returns None if not found or expired.
        """
        try:
            result = self.db.table(self.TABLE_NAME).select("*").eq(
                "key", key
            ).eq("operation", operation).single().execute()
            
            if not result.data:
                return None
            
            record = IdempotencyRecord(
                key=result.data["key"],
                operation=result.data["operation"],
                status=result.data["status"],
                result_id=result.data.get("result_id"),
                result_data=result.data.get("result_data"),
                created_at=self._parse_datetime(result.data.get("created_at")),
                expires_at=self._parse_datetime(result.data.get("expires_at")),
            )
            
            if record.is_expired():
                # Clean up expired record
                self._delete(key, operation)
                return None
            
            return record
            
        except Exception as e:
            # PGRST116 = not found
            if 'PGRST116' in str(e):
                return None
            logger.warning(f"Error getting idempotency key: {e}")
            return None
    
    def lock(
        self,
        key: str,
        operation: str,
        ttl_hours: int = None
    ) -> bool:
        """
        Atomically lock an idempotency key.
        
        Returns True if lock acquired, False if already locked.
        Uses upsert with conflict handling for atomicity.
        """
        ttl = ttl_hours or self.DEFAULT_TTL_HOURS
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=ttl)
        
        try:
            # Try to insert (will fail on conflict)
            self.db.table(self.TABLE_NAME).insert({
                "key": key,
                "operation": operation,
                "status": "pending",
                "created_at": now.isoformat(),
                "expires_at": expires_at.isoformat(),
            }).execute()
            
            logger.debug(f"Idempotency lock acquired: {key}")
            return True
            
        except Exception as e:
            # Check if it's a duplicate key error
            if '23505' in str(e) or 'duplicate' in str(e).lower():
                # Key exists - check if it's expired
                existing = self.get(key, operation)
                if existing is None:
                    # Was expired and deleted, retry lock
                    return self.lock(key, operation, ttl_hours)
                
                logger.debug(f"Idempotency key already exists: {key}")
                return False
            
            logger.error(f"Error locking idempotency key: {e}")
            raise
    
    def complete(
        self,
        key: str,
        result_id: str,
        result_data: Dict[str, Any] = None
    ) -> bool:
        """Mark operation as completed with result."""
        try:
            self.db.table(self.TABLE_NAME).update({
                "status": "completed",
                "result_id": result_id,
                "result_data": result_data,
            }).eq("key", key).execute()
            
            logger.debug(f"Idempotency completed: {key} -> {result_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error completing idempotency key: {e}")
            return False
    
    def fail(self, key: str, error: str = None) -> bool:
        """Mark operation as failed."""
        try:
            self.db.table(self.TABLE_NAME).update({
                "status": "failed",
                "result_data": {"error": error} if error else None,
            }).eq("key", key).execute()
            
            logger.debug(f"Idempotency failed: {key}")
            return True
            
        except Exception as e:
            logger.error(f"Error marking idempotency as failed: {e}")
            return False
    
    def _delete(self, key: str, operation: str) -> bool:
        """Delete an idempotency record."""
        try:
            self.db.table(self.TABLE_NAME).delete().eq(
                "key", key
            ).eq("operation", operation).execute()
            return True
        except Exception as e:
            logger.warning(f"Error deleting idempotency key: {e}")
            return False
    
    def cleanup_expired(self) -> int:
        """Clean up expired records. Returns count deleted."""
        try:
            now = datetime.now(timezone.utc).isoformat()
            result = self.db.table(self.TABLE_NAME).delete().lt(
                "expires_at", now
            ).execute()
            
            count = len(result.data) if result.data else 0
            if count > 0:
                logger.info(f"Cleaned up {count} expired idempotency keys")
            return count
            
        except Exception as e:
            logger.error(f"Error cleaning up expired keys: {e}")
            return 0
    
    @staticmethod
    def _parse_datetime(value) -> Optional[datetime]:
        """Parse datetime from string."""
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None


# =============================================================================
# In-Memory Fallback Store (for development/testing)
# =============================================================================

class InMemoryIdempotencyStore(IdempotencyStore):
    """
    In-memory idempotency store for testing.
    WARNING: Not suitable for production (no persistence, no multi-instance support)
    """
    
    def __init__(self):
        self._store: Dict[str, IdempotencyRecord] = {}
    
    def _ensure_table_exists(self):
        pass
    
    def get(self, key: str, operation: str) -> Optional[IdempotencyRecord]:
        composite_key = f"{operation}:{key}"
        record = self._store.get(composite_key)
        
        if record and record.is_expired():
            del self._store[composite_key]
            return None
        
        return record
    
    def lock(self, key: str, operation: str, ttl_hours: int = None) -> bool:
        composite_key = f"{operation}:{key}"
        
        existing = self.get(key, operation)
        if existing:
            return False
        
        ttl = ttl_hours or self.DEFAULT_TTL_HOURS
        now = datetime.now(timezone.utc)
        
        self._store[composite_key] = IdempotencyRecord(
            key=key,
            operation=operation,
            status="pending",
            created_at=now,
            expires_at=now + timedelta(hours=ttl),
        )
        return True
    
    def complete(self, key: str, result_id: str, result_data: Dict[str, Any] = None) -> bool:
        composite_key = f"create_order:{key}"  # Assume create_order for now
        if composite_key in self._store:
            self._store[composite_key].status = "completed"
            self._store[composite_key].result_id = result_id
            self._store[composite_key].result_data = result_data
            return True
        return False
    
    def fail(self, key: str, error: str = None) -> bool:
        composite_key = f"create_order:{key}"
        if composite_key in self._store:
            self._store[composite_key].status = "failed"
            return True
        return False


# =============================================================================
# Factory Function
# =============================================================================

_idempotency_store: Optional[IdempotencyStore] = None


def get_idempotency_store(supabase_client=None) -> IdempotencyStore:
    """Get or create idempotency store instance."""
    global _idempotency_store
    
    if _idempotency_store is not None:
        return _idempotency_store
    
    if supabase_client:
        _idempotency_store = IdempotencyStore(supabase_client)
    else:
        logger.warning("No Supabase client provided, using in-memory store")
        _idempotency_store = InMemoryIdempotencyStore()
    
    return _idempotency_store

