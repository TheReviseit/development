"""
Domain-Aware Capability Validation Middleware

Provides Flask decorators for enforcing domain-based access control.

SECURITY RULES:
1. Capabilities are authorization, not UI state
2. Frontend can READ capabilities, but NEVER WRITE them
3. Auto-grant is a server-side trust decision
4. Domain context always wins over manual toggles

Usage:
    from backend.middleware.domain_validation import require_domain_capability
    
    @app.route('/api/products')
    @require_auth
    @require_domain_capability
    def get_products():
        # Access request.domain_context to check current domain
        return jsonify({"domain": request.domain_context})
"""

from functools import wraps
from flask import request, jsonify, g
import logging

# Import domain context utilities
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from domain.context import (
    resolve_domain_from_request,
    get_required_capability,
    should_auto_grant_capability,
)

logger = logging.getLogger(__name__)


def get_user_capabilities(user_id: str) -> dict:
    """
    Fetch user capabilities from database.
    
    Args:
        user_id: Firebase UID
        
    Returns:
        dict: User capabilities (shop_enabled, showcase_enabled, etc.)
    """
    try:
        from supabase_client import get_supabase_client
        
        client = get_supabase_client()
        result = client.table('ai_capabilities').select('*').eq('user_id', user_id).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        
        # No capabilities record found - will be auto-created
        return {}
        
    except Exception as e:
        logger.error(f"Failed to fetch capabilities for user {user_id}: {e}")
        return {}


def auto_grant_shop_capability(user_id: str) -> bool:
    """
    Auto-grant shop capability to a user.
    
    SECURITY: This is a server-side trust decision. Frontend NEVER calls this.
    
    Args:
        user_id: Firebase UID
        
    Returns:
        bool: True if successfully granted, False otherwise
    """
    try:
        from supabase_client import get_supabase_client
        
        client = get_supabase_client()
        
        # Check if capabilities record exists
        result = client.table('ai_capabilities').select('id').eq('user_id', user_id).execute()
        
        if result.data and len(result.data) > 0:
            # Update existing record
            client.table('ai_capabilities').update({
                'shop_enabled': True
            }).eq('user_id', user_id).execute()
            logger.info(f"✅ Auto-granted shop capability to existing user: {user_id}")
        else:
            # Create new capabilities record
            client.table('ai_capabilities').insert({
                'user_id': user_id,
                'shop_enabled': True,
                'appointment_booking_enabled': False,
                'order_booking_enabled': False,
                'products_enabled': False,
                'showcase_enabled': False,
                'marketing_enabled': False,
            }).execute()
            logger.info(f"✅ Created capabilities record with shop enabled for new user: {user_id}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to auto-grant shop capability to user {user_id}: {e}")
        return False


def require_domain_capability(f):
    """
    Decorator to enforce domain-based capability validation.
    
    Flow:
    1. Resolve domain from request hostname
    2. Get user from auth middleware (assumes @require_auth ran first)
    3. Check if user has required capability for domain
    4. Auto-grant shop capability if missing (backwards compatibility)
    5. Return 403 if capability missing and can't auto-grant
    6. Set request.domain_context for downstream handlers
    
    Usage:
        @app.route('/api/products')
        @require_auth  # Must come first
        @require_domain_capability
        def get_products():
            return jsonify({"domain": request.domain_context})
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Resolve domain from request
        domain = resolve_domain_from_request(request)
        
        # Get user ID from request (set by auth middleware)
        user_id = getattr(request, 'user_id', None) or getattr(g, 'user_id', None)
        
        if not user_id:
            logger.warning(f"[DOMAIN VALIDATION] No user_id found in request for domain: {domain}")
            return jsonify({
                "error": "Authentication required",
                "code": "AUTH_REQUIRED"
            }), 401
        
        # Get required capability for this domain
        required_cap = get_required_capability(domain)
        
        # Set domain context for downstream handlers
        request.domain_context = domain
        g.domain_context = domain
        
        # No capability required (legacy dashboard)
        if not required_cap:
            logger.debug(f"[DOMAIN VALIDATION] No capability required for domain: {domain}")
            return f(*args, **kwargs)
        
        # Fetch user capabilities
        caps = get_user_capabilities(user_id)
        
        # Check if user has required capability
        if caps.get(required_cap):
            logger.debug(f"[DOMAIN VALIDATION] User {user_id} has {required_cap} for domain {domain}")
            return f(*args, **kwargs)
        
        # Check if we should auto-grant
        if should_auto_grant_capability(domain, caps):
            logger.info(f"[DOMAIN VALIDATION] Auto-granting {required_cap} to user {user_id}")
            
            if auto_grant_shop_capability(user_id):
                # Successfully auto-granted, proceed
                return f(*args, **kwargs)
            else:
                # Failed to auto-grant
                logger.error(f"[DOMAIN VALIDATION] Failed to auto-grant {required_cap} to user {user_id}")
                return jsonify({
                    "error": "Failed to enable capability",
                    "code": "CAPABILITY_GRANT_FAILED",
                    "domain": domain,
                    "required_capability": required_cap
                }), 500
        
        # Capability not enabled and can't auto-grant
        logger.warning(f"[DOMAIN VALIDATION] User {user_id} missing {required_cap} for domain {domain}")
        return jsonify({
            "error": "Capability not enabled",
            "code": "CAPABILITY_DISABLED",
            "domain": domain,
            "required_capability": required_cap,
            "message": f"Access to {domain} product requires {required_cap} to be enabled."
        }), 403
    
    return decorated_function


def inject_domain_context_header(response):
    """
    Flask after_request handler to inject X-Product-Domain header.
    
    Usage in app.py:
        @app.after_request
        def add_domain_context(response):
            return inject_domain_context_header(response)
    """
    domain = getattr(request, 'domain_context', 'dashboard')
    response.headers['X-Product-Domain'] = domain
    return response
