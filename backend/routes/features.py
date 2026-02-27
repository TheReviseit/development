"""
Feature Gate API Routes
========================
REST endpoints for feature access checks and usage reporting.

Endpoints:
    GET  /api/features/check    — Check feature access (returns PolicyDecision)
    GET  /api/features/usage    — Get all usage counters for user+domain
    POST /api/features/flags    — Admin: toggle feature flags

All endpoints require Firebase auth via Authorization header.
Domain is resolved from request.host via domain_middleware.
"""

import logging
from flask import Blueprint, request, jsonify, g

logger = logging.getLogger('reviseit.features')

features_bp = Blueprint('features', __name__, url_prefix='/api/features')


# =============================================================================
# AUTH HELPER
# =============================================================================

def _get_user_id():
    """Extract user_id from Flask context (set by auth middleware)."""
    return getattr(g, 'user_id', None)


def _get_domain():
    """Extract product_domain from Flask context (set by domain middleware)."""
    return getattr(g, 'product_domain', None)


def _require_identity():
    """Validate user_id and domain are present. Returns error tuple or None."""
    user_id = _get_user_id()
    domain = _get_domain()

    if not user_id:
        return jsonify({
            "error": "Authentication required",
            "code": "AUTH_REQUIRED",
        }), 401

    if not domain:
        return jsonify({
            "error": "Domain could not be resolved",
            "code": "DOMAIN_REQUIRED",
        }), 400

    return None


# =============================================================================
# GET /api/features/check — Check feature access
# =============================================================================

@features_bp.route('/check', methods=['GET'])
def check_feature():
    """
    Check if the authenticated user can access a feature.

    Query params:
        feature (required): Feature key to check (e.g., "create_product")
        increment (optional): "true" to atomically increment usage (default: "false")

    Headers:
        Authorization: Bearer <firebase_token>
        X-Idempotency-Key: <optional key for idempotent increments>

    Response 200:
        {
            "allowed": true,
            "hard_limit": 500,
            "soft_limit": 400,
            "used": 123,
            "remaining": 377,
            "soft_limit_exceeded": false,
            "upgrade_required": false,
            "denial_reason": null,
            "feature_key": "create_product"
        }
    """
    # Validate identity
    error = _require_identity()
    if error:
        return error

    user_id = str(_get_user_id())
    domain = str(_get_domain())

    # Get feature key from query params
    feature_key = request.args.get('feature', '').strip()
    if not feature_key:
        return jsonify({
            "error": "Missing 'feature' query parameter",
            "code": "MISSING_FEATURE",
        }), 400

    # Should we increment?
    should_increment = request.args.get('increment', 'false').lower() == 'true'

    # Get engine
    from services.feature_gate_engine import get_feature_gate_engine
    engine = get_feature_gate_engine()

    if should_increment:
        idempotency_key = request.headers.get('X-Idempotency-Key')
        decision = engine.check_and_increment(
            user_id=user_id,
            domain=domain,
            feature_key=feature_key,
            idempotency_key=idempotency_key,
        )
    else:
        decision = engine.check_feature_access(
            user_id=user_id,
            domain=domain,
            feature_key=feature_key,
        )

    return jsonify(decision.to_dict()), 200


# =============================================================================
# GET /api/features/usage — Get all usage counters
# =============================================================================

@features_bp.route('/usage', methods=['GET'])
def get_usage():
    """
    Get all usage counters for the authenticated user on the current domain.

    Response 200:
        {
            "counters": [
                {
                    "feature_key": "create_product",
                    "current_value": 123,
                    "reset_at": "2026-03-14T00:00:00Z",
                    "period_start": "2026-02-14T00:00:00Z"
                },
                ...
            ],
            "domain": "shop",
            "user_id": "..."
        }
    """
    # Validate identity
    error = _require_identity()
    if error:
        return error

    user_id = str(_get_user_id())
    domain = str(_get_domain())

    from services.feature_gate_engine import get_feature_gate_engine
    engine = get_feature_gate_engine()

    counters = engine.get_usage_summary(user_id, domain)

    return jsonify({
        "counters": counters,
        "domain": domain,
        "user_id": user_id,
    }), 200


# =============================================================================
# POST /api/features/flags — Admin: toggle feature flags
# =============================================================================

@features_bp.route('/flags', methods=['POST'])
def toggle_feature_flag():
    """
    Admin endpoint: toggle a global feature flag.

    Request body:
        {
            "feature_key": "create_product",
            "is_enabled": false
        }

    Requires admin role (service_role JWT or admin check).
    Triggers active cache invalidation.
    """
    # Validate identity
    error = _require_identity()
    if error:
        return error

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    feature_key = data.get('feature_key', '').strip()
    is_enabled = data.get('is_enabled')

    if not feature_key:
        return jsonify({"error": "Missing 'feature_key'"}), 400

    if is_enabled is None:
        return jsonify({"error": "Missing 'is_enabled'"}), 400

    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()

        # Get old value for audit
        old_result = supabase.table('feature_flags').select(
            'is_enabled_globally'
        ).eq('feature_key', feature_key).limit(1).execute()

        old_value = old_result.data[0]['is_enabled_globally'] if old_result.data else None

        # Update flag
        supabase.table('feature_flags').upsert({
            'feature_key': feature_key,
            'is_enabled_globally': bool(is_enabled),
        }).execute()

        # Active cache invalidation
        from services.feature_gate_engine import get_feature_gate_engine
        engine = get_feature_gate_engine()
        engine.invalidate_feature_flags_cache()

        # Audit trail
        try:
            from audit_logger import AuditLogger
            audit = AuditLogger(supabase)
            audit.log_event(
                event_type="feature_flag_toggled",
                user_id=str(_get_user_id()),
                metadata={
                    "feature_key": feature_key,
                    "old_value": old_value,
                    "new_value": bool(is_enabled),
                },
            )
        except Exception as e:
            logger.warning(f"Audit log failed for flag toggle: {e}")

        logger.info(
            f"🏁 Feature flag toggled: {feature_key} = {is_enabled} "
            f"(was: {old_value})"
        )

        return jsonify({
            "success": True,
            "feature_key": feature_key,
            "is_enabled": bool(is_enabled),
            "old_value": old_value,
        }), 200

    except Exception as e:
        logger.error(f"Feature flag toggle error: {e}", exc_info=True)
        return jsonify({"error": "Failed to toggle feature flag"}), 500
