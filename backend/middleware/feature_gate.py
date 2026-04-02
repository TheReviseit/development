"""
Feature Gate Middleware — Route Protection Decorators
=====================================================
Enterprise-grade feature gating for API routes.

CONTROLLED ROLLOUT:
    Set FEATURE_GATE_ENFORCEMENT env var to control behavior:
    - "soft"  → Log violations, allow request (observation period)
    - "hard"  → Log violations, block request (production enforcement)
    Default: "hard" (production enforcement)

FAIL BEHAVIOR:
    Cost-bearing features (require_limit) → FAIL CLOSED (503 on engine error)
    Boolean entitlements (require_feature) → FAIL OPEN (allow on engine error)

DECORATORS:
    @require_feature("custom_domain")    — Read-only check, fail-open
    @require_limit("product_limit")      — Check + increment, fail-closed
    @with_feature_gate(...)              — Low-level gate with full control

DECORATOR STACKING ORDER:
    @app.route('/api/products', methods=['POST'])
    @require_auth              # Step 1: auth → g.user_id
    @resolve_product_domain    # Step 2: domain → g.product_domain
    @require_limit("create_product")  # Step 3: feature gate (fail-closed)
    def create_product():
        ...  # Only executes if feature check passes

Returns 403 with PolicyDecision JSON on denial (hard mode).
Returns 503 on engine unavailability (fail-closed features).
Returns 200 with X-Feature-Gate-Violation header on denial (soft mode).
Passes X-Idempotency-Key header to the engine.
"""

import os
import functools
import logging
import time
from flask import request, jsonify, g

logger = logging.getLogger('reviseit.feature_gate.middleware')

# =============================================================================
# ENFORCEMENT MODE
# =============================================================================
# "soft" = log violations but ALLOW the request (for observation period)
# "hard" = log violations and BLOCK the request (production enforcement)
ENFORCEMENT_MODE = os.getenv('FEATURE_GATE_ENFORCEMENT', 'hard').lower()


def _get_enforcement_mode() -> str:
    """Get current enforcement mode. Re-reads env for hot-reload support."""
    return os.getenv('FEATURE_GATE_ENFORCEMENT', 'hard').lower()


def with_feature_gate(feature_key: str, increment: bool = True, fail_closed: bool = False):
    """
    Core decorator to protect API routes with feature gating.

    Args:
        feature_key: Feature identifier (e.g., 'create_product', 'bulk_messaging')
        increment: If True, atomically increment usage counter on access.
                   Set to False for read-only checks (e.g., checking entitlement).
        fail_closed: If True, return 503 when engine is unavailable.
                     MUST be True for cost-bearing features (AI, messaging, credits).
                     False allows fail-open for read-only entitlement checks.

    Returns:
        Decorated function that checks feature access before executing.

    Enforcement Modes:
        SOFT (default):
            - Logs entitlement_violation_detected as structured warning
            - Sets X-Feature-Gate-Violation response header
            - ALLOWS the request to proceed
            - Use this for 48-hour observation before flipping to hard

        HARD:
            - Logs entitlement_violation_blocked
            - Returns 403 with PolicyDecision JSON
            - BLOCKS the request

    Response on denial (403, hard mode only):
        {
            "error": "Feature not available on your current plan",
            "code": "FEATURE_GATE_DENIED",
            "decision": {
                "allowed": false,
                "denial_reason": "hard_limit_exceeded",
                "used": 500,
                "hard_limit": 500,
                "remaining": 0,
                "soft_limit_exceeded": true,
                "upgrade_required": true,
                "feature_key": "create_product"
            }
        }
    """
    def decorator(f):
        @functools.wraps(f)
        def decorated_function(*args, **kwargs):
            start_time = time.time()

            # Extract identity from Flask context (set by auth + domain middleware)
            user_id = getattr(g, 'user_id', None)
            domain = getattr(g, 'product_domain', None)

            if not user_id:
                return jsonify({
                    "error": "Authentication required",
                    "code": "AUTH_REQUIRED",
                }), 401

            if not domain:
                # Fallback: try to resolve from request host
                logger.warning(
                    f"⚠️ product_domain not set for feature gate check: "
                    f"feature={feature_key}, user={user_id}"
                )
                return jsonify({
                    "error": "Domain could not be resolved",
                    "code": "DOMAIN_REQUIRED",
                }), 400

            # Get feature gate engine (lazy import for safety)
            try:
                from services.feature_gate_engine import get_feature_gate_engine
                engine = get_feature_gate_engine()
            except Exception as e:
                logger.error(f"❌ FeatureGateEngine unavailable: {e}")
                if fail_closed:
                    # FAIL CLOSED: cost-bearing features must not proceed
                    return jsonify({
                        "error": "Entitlement check failed",
                        "code": "ENTITLEMENT_CHECK_UNAVAILABLE",
                    }), 503
                # FAIL OPEN: read-only entitlements allow through
                return f(*args, **kwargs)

            # Extract idempotency key from header
            idempotency_key = request.headers.get('X-Idempotency-Key')

            # Check feature access
            try:
                if increment:
                    decision = engine.check_and_increment(
                        user_id=str(user_id),
                        domain=str(domain),
                        feature_key=feature_key,
                        idempotency_key=idempotency_key,
                    )
                else:
                    decision = engine.check_feature_access(
                        user_id=str(user_id),
                        domain=str(domain),
                        feature_key=feature_key,
                    )
            except Exception as e:
                logger.error(
                    f"❌ Feature gate check failed: feature={feature_key}, "
                    f"user={user_id}, domain={domain}, error={e}",
                    exc_info=True
                )
                if fail_closed:
                    # FAIL CLOSED: cost-bearing features must not proceed
                    return jsonify({
                        "error": "Entitlement check failed",
                        "code": "ENTITLEMENT_CHECK_FAILED",
                    }), 503
                # FAIL OPEN: read-only entitlements allow through
                return f(*args, **kwargs)

            elapsed_ms = (time.time() - start_time) * 1000

            # Store decision in Flask context for route handler access
            g.feature_decision = decision

            # Upgrade pressure signal: monetization analytics
            if decision.allowed and decision.soft_limit_exceeded:
                logger.info(
                    "📈 upgrade_pressure_signal",
                    extra={
                        "event": "upgrade_pressure_signal",
                        "user_id": str(user_id),
                        "domain": str(domain),
                        "feature_key": feature_key,
                        "used": decision.used,
                        "hard_limit": decision.hard_limit,
                        "soft_limit": decision.soft_limit,
                        "remaining": decision.remaining,
                        "endpoint": request.path,
                    },
                )

            if not decision.allowed:
                mode = _get_enforcement_mode()

                # Structured violation log (always emitted, regardless of mode)
                violation_data = {
                    "event": "entitlement_violation_detected",
                    "enforcement": mode,
                    "user_id": str(user_id),
                    "domain": str(domain),
                    "feature_key": feature_key,
                    "denial_reason": decision.denial_reason,
                    "plan_slug": getattr(decision, 'plan_slug', None),
                    "used": decision.used,
                    "hard_limit": decision.hard_limit,
                    "soft_limit_exceeded": decision.soft_limit_exceeded,
                    "upgrade_required": decision.upgrade_required,
                    "latency_ms": round(elapsed_ms, 2),
                    "endpoint": request.path,
                    "method": request.method,
                }

                if mode == 'hard':
                    # HARD MODE: Block the request
                    logger.warning(
                        f"🚫 entitlement_violation_blocked | "
                        f"feature={feature_key} domain={domain} "
                        f"denial_reason={decision.denial_reason} "
                        f"endpoint={request.path} "
                        f"plan_slug={getattr(decision, 'plan_slug', '?')}",
                        extra=violation_data,
                    )
                    return jsonify({
                        "error": "Feature not available on your current plan",
                        "code": "FEATURE_GATE_DENIED",
                        "decision": decision.to_dict(),
                    }), 403
                else:
                    # SOFT MODE: Log violation but ALLOW the request
                    logger.warning(
                        "⚠️ entitlement_violation_detected (soft mode — not blocking)",
                        extra=violation_data,
                    )
                    # Set header so frontend can show upgrade nudge
                    response = f(*args, **kwargs)

                    # Handle both tuple and Response return types
                    if isinstance(response, tuple):
                        resp_obj = response[0]
                        status = response[1] if len(response) > 1 else 200
                        if hasattr(resp_obj, 'headers'):
                            resp_obj.headers['X-Feature-Gate-Violation'] = feature_key
                            resp_obj.headers['X-Feature-Gate-Denial-Reason'] = (
                                decision.denial_reason or 'unknown'
                            )
                        return response
                    elif hasattr(response, 'headers'):
                        response.headers['X-Feature-Gate-Violation'] = feature_key
                        response.headers['X-Feature-Gate-Denial-Reason'] = (
                            decision.denial_reason or 'unknown'
                        )
                    return response

            # Feature allowed — execute the route handler
            return f(*args, **kwargs)

        return decorated_function
    return decorator


# =============================================================================
# CONVENIENCE DECORATORS (Principal-Level API)
# =============================================================================

def require_feature(feature_key: str):
    """
    Entitlement check — does the user's plan include this feature?

    Read-only check. Does NOT increment any usage counter.
    FAIL-OPEN: if engine is unavailable, request proceeds.
    Use for boolean features like: custom_domain, white_label, webhooks.

    Usage:
        @app.route('/api/settings/domain', methods=['PUT'])
        @require_auth
        @require_feature("custom_domain")
        def update_custom_domain():
            ...  # Only runs if plan includes custom_domain
    """
    return with_feature_gate(feature_key, increment=False, fail_closed=False)


def require_limit(feature_key: str):
    """
    Limit enforcement — does the user have remaining quota for this feature?

    Performs BOTH:
    1. Entitlement check (is feature in plan?)
    2. Atomic usage increment (count + 1, respects hard/soft limits)

    FAIL-CLOSED: if engine is unavailable, returns 503.
    Cost-bearing features MUST NOT proceed without entitlement verification.
    Use for metered features like: create_product, bulk_messaging, ai_responses.

    Usage:
        @app.route('/api/products', methods=['POST'])
        @require_auth
        @require_limit("create_product")
        def create_product():
            ...  # Only runs if within product limit
    """
    return with_feature_gate(feature_key, increment=True, fail_closed=True)


def with_feature_check(feature_key: str):
    """
    Legacy alias for require_feature().
    Equivalent to @with_feature_gate(feature_key, increment=False).
    """
    return with_feature_gate(feature_key, increment=False, fail_closed=False)

