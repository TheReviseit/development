"""
Admin API for Plan Overrides
==============================
Customer success tool for granting per-tenant feature boosts.

Use Cases:
  - Grant enterprise trial (boost product limit 10 → 100)
  - Temporary feature access (with expiration)
  - Custom contracts (permanent overrides)

Authentication: Requires admin role
Authorization: Admin-only endpoints

Usage Example:
    curl -X POST /admin/plan-overrides \
      -H "Authorization: Bearer <admin_token>" \
      -d '{
        "user_id": "firebase_uid_123",
        "domain": "shop",
        "feature_key": "create_product",
        "override_hard_limit": 100,
        "reason": "Support ticket #1234 - enterprise trial"
      }'
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime, timedelta
from typing import Optional
import logging

# Import Supabase client (adjust import path as needed)
try:
    from app import supabase
except ImportError:
    # Fallback for standalone testing
    from os import getenv
    from supabase import create_client
    supabase = create_client(getenv('SUPABASE_URL'), getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Import feature gate engine for cache invalidation
try:
    from services.feature_gate_engine import get_feature_gate_engine
except ImportError:
    get_feature_gate_engine = lambda: None

logger = logging.getLogger('reviseit.admin_features')

# Create blueprint
admin_bp = Blueprint('admin_features', __name__, url_prefix='/admin')

# =============================================================================
# Authentication Decorator (replace with your actual admin auth)
# =============================================================================

def require_admin():
    """
    Decorator to require admin authentication.

    TODO: Replace with your actual admin authentication logic.
    Example implementations:
      - Check JWT role claim
      - Verify admin API key
      - Check Supabase auth role
    """
    def decorator(f):
        def wrapper(*args, **kwargs):
            # TODO: Implement actual admin auth check
            # Example:
            # if not g.user or g.user.get('role') != 'admin':
            #     return jsonify({'error': 'Admin access required'}), 403

            # For now, check for admin header (INSECURE - replace in production!)
            if request.headers.get('X-Admin-Key') != 'REPLACE_ME_WITH_SECURE_AUTH':
                return jsonify({'error': 'Admin access required', 'hint': 'Implement require_admin() auth'}), 403

            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator


# =============================================================================
# Plan Override Endpoints
# =============================================================================

@admin_bp.route('/plan-overrides', methods=['POST'])
@require_admin()
def create_plan_override():
    """
    Create or update a plan override for a specific user.

    Request Body:
        {
            "user_id": "firebase_uid_123",  // Required
            "domain": "shop",                // Required
            "feature_key": "create_product", // Required
            "override_hard_limit": 100,      // Optional: numeric limit
            "override_is_unlimited": false,  // Optional: unlimited flag
            "override_enabled": true,        // Optional: boolean override
            "reason": "Support ticket #1234", // Required: audit trail
            "expires_at": "2026-03-01T00:00:00Z"  // Optional: expiration
        }

    Returns:
        201: Override created
        400: Validation error
        500: Server error
    """
    data = request.json

    # ========================================
    # Validation
    # ========================================
    required_fields = ['user_id', 'domain', 'feature_key', 'reason']
    missing_fields = [f for f in required_fields if not data.get(f)]

    if missing_fields:
        return jsonify({
            'error': 'Missing required fields',
            'missing': missing_fields,
        }), 400

    # At least one override field must be set
    has_override = any([
        data.get('override_hard_limit') is not None,
        data.get('override_is_unlimited') is True,
        data.get('override_enabled') is not None,
    ])

    if not has_override:
        return jsonify({
            'error': 'At least one override field must be set',
            'hint': 'Provide override_hard_limit, override_is_unlimited, or override_enabled',
        }), 400

    # ========================================
    # Insert override
    # ========================================
    try:
        override_data = {
            'user_id': data['user_id'],
            'domain': data['domain'],
            'feature_key': data['feature_key'],
            'override_hard_limit': data.get('override_hard_limit'),
            'override_is_unlimited': data.get('override_is_unlimited', False),
            'override_enabled': data.get('override_enabled'),
            'reason': data['reason'],
            'expires_at': data.get('expires_at'),
            'created_by': g.get('user_id', 'admin'),  # Track who created it
        }

        result = supabase.table('plan_overrides').upsert(override_data).execute()

        # Invalidate cache
        engine = get_feature_gate_engine()
        if engine:
            try:
                engine.invalidate_override_cache(data['user_id'], data['domain'], data['feature_key'])
            except Exception as e:
                logger.warning(f"Failed to invalidate cache: {e}")

        return jsonify({
            'success': True,
            'override': result.data[0] if result.data else override_data,
            'message': 'Plan override created successfully',
        }), 201

    except Exception as e:
        logger.error(f"Failed to create plan override: {e}")
        return jsonify({
            'error': 'Failed to create override',
            'details': str(e),
        }), 500


@admin_bp.route('/plan-overrides', methods=['GET'])
@require_admin()
def list_plan_overrides():
    """
    List all plan overrides (optionally filtered by user_id).

    Query Parameters:
        user_id (optional): Filter by user ID
        domain (optional): Filter by domain
        active_only (optional): Only non-expired overrides

    Returns:
        200: List of overrides
    """
    try:
        query = supabase.table('plan_overrides').select('*')

        # Apply filters
        user_id = request.args.get('user_id')
        if user_id:
            query = query.eq('user_id', user_id)

        domain = request.args.get('domain')
        if domain:
            query = query.eq('domain', domain)

        # Execute query
        result = query.execute()
        overrides = result.data or []

        # Filter active only
        if request.args.get('active_only') == 'true':
            now = datetime.utcnow()
            overrides = [
                o for o in overrides
                if not o.get('expires_at') or datetime.fromisoformat(o['expires_at'].replace('Z', '')) > now
            ]

        return jsonify({
            'overrides': overrides,
            'total': len(overrides),
        }), 200

    except Exception as e:
        logger.error(f"Failed to list overrides: {e}")
        return jsonify({
            'error': 'Failed to list overrides',
            'details': str(e),
        }), 500


@admin_bp.route('/plan-overrides/<override_id>', methods=['DELETE'])
@require_admin()
def delete_plan_override(override_id):
    """
    Delete a plan override.

    Returns:
        200: Override deleted
        404: Override not found
        500: Server error
    """
    try:
        # Get override details for cache invalidation
        override_result = supabase.table('plan_overrides').select('*').eq('id', override_id).single().execute()

        if not override_result.data:
            return jsonify({'error': 'Override not found'}), 404

        override = override_result.data

        # Delete override
        supabase.table('plan_overrides').delete().eq('id', override_id).execute()

        # Invalidate cache
        engine = get_feature_gate_engine()
        if engine:
            try:
                engine.invalidate_override_cache(
                    override['user_id'],
                    override['domain'],
                    override['feature_key']
                )
            except Exception as e:
                logger.warning(f"Failed to invalidate cache: {e}")

        return jsonify({
            'success': True,
            'message': 'Override deleted successfully',
        }), 200

    except Exception as e:
        logger.error(f"Failed to delete override: {e}")
        return jsonify({
            'error': 'Failed to delete override',
            'details': str(e),
        }), 500


# =============================================================================
# Helper Endpoints
# =============================================================================

@admin_bp.route('/plan-features/<plan_id>/<feature_key>', methods=['PATCH'])
@require_admin()
def update_plan_feature(plan_id, feature_key):
    """
    Update a plan feature limit (admin tool for testing).

    WARNING: This modifies the live plan_features table.
    Use with caution. Consider using plan_overrides for individual users instead.

    Request Body:
        {
            "hard_limit": 20,    // Optional
            "soft_limit": 16,    // Optional
            "is_unlimited": false // Optional
        }

    Returns:
        200: Feature updated + cache invalidated
        400: Validation error
        500: Server error
    """
    data = request.json

    try:
        # Update plan_features
        update_data = {}
        if 'hard_limit' in data:
            update_data['hard_limit'] = data['hard_limit']
        if 'soft_limit' in data:
            update_data['soft_limit'] = data['soft_limit']
        if 'is_unlimited' in data:
            update_data['is_unlimited'] = data['is_unlimited']

        if not update_data:
            return jsonify({'error': 'No fields to update'}), 400

        result = supabase.table('plan_features').update(update_data).match({
            'plan_id': plan_id,
            'feature_key': feature_key,
        }).execute()

        # Auto-invalidate cache (versioned cache keys)
        engine = get_feature_gate_engine()
        if engine and hasattr(engine, '_increment_cache_version'):
            try:
                engine._increment_cache_version('cache_version:plan_features')
            except Exception as e:
                logger.warning(f"Failed to invalidate cache: {e}")

        return jsonify({
            'success': True,
            'updated': result.data,
            'invalidated_cache': True,
        }), 200

    except Exception as e:
        logger.error(f"Failed to update plan feature: {e}")
        return jsonify({
            'error': 'Failed to update feature',
            'details': str(e),
        }), 500


# =============================================================================
# Register Blueprint
# =============================================================================
# Add to app.py:
#   from routes.admin_features import admin_bp
#   app.register_blueprint(admin_bp)
