from flask import Blueprint, jsonify, request
from typing import Dict, Any
import logging
from utils.username_utils import (
    check_username_availability,
    generate_username_suggestions,
    validate_username_format,
    get_username_by_user_id
)
from utils.username_cache import invalidate_username_cache
from supabase_client import get_supabase_client
from routes.showcase_api import get_user_from_token  # Reuse auth helper

username_bp = Blueprint('username', __name__, url_prefix='/api/username')
logger = logging.getLogger('username.api')


@username_bp.route('/check', methods=['POST'])
def check_availability():
    """
    Check username availability
    
    Request:
        {
            "username": "flowauxi"
        }
    
    Response:
        {
            "available": true,
            "valid": true
        }
    
    Or if unavailable:
        {
            "available": false,
            "valid": true,
            "error": "This username is already taken",
            "suggestions": ["flowauxi-1", "flowauxi-2", ...]
        }
    """
    try:
        # Get authenticated user
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized"
            }), 401
        
        data = request.get_json()
        username = data.get('username', '').strip()
        
        if not username:
            return jsonify({
                "available": False,
                "valid": False,
                "error": "Username is required"
            }), 400
        
        # Check availability
        result = check_username_availability(username, user_id)
        
        return jsonify(result), 200
    
    except Exception as e:
        logger.error(f"Error checking username availability: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@username_bp.route('/suggest', methods=['POST'])
def suggest_usernames():
    """
    Get username suggestions
    
    Request:
        {
            "base": "flowauxi"
        }
    
    Response:
        {
            "suggestions": ["flowauxi-1", "flowauxi-2", ...]
        }
    """
    try:
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized"
            }), 401
        
        data = request.get_json()
        base = data.get('base', '').strip()
        
        if not base:
            return jsonify({
                "success": False,
                "error": "Base username is required"
            }), 400
        
        suggestions = generate_username_suggestions(base, count=5)
        
        return jsonify({
            "success": True,
            "suggestions": suggestions
        }), 200
    
    except Exception as e:
        logger.error(f"Error generating username suggestions: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@username_bp.route('/claim', methods=['POST'])
def claim_username():
    """
    Claim a username (sets to 'pending' status)
    
    Request:
        {
            "username": "flowauxi"
        }
    
    Response:
        {
            "success": true,
            "username": "flowauxi",
            "status": "pending",
            "message": "Username claimed. Please confirm to activate."
        }
    
    Enforces 1-change-ever policy
    """
    try:
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized"
            }), 401
        
        data = request.get_json()
        username = data.get('username', '').strip()
        
        if not username:
            return jsonify({
                "success": False,
                "error": "Username is required"
            }), 400
        
        # Get user's UUID from firebase_uid
        db = get_supabase_client()
        user_result = db.table('users').select('id').eq(
            'firebase_uid', user_id
        ).limit(1).execute()
        
        if not user_result.data:
            return jsonify({
                "success": False,
                "error": "User not found"
            }), 404
        
        user_uuid = user_result.data[0]['id']
        
        # Call database function to claim username
        result = db.rpc('claim_username', {
            'p_user_id': user_uuid,
            'p_username': username
        }).execute()
        
        response_data = result.data if result.data else {}
        
        if not response_data.get('success'):
            return jsonify(response_data), 400
        
        return jsonify({
            "success": True,
            "username": username,
            "status": "pending",
            "message": "Username claimed. Please confirm to activate."
        }), 200
    
    except Exception as e:
        logger.error(f"Error claiming username: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@username_bp.route('/confirm', methods=['POST'])
def confirm_username():
    """
    Confirm pending username (activates it)
    
    Response:
        {
            "success": true,
            "username": "flowauxi",
            "status": "active",
            "message": "Username activated successfully"
        }
    """
    try:
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized"
            }), 401
        
        # Get user's UUID
        db = get_supabase_client()
        user_result = db.table('users').select('id, username').eq(
            'firebase_uid', user_id
        ).limit(1).execute()
        
        if not user_result.data:
            return jsonify({
                "success": False,
                "error": "User not found"
            }), 404
        
        user_uuid = user_result.data[0]['id']
        old_username = user_result.data[0].get('username')
        
        # Call database function to confirm username
        result = db.rpc('confirm_username', {
            'p_user_id': user_uuid
        }).execute()
        
        response_data = result.data if result.data else {}
        
        if not response_data.get('success'):
            return jsonify(response_data), 400
        
        # Invalidate cache (if username changed)
        invalidate_username_cache(user_id, old_username)
        
        return jsonify({
            "success": True,
            "username": response_data.get('username'),
            "status": "active",
            "message": "Username activated successfully"
        }), 200
    
    except Exception as e:
        logger.error(f"Error confirming username: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@username_bp.route('/current', methods=['GET'])
def get_current_username():
    """
    Get current user's username status
    
    Response:
        {
            "success": true,
            "username": "flowauxi",
            "status": "active",
            "changeCount": 0,
            "canChange": true
        }
    """
    try:
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized"
            }), 401
        
        db = get_supabase_client()
        result = db.table('users').select(
            'username, username_status, username_change_count'
        ).eq('firebase_uid', user_id).limit(1).execute()
        
        if not result.data:
            return jsonify({
                "success": False,
                "error": "User not found"
            }), 404
        
        user_data = result.data[0]
        change_count = user_data.get('username_change_count', 0)
        
        return jsonify({
            "success": True,
            "username": user_data.get('username'),
            "status": user_data.get('username_status'),
            "changeCount": change_count,
            "canChange": change_count < 1  # 1-change-ever policy
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting current username: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@username_bp.route('/reserved', methods=['GET'])
def get_reserved_usernames():
    """
    Get list of reserved usernames
    
    Response:
        {
            "reserved": ["admin", "api", "support", ...]
        }
    """
    try:
        db = get_supabase_client()
        result = db.table('reserved_usernames').select(
            'username_lower'
        ).order('username_lower').execute()
        
        reserved_list = [row['username_lower'] for row in (result.data or [])]
        
        return jsonify({
            "success": True,
            "reserved": reserved_list
        }), 200
    
    except Exception as e:
        logger.error(f"Error fetching reserved usernames: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500
