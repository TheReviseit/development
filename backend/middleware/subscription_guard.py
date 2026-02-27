"""
Subscription Guard Middleware
Entitlement-based access control for Console API routes

ARCHITECTURE:
  Access decisions are made by FeatureGateEngine (DB-backed).
  No string-based entitlement_level checks.
  The subscription record provides plan_slug + billing_status.
  FeatureGateEngine resolves plan_slug → plan_features → policy decision.

Decorators:
  @require_live_entitlement()  — Live API access (delegates to engine)
  @require_any_subscription()  — Basic subscription presence check
  @inject_subscription()       — Soft-gate (inject sub, don't block)

Guards:
  Feature access is determined by plan_features DB table, NOT by
  entitlement_level strings. Legacy entitlement_level column is ignored.
"""

import logging
from functools import wraps
from typing import Callable, Optional, Dict, Any

from flask import request, g, jsonify

logger = logging.getLogger('console.subscription.guard')


# =============================================================================
# SUBSCRIPTION FETCHING
# =============================================================================

def get_org_subscription(org_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch subscription record for an organization.

    Returns:
        Subscription dict or None if no subscription exists
    """
    if not org_id:
        return None

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        result = db.table('otp_console_subscriptions').select(
            'id, org_id, plan_name, billing_status, '
            'current_period_start, current_period_end, grace_period_end, '
            'razorpay_subscription_id, created_at, updated_at'
        ).eq('org_id', org_id).single().execute()

        return result.data

    except Exception as e:
        logger.error(f"Error fetching subscription for org {org_id}: {e}")
        return None


def get_or_create_subscription(org_id: str, plan_name: str = 'starter') -> Dict[str, Any]:
    """
    Get existing subscription or create a new one in 'created' state.
    Used during signup flow.
    """
    existing = get_org_subscription(org_id)
    if existing:
        return existing

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        result = db.table('otp_console_subscriptions').insert({
            'org_id': org_id,
            'plan_name': plan_name,
            'billing_status': 'created',
        }).execute()

        return result.data[0] if result.data else None

    except Exception as e:
        logger.error(f"Error creating subscription for org {org_id}: {e}")
        return None


# =============================================================================
# ENTITLEMENT CHECKS — Delegated to FeatureGateEngine
# =============================================================================

def _check_feature_via_engine(user_id: str, domain: str, feature_key: str) -> bool:
    """
    Check feature access through FeatureGateEngine.
    FAIL CLOSED: if engine unavailable, access is denied.
    """
    try:
        from services.feature_gate_engine import get_feature_gate_engine
        engine = get_feature_gate_engine()
        decision = engine.check_feature_access(
            user_id=str(user_id),
            domain=domain,
            feature_key=feature_key,
        )
        return decision.allowed
    except Exception as e:
        logger.error(f"❌ FeatureGateEngine unavailable for {feature_key}: {e}")
        return False  # FAIL CLOSED


def can_create_live_keys(subscription: Optional[Dict[str, Any]], user_id: Optional[str] = None) -> bool:
    """
    Check if subscription allows live key creation.

    Delegates to FeatureGateEngine for 'live_api_keys' feature check.
    Falls back to billing_status check if user_id not available (legacy path).
    """
    if not subscription:
        return False

    billing_status = subscription.get('billing_status', 'created')

    # Blocked billing states → deny immediately
    if billing_status in ('expired', 'cancelled', 'halted', 'paused', 'pending', 'created'):
        # Check grace period for cancelled/expired users
        grace_end = subscription.get('grace_period_end')
        if grace_end:
            from datetime import datetime
            try:
                grace_dt = datetime.fromisoformat(grace_end.replace('Z', '+00:00'))
                if datetime.now(grace_dt.tzinfo) < grace_dt:
                    return True  # Still in grace period
            except:
                pass
        return False

    # Active billing state — check feature via engine if user_id available
    if user_id:
        return _check_feature_via_engine(user_id, 'console', 'live_api_keys')

    # Legacy path: if billing is active/trialing/grace_period, allow
    return billing_status in ('active', 'trialing', 'grace_period', 'past_due', 'pending_upgrade', 'upgrade_failed')


def can_send_live_otps(subscription: Optional[Dict[str, Any]], user_id: Optional[str] = None) -> bool:
    """Check if subscription allows live OTP sending."""
    return can_create_live_keys(subscription, user_id)


# =============================================================================
# DECORATORS
# =============================================================================

def require_live_entitlement():
    """
    Decorator for routes requiring live API access.

    Use for:
    - Creating live API keys
    - Enabling live channels
    - Sending live OTPs

    Checks billing_status + FeatureGateEngine for 'live_api_keys'.
    Returns 402 Payment Required if not entitled.
    """
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            org_id = getattr(g, 'console_org_id', None)

            if not org_id:
                return jsonify({
                    'success': False,
                    'error': 'NO_ORG',
                    'message': 'Organization not found'
                }), 400

            # Fetch subscription
            sub = get_org_subscription(org_id)

            if not sub:
                logger.warning(f"No subscription found for org {org_id}")
                return jsonify({
                    'success': False,
                    'error': 'NO_SUBSCRIPTION',
                    'redirect': '/console/billing/select-plan',
                    'message': 'Please select a plan to continue'
                }), 402

            # Check entitlement via engine
            user_id = getattr(g, 'user_id', None)
            if not can_create_live_keys(sub, user_id):
                billing_status = sub.get('billing_status', 'unknown')
                plan_name = sub.get('plan_name', 'unknown')

                logger.info(
                    f"Live entitlement denied for org {org_id}: "
                    f"plan={plan_name}, status={billing_status}"
                )

                return jsonify({
                    'success': False,
                    'error': 'LIVE_ENTITLEMENT_REQUIRED',
                    'plan_name': plan_name,
                    'billing_status': billing_status,
                    'redirect': '/console/billing/select-plan',
                    'message': 'Upgrade to a paid plan to access live APIs',
                    'cta': {
                        'text': 'Upgrade Now',
                        'href': '/console/billing/select-plan'
                    }
                }), 402

            # Inject subscription into context
            g.console_subscription = sub
            return f(*args, **kwargs)

        return decorated_function
    return decorator


def require_any_subscription():
    """
    Decorator for routes requiring any subscription (including sandbox).

    Use for:
    - Accessing dashboard
    - Creating test keys
    - Viewing logs

    Returns 402 if no subscription exists at all.
    """
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            org_id = getattr(g, 'console_org_id', None)

            if not org_id:
                return jsonify({
                    'success': False,
                    'error': 'NO_ORG'
                }), 400

            sub = get_org_subscription(org_id)

            if not sub:
                return jsonify({
                    'success': False,
                    'error': 'NO_SUBSCRIPTION',
                    'redirect': '/console/billing/select-plan'
                }), 402

            g.console_subscription = sub
            return f(*args, **kwargs)

        return decorated_function
    return decorator


def inject_subscription():
    """
    Decorator that injects subscription into g without blocking.

    Use for soft-gated routes like dashboard where we want to show
    upgrade prompts but not block access.
    """
    def decorator(f: Callable):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            org_id = getattr(g, 'console_org_id', None)

            if org_id:
                g.console_subscription = get_org_subscription(org_id)
            else:
                g.console_subscription = None

            return f(*args, **kwargs)

        return decorated_function
    return decorator


# =============================================================================
# HELPER FOR API KEY CREATION
# =============================================================================

def validate_key_environment(requested_env: str, subscription: Optional[Dict[str, Any]], user_id: Optional[str] = None) -> tuple[bool, str]:
    """
    Validate if user can create a key of the requested environment.

    Args:
        requested_env: 'test' or 'live'
        subscription: User's subscription record
        user_id: User ID for FeatureGateEngine check

    Returns:
        (is_valid, error_message)
    """
    if requested_env == 'test':
        # Test keys always allowed with any subscription
        if subscription:
            return True, ""
        return False, "Subscription required to create API keys"

    if requested_env == 'live':
        # Live keys require live entitlement via engine
        if can_create_live_keys(subscription, user_id):
            return True, ""
        return False, "Upgrade to a paid plan to create live API keys"

    return False, f"Invalid environment: {requested_env}"
