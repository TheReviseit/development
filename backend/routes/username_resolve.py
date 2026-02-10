"""
Username resolution endpoint for Next.js middleware
Supports server-side 301 redirects
"""

from flask import Blueprint, jsonify
import logging
from utils.username_utils import get_username_by_user_id

resolve_bp = Blueprint('username_resolve', __name__, url_prefix='/api/username')
logger = logging.getLogger('username.resolve')


@resolve_bp.route('/resolve/<user_id>', methods=['GET'])
def resolve_user_id_to_username(user_id: str):
    """
    Resolve Firebase UID to username
    
    Used by Next.js middleware for 301 redirects
    
    Response:
        {
            "success": true,
            "username": "flowauxi"
        }
    
    Or if not found:
        {
            "success": false,
            "error": "Username not found"
        }
    """
    try:
        username = get_username_by_user_id(user_id)
        
        if not username:
            return jsonify({
                "success": False,
                "error": "Username not found"
            }), 404
        
        return jsonify({
            "success": True,
            "username": username
        }), 200
    
    except Exception as e:
        logger.error(f"Error resolving user_id to username: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500
