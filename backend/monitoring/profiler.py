"""
Flask-Profiler Integration for Performance Monitoring.
Identifies bottlenecks and tracks endpoint performance.
"""

import os
import logging
from typing import Dict, Any

logger = logging.getLogger('reviseit.monitoring')


def get_profiler_config() -> Dict[str, Any]:
    """
    Get Flask-Profiler configuration.
    
    Returns:
        Configuration dictionary for flask_profiler
    """
    return {
        "enabled": os.getenv("ENABLE_PROFILER", "true").lower() == "true",
        "storage": {
            "engine": "sqlite",
            "FILE": "profiler.db",
        },
        "basicAuth": {
            "enabled": os.getenv("PROFILER_AUTH_ENABLED", "true").lower() == "true",
            "username": os.getenv("PROFILER_USERNAME", "admin"),
            "password": os.getenv("PROFILER_PASSWORD", "profiler_secret"),
        },
        "ignore": [
            "/api/health",
            "/static/*",
            "/profiler/*",
        ],
        "endpointRoot": "profiler",
        "sampling_function": sampling_function,
    }


def sampling_function(endpoint: str, method: str) -> bool:
    """
    Determine whether to sample this request.
    
    Samples based on:
    - Endpoint importance
    - Random sampling rate (10% default)
    """
    import random
    
    # Always profile webhooks
    if "webhook" in endpoint.lower():
        return True
    
    # Always profile AI endpoints
    if "/ai/" in endpoint:
        return True
    
    # Random 10% sampling for other endpoints
    return random.random() < 0.1


def init_profiler(app):
    """
    Initialize Flask-Profiler on the Flask app.
    
    Args:
        app: Flask application instance
    
    Returns:
        Configured Flask app
    """
    try:
        import flask_profiler
        
        config = get_profiler_config()
        
        if not config["enabled"]:
            logger.info("Flask-Profiler disabled")
            return app
        
        app.config["flask_profiler"] = config
        flask_profiler.init_app(app)
        
        logger.info(
            f"Flask-Profiler initialized at /{config['endpointRoot']}"
        )
        
    except ImportError:
        logger.warning(
            "flask_profiler not installed. "
            "Run: pip install flask-profiler"
        )
    except Exception as e:
        logger.error(f"Error initializing profiler: {e}")
    
    return app


def profile_endpoint(name: str = None):
    """
    Decorator to manually profile an endpoint.
    
    Usage:
        @profile_endpoint("generate_ai_reply")
        def generate_reply():
            ...
    """
    def decorator(func):
        import functools
        import time
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                elapsed = time.time() - start_time
                
                logger.info(
                    f"Profile: {name or func.__name__} "
                    f"completed in {elapsed*1000:.2f}ms"
                )
                
                return result
            
            except Exception as e:
                elapsed = time.time() - start_time
                logger.error(
                    f"Profile: {name or func.__name__} "
                    f"failed after {elapsed*1000:.2f}ms: {e}"
                )
                raise
        
        return wrapper
    return decorator


# =============================================================================
# cProfile Integration for Deep Analysis
# =============================================================================

def profile_function_detailed(func, *args, **kwargs):
    """
    Profile a function using cProfile for detailed analysis.
    
    Usage:
        stats = profile_function_detailed(my_function, arg1, arg2)
        stats.print_stats(10)  # Top 10 functions by time
    """
    import cProfile
    import pstats
    import io
    
    profiler = cProfile.Profile()
    profiler.enable()
    
    try:
        result = func(*args, **kwargs)
    finally:
        profiler.disable()
    
    # Create stats
    stream = io.StringIO()
    stats = pstats.Stats(profiler, stream=stream)
    stats.sort_stats('cumulative')
    stats.print_stats(20)
    
    logger.debug(f"Profile for {func.__name__}:\n{stream.getvalue()}")
    
    return result, stats

