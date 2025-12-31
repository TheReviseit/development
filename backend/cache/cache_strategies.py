"""
Cache strategies for different types of data.
Implements Strategy pattern for flexible caching behavior.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Any, Optional
from enum import Enum


class CacheType(str, Enum):
    """Types of cached data."""
    SESSION = "session"
    USER_PROFILE = "profile"
    RESPONSE = "response"
    STATIC = "static"
    BUSINESS = "business"


@dataclass
class CacheStrategy(ABC):
    """Abstract base class for cache strategies."""
    cache_type: CacheType
    ttl: int  # Time-to-live in seconds
    
    @abstractmethod
    def generate_key(self, *args, **kwargs) -> str:
        """Generate cache key."""
        pass
    
    @abstractmethod
    def should_cache(self, data: Any) -> bool:
        """Determine if data should be cached."""
        pass
    
    @abstractmethod
    def transform_for_cache(self, data: Any) -> Any:
        """Transform data before caching."""
        pass
    
    @abstractmethod
    def transform_from_cache(self, data: Any) -> Any:
        """Transform data after retrieval from cache."""
        pass


@dataclass
class SessionCacheStrategy(CacheStrategy):
    """
    Strategy for caching session data.
    Short TTL (5 minutes) for active conversations.
    """
    cache_type: CacheType = CacheType.SESSION
    ttl: int = 300  # 5 minutes
    
    def generate_key(self, user_id: str, **kwargs) -> str:
        return f"session:{user_id}"
    
    def should_cache(self, data: Any) -> bool:
        # Always cache session data if it exists
        return data is not None and bool(data)
    
    def transform_for_cache(self, data: Any) -> Any:
        # Remove sensitive fields before caching
        if isinstance(data, dict):
            safe_data = data.copy()
            safe_data.pop("access_token", None)
            safe_data.pop("password", None)
            return safe_data
        return data
    
    def transform_from_cache(self, data: Any) -> Any:
        # Mark as from cache
        if isinstance(data, dict):
            data["_from_cache"] = True
        return data


@dataclass
class UserProfileCacheStrategy(CacheStrategy):
    """
    Strategy for caching user profiles.
    Medium TTL (1 hour) for user preferences and history.
    """
    cache_type: CacheType = CacheType.USER_PROFILE
    ttl: int = 3600  # 1 hour
    
    def generate_key(self, user_id: str, **kwargs) -> str:
        return f"profile:{user_id}"
    
    def should_cache(self, data: Any) -> bool:
        # Cache if we have meaningful profile data
        if not isinstance(data, dict):
            return False
        return bool(data.get("user_id") or data.get("phone_number"))
    
    def transform_for_cache(self, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        # Keep only essential profile fields
        essential_fields = [
            "user_id", "name", "phone_number", "preferences",
            "language", "timezone", "interaction_count", "last_intent"
        ]
        return {k: v for k, v in data.items() if k in essential_fields}
    
    def transform_from_cache(self, data: Any) -> Any:
        return data


@dataclass
class ResponseCacheStrategy(CacheStrategy):
    """
    Strategy for caching AI responses.
    Variable TTL based on intent type.
    """
    cache_type: CacheType = CacheType.RESPONSE
    ttl: int = 300  # Default 5 minutes
    
    # Intent-specific TTLs
    INTENT_TTLS = {
        "greeting": 1800,        # 30 mins - greetings are stable
        "goodbye": 1800,         # 30 mins
        "hours": 3600,           # 1 hour - business hours rarely change
        "location": 3600,        # 1 hour
        "pricing": 600,          # 10 mins - prices may change
        "general_enquiry": 600,  # 10 mins
        "booking": 60,           # 1 min - availability changes
        "order_status": 0,       # No cache - always fresh
        "complaint": 0,          # No cache - needs human review
        "lead_capture": 0,       # No cache - unique per user
    }
    
    def generate_key(
        self,
        business_id: str,
        intent: str,
        query_hash: str,
        **kwargs
    ) -> str:
        return f"response:{business_id}:{intent}:{query_hash}"
    
    def should_cache(self, data: Any) -> bool:
        if not isinstance(data, dict):
            return False
        
        # Don't cache errors
        if data.get("metadata", {}).get("error"):
            return False
        
        # Don't cache low-confidence responses
        if data.get("confidence", 1.0) < 0.7:
            return False
        
        # Don't cache human escalation responses
        if data.get("needs_human"):
            return False
        
        return True
    
    def get_ttl_for_intent(self, intent: str) -> int:
        """Get appropriate TTL for the given intent."""
        return self.INTENT_TTLS.get(intent, self.ttl)
    
    def transform_for_cache(self, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        # Store only essential response fields
        return {
            "reply": data.get("reply"),
            "intent": data.get("intent"),
            "confidence": data.get("confidence"),
            "suggested_actions": data.get("suggested_actions"),
            "metadata": {
                "cached_at": __import__("time").time(),
                "original_response_time_ms": data.get("metadata", {}).get("response_time_ms"),
            }
        }
    
    def transform_from_cache(self, data: Any) -> Any:
        if isinstance(data, dict):
            data["metadata"] = data.get("metadata", {})
            data["metadata"]["from_cache"] = True
            data["needs_human"] = False  # Cached responses don't need human
        return data


@dataclass
class StaticContentCacheStrategy(CacheStrategy):
    """
    Strategy for caching static content.
    Long TTL (24 hours) for templates, FAQs, etc.
    """
    cache_type: CacheType = CacheType.STATIC
    ttl: int = 86400  # 24 hours
    
    def generate_key(self, content_type: str, content_id: str, **kwargs) -> str:
        return f"static:{content_type}:{content_id}"
    
    def should_cache(self, data: Any) -> bool:
        return data is not None
    
    def transform_for_cache(self, data: Any) -> Any:
        return data
    
    def transform_from_cache(self, data: Any) -> Any:
        return data


@dataclass
class BusinessDataCacheStrategy(CacheStrategy):
    """
    Strategy for caching business data.
    Medium TTL (1 hour) for business profiles, products, services.
    """
    cache_type: CacheType = CacheType.BUSINESS
    ttl: int = 3600  # 1 hour
    
    def generate_key(self, business_id: str, **kwargs) -> str:
        return f"business:{business_id}"
    
    def should_cache(self, data: Any) -> bool:
        if not isinstance(data, dict):
            return False
        return bool(data.get("business_id") or data.get("business_name"))
    
    def transform_for_cache(self, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        # Remove sensitive business data
        safe_data = data.copy()
        safe_data.pop("api_key", None)
        safe_data.pop("access_token", None)
        safe_data.pop("secret_key", None)
        return safe_data
    
    def transform_from_cache(self, data: Any) -> Any:
        return data


# =============================================================================
# Strategy Factory
# =============================================================================

def get_cache_strategy(cache_type: CacheType) -> CacheStrategy:
    """Factory function to get appropriate cache strategy."""
    strategies = {
        CacheType.SESSION: SessionCacheStrategy(),
        CacheType.USER_PROFILE: UserProfileCacheStrategy(),
        CacheType.RESPONSE: ResponseCacheStrategy(),
        CacheType.STATIC: StaticContentCacheStrategy(),
        CacheType.BUSINESS: BusinessDataCacheStrategy(),
    }
    return strategies.get(cache_type, ResponseCacheStrategy())

