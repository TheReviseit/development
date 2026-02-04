"""
Resource Guard Middleware
Paid resource protection, signed URLs, and tenant-scoped file access.

Responsibilities:
- Generate time-limited signed URLs for paid resources
- Verify signed URL authenticity and expiration
- Enforce tenant-scoped resource access
"""

import hmac
import hashlib
import base64
import logging
import os
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional, Callable
from urllib.parse import urlencode, parse_qs, urlparse

from flask import request, g, jsonify

logger = logging.getLogger('security.resource_guard')

# Signing secret (use environment variable in production)
SIGNING_SECRET = os.getenv('RESOURCE_SIGNING_SECRET', 'change-this-in-production')

# Default TTL for signed URLs
DEFAULT_TTL_SECONDS = 3600  # 1 hour


# =============================================================================
# SIGNED URL GENERATION
# =============================================================================

def generate_signed_url(
    resource_path: str,
    tenant_id: str,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
    base_url: str = None
) -> str:
    """
    Generate a time-limited signed URL for a paid resource.
    
    Args:
        resource_path: Path to the resource (e.g., '/files/report.pdf')
        tenant_id: ID of the tenant who owns the resource
        ttl_seconds: Time-to-live for the URL
        base_url: Base URL (defaults to API_BASE_URL env var)
        
    Returns:
        Signed URL string
    """
    base_url = base_url or os.getenv('API_BASE_URL', 'https://api.flowauxi.com')
    
    # Calculate expiration timestamp
    expires = int((datetime.utcnow() + timedelta(seconds=ttl_seconds)).timestamp())
    
    # Build params to sign
    params = {
        'path': resource_path,
        'tenant': tenant_id,
        'expires': str(expires),
    }
    
    # Generate signature
    signature = _sign_params(params)
    params['sig'] = signature
    
    # Build URL
    url = f"{base_url}/resources/{resource_path.lstrip('/')}?{urlencode(params)}"
    
    logger.debug(f"Generated signed URL for {resource_path}, expires={expires}")
    return url


def verify_signed_url(
    url: str,
    expected_tenant_id: str = None
) -> tuple[bool, Optional[str]]:
    """
    Verify a signed URL.
    
    Args:
        url: The signed URL to verify
        expected_tenant_id: If provided, verify tenant matches
        
    Returns:
        Tuple of (is_valid: bool, resource_path: Optional[str])
    """
    try:
        parsed = urlparse(url)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        
        # Check required params
        if not all(k in params for k in ['path', 'tenant', 'expires', 'sig']):
            logger.warning("Signed URL missing required parameters")
            return False, None
        
        # Check expiration
        expires = int(params['expires'])
        if datetime.utcnow().timestamp() > expires:
            logger.info(f"Signed URL expired: expires={expires}")
            return False, None
        
        # Check tenant if specified
        if expected_tenant_id and params['tenant'] != expected_tenant_id:
            logger.warning(f"Tenant mismatch: expected={expected_tenant_id}, got={params['tenant']}")
            return False, None
        
        # Verify signature
        provided_sig = params.pop('sig')
        expected_sig = _sign_params(params)
        
        if not hmac.compare_digest(provided_sig, expected_sig):
            logger.warning("Signed URL signature verification failed")
            return False, None
        
        return True, params['path']
        
    except Exception as e:
        logger.error(f"Error verifying signed URL: {e}")
        return False, None


def _sign_params(params: dict) -> str:
    """Generate HMAC signature for params."""
    # Sort params for consistent signing
    sorted_params = sorted(params.items())
    message = '&'.join(f"{k}={v}" for k, v in sorted_params)
    
    signature = hmac.new(
        SIGNING_SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).digest()
    
    return base64.urlsafe_b64encode(signature).decode().rstrip('=')


# =============================================================================
# RESOURCE ACCESS DECORATORS
# =============================================================================

def require_resource_ownership(resource_type: str):
    """
    Decorator factory: Ensure user owns the resource being accessed.
    
    Verifies that the resource belongs to the user's tenant/org.
    
    Args:
        resource_type: Type of resource ('file', 'report', 'export', etc.)
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get resource_id from URL or query params
            resource_id = kwargs.get('resource_id') or request.args.get('resource_id')
            
            if not resource_id:
                return jsonify({
                    "success": False,
                    "error": "BAD_REQUEST",
                    "message": "Resource ID required"
                }), 400
            
            # Get tenant context
            ctx = getattr(g, 'entitlement_ctx', None)
            if not ctx:
                return jsonify({
                    "success": False,
                    "error": "ACCESS_DENIED",
                    "message": "Access denied"
                }), 403
            
            # Verify resource ownership
            # This would query the database to check resource.org_id == ctx.org_id
            if not _verify_resource_ownership(resource_type, resource_id, ctx.org_id):
                logger.warning(
                    f"Resource ownership check failed: type={resource_type}, "
                    f"id={resource_id}, user_org={ctx.org_id}"
                )
                return jsonify({
                    "success": False,
                    "error": "ACCESS_DENIED",
                    "message": "Access denied"
                }), 403
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def require_signed_access(f: Callable) -> Callable:
    """
    Decorator: Require valid signed URL for resource access.
    
    Used for publicly-accessible CDN/file endpoints where
    auth tokens may not be available.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get signature from query params
        sig = request.args.get('sig')
        expires = request.args.get('expires')
        tenant = request.args.get('tenant')
        
        if not all([sig, expires, tenant]):
            return jsonify({
                "success": False,
                "error": "ACCESS_DENIED",
                "message": "Access denied"
            }), 403
        
        # Reconstruct and verify URL
        is_valid, resource_path = verify_signed_url(request.url)
        
        if not is_valid:
            return jsonify({
                "success": False,
                "error": "ACCESS_DENIED",
                "message": "Access denied"
            }), 403
        
        # Inject verified info into context
        g.signed_resource_path = resource_path
        g.signed_tenant_id = tenant
        
        return f(*args, **kwargs)
    
    return decorated_function


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _verify_resource_ownership(
    resource_type: str,
    resource_id: str,
    org_id: str
) -> bool:
    """
    Verify that a resource belongs to the specified organization.
    
    Returns True if ownership verified, False otherwise.
    """
    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()
        
        # Resource type to table mapping
        table_mapping = {
            'file': 'files',
            'report': 'reports',
            'export': 'exports',
            'project': 'otp_projects',
            'api_key': 'otp_api_keys',
        }
        
        table = table_mapping.get(resource_type)
        if not table:
            logger.error(f"Unknown resource type: {resource_type}")
            return False
        
        # Query for resource
        result = supabase.table(table).select('org_id').eq('id', resource_id).execute()
        
        if not result.data:
            logger.info(f"Resource not found: type={resource_type}, id={resource_id}")
            return False
        
        resource_org_id = result.data[0].get('org_id')
        
        return resource_org_id == org_id
        
    except Exception as e:
        logger.error(f"Error verifying resource ownership: {e}")
        # Fail secure
        return False
