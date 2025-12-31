"""
Flask Extensions Configuration.
Initializes Flask-Compress, Flask-Caching, and other extensions.
"""

import os
import logging
from typing import Optional
from flask import Flask

logger = logging.getLogger('reviseit.extensions')

# Extension instances
compress = None
cache = None
limiter = None


def init_compression(app: Flask):
    """
    Initialize Flask-Compress for gzip compression.
    
    Compresses responses over 500 bytes automatically.
    Reduces bandwidth by 60-80%.
    """
    global compress
    
    try:
        from flask_compress import Compress
        
        # Configuration
        app.config.setdefault('COMPRESS_MIMETYPES', [
            'text/html',
            'text/css',
            'text/xml',
            'application/json',
            'application/javascript',
        ])
        app.config.setdefault('COMPRESS_LEVEL', 6)
        app.config.setdefault('COMPRESS_MIN_SIZE', 500)
        app.config.setdefault('COMPRESS_ALGORITHM', 'gzip')
        
        compress = Compress(app)
        logger.info("✅ Flask-Compress initialized (gzip enabled)")
        
    except ImportError:
        logger.warning(
            "⚠️ Flask-Compress not installed. "
            "Run: pip install Flask-Compress"
        )
    except Exception as e:
        logger.error(f"❌ Error initializing compression: {e}")


def init_caching(app: Flask, redis_url: str = None):
    """
    Initialize Flask-Caching with Redis backend.
    
    Falls back to simple in-memory cache if Redis unavailable.
    """
    global cache
    
    try:
        from flask_caching import Cache
        
        redis_url = redis_url or os.getenv("REDIS_URL")
        
        if redis_url:
            # Redis backend for production
            app.config['CACHE_TYPE'] = 'RedisCache'
            app.config['CACHE_REDIS_URL'] = redis_url
            app.config['CACHE_DEFAULT_TIMEOUT'] = 300
            logger.info("✅ Flask-Caching initialized with Redis")
        else:
            # Simple cache for development
            app.config['CACHE_TYPE'] = 'SimpleCache'
            app.config['CACHE_DEFAULT_TIMEOUT'] = 300
            logger.info("⚠️ Flask-Caching using SimpleCache (Redis not available)")
        
        cache = Cache(app)
        
    except ImportError:
        logger.warning(
            "⚠️ Flask-Caching not installed. "
            "Run: pip install Flask-Caching"
        )
    except Exception as e:
        logger.error(f"❌ Error initializing caching: {e}")


def init_rate_limiter(app: Flask, redis_url: str = None):
    """
    Initialize Flask-Limiter for rate limiting.
    """
    global limiter
    
    try:
        from flask_limiter import Limiter
        from flask_limiter.util import get_remote_address
        
        redis_url = redis_url or os.getenv("REDIS_URL")
        
        storage_uri = redis_url if redis_url else "memory://"
        
        limiter = Limiter(
            key_func=get_remote_address,
            app=app,
            storage_uri=storage_uri,
            default_limits=["200 per day", "50 per hour"],
        )
        
        logger.info(f"✅ Flask-Limiter initialized")
        
    except ImportError:
        logger.warning(
            "⚠️ Flask-Limiter not installed. "
            "Using custom rate limiter."
        )
    except Exception as e:
        logger.error(f"❌ Error initializing rate limiter: {e}")


def init_extensions(app: Flask, redis_url: str = None):
    """
    Initialize all Flask extensions.
    
    Args:
        app: Flask application
        redis_url: Redis URL for cache and rate limiting
    """
    init_compression(app)
    init_caching(app, redis_url)
    # init_rate_limiter(app, redis_url)  # Using custom rate limiter instead
    
    # Initialize profiler
    from monitoring import init_profiler
    init_profiler(app)
    
    # Initialize metrics
    from monitoring import init_metrics
    init_metrics(app)
    
    logger.info("✅ All extensions initialized")


def get_cache():
    """Get the Flask-Caching instance."""
    return cache


def cached_endpoint(timeout: int = 300, key_prefix: str = None):
    """
    Decorator for caching endpoint responses.
    
    Usage:
        @app.route('/api/data')
        @cached_endpoint(timeout=600)
        def get_data():
            ...
    """
    def decorator(f):
        if cache:
            return cache.cached(timeout=timeout, key_prefix=key_prefix)(f)
        return f
    return decorator

