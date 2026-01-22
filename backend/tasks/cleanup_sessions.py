"""
Expired Session Cleanup Task
============================
Celery task to mark stale PENDING/PROCESSING subscriptions as EXPIRED.
Runs every 5 minutes.
"""

import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger('reviseit.tasks.cleanup')

# Maximum age for pending/processing sessions (15 minutes)
MAX_SESSION_AGE_MINUTES = 15


def cleanup_expired_sessions():
    """
    Mark subscriptions stuck in PENDING/PROCESSING for > 15 minutes as EXPIRED.
    
    This allows users to retry cleanly without duplicate subscription issues.
    """
    try:
        from supabase_client import get_supabase_client
        
        supabase = get_supabase_client()
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=MAX_SESSION_AGE_MINUTES)
        
        # Find and update expired sessions
        result = supabase.table('subscriptions').update({
            'status': 'expired'
        }).in_(
            'status', ['pending', 'processing']
        ).lt(
            'created_at', cutoff_time.isoformat()
        ).execute()
        
        if result.data:
            expired_count = len(result.data)
            logger.info(f"Marked {expired_count} subscriptions as expired")
            
            # Clear idempotency keys to allow retry
            for sub in result.data:
                if sub.get('idempotency_key'):
                    # Append timestamp to key so it's no longer blocking
                    new_key = f"{sub['idempotency_key']}_expired_{int(datetime.now().timestamp())}"
                    supabase.table('subscriptions').update({
                        'idempotency_key': new_key
                    }).eq('id', sub['id']).execute()
        else:
            logger.debug("No expired sessions found")
            
        return {'expired_count': len(result.data) if result.data else 0}
        
    except Exception as e:
        logger.exception(f"Error in cleanup_expired_sessions: {e}")
        return {'error': str(e)}


# Register with Celery if available
try:
    from celery_app import celery_app
    
    @celery_app.task(name='cleanup_expired_payment_sessions')
    def cleanup_expired_sessions_task():
        """Celery task wrapper for cleanup."""
        return cleanup_expired_sessions()
    
    # Schedule to run every 5 minutes
    celery_app.conf.beat_schedule['cleanup-expired-sessions'] = {
        'task': 'cleanup_expired_payment_sessions',
        'schedule': 300.0,  # 5 minutes
    }
    
    logger.info("✅ Registered cleanup_expired_payment_sessions task")
    
except ImportError:
    logger.warning("⚠️ Celery not available, cleanup task not registered")
