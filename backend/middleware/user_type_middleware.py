"""
User Type Middleware
Enterprise-grade cross-auth protection with observability

Features:
- Enforce user_type claim validation
- Block cross-auth attempts (console token on normal routes, vice versa)
- Comprehensive logging for security audits
- Declarative route protection
"""

import logging
from functools import wraps
from typing import Callable, Optional

from flask import request, g, jsonify

logger = logging.getLogger('auth.user_type')


# =============================================================================
# USER TYPE CONSTANTS
# =============================================================================

USER_TYPE_NORMAL = 'normal'
USER_TYPE_CONSOLE = 'console'


# =============================================================================
# OBSERVABILITY
# =============================================================================

def _log_cross_auth_attempt(
    user_id: Optional[str],
    user_type: Optional[str],
    expected_type: str,
    route: str,
    ip_address: str
) -> None:
    """Log cross-auth attempt for security auditing."""
    logger.warning(
        "Cross-auth attempt blocked",
        extra={
            "user_id": user_id or "unknown",
            "user_type": user_type or "none",
            "expected_type": expected_type,
            "route": route,
            "ip_address": ip_address,
            "event_type": "CROSS_AUTH_BLOCKED"
        }
    )


def _get_client_ip() -> str:
    """Get client IP address, handling proxies."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    if request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr or '0.0.0.0'


# =============================================================================
# MIDDLEWARE DECORATORS
# =============================================================================

def require_user_type(expected_type: str):
    """
    Decorator to enforce user_type claim matches expected type.
    
    Usage:
        @app.route('/api/user/profile')
        @require_user_type('normal')
        def get_profile():
            ...
        
        @app.route('/console/dashboard')
        @require_user_type('console')
        def console_dashboard():
            ...
    
    Args:
        expected_type: 'normal' or 'console'
    
    Returns:
        403 WRONG_PORTAL if user_type doesn't match
    """
    def decorator(fn: Callable):
        @wraps(fn)
        def decorated_function(*args, **kwargs):
            # Get user_type from request context
            # This is set by the respective auth middleware
            user_type = getattr(g, 'user_type', None)
            user_id = getattr(g, 'user_id', None) or getattr(g, 'console_user', {})
            
            if hasattr(g, 'console_user') and g.console_user:
                user_id = g.console_user.id if hasattr(g.console_user, 'id') else str(g.console_user)
                user_type = 'console'
            
            if user_type != expected_type:
                # Log the cross-auth attempt
                _log_cross_auth_attempt(
                    user_id=str(user_id) if user_id else None,
                    user_type=user_type,
                    expected_type=expected_type,
                    route=request.path,
                    ip_address=_get_client_ip()
                )
                
                return jsonify({
                    'success': False,
                    'error': 'WRONG_PORTAL',
                    'message': f'This endpoint requires {expected_type} user access',
                    'expected': expected_type,
                    'redirect': f'/{"console/login" if expected_type == "console" else "login"}'
                }), 403
            
            return fn(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def require_normal_user():
    """Shorthand for require_user_type('normal')"""
    return require_user_type(USER_TYPE_NORMAL)


def require_console_user():
    """Shorthand for require_user_type('console')"""
    return require_user_type(USER_TYPE_CONSOLE)


def reject_cross_auth():
    """
    Middleware that detects and rejects cross-auth attempts.
    
    Logic:
    - If route starts with /console and has 'session' cookie but no 'otp_console_session'
      → Block (normal user trying console)
    - If route starts with /api but NOT /api/console and has 'otp_console_session' but no 'session'
      → Block (console user trying normal API)
    
    Usage:
        from middleware.user_type_middleware import reject_cross_auth
        
        @app.before_request
        def check_cross_auth():
            result = reject_cross_auth()
            if result:
                return result
    """
    path = request.path
    
    has_session = bool(request.cookies.get('session'))
    has_console_session = bool(request.cookies.get('otp_console_session'))
    
    # Console routes with normal session only
    if path.startswith('/console') and not path.startswith('/console/auth'):
        if has_session and not has_console_session:
            _log_cross_auth_attempt(
                user_id=None,  # Can't decode without proper auth
                user_type='normal',
                expected_type='console',
                route=path,
                ip_address=_get_client_ip()
            )
            return jsonify({
                'success': False,
                'error': 'WRONG_PORTAL',
                'message': 'Use /console/login for developer console access',
                'expected': 'console',
                'redirect': '/console/login'
            }), 403
    
    # Normal API routes with console session only
    # Exclude /api/console routes which are for console users
    if path.startswith('/api') and not path.startswith('/api/console'):
        if has_console_session and not has_session:
            _log_cross_auth_attempt(
                user_id=None,
                user_type='console',
                expected_type='normal',
                route=path,
                ip_address=_get_client_ip()
            )
            return jsonify({
                'success': False,
                'error': 'WRONG_PORTAL',
                'message': 'Use /login for application access',
                'expected': 'normal',
                'redirect': '/login'
            }), 403
    
    return None


def inject_user_type_from_console_auth():
    """
    After console auth succeeds, inject user_type into g for downstream checks.
    
    Usage:
        # In console_auth_middleware.py, after successful auth:
        from middleware.user_type_middleware import inject_user_type_from_console_auth
        inject_user_type_from_console_auth()
    """
    if hasattr(g, 'console_user') and g.console_user:
        g.user_type = USER_TYPE_CONSOLE
        g.user_id = g.console_user.id if hasattr(g.console_user, 'id') else None


def inject_user_type_from_firebase_auth():
    """
    After Firebase auth succeeds, inject user_type into g for downstream checks.
    
    Usage:
        # In your Firebase auth verification, after successful auth:
        from middleware.user_type_middleware import inject_user_type_from_firebase_auth
        inject_user_type_from_firebase_auth()
    """
    # If we got here via Firebase session cookie auth
    if hasattr(g, 'firebase_user') and g.firebase_user:
        g.user_type = USER_TYPE_NORMAL
        g.user_id = g.firebase_user.get('uid') if isinstance(g.firebase_user, dict) else None
