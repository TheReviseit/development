"""
Enterprise URL Slug Resolution
Handles showcase URL routing with business slugs

Resolution order (MANDATORY):
1. businesses.url_slug_lower
2. users.username_lower
3. users.firebase_uid (legacy)
4. 404 Not Found

All matching is case-insensitive.
Canonical URLs are always lowercase.
"""

import logging
import redis
import os
from typing import Optional, Tuple
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

# Redis connection for caching
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
redis_client = None

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
    logger.info(f"✅ Redis connected for slug cache: {REDIS_URL}")
except Exception as e:
    logger.warning(f"⚠️ Redis unavailable for slug cache: {e}")
    redis_client = None

CACHE_TTL = 600  # 10 minutes


def normalize_slug(slug: str) -> str:
    """
    Normalize a slug to lowercase URL-safe format
    
    Args:
        slug: Input slug (may be mixed case)
    
    Returns:
        Normalized lowercase slug
    """
    if not slug:
        return ""
    
    return slug.lower().strip()


def resolve_slug_to_user_id(slug_or_username: str) -> Optional[Tuple[str, str, bool]]:
    """
    Resolve URL slug/username to user_id with redirect detection
    
    Enterprise resolution order:
    1. businesses.url_slug_lower  (canonical)
    2. users.username_lower       (legacy)
    3. users.firebase_uid          (legacy fallback)
    4. None (404)
    
    Args:
        slug_or_username: URL parameter (case-insensitive)
    
    Returns:
        Tuple of (user_id, canonical_slug, needs_redirect)
        - user_id: Firebase UID
        - canonical_slug: The correct lowercase slug for 301 redirect
        - needs_redirect: True if input doesn't match canonical
        
        Returns None if not found
    
    Examples:
        >>> resolve_slug_to_user_id("Flowauxi")
        ("abc123", "flowauxi", True)  # Needs redirect (mixed case)
        
        >>> resolve_slug_to_user_id("flowauxi")
        ("abc123", "flowauxi", False)  # Already canonical
        
        >>> resolve_slug_to_user_id("old-username")
        ("abc123", "flowauxi", True)  # Legacy username, redirect to slug
    """
    if not slug_or_username:
        return None
    
    # Normalize input for lookup
    normalized = normalize_slug(slug_or_username)
    cache_key = f"slug:{normalized}"
    
    # Try cache first
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                user_id, canonical_slug = cached.split(":", 1)
                needs_redirect = (slug_or_username != canonical_slug)
                logger.debug(f"✅ Slug cache HIT: {normalized} → {canonical_slug}")
                return (user_id, canonical_slug, needs_redirect)
        except Exception as e:
            logger.warning(f"Redis get failed: {e}")
    
    # Cache miss - resolve from database
    db = get_supabase_client()
    
    # STEP 1: Try business.url_slug_lower (PRIMARY)
    try:
        result = db.table('businesses').select('user_id, url_slug').eq(
            'url_slug_lower', normalized
        ).limit(1).execute()
        
        if result.data and len(result.data) > 0:
            user_id = result.data[0]['user_id']
            canonical_slug = result.data[0]['url_slug']
            needs_redirect = (slug_or_username != canonical_slug)
            
            # Cache the result
            if redis_client:
                try:
                    redis_client.setex(cache_key, CACHE_TTL, f"{user_id}:{canonical_slug}")
                except:
                    pass
            
            logger.info(f"🎯 Resolved via business slug: {normalized} → {canonical_slug}")
            return (user_id, canonical_slug, needs_redirect)
    
    except Exception as e:
        logger.error(f"Error querying businesses table: {e}")
    
    # STEP 2: Try users.username_lower (LEGACY)
    try:
        result = db.table('users').select('firebase_uid, username').eq(
            'username_lower', normalized
        ).eq('username_status', 'active').limit(1).execute()
        
        if result.data and len(result.data) > 0:
            user_id = result.data[0]['firebase_uid']
            username = result.data[0]['username']
            
            # Check if this user has a business slug
            biz_result = db.table('businesses').select('url_slug').eq(
                'user_id', user_id
            ).limit(1).execute()
            
            if biz_result.data and len(biz_result.data) > 0 and biz_result.data[0].get('url_slug'):
                # User has a slug - redirect to it (canonical)
                canonical_slug = biz_result.data[0]['url_slug']
                needs_redirect = True
                
                logger.info(f"🔀 Resolved via username, redirecting to slug: {normalized} → {canonical_slug}")
            else:
                # No slug yet, username IS canonical for now
                canonical_slug = username.lower()
                needs_redirect = (slug_or_username != canonical_slug)
                
                logger.info(f"📛 Resolved via username (no slug): {normalized} → {canonical_slug}")
            
            # Cache the result
            if redis_client:
                try:
                    redis_client.setex(cache_key, CACHE_TTL, f"{user_id}:{canonical_slug}")
                except:
                    pass
            
            return (user_id, canonical_slug, needs_redirect)
    
    except Exception as e:
        logger.error(f"Error querying users table: {e}")
    
    # STEP 3: Try direct Firebase UID (LEGACY FALLBACK - optional)
    # This is for very old links that used UID directly
    # You can remove this if you don't want to support it
    try:
        result = db.table('businesses').select('user_id, url_slug').eq(
            'user_id', slug_or_username
        ).limit(1).execute()
        
        if result.data and len(result.data) > 0:
            user_id = result.data[0]['user_id']
            canonical_slug = result.data[0]['url_slug']
            
            if canonical_slug:
                needs_redirect = True  # Always redirect UID → slug
                logger.info(f"🆔 Resolved via UID, redirecting: UID → {canonical_slug}")
                return (user_id, canonical_slug, needs_redirect)
    
    except Exception as e:
        logger.error(f"Error in UID fallback: {e}")
    
    # STEP 4: Not found
    logger.warning(f"❌ Slug not found: {normalized}")
    return None


def invalidate_slug_cache(user_id: str, old_slug: Optional[str] = None):
    """
    Invalidate cache when business updates slug
    
    Args:
        user_id: Firebase UID
        old_slug: Previous slug (if changed)
    """
    if not redis_client:
        return
    
    try:
        # Clear old slug cache
        if old_slug:
            old_normalized = normalize_slug(old_slug)
            redis_client.delete(f"slug:{old_normalized}")
        
        # Also clear username cache (since resolution changed)
        redis_client.delete(f"userid:{user_id}")
        
        logger.info(f"♻️ Invalidated slug cache for user {user_id}")
    
    except Exception as e:
        logger.error(f"Failed to invalidate slug cache: {e}")
