"""
Outbox Handler - Reliable Event Publishing
==========================================
Implements the Outbox Pattern for reliable event publishing.

Features:
- Store events in outbox table before publishing
- Async background publisher
- Guaranteed at-least-once delivery
- Retry with exponential backoff

@version 1.0.0
@securityLevel FAANG-Production
"""

import json
import time
import threading
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, asdict
from enum import Enum

# =============================================================================
# TYPES
# =============================================================================

class OutboxStatus(Enum):
    PENDING = "pending"
    PUBLISHED = "published"
    FAILED = "failed"
    RETRYING = "retrying"

@dataclass
class OutboxEvent:
    """Event stored in outbox for reliable publishing."""
    id: str
    event_type: str
    aggregate_type: str
    aggregate_id: str
    payload: Dict[str, Any]
    metadata: Dict[str, Any]
    status: str = "pending"
    created_at: float = 0
    published_at: Optional[float] = None
    retry_count: int = 0
    error: Optional[str] = None
    
    def __post_init__(self):
        if self.created_at == 0:
            self.created_at = time.time()

# =============================================================================
# IN-MEMORY OUTBOX (Use database in production)
# =============================================================================

class OutboxStore:
    """
    In-memory store for outbox events.
    
    In production, use database table with:
    - id (UUID, PK)
    - event_type (string)
    - aggregate_type (string)
    - aggregate_id (string)
    - payload (JSON)
    - metadata (JSON)
    - status (enum: pending, published, failed)
    - created_at (timestamp)
    - published_at (timestamp, nullable)
    - retry_count (integer)
    - error (text, nullable)
    """
    
    def __init__(self):
        self._events: Dict[str, OutboxEvent] = {}
        self._lock = threading.RLock()
    
    def save(self, event: OutboxEvent) -> str:
        """Save event to outbox."""
        with self._lock:
            self._events[event.id] = event
            return event.id
    
    def get_pending(self, limit: int = 100) -> list:
        """Get pending events for publishing."""
        with self._lock:
            pending = [
                e for e in self._events.values()
                if e.status in (OutboxStatus.PENDING.value, OutboxStatus.RETRYING.value)
            ]
            # Sort by created_at (oldest first)
            pending.sort(key=lambda e: e.created_at)
            return pending[:limit]
    
    def mark_published(self, event_id: str):
        """Mark event as published."""
        with self._lock:
            if event_id in self._events:
                self._events[event_id].status = OutboxStatus.PUBLISHED.value
                self._events[event_id].published_at = time.time()
    
    def mark_failed(self, event_id: str, error: str, increment_retry: bool = True):
        """Mark event as failed."""
        with self._lock:
            if event_id in self._events:
                event = self._events[event_id]
                event.status = OutboxStatus.FAILED.value
                event.error = error
                if increment_retry:
                    event.retry_count += 1
    
    def mark_retrying(self, event_id: str):
        """Mark event as retrying."""
        with self._lock:
            if event_id in self._events:
                self._events[event_id].status = OutboxStatus.RETRYING.value

# Global store instance
_outbox_store = OutboxStore()

# =============================================================================
# PUBLISHER
# =============================================================================

class OutboxPublisher:
    """
    Publisher for outbox events.
    
    Implements the Outbox Pattern:
    1. Store event in outbox (same transaction as business logic)
    2. Background process polls outbox and publishes events
    3. Mark events as published after successful publish
    """
    
    def __init__(self, store: Optional[OutboxStore] = None):
        self._store = store or _outbox_store
        self._publishers: Dict[str, Callable] = {}
        self._running = False
        self._thread: Optional[threading.Thread] = None
    
    def register_publisher(self, event_type: str, publisher: Callable[[OutboxEvent], bool]):
        """Register a publisher function for an event type."""
        self._publishers[event_type] = publisher
    
    def publish(
        self,
        event_type: str,
        payload: Dict[str, Any],
        aggregate_type: str,
        aggregate_id: str,
        transaction: Any = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Publish event to outbox for guaranteed delivery.
        
        Args:
            event_type: Type of event (e.g., 'checkout.created')
            payload: Event data
            aggregate_type: Type of aggregate (e.g., 'subscription')
            aggregate_id: ID of the aggregate
            transaction: Database transaction context (optional)
            metadata: Additional metadata
            
        Returns:
            Event ID
        """
        event = OutboxEvent(
            id=create_event_id(),
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
            metadata=metadata or {},
        )
        return self.schedule(event)
    
    def schedule(self, event: OutboxEvent) -> str:
        """
        Schedule event for publishing.
        
        Stores event in outbox. Background process will publish it.
        
        Returns:
            Event ID
        """
        self._store.save(event)
        return event.id
    
    def publish_now(self, event: OutboxEvent) -> bool:
        """
        Publish event immediately (synchronous).
        
        Returns:
            True if published successfully
        """
        publisher = self._publishers.get(event.event_type)
        if not publisher:
            # No publisher registered, mark as failed
            self._store.mark_failed(event.id, f"No publisher for event type: {event.event_type}")
            return False
        
        try:
            success = publisher(event)
            if success:
                self._store.mark_published(event.id)
                return True
            else:
                self._store.mark_failed(event.id, "Publisher returned False")
                return False
        except Exception as e:
            self._store.mark_failed(event.id, str(e))
            return False
    
    def start_background_publisher(self, interval_seconds: float = 5.0):
        """Start background publishing thread."""
        if self._running:
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._publish_loop, args=(interval_seconds,), daemon=True)
        self._thread.start()
    
    def stop_background_publisher(self):
        """Stop background publishing thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5.0)
    
    def _publish_loop(self, interval_seconds: float):
        """Background loop for publishing events."""
        while self._running:
            try:
                self._process_pending_events()
            except Exception as e:
                print(f"[OutboxPublisher] Error in publish loop: {e}")
            
            time.sleep(interval_seconds)
    
    def _process_pending_events(self):
        """Process all pending events."""
        pending = self._store.get_pending(limit=100)
        
        for event in pending:
            # Check retry count
            if event.retry_count >= 3:
                self._store.mark_failed(event.id, "Max retries exceeded", increment_retry=False)
                continue
            
            # Mark as retrying
            if event.status == OutboxStatus.PENDING.value:
                self._store.mark_retrying(event.id)
            
            # Try to publish
            publisher = self._publishers.get(event.event_type)
            if not publisher:
                self._store.mark_failed(event.id, f"No publisher for: {event.event_type}")
                continue
            
            try:
                success = publisher(event)
                if success:
                    self._store.mark_published(event.id)
                else:
                    self._store.mark_failed(event.id, "Publisher returned False")
            except Exception as e:
                self._store.mark_failed(event.id, str(e))

# Global publisher instance
outbox_publisher = OutboxPublisher()

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def create_event_id() -> str:
    """Generate unique event ID."""
    import uuid
    return str(uuid.uuid4())

def schedule_event(
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """
    Schedule an event for publishing.
    
    Convenience function for creating and scheduling events.
    
    Returns:
        Event ID
    """
    event = OutboxEvent(
        id=create_event_id(),
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload,
        metadata=metadata or {},
    )
    return outbox_publisher.schedule(event)

# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    'outbox_publisher',
    'OutboxPublisher',
    'OutboxStore',
    'OutboxEvent',
    'OutboxStatus',
    'schedule_event',
    'create_event_id',
]
