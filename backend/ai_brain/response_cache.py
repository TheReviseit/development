"""
Response caching layer for AI Brain.
Reduces API costs by caching common responses.
"""

import time
import hashlib
import json
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from threading import Lock


@dataclass
class CacheEntry:
    """A single cache entry."""
    key: str
    value: Dict[str, Any]
    created_at: float = field(default_factory=time.time)
    hits: int = 0
    ttl: int = 300  # 5 minutes default
    
    def is_expired(self) -> bool:
        """Check if entry has expired."""
        return (time.time() - self.created_at) > self.ttl
    
    def touch(self):
        """Record a cache hit."""
        self.hits += 1


class ResponseCache:
    """
    Caching layer for AI responses.
    
    Caches responses by intent + key entities to reduce API calls.
    Supports both in-memory and Redis backends.
    
    Cache key pattern:
    - {business_id}:{intent}:{normalized_query_hash}
    
    Features:
    - TTL-based expiration
    - Hit counting for analytics
    - Thread-safe operations
    - Optional Redis backend
    """
    
    def __init__(
        self,
        default_ttl: int = 300,  # 5 minutes
        max_entries: int = 1000,
        redis_client=None
    ):
        self.default_ttl = default_ttl
        self.max_entries = max_entries
        self.redis = redis_client
        
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = Lock()
        
        # Stats
        self._hits = 0
        self._misses = 0
    
    def _generate_key(
        self,
        business_id: str,
        intent: str,
        query: str = "",
        entities: Dict[str, Any] = None
    ) -> str:
        """Generate a cache key from components."""
        # Normalize query
        normalized_query = query.lower().strip()
        
        # Include relevant entities
        entity_str = ""
        if entities:
            # Sort entities for consistent hashing
            sorted_entities = sorted(entities.items())
            entity_str = json.dumps(sorted_entities)
        
        # Create hash of query + entities
        content = f"{normalized_query}:{entity_str}"
        content_hash = hashlib.md5(content.encode()).hexdigest()[:12]
        
        return f"{business_id}:{intent}:{content_hash}"
    
    def get(
        self,
        business_id: str,
        intent: str,
        query: str = "",
        entities: Dict[str, Any] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached response if available.
        
        Returns:
            Cached response dict or None if not found/expired
        """
        key = self._generate_key(business_id, intent, query, entities)
        
        # Try Redis first
        if self.redis:
            try:
                cached = self.redis.get(f"ai_cache:{key}")
                if cached:
                    self._hits += 1
                    return json.loads(cached)
            except Exception:
                pass
        
        # Try memory cache
        with self._lock:
            entry = self._cache.get(key)
            if entry and not entry.is_expired():
                entry.touch()
                self._hits += 1
                return entry.value
            elif entry and entry.is_expired():
                del self._cache[key]
            
            self._misses += 1
            return None
    
    def set(
        self,
        business_id: str,
        intent: str,
        query: str,
        response: Dict[str, Any],
        entities: Dict[str, Any] = None,
        ttl: int = None
    ):
        """
        Cache a response.
        
        Args:
            business_id: Business identifier
            intent: Detected intent
            query: User's query
            response: Response to cache
            entities: Relevant entities
            ttl: Optional TTL override
        """
        key = self._generate_key(business_id, intent, query, entities)
        ttl = ttl or self.default_ttl
        
        # Store in Redis if available
        if self.redis:
            try:
                self.redis.setex(
                    f"ai_cache:{key}",
                    ttl,
                    json.dumps(response, default=str)
                )
            except Exception:
                pass
        
        # Store in memory
        with self._lock:
            # Evict old entries if at capacity
            if len(self._cache) >= self.max_entries:
                self._evict_oldest()
            
            self._cache[key] = CacheEntry(
                key=key,
                value=response,
                ttl=ttl
            )
    
    def invalidate(
        self,
        business_id: str,
        intent: str = None
    ):
        """
        Invalidate cache entries for a business.
        
        Args:
            business_id: Business identifier
            intent: Optional intent to target (None = all intents)
        """
        prefix = f"{business_id}:{intent}:" if intent else f"{business_id}:"
        
        # Redis invalidation
        if self.redis:
            try:
                keys = self.redis.keys(f"ai_cache:{prefix}*")
                if keys:
                    self.redis.delete(*keys)
            except Exception:
                pass
        
        # Memory invalidation
        with self._lock:
            keys_to_delete = [
                k for k in self._cache.keys()
                if k.startswith(prefix)
            ]
            for k in keys_to_delete:
                del self._cache[k]
    
    def _evict_oldest(self):
        """Evict oldest entries to make room."""
        if not self._cache:
            return
        
        # Sort by creation time and remove oldest 10%
        sorted_entries = sorted(
            self._cache.items(),
            key=lambda x: x[1].created_at
        )
        
        num_to_remove = max(1, len(sorted_entries) // 10)
        for key, _ in sorted_entries[:num_to_remove]:
            del self._cache[key]
    
    def clear(self):
        """Clear all cache entries."""
        if self.redis:
            try:
                keys = self.redis.keys("ai_cache:*")
                if keys:
                    self.redis.delete(*keys)
            except Exception:
                pass
        
        with self._lock:
            self._cache.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_hits = sum(e.hits for e in self._cache.values())
            
            return {
                "entries": len(self._cache),
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": self._hits / (self._hits + self._misses) if (self._hits + self._misses) > 0 else 0,
                "total_entry_hits": total_hits
            }


# =============================================================================
# CACHE DECORATOR
# =============================================================================

def cached_response(
    cache: ResponseCache,
    business_id_arg: str = "business_id",
    intent_arg: str = "intent",
    query_arg: str = "message",
    ttl: int = 300
):
    """
    Decorator to cache function responses.
    
    Usage:
        @cached_response(cache, ttl=600)
        def generate_response(business_id, intent, message):
            ...
    """
    def decorator(func: Callable):
        def wrapper(*args, **kwargs):
            # Extract cache key components
            business_id = kwargs.get(business_id_arg, "default")
            intent = kwargs.get(intent_arg, "unknown")
            query = kwargs.get(query_arg, "")
            
            # Check cache
            cached = cache.get(business_id, intent, query)
            if cached:
                cached["_from_cache"] = True
                return cached
            
            # Call function
            result = func(*args, **kwargs)
            
            # Cache result
            if result:
                cache.set(business_id, intent, query, result, ttl=ttl)
            
            return result
        
        return wrapper
    return decorator


# =============================================================================
# INTENT-SPECIFIC CACHE TTLs
# =============================================================================

INTENT_CACHE_TTLS = {
    # Static info - cache longer
    "hours": 3600,        # 1 hour
    "location": 3600,     # 1 hour
    "greeting": 1800,     # 30 mins
    "goodbye": 1800,      # 30 mins
    
    # Semi-dynamic - moderate cache
    "pricing": 600,       # 10 mins (prices may change)
    "general_enquiry": 600,
    
    # Dynamic - short/no cache
    "booking": 60,        # 1 min (availability changes)
    "order_status": 0,    # No cache
    "complaint": 0,       # No cache
    "lead_capture": 0,    # No cache
    
    # Default
    "unknown": 300,       # 5 mins
}


def get_cache_ttl(intent: str) -> int:
    """Get appropriate cache TTL for an intent."""
    return INTENT_CACHE_TTLS.get(intent, 300)


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_response_cache: Optional[ResponseCache] = None


def get_response_cache(
    redis_client=None,
    default_ttl: int = 300
) -> ResponseCache:
    """Get or create the global response cache."""
    global _response_cache
    if _response_cache is None:
        _response_cache = ResponseCache(
            default_ttl=default_ttl,
            redis_client=redis_client
        )
    return _response_cache
