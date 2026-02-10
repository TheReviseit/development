"""
Domain API Routes

Provides endpoints for:
- Fetching domain-specific user capabilities
- Getting domain metadata
- Validating domain access

All capability writes are server-side only (via middleware).
Frontend can only READ capabilities.
"""

from flask import Blueprint, request, jsonify
from middleware.domain_validation import require_domain_capability, get_user_capabilities
from domain.context import (
    resolve_domain_from_request,
    get_domain_metadata,
    get_required_capability,
)
import logging

# Create blueprint
domain_bp = Blueprint('domain', __name__, url_prefix='/api/domain')
logger = logging.getLogger(__name__)


@domain_bp.route('/capabilities', methods=['GET'])
def get_domain_capabilities():
    """
    Get user capabilities filtered for current domain.
    
    This endpoint does NOT require authentication for initial load,
    but will return limited data if not authenticated.
    
    Returns:
        JSON with capabilities relevant to current domain
        
    Example Response:
        {
            "success": true,
            "domain": "shop",
            "capabilities": {
                "shop_enabled": true,
                "products_enabled": true,
                "orders_enabled": false
            },
            "metadata": {
                "name": "Flowauxi Shop",
                "base_url": "https://shop.flowauxi.com"
            }
        }
    """
    try:
        # Resolve domain from request
        domain = resolve_domain_from_request(request)
        
        # Get user ID if available (may be None if not authenticated)
        user_id = getattr(request, 'user_id', None)
        
        if not user_id:
            # Not authenticated - return public domain metadata only
            return jsonify({
                "success": True,
                "authenticated": False,
                "domain": domain,
                "metadata": get_domain_metadata(domain),
            }), 200
        
        # Fetch user capabilities
        caps = get_user_capabilities(user_id)
        
        # Filter capabilities relevant to this domain
        domain_caps = filter_capabilities_for_domain(caps, domain)
        
        # Check if user has access to this domain
        required_cap = get_required_capability(domain)
        has_access = True
        
        if required_cap:
            has_access = caps.get(required_cap, False)
        
        return jsonify({
            "success": True,
            "authenticated": True,
            "domain": domain,
            "has_access": has_access,
            "capabilities": domain_caps,
            "metadata": get_domain_metadata(domain),
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching domain capabilities: {e}")
        return jsonify({
            "success": False,
            "error": "Failed to fetch capabilities",
            "details": str(e)
        }), 500


@domain_bp.route('/metadata', methods=['GET'])
def get_domain_info():
    """
    Get metadata for current domain.
    
    Public endpoint (no auth required).
    
    Returns:
        JSON with domain metadata (name, base_url, description, etc.)
    """
    try:
        domain = resolve_domain_from_request(request)
        metadata = get_domain_metadata(domain)
        
        return jsonify({
            "success": True,
            "domain": domain,
            "metadata": metadata
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching domain metadata: {e}")
        return jsonify({
            "success": False,
            "error": "Failed to fetch domain metadata"
        }), 500


@domain_bp.route('/validate', methods=['POST'])
def validate_domain_access():
    """
    Validate if current user has access to a specific domain.
    
    Requires authentication.
    
    Request Body:
        {
            "target_domain": "shop" | "showcase" | "marketing"
        }
        
    Returns:
        {
            "success": true,
            "has_access": true,
            "required_capability": "shop_enabled",
            "current_value": true
        }
    """
    try:
        user_id = getattr(request, 'user_id', None)
        
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Authentication required"
            }), 401
        
        data = request.get_json()
        target_domain = data.get('target_domain')
        
        if not target_domain:
            return jsonify({
                "success": False,
                "error": "target_domain required"
            }), 400
        
        # Get required capability
        required_cap = get_required_capability(target_domain)
        
        # Fetch user capabilities
        caps = get_user_capabilities(user_id)
        
        # Check access
        has_access = True
        if required_cap:
            has_access = caps.get(required_cap, False)
        
        return jsonify({
            "success": True,
            "target_domain": target_domain,
            "has_access": has_access,
            "required_capability": required_cap,
            "current_value": caps.get(required_cap) if required_cap else None
        }), 200
        
    except Exception as e:
        logger.error(f"Error validating domain access: {e}")
        return jsonify({
            "success": False,
            "error": "Validation failed"
        }), 500


def filter_capabilities_for_domain(caps: dict, domain: str) -> dict:
    """
    Filter user capabilities to only those relevant for a domain.
    
    Args:
        caps: Full user capabilities from database
        domain: Product domain
        
    Returns:
        dict: Filtered capabilities relevant to domain
    """
    if domain == "shop":
        return {
            "shop_enabled": caps.get("shop_enabled", False),
            "products_enabled": caps.get("products_enabled", False),
            "order_booking_enabled": caps.get("order_booking_enabled", False),
            # Messages is part of shop
        }
    elif domain == "showcase":
        return {
            "showcase_enabled": caps.get("showcase_enabled", False),
        }
    elif domain == "marketing":
        return {
            "marketing_enabled": caps.get("marketing_enabled", False),
            # Campaigns, bulk messages, templates, contacts
        }
    else:
        # Dashboard - return all capabilities
        return caps


# Register blueprint in app.py:
# from routes.domain import domain_bp
# app.register_blueprint(domain_bp)
