"""
Advanced Caching Module for WhatsApp Chatbot API.
Multi-layer caching with L1 (in-memory) and L2 (Redis) layers.
"""

from .redis_cache import (
    CacheManager,
    get_cache_manager,
    cache_response,
    cache_user_profile,
    cache_session,
    invalidate_cache,
    warmup_cache,
)
from .cache_strategies import (
    CacheStrategy,
    SessionCacheStrategy,
    UserProfileCacheStrategy,
    ResponseCacheStrategy,
    StaticContentCacheStrategy,
)

__all__ = [
    'CacheManager',
    'get_cache_manager',
    'cache_response',
    'cache_user_profile',
    'cache_session',
    'invalidate_cache',
    'warmup_cache',
    'CacheStrategy',
    'SessionCacheStrategy',
    'UserProfileCacheStrategy',
    'ResponseCacheStrategy',
    'StaticContentCacheStrategy',
]

