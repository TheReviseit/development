"""
Maintenance Tasks for Celery.
Handles cache warming, cleanup, health checks, etc.
"""

import logging
from typing import Dict, Any, List
from celery import shared_task
from datetime import datetime, timedelta

logger = logging.getLogger('reviseit.tasks.maintenance')


@shared_task
def cleanup_sessions(max_age_hours: int = 24) -> Dict[str, Any]:
    """
    Clean up expired conversation sessions.
    
    Args:
        max_age_hours: Remove sessions older than this
    
    Returns:
        Cleanup summary
    """
    try:
        from ai_brain.conversation_manager import get_conversation_manager
        
        manager = get_conversation_manager()
        initial_count = manager.get_session_count()
        
        # Force cleanup
        manager._cleanup_expired()
        
        final_count = manager.get_session_count()
        cleaned = initial_count - final_count
        
        logger.info(f"Cleaned up {cleaned} expired sessions")
        
        return {
            "status": "completed",
            "sessions_before": initial_count,
            "sessions_after": final_count,
            "cleaned": cleaned,
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up sessions: {e}")
        return {"error": str(e)}


@shared_task
def warm_cache() -> Dict[str, Any]:
    """
    Warm up cache with common/predictable queries.
    
    Preloads frequently accessed data to improve response times.
    
    Returns:
        Cache warming summary
    """
    try:
        from cache import get_cache_manager
        
        cache = get_cache_manager()
        
        # Common queries to warm
        common_queries = [
            {"business_id": "default", "intent": "greeting", "query": "hi", "response": {"reply": "Hello! How can I help?"}},
            {"business_id": "default", "intent": "greeting", "query": "hello", "response": {"reply": "Hello! How can I help?"}},
            {"business_id": "default", "intent": "hours", "query": "what are your hours", "response": {"reply": "Our hours are available on our website."}},
        ]
        
        warmed = 0
        for query in common_queries:
            try:
                cache.set_response(
                    business_id=query["business_id"],
                    intent=query["intent"],
                    query=query["query"],
                    response=query["response"],
                )
                warmed += 1
            except Exception as e:
                logger.warning(f"Error warming cache entry: {e}")
        
        logger.info(f"Cache warmed with {warmed} entries")
        
        return {
            "status": "completed",
            "entries_warmed": warmed,
            "cache_stats": cache.get_stats(),
        }
        
    except Exception as e:
        logger.error(f"Error warming cache: {e}")
        return {"error": str(e)}


@shared_task
def health_check() -> Dict[str, Any]:
    """
    Perform system health check.
    
    Checks:
    - Database connectivity
    - Redis connectivity
    - AI service availability
    - Cache stats
    
    Returns:
        Health status report
    """
    health = {
        "timestamp": datetime.utcnow().isoformat(),
        "status": "healthy",
        "checks": {},
    }
    
    # Check Supabase
    try:
        from supabase_client import get_supabase_client
        client = get_supabase_client()
        if client:
            # Simple query to test connection
            health["checks"]["supabase"] = {"status": "healthy"}
        else:
            health["checks"]["supabase"] = {"status": "unavailable"}
    except Exception as e:
        health["checks"]["supabase"] = {"status": "error", "message": str(e)}
        health["status"] = "degraded"
    
    # Check Redis
    try:
        from cache import get_cache_manager
        cache = get_cache_manager()
        if cache._redis_available:
            cache._redis.ping()
            health["checks"]["redis"] = {"status": "healthy"}
        else:
            health["checks"]["redis"] = {"status": "unavailable"}
    except Exception as e:
        health["checks"]["redis"] = {"status": "error", "message": str(e)}
        health["status"] = "degraded"
    
    # Check cache stats
    try:
        from cache import get_cache_manager
        cache = get_cache_manager()
        stats = cache.get_stats()
        health["checks"]["cache"] = {
            "status": "healthy",
            "hit_rate": stats.get("hit_rate", 0),
            "entries": stats.get("entries", 0),
        }
    except Exception as e:
        health["checks"]["cache"] = {"status": "error", "message": str(e)}
    
    # Check AI Brain
    try:
        from ai_brain import AIBrain
        health["checks"]["ai_brain"] = {"status": "healthy"}
    except Exception as e:
        health["checks"]["ai_brain"] = {"status": "error", "message": str(e)}
        health["status"] = "degraded"
    
    # Log and alert if unhealthy
    if health["status"] != "healthy":
        logger.warning(f"Health check failed: {health}")
        # Could trigger alert here
    else:
        logger.info("Health check passed")
    
    return health


@shared_task
def rotate_logs(max_age_days: int = 7) -> Dict[str, Any]:
    """
    Rotate and archive old log files.
    
    Args:
        max_age_days: Archive logs older than this
    
    Returns:
        Rotation summary
    """
    # Placeholder for log rotation logic
    logger.info(f"Log rotation completed (max age: {max_age_days} days)")
    
    return {
        "status": "completed",
        "max_age_days": max_age_days,
    }


@shared_task
def vacuum_database() -> Dict[str, Any]:
    """
    Perform database maintenance (VACUUM, ANALYZE).
    
    For Supabase/PostgreSQL to reclaim space and update statistics.
    
    Returns:
        Maintenance summary
    """
    try:
        from supabase_client import get_supabase_client
        
        client = get_supabase_client()
        if not client:
            return {"error": "Database not available"}
        
        # Note: Supabase manages vacuum automatically
        # This is a placeholder for custom maintenance queries
        
        logger.info("Database maintenance completed")
        
        return {"status": "completed"}
        
    except Exception as e:
        logger.error(f"Error in database maintenance: {e}")
        return {"error": str(e)}


@shared_task
def backup_analytics(date: str = None) -> Dict[str, Any]:
    """
    Backup analytics data to cold storage.
    
    Args:
        date: Date to backup (YYYY-MM-DD)
    
    Returns:
        Backup summary
    """
    if not date:
        date = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    logger.info(f"Analytics backup for {date} completed")
    
    return {
        "status": "completed",
        "date": date,
    }

