"""
Username Caching Layer
Enterprise-grade Redis caching for username → user_id resolution

Critical for scale:
- Every public store/showcase visit requires username lookup
- Without caching, this becomes a DB hot path
- Target: >95% cache hit rate, <10ms resolution time
"""

import os
import logging
from typing import Optional
from functools import wraps
import redis
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

# Redis connection
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
redis_client = None

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
    logger.info(f"✅ Redis connected: {REDIS_URL}")
except Exception as e:
    logger.warning(f"⚠️ Redis unavailable, falling back to DB-only mode: {e}")
    redis_client = None

# Cache TTL in seconds (10 minutes)
CACHE_TTL = 600

def cache_enabled(func):
    """Decorator to gracefully handle Redis failures"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            logger.error(f"Cache operation failed: {e}")
            return None
    return wrapper


@cache_enabled
def resolve_username_to_user_id(username: str) -> Optional[str]:
    """
    Resolve username to user_id with Redis caching
    
    Flow:
    1. Check Redis cache first
    2. If miss, query database
    3. Cache result for future requests
    
    Args:
        username: Public username (case-insensitive)
    
    Returns:
        user_id (Firebase UID) or None if not found
    """
    if not username:
        return None
    
    username_lower = username.lower().strip()
    cache_key = f"username:{username_lower}"
    
    # Try cache first
    if redis_client:
        try:
            cached_user_id = redis_client.get(cache_key)
            if cached_user_id:
                logger.debug(f"✅ Cache HIT: {username_lower} → {cached_user_id}")
                return cached_user_id
            logger.debug(f"❌ Cache MISS: {username_lower}")
        except Exception as e:
            logger.warning(f"Redis get failed: {e}")
    
    # Cache miss or Redis unavailable - query database
    try:
        db = get_supabase_client()
        result = db.table('users').select('firebase_uid').eq(
            'username_lower', username_lower
        ).eq('username_status', 'active').limit(1).execute()
        
        if result.data and len(result.data) > 0:
            user_id = result.data[0]['firebase_uid']
            
            # Cache the result (bi-directional)
            if redis_client:
                try:
                    redis_client.setex(cache_key, CACHE_TTL, user_id)
                    redis_client.setex(f"userid:{user_id}", CACHE_TTL, username_lower)
                    logger.debug(f"💾 Cached: {username_lower} ↔ {user_id}")
                except Exception as e:
                    logger.warning(f"Failed to cache result: {e}")
            
            return user_id
        
        return None
    
    except Exception as e:
        logger.error(f"Database lookup failed for username '{username}': {e}")
        return None


@cache_enabled
def resolve_user_id_to_username(user_id: str) -> Optional[str]:
    """
    Reverse lookup: user_id → username (for 301 redirects)
    
    Args:
        user_id: Firebase UID
    
    Returns:
        username or None if not found
    """
    if not user_id:
        return None
    
    cache_key = f"userid:{user_id}"
    
    # Try cache first
    if redis_client:
        try:
            cached_username = redis_client.get(cache_key)
            if cached_username:
                logger.debug(f"✅ Reverse cache HIT: {user_id} → {cached_username}")
                return cached_username
            logger.debug(f"❌ Reverse cache MISS: {user_id}")
        except Exception as e:
            logger.warning(f"Redis get failed: {e}")
    
    # Cache miss - query database
    try:
        db = get_supabase_client()
        result = db.table('users').select('username, username_lower').eq(
            'firebase_uid', user_id
        ).eq('username_status', 'active').limit(1).execute()
        
        if result.data and len(result.data) > 0:
            username = result.data[0]['username']
            username_lower = result.data[0]['username_lower']
            
            # Cache bi-directionally
            if redis_client:
                try:
                    redis_client.setex(cache_key, CACHE_TTL, username_lower)
                    redis_client.setex(f"username:{username_lower}", CACHE_TTL, user_id)
                    logger.debug(f"💾 Reverse cached: {user_id} ↔ {username_lower}")
                except Exception as e:
                    logger.warning(f"Failed to cache result: {e}")
            
            return username
        
        return None
    
    except Exception as e:
        logger.error(f"Database lookup failed for user_id '{user_id}': {e}")
        return None


@cache_enabled
def invalidate_username_cache(user_id: str, old_username: Optional[str] = None):
    """
    Invalidate cache when username changes
    
    CRITICAL: Must be called when user changes username
    
    Args:
        user_id: Firebase UID
        old_username: Previous username (if known)
    """
    if not redis_client:
        return
    
    try:
        # Clear user_id → username mapping
        redis_client.delete(f"userid:{user_id}")
        
        # Clear old username → user_id mapping
        if old_username:
            old_username_lower = old_username.lower().strip()
            redis_client.delete(f"username:{old_username_lower}")
        
        logger.info(f"♻️ Invalidated cache for user {user_id}")
    
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {e}")


def get_cache_stats() -> dict:
    """
    Get cache statistics for monitoring
    
    Returns:
        Dict with cache metrics
    """
    if not redis_client:
        return {
            'enabled': False,
            'status': 'unavailable'
        }
    
    try:
        info = redis_client.info('stats')
        
        # Calculate hit rate if available
        hits = info.get('keyspace_hits', 0)
        misses = info.get('keyspace_misses', 0)
        total = hits + misses
        hit_rate = (hits / total * 100) if total > 0 else 0
        
        return {
            'enabled': True,
            'status': 'connected',
            'hits': hits,
            'misses': misses,
            'hit_rate': round(hit_rate, 2),
            'keys': redis_client.dbsize()
        }
    
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}")
        return {
            'enabled': True,
            'status': 'error',
            'error': str(e)
        }


# Health check for monitoring systems
def health_check() -> bool:
    """
    Check if Redis is healthy
    
    Returns:
        True if Redis is responding, False otherwise
    """
    if not redis_client:
        return False
    
    try:
        redis_client.ping()
        return True
    except:
        return False
