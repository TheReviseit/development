"""
Console Auth Routes
Authentication endpoints for OTP Developer Console

Endpoints:
- POST /console/auth/signup - Create account
- POST /console/auth/login - Login
- POST /console/auth/logout - Logout
- POST /console/auth/refresh - Refresh access token
- GET /console/auth/me - Get current user
"""

import logging
from flask import Blueprint, request, jsonify, make_response, g

from services.console_auth_service import get_console_auth_service
from middleware.console_auth_middleware import require_console_auth, get_client_ip

logger = logging.getLogger('console.auth.routes')

# Create blueprint
console_auth_bp = Blueprint('console_auth', __name__, url_prefix='/console/auth')

# Cookie settings
COOKIE_NAME = 'otp_console_session'
COOKIE_REFRESH_NAME = 'otp_console_refresh'
COOKIE_MAX_AGE = 60 * 15  # 15 minutes for access token
COOKIE_REFRESH_MAX_AGE = 60 * 60 * 24 * 7  # 7 days for refresh token

# Set secure=False for local development (HTTP), True for production (HTTPS)
import os
IS_PRODUCTION = os.getenv('FLASK_ENV') == 'production' or os.getenv('ENVIRONMENT') == 'production'


def _set_auth_cookies(response, access_token: str, refresh_token: str = None):
    """Set authentication cookies (httpOnly, secure in production)."""
    response.set_cookie(
        COOKIE_NAME,
        access_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=IS_PRODUCTION,  # False for localhost, True for production
        samesite='Lax',
        path='/'
    )
    
    if refresh_token:
        response.set_cookie(
            COOKIE_REFRESH_NAME,
            refresh_token,
            max_age=COOKIE_REFRESH_MAX_AGE,
            httponly=True,
            secure=IS_PRODUCTION,
            samesite='Lax',
            path='/'
        )
    
    return response


def _clear_auth_cookies(response):
    """Clear authentication cookies."""
    response.delete_cookie(COOKIE_NAME, path='/')
    response.delete_cookie(COOKIE_REFRESH_NAME, path='/')
    return response


# =============================================================================
# SIGNUP
# =============================================================================

@console_auth_bp.route('/signup', methods=['POST'])
def signup():
    """
    Create a new console account.
    
    Request Body:
        {
            "email": "user@example.com",
            "password": "SecurePass123",
            "name": "John Doe"
        }
    
    Response:
        Sets httpOnly cookies and returns user info
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({
            'success': False,
            'error': 'INVALID_JSON',
            'message': 'Invalid JSON in request body'
        }), 400
    
    email = data.get('email', '').strip()
    password = data.get('password', '')
    name = data.get('name', '').strip()
    
    # Validation
    if not email:
        return jsonify({
            'success': False,
            'error': 'MISSING_EMAIL',
            'message': 'Email is required'
        }), 400
    
    if not password:
        return jsonify({
            'success': False,
            'error': 'MISSING_PASSWORD',
            'message': 'Password is required'
        }), 400
    
    # Get IP for rate limiting
    ip_address = get_client_ip()
    
    # Call auth service
    try:
        import asyncio
        service = get_console_auth_service()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.signup(
                email=email,
                password=password,
                name=name,
                ip_address=ip_address
            ))
        finally:
            loop.close()
        
        if result.get('success'):
            response_data = {
                'success': True,
                'requires_verification': result.get('requires_verification', False),
                'user': result['user'],
                'org': result['org']
            }
            
            response = make_response(jsonify(response_data), 201)
            response = _set_auth_cookies(
                response,
                result['access_token'],
                result['refresh_token']
            )
            return response
        else:
            error_code = result.get('error', 'SIGNUP_FAILED')
            status_code = _error_to_status(error_code)
            return jsonify(result), status_code
            
    except Exception as e:
        logger.error(f"Signup error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': 'Unable to create account'
        }), 500


# =============================================================================
# EMAIL VERIFICATION OTP
# =============================================================================

@console_auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    """
    Send verification OTP to user's email.
    
    Request Body:
        {
            "email": "user@example.com"
        }
    
    Response:
        {
            "success": true,
            "expires_in": 600,
            "message": "Verification code sent"
        }
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({
            'success': False,
            'error': 'INVALID_JSON'
        }), 400
    
    email = data.get('email', '').strip()
    
    if not email:
        return jsonify({
            'success': False,
            'error': 'MISSING_EMAIL',
            'message': 'Email is required'
        }), 400
    
    ip_address = get_client_ip()
    
    try:
        import asyncio
        service = get_console_auth_service()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.send_verification_otp(
                email=email,
                ip_address=ip_address
            ))
        finally:
            loop.close()
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            error_code = result.get('error', 'SEND_FAILED')
            status_code = _error_to_status(error_code)
            return jsonify(result), status_code
            
    except Exception as e:
        logger.error(f"Send OTP error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': 'Unable to send verification code'
        }), 500


@console_auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    """
    Verify email OTP code.
    
    Request Body:
        {
            "email": "user@example.com",
            "code": "123456"
        }
    
    Response:
        {
            "success": true,
            "verified": true,
            "message": "Email verified successfully"
        }
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({
            'success': False,
            'error': 'INVALID_JSON'
        }), 400
    
    email = data.get('email', '').strip()
    code = data.get('code', '').strip()
    
    if not email:
        return jsonify({
            'success': False,
            'error': 'MISSING_EMAIL',
            'message': 'Email is required'
        }), 400
    
    if not code:
        return jsonify({
            'success': False,
            'error': 'MISSING_CODE',
            'message': 'Verification code is required'
        }), 400
    
    ip_address = get_client_ip()
    
    try:
        import asyncio
        service = get_console_auth_service()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.verify_email_otp(
                email=email,
                otp=code,
                ip_address=ip_address
            ))
        finally:
            loop.close()
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            error_code = result.get('error', 'VERIFICATION_FAILED')
            status_code = _error_to_status(error_code)
            return jsonify(result), status_code
            
    except Exception as e:
        logger.error(f"Verify OTP error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': 'Unable to verify code'
        }), 500


# =============================================================================
# LOGIN
# =============================================================================

@console_auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login to console.
    
    Request Body:
        {
            "email": "user@example.com",
            "password": "SecurePass123"
        }
    
    Response:
        Sets httpOnly cookies and returns user info
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({
            'success': False,
            'error': 'INVALID_JSON'
        }), 400
    
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({
            'success': False,
            'error': 'MISSING_CREDENTIALS',
            'message': 'Email and password are required'
        }), 400
    
    ip_address = get_client_ip()
    user_agent = request.headers.get('User-Agent', '')
    
    try:
        import asyncio
        service = get_console_auth_service()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.login(
                email=email,
                password=password,
                ip_address=ip_address,
                user_agent=user_agent
            ))
        finally:
            loop.close()
        
        if result.get('success'):
            response_data = {
                'success': True,
                'user': result['user'],
                'org': result['org']
            }
            
            response = make_response(jsonify(response_data), 200)
            response = _set_auth_cookies(
                response,
                result['access_token'],
                result['refresh_token']
            )
            return response
        else:
            error_code = result.get('error', 'LOGIN_FAILED')
            status_code = _error_to_status(error_code)
            return jsonify(result), status_code
            
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR'
        }), 500


# =============================================================================
# LOGOUT
# =============================================================================

@console_auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    Logout and clear session.
    """
    refresh_token = request.cookies.get(COOKIE_REFRESH_NAME)
    user_id = None
    
    # Try to get user_id from access token
    access_token = request.cookies.get(COOKIE_NAME)
    if access_token:
        from services.console_auth_service import verify_token
        payload = verify_token(access_token)
        if payload:
            user_id = payload.get('sub')
    
    if user_id:
        try:
            import asyncio
            service = get_console_auth_service()
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(service.logout(
                    user_id=user_id,
                    refresh_token=refresh_token,
                    ip_address=get_client_ip()
                ))
            finally:
                loop.close()
        except Exception as e:
            logger.warning(f"Logout error: {e}")
    
    response = make_response(jsonify({'success': True}), 200)
    response = _clear_auth_cookies(response)
    return response


# =============================================================================
# REFRESH TOKEN
# =============================================================================

@console_auth_bp.route('/refresh', methods=['POST'])
def refresh_token():
    """
    Refresh access token using refresh token cookie.
    """
    refresh_token = request.cookies.get(COOKIE_REFRESH_NAME)
    
    if not refresh_token:
        return jsonify({
            'success': False,
            'error': 'NO_REFRESH_TOKEN',
            'message': 'Refresh token not found'
        }), 401
    
    try:
        import asyncio
        service = get_console_auth_service()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.refresh_access_token(refresh_token))
        finally:
            loop.close()
        
        if result.get('success'):
            response = make_response(jsonify({
                'success': True,
                'expires_in': result['expires_in']
            }), 200)
            
            response.set_cookie(
                COOKIE_NAME,
                result['access_token'],
                max_age=COOKIE_MAX_AGE,
                httponly=True,
                secure=True,
                samesite='Lax'
            )
            return response
        else:
            # Clear cookies on refresh failure
            response = make_response(jsonify(result), 401)
            response = _clear_auth_cookies(response)
            return response
            
    except Exception as e:
        logger.error(f"Refresh error: {e}")
        return jsonify({
            'success': False,
            'error': 'REFRESH_FAILED'
        }), 500


# =============================================================================
# GET CURRENT USER
# =============================================================================

@console_auth_bp.route('/me', methods=['GET'])
@require_console_auth()
def get_me():
    """
    Get current authenticated user.
    
    Response:
        {
            "success": true,
            "user": {
                "id": "...",
                "email": "...",
                "name": "..."
            },
            "org": { ... }
        }
    """
    user = g.console_user
    
    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'is_email_verified': user.is_email_verified
        },
        'org': {
            'id': user.current_org_id,
            'role': user.current_org_role
        } if user.current_org_id else None
    }), 200


# =============================================================================
# HELPERS
# =============================================================================

def _error_to_status(error_code: str) -> int:
    """Map error codes to HTTP status."""
    status_map = {
        'MISSING_EMAIL': 400,
        'MISSING_PASSWORD': 400,
        'MISSING_CODE': 400,
        'INVALID_EMAIL': 400,
        'INVALID_OTP_FORMAT': 400,
        'WEAK_PASSWORD': 400,
        'EMAIL_EXISTS': 409,
        'INVALID_CREDENTIALS': 401,
        'INVALID_OTP': 401,
        'NO_OTP_FOUND': 404,
        'USER_NOT_FOUND': 404,
        'OTP_EXPIRED': 410,
        'MAX_ATTEMPTS': 429,
        'RATE_LIMITED': 429,
        'SEND_FAILED': 500,
        'VERIFICATION_FAILED': 500,
        'INTERNAL_ERROR': 500,
        'DATABASE_ERROR': 500,
    }
    return status_map.get(error_code, 400)
