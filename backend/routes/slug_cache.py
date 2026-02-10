"""
Slug Cache Invalidation Endpoint (INTERNAL ONLY)

Security: This endpoint MUST NOT be publicly accessible.
- Requires X-Internal-API-Key header
- Only callable from trusted frontend API routes
- Logs unauthorized access attempts

Purpose: Invalidate Redis cache when business name/slug changes
"""

from flask import Blueprint, request, jsonify
import os
import logging
from utils.slug_resolver import invalidate_slug_cache

logger = logging.getLogger(__name__)
slug_cache_bp = Blueprint('slug_cache', __name__)

# Internal API key from environment (NEVER expose to client)
INTERNAL_API_KEY = os.getenv('INTERNAL_API_KEY')

if not INTERNAL_API_KEY:
    logger.error("❌ CRITICAL: INTERNAL_API_KEY not set in environment!")
    raise ValueError("INTERNAL_API_KEY required for internal endpoints")


@slug_cache_bp.route('/api/invalidate-slug-cache', methods=['POST'])
def invalidate_cache():
    """
    🔒 INTERNAL ONLY - Invalidate slug cache after business name change
    
    Headers:
        X-Internal-API-Key: Secret key (INTERNAL_API_KEY env var)
    
    Body:
        {
            "user_id": "firebase-uid"
        }
    
    Returns:
        200: { "success": true }
        401: { "error": "Unauthorized" }
        400: { "error": "user_id required" }
        500: { "error": "Cache invalidation failed" }
    """
    
    # ✅ SECURITY: Verify internal API key
    api_key = request.headers.get('X-Internal-API-Key')
    
    if not api_key or api_key != INTERNAL_API_KEY:
        logger.warning(
            f"❌ Unauthorized cache invalidation attempt from {request.remote_addr} "
            f"(User-Agent: {request.headers.get('User-Agent', 'unknown')})"
        )
        return jsonify({"error": "Unauthorized"}), 401
    
    # Validate request data
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400
    
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    # ✅ REFINED: Invalidate by user_id only (no old_slug needed)
    # Cache invalidation clears all slug entries for this user
    try:
        invalidate_slug_cache(user_id, old_slug=None)
        logger.info(f"✅ Slug cache invalidated for user {user_id}")
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error(f"❌ Cache invalidation failed for user {user_id}: {e}")
        return jsonify({"error": "Cache invalidation failed"}), 500
