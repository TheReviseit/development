"""
Health Check API
================
Production-grade health monitoring endpoints.

Provides:
- Liveness probe (is the application running)
- Readiness probe (is the application ready to serve traffic)
- Deep health check (database, external services)

@version 1.0.0
@securityLevel FAANG-Production
"""

import os
import time
import platform
from datetime import datetime, timezone
from flask import Blueprint, jsonify, current_app

# =============================================================================
# BLUEPRINT
# =============================================================================

health_bp = Blueprint('health', __name__, url_prefix='/api/health')

# =============================================================================
# STARTUP TIME (module-level constant)
# =============================================================================

STARTUP_TIME = time.time()

# =============================================================================
# LIVENESS CHECK
# =============================================================================

@health_bp.route('', methods=['GET'])
def health_check():
    """
    Simple liveness check.
    
    Returns 200 if the application is running.
    Used by load balancers to determine if instance should receive traffic.
    """
    uptime_seconds = int(time.time() - STARTUP_TIME)
    
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'uptime_seconds': uptime_seconds,
    }), 200


@health_bp.route('/live', methods=['GET'])
def liveness_check():
    """
    Kubernetes-style liveness probe.
    
    Returns 200 if the application is alive.
    If this fails, Kubernetes will restart the container.
    """
    return jsonify({
        'status': 'alive',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }), 200


# =============================================================================
# READINESS CHECK
# =============================================================================

@health_bp.route('/ready', methods=['GET'])
def readiness_check():
    """
    Kubernetes-style readiness probe.
    
    Returns 200 if the application is ready to serve traffic.
    Checks critical dependencies like database connections.
    """
    checks = {
        'database': _check_database(),
        'firebase': _check_firebase(),
        'razorpay': _check_razorpay_config(),
    }
    
    all_healthy = all(check['healthy'] for check in checks.values())
    
    status_code = 200 if all_healthy else 503
    
    return jsonify({
        'status': 'ready' if all_healthy else 'not_ready',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'checks': checks,
    }), status_code


# =============================================================================
# DEEP HEALTH CHECK
# =============================================================================

@health_bp.route('/deep', methods=['GET'])
def deep_health_check():
    """
    Comprehensive health check with detailed diagnostics.
    
    Includes all service dependencies and system metrics.
    Use sparingly as it's resource-intensive.
    """
    # System metrics
    try:
        import psutil
        PSUTIL_AVAILABLE = True
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        cpu_percent = psutil.cpu_percent(interval=0.1)
    except ImportError:
        PSUTIL_AVAILABLE = False
        memory = None
        disk = None
        cpu_percent = None
    
    checks = {
        'database': _check_database(),
        'firebase': _check_firebase(),
        'razorpay': _check_razorpay(),
        'redis': _check_redis(),
        'system': {
            'healthy': True,
            'details': {
                'memory_used_percent': memory.percent if memory else None,
                'disk_used_percent': disk.percent if disk else None,
                'cpu_percent': cpu_percent if cpu_percent is not None else None,
                'platform': platform.platform(),
                'python_version': platform.python_version(),
                'psutil_available': PSUTIL_AVAILABLE,
            },
        },
    }
    
    all_healthy = all(
        check.get('healthy', True) 
        for check in checks.values() 
        if isinstance(check, dict)
    )
    
    uptime_seconds = int(time.time() - STARTUP_TIME)
    
    return jsonify({
        'status': 'healthy' if all_healthy else 'degraded',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'uptime_seconds': uptime_seconds,
        'version': os.getenv('APP_VERSION', 'unknown'),
        'environment': os.getenv('FLASK_ENV', 'production'),
        'checks': checks,
    }), 200 if all_healthy else 503


# =============================================================================
# HELPER CHECK FUNCTIONS
# =============================================================================

def _check_database():
    """Check database connectivity."""
    try:
        # Import here to avoid circular dependencies
        from models import db
        
        # Simple query to verify connection
        db.session.execute('SELECT 1')
        
        return {
            'healthy': True,
            'details': {
                'type': 'postgresql',
                'connected': True,
            },
        }
    except Exception as e:
        return {
            'healthy': False,
            'error': str(e),
            'details': {
                'type': 'postgresql',
                'connected': False,
            },
        }


def _check_firebase():
    """Check Firebase Admin SDK connectivity."""
    try:
        from firebase_admin import get_app
        
        app = get_app()
        
        return {
            'healthy': True,
            'details': {
                'project_id': app.project_id,
                'name': app.name,
            },
        }
    except Exception as e:
        return {
            'healthy': False,
            'error': str(e),
            'details': {
                'initialized': False,
            },
        }


def _check_razorpay_config():
    """Check Razorpay configuration (not actual connectivity)."""
    key_id = os.getenv('RAZORPAY_KEY_ID')
    key_secret = os.getenv('RAZORPAY_KEY_SECRET')
    
    if key_id and key_secret:
        return {
            'healthy': True,
            'details': {
                'configured': True,
                'key_id_prefix': key_id[:8] + '...' if len(key_id) > 8 else '...',
            },
        }
    
    return {
        'healthy': False,
        'error': 'Missing Razorpay credentials',
        'details': {
            'configured': False,
            'has_key_id': bool(key_id),
            'has_key_secret': bool(key_secret),
        },
    }


def _check_razorpay():
    """Check Razorpay API connectivity."""
    config = _check_razorpay_config()
    
    if not config['healthy']:
        return config
    
    try:
        import razorpay
        
        client = razorpay.Client(
            auth=(os.getenv('RAZORPAY_KEY_ID'), os.getenv('RAZORPAY_KEY_SECRET'))
        )
        
        # Lightweight API call to verify connectivity
        # Using items endpoint as it's lightweight
        client.item.fetch_all(options={'count': 1})
        
        return {
            'healthy': True,
            'details': {
                'configured': True,
                'api_reachable': True,
            },
        }
    except Exception as e:
        return {
            'healthy': False,
            'error': str(e),
            'details': {
                'configured': True,
                'api_reachable': False,
            },
        }


def _check_redis():
    """Check Redis connectivity."""
    try:
        from redis import Redis
        
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        client = Redis.from_url(redis_url, socket_connect_timeout=2)
        
        client.ping()
        
        info = client.info()
        
        return {
            'healthy': True,
            'details': {
                'connected': True,
                'version': info.get('redis_version', 'unknown'),
            },
        }
    except Exception as e:
        return {
            'healthy': False,
            'error': str(e),
            'details': {
                'connected': False,
            },
        }
