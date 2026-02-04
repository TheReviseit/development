"""
OTP API Key Authentication Middleware
Production-Grade Authentication for OTP Platform

Features:
- API key validation (Bearer token)
- Key prefix lookup + hash verification
- Soft-delete aware (checks revoked_at)
- Rate limit enforcement
- Project/Business context injection
"""

import hmac
import hashlib
import logging
from functools import wraps
from datetime import datetime
from typing import Optional, Dict, Any, Callable
from flask import request, g, jsonify

logger = logging.getLogger('otp.auth')


def get_api_key_from_header() -> Optional[str]:
    """Extract API key from Authorization header."""
    auth_header = request.headers.get('Authorization', '')
    
    if auth_header.startswith('Bearer '):
        return auth_header[7:]  # Remove 'Bearer ' prefix
    
    return None


def is_sandbox_key(api_key: str) -> bool:
    """Check if API key is a sandbox/test key."""
    return api_key.startswith('otp_test_')


def verify_api_key(api_key: str, supabase_client) -> Optional[Dict[str, Any]]:
    """
    Verify API key and return project context.
    
    Lookup flow:
    1. Extract key prefix (first 16 chars)
    2. Find matching key in database
    3. Verify full key hash
    4. Check active and not revoked
    5. Update last_used_at
    
    Args:
        api_key: Full API key string
        supabase_client: Supabase client instance
        
    Returns:
        Project context dict or None if invalid
    """
    if not api_key or len(api_key) < 16:
        return None
    
    # Extract prefix for lookup
    key_prefix = api_key[:16]
    
    try:
        # Lookup by prefix
        result = supabase_client.table("otp_api_keys").select(
            "id, project_id, key_hash, scopes, rate_limit_per_minute, rate_limit_per_day, "
            "is_active, expires_at, revoked_at, environment"
        ).eq("key_prefix", key_prefix).single().execute()
        
        key_record = result.data
        
        if not key_record:
            logger.warning(f"API key not found: {key_prefix}...")
            return None
        
        # Check if revoked (soft-delete)
        if key_record.get("revoked_at"):
            logger.warning(f"API key revoked: {key_prefix}...")
            return None
        
        # Check if active
        if not key_record.get("is_active", True):
            logger.warning(f"API key inactive: {key_prefix}...")
            return None
        
        # Check expiry
        if key_record.get("expires_at"):
            expires_at = datetime.fromisoformat(key_record["expires_at"].replace("Z", "+00:00"))
            if datetime.utcnow() > expires_at.replace(tzinfo=None):
                logger.warning(f"API key expired: {key_prefix}...")
                return None
        
        # Verify hash
        computed_hash = hashlib.sha256(api_key.encode('utf-8')).hexdigest()
        if not hmac.compare_digest(computed_hash, key_record["key_hash"]):
            logger.warning(f"API key hash mismatch: {key_prefix}...")
            return None
        
        # Update last_used_at (non-blocking)
        try:
            supabase_client.table("otp_api_keys").update({
                "last_used_at": datetime.utcnow().isoformat()
            }).eq("id", key_record["id"]).execute()
        except Exception:
            pass  # Don't fail auth on usage tracking error
        
        # Fetch project info
        project_id = key_record.get("project_id")
        project = {}
        
        if project_id:
            project_result = supabase_client.table("otp_projects").select(
                "id, name, org_id, environment, whatsapp_mode, whatsapp_phone_number_id, "
                "webhook_url, webhook_secret, otp_length, otp_ttl_seconds, max_verify_attempts"
            ).eq("id", project_id).single().execute()
            
            project = project_result.data if project_result.data else {}
        
        # Determine if this is sandbox mode
        # test environment OR test key prefix = sandbox mode
        is_sandbox = (
            key_record.get("environment") == "test" or 
            is_sandbox_key(api_key)
        )
        
        return {
            "key_id": key_record["id"],
            "project_id": project_id,
            "business_id": project_id,  # Alias for backward compatibility
            "org_id": project.get("org_id"),
            "project_name": project.get("name"),
            "scopes": key_record.get("scopes", ["send", "verify"]),
            "rate_limit_per_minute": key_record.get("rate_limit_per_minute", 60),
            "rate_limit_per_day": key_record.get("rate_limit_per_day", 10000),
            "whatsapp_mode": project.get("whatsapp_mode", "platform"),
            "phone_number_id": project.get("whatsapp_phone_number_id"),
            "webhook_url": project.get("webhook_url"),
            "webhook_secret": project.get("webhook_secret"),
            "otp_length": project.get("otp_length", 6),
            "otp_ttl_seconds": project.get("otp_ttl_seconds", 300),
            "max_verify_attempts": project.get("max_verify_attempts", 5),
            "is_sandbox": is_sandbox,
            "environment": key_record.get("environment", "test")
        }
        
    except Exception as e:
        logger.error(f"Error verifying API key: {e}")
        return None


def require_otp_auth(scopes: list = None):
    """
    Decorator for routes requiring OTP API key authentication.
    
    Usage:
        @app.route('/v1/otp/send', methods=['POST'])
        @require_otp_auth(scopes=['send'])
        def send_otp():
            business_id = g.otp_business['business_id']
            ...
    
    Args:
        scopes: Required scopes (e.g., ['send'], ['verify'])
        
    Injects into flask.g:
        g.otp_api_key: The API key string
        g.otp_business: Project context dict
        g.otp_is_sandbox: Boolean for sandbox mode
    """
    scopes = scopes or []
    
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Extract API key
            api_key = get_api_key_from_header()
            
            if not api_key:
                return jsonify({
                    "success": False,
                    "error": "MISSING_API_KEY",
                    "message": "Authorization header with Bearer token required"
                }), 401
            
            # Validate key format
            if not api_key.startswith('otp_live_') and not api_key.startswith('otp_test_'):
                return jsonify({
                    "success": False,
                    "error": "INVALID_API_KEY",
                    "message": "Invalid API key format"
                }), 401
            
            # Verify key and get project context
            try:
                from supabase_client import get_supabase_client
                supabase = get_supabase_client()
                project_context = verify_api_key(api_key, supabase)
            except Exception as e:
                logger.error(f"Auth error: {e}")
                return jsonify({
                    "success": False,
                    "error": "AUTH_ERROR",
                    "message": "Authentication service unavailable"
                }), 500
            
            if not project_context:
                return jsonify({
                    "success": False,
                    "error": "INVALID_API_KEY",
                    "message": "Invalid or expired API key"
                }), 401
            
            # Check required scopes
            if scopes:
                key_scopes = project_context.get("scopes", [])
                missing_scopes = [s for s in scopes if s not in key_scopes]
                if missing_scopes:
                    return jsonify({
                        "success": False,
                        "error": "INSUFFICIENT_SCOPE",
                        "message": f"API key missing required scopes: {missing_scopes}"
                    }), 403
            
            # Inject context into flask.g
            g.otp_api_key = api_key
            g.otp_business = project_context  # Keep name for backward compatibility
            g.otp_is_sandbox = project_context.get("is_sandbox", False)
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def get_client_ip() -> str:
    """Get client IP address, handling proxies."""
    # Check X-Forwarded-For header (from load balancers/proxies)
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    
    # Check X-Real-IP header
    if request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    
    # Fallback to remote_addr
    return request.remote_addr or '0.0.0.0'
