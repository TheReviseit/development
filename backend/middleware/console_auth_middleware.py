"""
Console Auth Middleware
JWT cookie authentication for Developer Console

Features:
- Cookie-based JWT authentication
- User context injection
- Organization context
- Protected route decorator
"""

import logging
from functools import wraps
from typing import Callable, Optional

from flask import request, g, jsonify

from services.console_auth_service import verify_token, AuthUser

logger = logging.getLogger('console.auth.middleware')

COOKIE_NAME = 'otp_console_session'


def get_client_ip() -> str:
    """Get client IP address, handling proxies."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    if request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr or '0.0.0.0'


def get_access_token() -> Optional[str]:
    """
    Extract access token from cookie or Authorization header.
    Cookie takes precedence.
    """
    # Try cookie first
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    
    # Fallback to Authorization header
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    
    return None


def require_console_auth(roles: list = None):
    """
    Decorator for routes requiring console authentication.
    
    Usage:
        @app.route('/console/dashboard')
        @require_console_auth()
        def dashboard():
            user = g.console_user
            ...
        
        @app.route('/console/admin')
        @require_console_auth(roles=['owner', 'admin'])
        def admin():
            ...
    
    Args:
        roles: Required roles (e.g., ['owner', 'admin'])
        
    Injects into flask.g:
        g.console_user: AuthUser instance
        g.console_org_id: Current organization ID
    """
    roles = roles or []
    
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get access token
            access_token = get_access_token()
            
            if not access_token:
                return jsonify({
                    'success': False,
                    'error': 'UNAUTHORIZED',
                    'message': 'Authentication required'
                }), 401
            
            # Verify token
            payload = verify_token(access_token, expected_type='access')
            
            if not payload:
                return jsonify({
                    'success': False,
                    'error': 'INVALID_TOKEN',
                    'message': 'Invalid or expired token'
                }), 401
            
            user_id = payload.get('sub')
            org_id = payload.get('org')
            
            if not user_id:
                return jsonify({
                    'success': False,
                    'error': 'INVALID_TOKEN',
                    'message': 'Invalid token payload'
                }), 401
            
            # Fetch user from database
            try:
                from services.console_auth_service import get_console_auth_service
                import asyncio
                
                service = get_console_auth_service()
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    user = loop.run_until_complete(service.get_current_user(user_id))
                finally:
                    loop.close()
                
                if not user:
                    return jsonify({
                        'success': False,
                        'error': 'USER_NOT_FOUND',
                        'message': 'User account not found'
                    }), 401
                
            except Exception as e:
                logger.error(f"Auth middleware error: {e}")
                return jsonify({
                    'success': False,
                    'error': 'AUTH_ERROR',
                    'message': 'Authentication service unavailable'
                }), 500
            
            # Check role requirements
            if roles and user.current_org_role not in roles:
                return jsonify({
                    'success': False,
                    'error': 'FORBIDDEN',
                    'message': 'Insufficient permissions'
                }), 403
            
            # Inject user context
            g.console_user = user
            g.console_org_id = user.current_org_id or org_id
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def require_org_access(allow_roles: list = None):
    """
    Decorator to ensure user has access to the current org.
    Must be used after require_console_auth.
    
    Usage:
        @app.route('/console/orgs/<org_id>/projects')
        @require_console_auth()
        @require_org_access(allow_roles=['owner', 'admin', 'developer'])
        def list_projects(org_id):
            ...
    """
    allow_roles = allow_roles or ['owner', 'admin', 'developer', 'viewer']
    
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get org_id from URL or request
            org_id = kwargs.get('org_id') or request.args.get('org_id')
            
            if not org_id:
                return jsonify({
                    'success': False,
                    'error': 'MISSING_ORG_ID',
                    'message': 'Organization ID required'
                }), 400
            
            user = g.console_user
            
            # Check if user has access to this org
            if user.current_org_id != org_id:
                # TODO: Check org_members table for access
                return jsonify({
                    'success': False,
                    'error': 'FORBIDDEN',
                    'message': 'No access to this organization'
                }), 403
            
            # Check role
            if user.current_org_role not in allow_roles:
                return jsonify({
                    'success': False,
                    'error': 'FORBIDDEN',
                    'message': 'Insufficient permissions for this action'
                }), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def optional_console_auth():
    """
    Decorator that attempts auth but doesn't require it.
    Useful for pages that show different content based on auth state.
    
    Injects:
        g.console_user: AuthUser or None
        g.console_is_authenticated: Boolean
    """
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            g.console_user = None
            g.console_is_authenticated = False
            
            access_token = get_access_token()
            
            if access_token:
                payload = verify_token(access_token, expected_type='access')
                
                if payload:
                    user_id = payload.get('sub')
                    
                    try:
                        from services.console_auth_service import get_console_auth_service
                        import asyncio
                        
                        service = get_console_auth_service()
                        
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            user = loop.run_until_complete(service.get_current_user(user_id))
                        finally:
                            loop.close()
                        
                        if user:
                            g.console_user = user
                            g.console_is_authenticated = True
                            g.console_org_id = user.current_org_id
                            
                    except Exception as e:
                        logger.debug(f"Optional auth error: {e}")
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator
