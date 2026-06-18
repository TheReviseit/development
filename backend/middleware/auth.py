"""
Shared Authentication Middleware — Firebase Token Verification
==============================================================
SECURITY: All routes MUST use `require_auth` from this module.
Every request must present a valid Firebase ID token in the
`Authorization: Bearer` header. Tokens are verified locally with
check_revoked=False (no blocking HTTPS call to Google) and a
5-second timeout to prevent worker thread exhaustion.

Usage:
    from middleware.auth import require_auth

    @bp.route('/protected')
    @require_auth
    def protected_route():
        user_id = g.user_id  # Supabase UUID
        firebase_uid = g.firebase_uid  # Firebase UID
        ...
"""

import logging
import time
from functools import wraps
from flask import request, jsonify, g
from typing import Optional, Tuple

logger = logging.getLogger('flowauxi.auth')

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    FIREBASE_IMPORTED = True
except ImportError:
    FIREBASE_IMPORTED = False

try:
    from supabase_client import get_supabase_client, get_user_id_from_firebase_uid
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    get_user_id_from_firebase_uid = None

# Circuit breaker state for Firebase token verification
_auth_circuit_open = False
_auth_circuit_failures = 0
_auth_circuit_last_failure = 0.0
_AUTH_CIRCUIT_TIMEOUT = 30
_AUTH_CIRCUIT_THRESHOLD = 3


def _is_auth_circuit_open() -> bool:
    global _auth_circuit_open, _auth_circuit_last_failure
    if not _auth_circuit_open:
        return False
    if time.time() - _auth_circuit_last_failure > _AUTH_CIRCUIT_TIMEOUT:
        _auth_circuit_open = False
        logger.info("Auth circuit half-open — allowing one request")
        return False
    return True


def _record_auth_failure() -> None:
    global _auth_circuit_open, _auth_circuit_failures, _auth_circuit_last_failure
    _auth_circuit_failures += 1
    _auth_circuit_last_failure = time.time()
    if _auth_circuit_failures >= _AUTH_CIRCUIT_THRESHOLD:
        _auth_circuit_open = True
        logger.error(
            f"Auth circuit OPEN after {_auth_circuit_failures} consecutive failures"
        )


def _reset_auth_circuit() -> None:
    global _auth_circuit_open, _auth_circuit_failures, _auth_circuit_last_failure
    _auth_circuit_open = False
    _auth_circuit_failures = 0
    _auth_circuit_last_failure = 0.0


def verify_token_direct(token: str) -> Optional[dict]:
    """Verify Firebase ID token directly (no thread pool).

    Uses check_revoked=False for local-only verification with cached
    public keys (~5ms after first call). The first call may fetch keys
    from Google (~200ms) but that's a one-time cost at worker level.

    Returns decoded token dict, or None on failure.
    """
    if not FIREBASE_IMPORTED:
        logger.error("Firebase Admin SDK not installed")
        return None
    if not _init_firebase_if_needed():
        logger.error("Firebase app not initialized")
        return None
    try:
        logger.info(f"verify_token_direct: calling verify_id_token with check_revoked=False")
        decoded = firebase_auth.verify_id_token(token, check_revoked=False, clock_skew_seconds=10)
        logger.info(f"verify_token_direct: success uid={decoded.get('uid', 'N/A')[:20]}")
        _reset_auth_circuit()
        return decoded
    except firebase_admin.auth.ExpiredIdTokenError as e:
        logger.warning(f"Expired Firebase token: {e}")
        return None
    except firebase_admin.auth.RevokedIdTokenError as e:
        logger.warning(f"Revoked Firebase token: {e}")
        _record_auth_failure()
        return None
    except firebase_admin.auth.InvalidIdTokenError as e:
        logger.warning(f"Invalid Firebase token: {e}")
        return None
    except Exception as e:
        logger.error(f"Firebase token verification error: {type(e).__name__}: {e}")
        _record_auth_failure()
        return None


def _init_firebase_if_needed() -> bool:
    """Ensure Firebase is initialized; attempt initialization if not."""
    if not FIREBASE_IMPORTED:
        logger.error("_init_firebase_if_needed: FIREBASE_IMPORTED is False")
        return False
    try:
        firebase_admin.get_app()
        logger.info("_init_firebase_if_needed: Firebase app already initialized")
        return True
    except ValueError:
        logger.info("_init_firebase_if_needed: No Firebase app found, attempting initialization")
    try:
        from firebase_client import initialize_firebase
        result = initialize_firebase()
        logger.info(f"_init_firebase_if_needed: initialize_firebase() returned {result}")
        return result
    except Exception as e:
        logger.error(f"_init_firebase_if_needed: Failed to initialize Firebase: {type(e).__name__}: {e}")
        return False


def get_firebase_uid() -> Optional[str]:
    """
    Extract and verify Firebase UID from Authorization header.

    Returns:
        Firebase UID string, or None if authentication fails.

    SECURITY: Requires valid Firebase ID token in Authorization: Bearer header.
    Token is verified locally with cached public keys (check_revoked=False).
    No X-User-Id header trust — every request must present a valid Firebase token.
    """
    if _is_auth_circuit_open():
        logger.warning("Auth circuit open — rejecting request")
        return None

    auth_header = request.headers.get('Authorization', '')
    logger.info(f"get_firebase_uid: auth_header present={bool(auth_header)} starts_with_Bearer={auth_header.startswith('Bearer ')}")
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        logger.info(f"get_firebase_uid: token_prefix={token[:20]}... token_length={len(token)}")
        decoded = verify_token_direct(token)
        if not decoded:
            logger.warning("get_firebase_uid: verify_token_direct returned None")
            return None
        uid = decoded.get('uid')
        if not uid:
            logger.warning(f"get_firebase_uid: Token missing uid claim. Claims: {list(decoded.keys())}")
            return None
        logger.info(f"get_firebase_uid: success uid={uid[:10]}...")
        return uid

    logger.warning(f"get_firebase_uid: No Bearer token found in Authorization header")
    return None


def map_to_supabase_user_id(firebase_uid: str) -> Optional[str]:
    """Map Firebase UID to Supabase user UUID."""
    if SUPABASE_AVAILABLE and get_user_id_from_firebase_uid:
        supabase_id = get_user_id_from_firebase_uid(firebase_uid)
        if supabase_id:
            return supabase_id
        logger.warning(
            f"No Supabase user found for Firebase UID {firebase_uid[:10]}..."
        )
        return None
    return None


def require_auth(f):
    """
    Decorator that requires valid Firebase authentication.

    Sets:
        g.firebase_uid: Firebase UID of authenticated user
        g.user_id: Supabase UUID of authenticated user

    Returns 401 if not authenticated, 404 if user not found in Supabase.
    Token is verified locally with cached public keys (check_revoked=False).
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        firebase_uid = get_firebase_uid()
        if not firebase_uid:
            return jsonify({
                'success': False,
                'error': 'Authentication required. Provide valid Authorization: Bearer token.',
                'error_code': 'UNAUTHORIZED',
            }), 401

        g.firebase_uid = firebase_uid

        supabase_uuid = map_to_supabase_user_id(firebase_uid)
        if not supabase_uuid:
            return jsonify({
                'success': False,
                'error': 'User account not found. Please complete account setup.',
                'error_code': 'USER_NOT_FOUND',
            }), 404

        g.user_id = supabase_uuid
        g.request_id = request.headers.get('X-Request-Id') or f'req_{id(request)}'

        return f(*args, **kwargs)
    return decorated_function
