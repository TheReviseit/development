"""
Trial Guard Middleware — Shop Domain Access Control
====================================================

Intercepts requests and checks trial entitlement before allowing access.

Architecture:
    Request → TrialGuard → FeatureGateEngine → Route Handler

Features:
    - Check trial status before route access
    - Block expired trials with upsell redirect
    - Show days remaining for active trials
    - Support for both API and page redirects

Usage:
    @trial_guard(domain='shop')
    def my_route():
        ...

    Or with explicit check:
    if not await check_trial_access(user_id, org_id, 'shop'):
        return redirect_to_upgrade()
"""

import logging
from functools import wraps
from typing import Optional, Dict, Any, Callable

from flask import request, g, jsonify, redirect, url_for

logger = logging.getLogger('reviseit.trial_guard')


# =============================================================================
# ACCESS LEVELS
# =============================================================================

class AccessLevel(str):
    FULL = 'full'       # Active trial, full access
    RESTRICTED = 'restricted'  # Trial expired, limited access
    NONE = 'none'       # No trial at all


# =============================================================================
# TRIAL GUARD
# =============================================================================

def get_trial_guard():
    """Get singleton TrialGuard instance."""
    from services.trial_engine import get_trial_engine
    return get_trial_engine()


async def check_trial_access(
    user_id: str,
    org_id: str,
    domain: str = 'shop',
) -> Dict[str, Any]:
    """
    Check trial access for a user.

    Returns dict with:
    - has_access: bool
    - access_level: 'full' | 'restricted' | 'none'
    - trial_status: Optional[str]
    - days_remaining: Optional[int]
    - plan_slug: Optional[str]
    - trial_id: Optional[str]

    This is the PRIMARY method for checking trial entitlement.
    Used by middleware, guards, and route handlers.
    """
    engine = get_trial_guard()
    return await engine.check_entitlement(
        user_id=user_id,
        org_id=org_id,
        domain=domain,
    )


def require_trial_access(domain: str = 'shop'):
    """
    Decorator to require active trial for route access.

    Usage:
        @require_trial_access(domain='shop')
        def my_route():
            ...

    Returns 403 with upgrade prompt if trial is not active.
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        async def decorated_function(*args, **kwargs):
            # Get user_id and org_id from request context
            user_id = getattr(g, 'user_id', None)
            org_id = getattr(g, 'org_id', None)

            if not user_id or not org_id:
                # No auth context - let route handle auth
                return f(*args, **kwargs)

            # Check trial access
            entitlement = await check_trial_access(user_id, org_id, domain)

            if not entitlement['has_trial_access']:
                # Return 402 Payment Required with showPaywall flag
                # CRITICAL: Never redirect — frontend shows paywall modal
                return jsonify({
                    'success': False,
                    'error': 'SUBSCRIPTION_REQUIRED',
                    'showPaywall': True,
                    'reason': 'trial_expired',
                    'message': 'Active trial required for this feature',
                    'trial_status': entitlement['trial_status'],
                    'upgradeUrl': '/payment?reason=trial_expired',
                }), 402

            # Inject trial context into request
            g.trial_access = entitlement
            g.trial_id = entitlement.get('trial_id')
            g.trial_days_remaining = entitlement.get('days_remaining')
            g.trial_plan_slug = entitlement.get('plan_slug')

            return f(*args, **kwargs)

        return decorated_function
    return decorator


def require_active_trial(domain: str = 'shop'):
    """
    Decorator that requires active (non-expired) trial.

    Unlike require_trial_access, this blocks access even during
    the expiring_soon grace period.

    Usage:
        @require_active_trial(domain='shop')
        def my_route():
            ...
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        async def decorated_function(*args, **kwargs):
            user_id = getattr(g, 'user_id', None)
            org_id = getattr(g, 'org_id', None)

            if not user_id or not org_id:
                return f(*args, **kwargs)

            entitlement = await check_trial_access(user_id, org_id, domain)

            # Block if trial is expired or doesn't exist
            if entitlement['access_level'] != AccessLevel.FULL:
                # Return 402 Payment Required with showPaywall flag
                # CRITICAL: Never redirect — frontend shows paywall modal
                return jsonify({
                    'success': False,
                    'error': 'SUBSCRIPTION_REQUIRED',
                    'showPaywall': True,
                    'reason': 'trial_expired',
                    'message': 'Your free trial has ended. Upgrade to continue.',
                    'trial_status': entitlement['trial_status'],
                    'days_remaining': entitlement.get('days_remaining', 0),
                    'upgradeUrl': '/payment?reason=trial_expired',
                }), 402

            g.trial_access = entitlement
            return f(*args, **kwargs)

        return decorated_function
    return decorator


def inject_trial_context(domain: str = 'shop'):
    """
    Decorator that injects trial context without blocking.

    Use this when you need trial info but don't want to block access.

    Usage:
        @inject_trial_context(domain='shop')
        def my_route():
            trial_info = g.trial_access
            days = g.trial_days_remaining
            ...
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        async def decorated_function(*args, **kwargs):
            user_id = getattr(g, 'user_id', None)
            org_id = getattr(g, 'org_id', None)

            if user_id and org_id:
                entitlement = await check_trial_access(user_id, org_id, domain)
                g.trial_access = entitlement
                g.trial_id = entitlement.get('trial_id')
                g.trial_days_remaining = entitlement.get('days_remaining')
                g.trial_plan_slug = entitlement.get('plan_slug')
            else:
                g.trial_access = {
                    'has_trial_access': False,
                    'access_level': AccessLevel.NONE,
                    'trial_status': None,
                    'days_remaining': None,
                    'plan_slug': None,
                }
                g.trial_id = None
                g.trial_days_remaining = None
                g.trial_plan_slug = None

            return f(*args, **kwargs)

        return decorated_function
    return decorator


# =============================================================================
# FRONTEND HELPERS (for pages that need trial info)
# =============================================================================

def get_trial_status_for_frontend(
    user_id: str,
    org_id: str,
    domain: str = 'shop',
) -> Dict[str, Any]:
    """
    Get trial status formatted for frontend consumption.

    Returns:
    - status: 'active' | 'expiring_soon' | 'expired' | 'none'
    - days_remaining: number or null
    - show_banner: bool
    - banner_type: 'info' | 'warning' | 'danger' | null
    - banner_message: string or null
    - cta_text: string
    - cta_url: string
    """
    import asyncio

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    entitlement = loop.run_until_complete(
        check_trial_access(user_id, org_id, domain)
    )

    status = entitlement.get('trial_status', 'none')
    days_remaining = entitlement.get('days_remaining')

    # Determine banner
    show_banner = False
    banner_type = None
    banner_message = None

    if status == 'active':
        if days_remaining is not None and days_remaining <= 3:
            show_banner = True
            banner_type = 'warning'
            banner_message = f"Your trial expires in {days_remaining} day{'s' if days_remaining != 1 else ''}"
        else:
            show_banner = True
            banner_type = 'info'
            banner_message = f"You have {days_remaining} day{'s' if days_remaining != 1 else ''} remaining on your trial"

    elif status == 'expiring_soon':
        show_banner = True
        banner_type = 'warning'
        banner_message = "Your trial expires soon! Upgrade now to keep your data."

    elif status == 'expired':
        show_banner = True
        banner_type = 'danger'
        banner_message = "Your trial has ended. Upgrade to continue using Flowauxi."

    # CTA
    cta_text = "Upgrade Now"
    cta_url = f"/upgrade?domain={domain}"

    return {
        'status': status,
        'days_remaining': days_remaining,
        'has_access': entitlement.get('has_trial_access', False),
        'access_level': entitlement.get('access_level', AccessLevel.NONE),
        'show_banner': show_banner,
        'banner_type': banner_type,
        'banner_message': banner_message,
        'cta_text': cta_text,
        'cta_url': cta_url,
        'plan_slug': entitlement.get('plan_slug'),
    }
