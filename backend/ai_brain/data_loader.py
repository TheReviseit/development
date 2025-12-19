"""
Database abstraction layer for loading business data.
Provides flexible interface for different data sources.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import json


class BusinessDataLoader(ABC):
    """Abstract base class for loading business data."""
    
    @abstractmethod
    def load(self, business_id: str) -> Optional[Dict[str, Any]]:
        """
        Load business data by ID.
        
        Args:
            business_id: Unique identifier for the business
            
        Returns:
            Business data dictionary or None if not found
        """
        pass
    
    @abstractmethod
    def refresh(self, business_id: str) -> Optional[Dict[str, Any]]:
        """
        Force refresh from source (bypass cache).
        
        Args:
            business_id: Unique identifier for the business
            
        Returns:
            Fresh business data dictionary or None if not found
        """
        pass


class DictDataLoader(BusinessDataLoader):
    """
    Direct dictionary passthrough loader.
    Use this when business data is provided directly via API.
    """
    
    def __init__(self, data: Dict[str, Any] = None):
        self._data = data
    
    def load(self, business_id: str = None, data: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
        """Return provided data directly."""
        return data or self._data
    
    def refresh(self, business_id: str = None) -> Optional[Dict[str, Any]]:
        """Same as load for dict loader."""
        return self._data
    
    def set_data(self, data: Dict[str, Any]):
        """Set the data to be returned."""
        self._data = data


class MongoDataLoader(BusinessDataLoader):
    """
    MongoDB implementation for loading business data.
    Requires pymongo to be installed.
    """
    
    def __init__(self, connection_string: str, db_name: str, collection_name: str = "businesses"):
        try:
            from pymongo import MongoClient
            self.client = MongoClient(connection_string)
            self.db = self.client[db_name]
            self.collection = self.db[collection_name]
        except ImportError:
            raise ImportError("pymongo is required for MongoDataLoader. Install with: pip install pymongo")
    
    def load(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Load business data from MongoDB."""
        doc = self.collection.find_one({"business_id": business_id})
        if doc:
            doc.pop("_id", None)  # Remove MongoDB _id field
        return doc
    
    def refresh(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Force refresh from MongoDB (no caching at this level)."""
        return self.load(business_id)


class PostgresDataLoader(BusinessDataLoader):
    """
    PostgreSQL implementation for loading business data.
    Requires psycopg2 or sqlalchemy to be installed.
    """
    
    def __init__(self, connection_string: str, table_name: str = "businesses"):
        try:
            from sqlalchemy import create_engine, text
            self.engine = create_engine(connection_string)
            self.table_name = table_name
        except ImportError:
            raise ImportError("sqlalchemy is required for PostgresDataLoader. Install with: pip install sqlalchemy psycopg2-binary")
    
    def load(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Load business data from PostgreSQL."""
        from sqlalchemy import text
        
        query = text(f"SELECT * FROM {self.table_name} WHERE business_id = :business_id")
        with self.engine.connect() as conn:
            result = conn.execute(query, {"business_id": business_id})
            row = result.fetchone()
            if row:
                return dict(row._mapping)
        return None
    
    def refresh(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Force refresh from PostgreSQL."""
        return self.load(business_id)


class CachedDataLoader(BusinessDataLoader):
    """
    Redis-cached wrapper for any data loader.
    Reduces database load for frequently accessed businesses.
    """
    
    def __init__(self, loader: BusinessDataLoader, redis_client=None, ttl: int = 300):
        """
        Initialize cached loader.
        
        Args:
            loader: Underlying data loader
            redis_client: Redis client instance (if None, uses in-memory cache)
            ttl: Cache time-to-live in seconds (default 5 minutes)
        """
        self.loader = loader
        self.redis = redis_client
        self.ttl = ttl
        self._memory_cache: Dict[str, tuple] = {}  # Fallback in-memory cache
    
    def _cache_key(self, business_id: str) -> str:
        return f"business_data:{business_id}"
    
    def load(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Load from cache first, then from underlying loader."""
        cache_key = self._cache_key(business_id)
        
        # Try Redis cache
        if self.redis:
            try:
                cached = self.redis.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass  # Fall through to loader
        
        # Try memory cache
        if cache_key in self._memory_cache:
            data, timestamp = self._memory_cache[cache_key]
            import time
            if time.time() - timestamp < self.ttl:
                return data
        
        # Load from source
        data = self.loader.load(business_id)
        
        # Cache the result
        if data:
            self._cache(cache_key, data)
        
        return data
    
    def refresh(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Bypass cache and reload from source."""
        cache_key = self._cache_key(business_id)
        
        # Clear cache
        if self.redis:
            try:
                self.redis.delete(cache_key)
            except Exception:
                pass
        self._memory_cache.pop(cache_key, None)
        
        # Load fresh data
        data = self.loader.refresh(business_id)
        
        # Re-cache
        if data:
            self._cache(cache_key, data)
        
        return data
    
    def _cache(self, key: str, data: Dict[str, Any]):
        """Cache data in Redis and memory."""
        import time
        
        # Redis cache
        if self.redis:
            try:
                self.redis.setex(key, self.ttl, json.dumps(data, default=str))
            except Exception:
                pass
        
        # Memory cache fallback
        self._memory_cache[key] = (data, time.time())


class APIDataLoader(BusinessDataLoader):
    """
    HTTP API-based data loader.
    Fetches business data from a REST API endpoint.
    """
    
    def __init__(self, base_url: str, api_key: str = None, headers: Dict[str, str] = None):
        """
        Initialize API loader.
        
        Args:
            base_url: Base URL of the API (e.g., "https://api.example.com/v1")
            api_key: Optional API key for authentication
            headers: Optional additional headers
        """
        self.base_url = base_url.rstrip("/")
        self.headers = headers or {}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
    
    def load(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Load business data from API."""
        import requests
        
        url = f"{self.base_url}/businesses/{business_id}"
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                return response.json()
        except Exception:
            pass
        return None
    
    def refresh(self, business_id: str) -> Optional[Dict[str, Any]]:
        """API loader doesn't cache, so refresh is same as load."""
        return self.load(business_id)


def create_data_loader(
    loader_type: str = "dict",
    **kwargs
) -> BusinessDataLoader:
    """
    Factory function to create appropriate data loader.
    
    Args:
        loader_type: Type of loader ("dict", "mongo", "postgres", "api", "cached")
        **kwargs: Loader-specific configuration
        
    Returns:
        Configured BusinessDataLoader instance
    """
    loaders = {
        "dict": DictDataLoader,
        "mongo": MongoDataLoader,
        "postgres": PostgresDataLoader,
        "api": APIDataLoader,
    }
    
    if loader_type not in loaders:
        raise ValueError(f"Unknown loader type: {loader_type}. Available: {list(loaders.keys())}")
    
    loader = loaders[loader_type](**kwargs)
    
    # Optionally wrap in cache
    if kwargs.get("enable_cache", False):
        redis_client = kwargs.get("redis_client")
        ttl = kwargs.get("cache_ttl", 300)
        loader = CachedDataLoader(loader, redis_client, ttl)
    
    return loader
