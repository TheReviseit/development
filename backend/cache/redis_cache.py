"""
Redis-backed caching implementation with multi-layer architecture.
L1: In-memory (fast, per-worker)
L2: Redis (shared, persistent)
"""

import os
import json
import time
import hashlib
import logging
from typing import Dict, Any, Optional, Callable, List
from functools import wraps
from threading import Lock
from dataclasses import dataclass, field

try:
    import redis
    from redis.exceptions import RedisError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None

try:
    from cachetools import TTLCache, LRUCache
    CACHETOOLS_AVAILABLE = True
except ImportError:
    CACHETOOLS_AVAILABLE = False
    TTLCache = None
    LRUCache = None

try:
    import orjson
    JSON_SERIALIZER = orjson
    ORJSON_AVAILABLE = True
except ImportError:
    ORJSON_AVAILABLE = False
    JSON_SERIALIZER = json

logger = logging.getLogger('reviseit.cache')


@dataclass
class CacheStats:
    """Cache statistics for monitoring."""
    l1_hits: int = 0
    l1_misses: int = 0
    l2_hits: int = 0
    l2_misses: int = 0
    writes: int = 0
    invalidations: int = 0
    errors: int = 0
    
    @property
    def total_hits(self) -> int:
        return self.l1_hits + self.l2_hits
    
    @property
    def total_requests(self) -> int:
        return self.l1_hits + self.l1_misses
    
    @property
    def hit_rate(self) -> float:
        total = self.total_requests
        return self.total_hits / total if total > 0 else 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "l1_hits": self.l1_hits,
            "l1_misses": self.l1_misses,
            "l2_hits": self.l2_hits,
            "l2_misses": self.l2_misses,
            "total_hits": self.total_hits,
            "total_requests": self.total_requests,
            "hit_rate": round(self.hit_rate, 3),
            "writes": self.writes,
            "invalidations": self.invalidations,
            "errors": self.errors,
        }


class CacheManager:
    """
    Multi-layer cache manager with L1 (in-memory) and L2 (Redis) caching.
    
    Features:
    - Two-tier caching for optimal performance
    - Automatic fallback to L1 if Redis unavailable
    - TTL-based expiration
    - Cache warming for predictable queries
    - Statistics tracking
    
    Cache Key Patterns:
    - session:{user_id} - Session data (5 min TTL)
    - profile:{user_id} - User profiles (1 hour TTL)
    - response:{business_id}:{intent}:{hash} - AI responses (variable TTL)
    - static:{key} - Static content (24 hour TTL)
    """
    
    # TTL configurations by cache type
    TTL_CONFIG = {
        "session": 300,      # 5 minutes
        "profile": 3600,     # 1 hour
        "response": 300,     # 5 minutes (varies by intent)
        "static": 86400,     # 24 hours
        "default": 600,      # 10 minutes
    }
    
    # Intent-specific TTLs
    INTENT_TTLS = {
        "greeting": 1800,        # 30 mins
        "hours": 3600,           # 1 hour
        "location": 3600,        # 1 hour
        "pricing": 600,          # 10 mins
        "booking": 60,           # 1 min
        "general_enquiry": 600,  # 10 mins
    }
    
    def __init__(
        self,
        redis_url: str = None,
        l1_max_size: int = 500,
        l1_ttl: int = 300,
        key_prefix: str = "wa_cache",
    ):
        self.key_prefix = key_prefix
        self.redis_url = redis_url or os.getenv("REDIS_URL")
        
        # L1: In-memory cache (per-worker)
        self._l1_cache: Dict[str, Any] = {}
        self._l1_timestamps: Dict[str, float] = {}
        self._l1_max_size = l1_max_size
        self._l1_ttl = l1_ttl
        self._l1_lock = Lock()
        
        # Use cachetools if available for better L1 performance
        if CACHETOOLS_AVAILABLE and TTLCache:
            self._l1_cache = TTLCache(maxsize=l1_max_size, ttl=l1_ttl)
        
        # L2: Redis cache (shared)
        self._redis: Optional[redis.Redis] = None
        self._redis_available = False
        self._connect_redis()
        
        # Statistics
        self.stats = CacheStats()
        
        logger.info(
            f"CacheManager initialized: L1={l1_max_size} entries, "
            f"L2={'Redis' if self._redis_available else 'disabled'}"
        )
    
    def _connect_redis(self):
        """Connect to Redis with error handling."""
        if not REDIS_AVAILABLE or not self.redis_url:
            logger.warning("Redis not available, using L1 cache only")
            return
        
        try:
            self._redis = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                retry_on_timeout=True,
            )
            self._redis.ping()
            self._redis_available = True
            logger.info(f"✅ Redis connected: {self.redis_url[:30]}...")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            self._redis_available = False
    
    def _make_key(self, prefix: str, *parts: str) -> str:
        """Generate a cache key from parts."""
        key_parts = [self.key_prefix, prefix] + list(parts)
        return ":".join(str(p) for p in key_parts if p)
    
    def _hash_query(self, query: str, entities: Dict = None) -> str:
        """Create a hash for query + entities."""
        content = query.lower().strip()
        if entities:
            content += json.dumps(sorted(entities.items()))
        return hashlib.md5(content.encode()).hexdigest()[:12]
    
    def _serialize(self, value: Any) -> str:
        """Serialize value for Redis storage."""
        if ORJSON_AVAILABLE:
            return orjson.dumps(value).decode()
        return json.dumps(value, default=str)
    
    def _deserialize(self, data: str) -> Any:
        """Deserialize value from Redis."""
        if not data:
            return None
        if ORJSON_AVAILABLE:
            return orjson.loads(data)
        return json.loads(data)
    
    # =========================================================================
    # L1 Cache Operations (In-Memory)
    # =========================================================================
    
    def _l1_get(self, key: str) -> Optional[Any]:
        """Get from L1 cache."""
        if CACHETOOLS_AVAILABLE:
            return self._l1_cache.get(key)
        
        with self._l1_lock:
            if key not in self._l1_cache:
                return None
            
            # Check TTL
            timestamp = self._l1_timestamps.get(key, 0)
            if time.time() - timestamp > self._l1_ttl:
                del self._l1_cache[key]
                del self._l1_timestamps[key]
                return None
            
            return self._l1_cache[key]
    
    def _l1_set(self, key: str, value: Any, ttl: int = None):
        """Set in L1 cache."""
        if CACHETOOLS_AVAILABLE:
            self._l1_cache[key] = value
            return
        
        with self._l1_lock:
            # Evict if at capacity
            if len(self._l1_cache) >= self._l1_max_size:
                self._l1_evict()
            
            self._l1_cache[key] = value
            self._l1_timestamps[key] = time.time()
    
    def _l1_delete(self, key: str):
        """Delete from L1 cache."""
        if CACHETOOLS_AVAILABLE:
            self._l1_cache.pop(key, None)
            return
        
        with self._l1_lock:
            self._l1_cache.pop(key, None)
            self._l1_timestamps.pop(key, None)
    
    def _l1_evict(self):
        """Evict oldest entries from L1 cache."""
        if not self._l1_timestamps:
            return
        
        # Remove oldest 10%
        sorted_keys = sorted(self._l1_timestamps.items(), key=lambda x: x[1])
        num_to_remove = max(1, len(sorted_keys) // 10)
        
        for key, _ in sorted_keys[:num_to_remove]:
            self._l1_cache.pop(key, None)
            self._l1_timestamps.pop(key, None)
    
    # =========================================================================
    # L2 Cache Operations (Redis)
    # =========================================================================
    
    def _l2_get(self, key: str) -> Optional[Any]:
        """Get from L2 (Redis) cache."""
        if not self._redis_available:
            return None
        
        try:
            data = self._redis.get(key)
            return self._deserialize(data) if data else None
        except RedisError as e:
            logger.error(f"Redis GET error: {e}")
            self.stats.errors += 1
            return None
    
    def _l2_set(self, key: str, value: Any, ttl: int):
        """Set in L2 (Redis) cache."""
        if not self._redis_available:
            return
        
        try:
            serialized = self._serialize(value)
            self._redis.setex(key, ttl, serialized)
        except RedisError as e:
            logger.error(f"Redis SET error: {e}")
            self.stats.errors += 1
    
    def _l2_delete(self, key: str):
        """Delete from L2 (Redis) cache."""
        if not self._redis_available:
            return
        
        try:
            self._redis.delete(key)
        except RedisError as e:
            logger.error(f"Redis DELETE error: {e}")
            self.stats.errors += 1
    
    def _l2_delete_pattern(self, pattern: str):
        """Delete all keys matching pattern."""
        if not self._redis_available:
            return
        
        try:
            keys = self._redis.keys(pattern)
            if keys:
                self._redis.delete(*keys)
        except RedisError as e:
            logger.error(f"Redis DELETE pattern error: {e}")
            self.stats.errors += 1
    
    # =========================================================================
    # Public API
    # =========================================================================
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache (L1 first, then L2).
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None
        """
        # Try L1 first
        value = self._l1_get(key)
        if value is not None:
            self.stats.l1_hits += 1
            return value
        
        self.stats.l1_misses += 1
        
        # Try L2
        value = self._l2_get(key)
        if value is not None:
            self.stats.l2_hits += 1
            # Promote to L1
            self._l1_set(key, value)
            return value
        
        self.stats.l2_misses += 1
        return None
    
    def set(self, key: str, value: Any, ttl: int = None):
        """
        Set value in cache (both L1 and L2).
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds
        """
        ttl = ttl or self.TTL_CONFIG["default"]
        
        # Set in both layers
        self._l1_set(key, value, ttl)
        self._l2_set(key, value, ttl)
        
        self.stats.writes += 1
    
    def delete(self, key: str):
        """Delete value from cache."""
        self._l1_delete(key)
        self._l2_delete(key)
        self.stats.invalidations += 1
    
    def invalidate_pattern(self, pattern: str):
        """Invalidate all keys matching pattern."""
        self._l2_delete_pattern(pattern)
        
        # Clear matching keys from L1
        if CACHETOOLS_AVAILABLE:
            keys_to_delete = [k for k in list(self._l1_cache.keys()) if pattern.replace("*", "") in k]
            for k in keys_to_delete:
                self._l1_cache.pop(k, None)
        else:
            with self._l1_lock:
                keys_to_delete = [k for k in list(self._l1_cache.keys()) if pattern.replace("*", "") in k]
                for k in keys_to_delete:
                    self._l1_cache.pop(k, None)
                    self._l1_timestamps.pop(k, None)
        
        self.stats.invalidations += 1
    
    # =========================================================================
    # High-Level Cache Methods
    # =========================================================================
    
    def get_session(self, user_id: str) -> Optional[Dict]:
        """Get user session data."""
        key = self._make_key("session", user_id)
        return self.get(key)
    
    def set_session(self, user_id: str, data: Dict):
        """Set user session data."""
        key = self._make_key("session", user_id)
        self.set(key, data, self.TTL_CONFIG["session"])
    
    def get_user_profile(self, user_id: str) -> Optional[Dict]:
        """Get cached user profile."""
        key = self._make_key("profile", user_id)
        return self.get(key)
    
    def set_user_profile(self, user_id: str, profile: Dict):
        """Cache user profile."""
        key = self._make_key("profile", user_id)
        self.set(key, profile, self.TTL_CONFIG["profile"])
    
    def get_response(
        self,
        business_id: str,
        intent: str,
        query: str,
        entities: Dict = None
    ) -> Optional[Dict]:
        """Get cached AI response."""
        query_hash = self._hash_query(query, entities)
        key = self._make_key("response", business_id, intent, query_hash)
        return self.get(key)
    
    def set_response(
        self,
        business_id: str,
        intent: str,
        query: str,
        response: Dict,
        entities: Dict = None
    ):
        """Cache AI response."""
        query_hash = self._hash_query(query, entities)
        key = self._make_key("response", business_id, intent, query_hash)
        ttl = self.INTENT_TTLS.get(intent, self.TTL_CONFIG["response"])
        self.set(key, response, ttl)
    
    def invalidate_business(self, business_id: str):
        """Invalidate all cache for a business."""
        pattern = self._make_key("response", business_id, "*")
        self.invalidate_pattern(pattern)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self.stats.to_dict()
    
    def warmup(self, queries: List[Dict[str, Any]]):
        """
        Warm up cache with predictable queries.
        
        Args:
            queries: List of dicts with 'business_id', 'intent', 'query', 'response'
        """
        for q in queries:
            self.set_response(
                business_id=q.get("business_id", "default"),
                intent=q.get("intent", "general"),
                query=q.get("query", ""),
                response=q.get("response", {}),
            )
        logger.info(f"Cache warmed with {len(queries)} entries")


# =============================================================================
# Singleton and Decorators
# =============================================================================

_cache_manager: Optional[CacheManager] = None


def get_cache_manager(redis_url: str = None) -> CacheManager:
    """Get or create the global cache manager."""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager(redis_url=redis_url)
    return _cache_manager


def cache_response(
    ttl: int = 300,
    key_prefix: str = "response",
    business_id_arg: str = "business_id",
    intent_arg: str = "intent",
    query_arg: str = "message",
):
    """
    Decorator to cache function responses.
    
    Usage:
        @cache_response(ttl=600)
        def generate_response(business_id, intent, message):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache = get_cache_manager()
            
            # Extract cache key components
            business_id = kwargs.get(business_id_arg, "default")
            intent = kwargs.get(intent_arg, "general")
            query = kwargs.get(query_arg, "")
            
            # Check cache
            cached = cache.get_response(business_id, intent, query)
            if cached:
                cached["_from_cache"] = True
                return cached
            
            # Call function
            result = func(*args, **kwargs)
            
            # Cache result
            if result:
                cache.set_response(business_id, intent, query, result)
            
            return result
        return wrapper
    return decorator


def cache_user_profile(ttl: int = 3600):
    """Decorator to cache user profile lookups."""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(user_id: str, *args, **kwargs):
            cache = get_cache_manager()
            
            # Check cache
            cached = cache.get_user_profile(user_id)
            if cached:
                return cached
            
            # Call function
            result = func(user_id, *args, **kwargs)
            
            # Cache result
            if result:
                cache.set_user_profile(user_id, result)
            
            return result
        return wrapper
    return decorator


def cache_session(ttl: int = 300):
    """Decorator to cache session data."""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(user_id: str, *args, **kwargs):
            cache = get_cache_manager()
            
            # Check cache
            cached = cache.get_session(user_id)
            if cached:
                return cached
            
            # Call function
            result = func(user_id, *args, **kwargs)
            
            # Cache result
            if result:
                cache.set_session(user_id, result)
            
            return result
        return wrapper
    return decorator


def invalidate_cache(business_id: str = None, user_id: str = None):
    """Invalidate cache entries."""
    cache = get_cache_manager()
    
    if business_id:
        cache.invalidate_business(business_id)
    
    if user_id:
        cache.delete(cache._make_key("session", user_id))
        cache.delete(cache._make_key("profile", user_id))


def warmup_cache(queries: List[Dict[str, Any]]):
    """Warm up cache with predictable queries."""
    cache = get_cache_manager()
    cache.warmup(queries)

