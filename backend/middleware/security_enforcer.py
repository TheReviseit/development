"""
Security Enforcer Middleware
Enterprise-grade, zero-trust access control pipeline.

Pipeline order (MANDATORY):
    Auth → Paid Plan → AuthZ → Billing State → Tenant → Usage

🔒 CORE RULE: require_paid_plan is the FIRST enforcement layer after auth.
             No OTP ever goes out without money involved.
"""

import logging
from functools import wraps
from typing import Callable, Optional, List

from flask import request, g, jsonify

logger = logging.getLogger('security.enforcer')


# =============================================================================
# ERROR RESPONSES (GENERIC - NO INFO LEAKS)
# =============================================================================

def _access_denied(code: str = "ACCESS_DENIED") -> tuple:
    """
    Return generic access denied response.
    Never expose internal reasons, file paths, or billing details.
    """
    return jsonify({
        "success": False,
        "error": code,
        "message": "Access denied"
    }), 403


def _unauthorized() -> tuple:
    """Return unauthorized response for missing auth."""
    return jsonify({
        "success": False,
        "error": "UNAUTHORIZED",
        "message": "Authentication required"
    }), 401


def _payment_required() -> tuple:
    """Return payment required response."""
    return jsonify({
        "success": False,
        "error": "PAYMENT_REQUIRED",
        "message": "Paid subscription required"
    }), 402


def _rate_limited(retry_after: int = 60) -> tuple:
    """Return rate limit response."""
    response = jsonify({
        "success": False,
        "error": "RATE_LIMITED",
        "message": "Rate limit exceeded"
    })
    response.headers['Retry-After'] = str(retry_after)
    return response, 429


def _usage_exceeded() -> tuple:
    """Return usage limit exceeded response."""
    return jsonify({
        "success": False,
        "error": "USAGE_LIMIT_EXCEEDED",
        "message": "Usage limit exceeded for current billing period"
    }), 403


# =============================================================================
# SECURITY DECORATORS
# =============================================================================

def require_authenticated(f: Callable) -> Callable:
    """
    Decorator: Require valid authentication.
    
    Checks for either:
    - API key authentication (g.otp_business set by otp_auth_middleware)
    - Console JWT authentication (g.console_user set by console_auth_middleware)
    
    Must be the FIRST decorator in the chain.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check for OTP API key auth
        if hasattr(g, 'otp_business') and g.otp_business:
            return f(*args, **kwargs)
        
        # Check for console JWT auth
        if hasattr(g, 'console_user') and g.console_user:
            return f(*args, **kwargs)
        
        # No valid authentication
        logger.warning(f"Unauthenticated request to {request.path}")
        return _unauthorized()
    
    return decorated_function


def require_paid_plan(f: Callable) -> Callable:
    """
    Decorator: Require ANY paid plan (STARTER, GROWTH, or ENTERPRISE).
    
    🔒 THIS IS THE CRITICAL ENFORCEMENT LAYER.
    No OTP execution without a paid subscription.
    
    Must be called AFTER @require_authenticated.
    Sets g.entitlement_ctx for downstream decorators.
    """
    @wraps(f)
    async def decorated_function(*args, **kwargs):
        from services.entitlement_service import get_entitlement_service
        
        try:
            # Get user/org context from auth
            user_id, org_id = _get_identity_from_context()
            
            if not user_id:
                return _unauthorized()
            
            # Fetch entitlements
            service = get_entitlement_service()
            ctx = await service.get_entitlements(user_id, org_id)
            
            # CRITICAL CHECK: Must have paid plan
            if not ctx.has_paid_plan:
                logger.info(f"Paid plan required: user={user_id}, org={org_id}")
                return _payment_required()
            
            # Inject context for downstream decorators
            g.entitlement_ctx = ctx
            
            return await f(*args, **kwargs)
            
        except Exception as e:
            logger.error(f"Error checking paid plan: {e}")
            return _access_denied()
    
    return decorated_function


def require_paid_plan_sync(f: Callable) -> Callable:
    """
    Synchronous version of require_paid_plan for non-async routes.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from services.entitlement_service import get_entitlement_service
        import asyncio
        
        try:
            # Get user/org context from auth
            user_id, org_id = _get_identity_from_context()
            
            if not user_id:
                return _unauthorized()
            
            # Fetch entitlements (run async in sync context)
            service = get_entitlement_service()
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                ctx = loop.run_until_complete(service.get_entitlements(user_id, org_id))
            finally:
                loop.close()
            
            # CRITICAL CHECK: Must have paid plan
            if not ctx.has_paid_plan:
                logger.info(f"Paid plan required: user={user_id}, org={org_id}")
                return _payment_required()
            
            # Inject context for downstream decorators
            g.entitlement_ctx = ctx
            
            return f(*args, **kwargs)
            
        except Exception as e:
            logger.error(f"Error checking paid plan: {e}")
            return _access_denied()
    
    return decorated_function


def require_billing_active(f: Callable) -> Callable:
    """
    Decorator: Require active billing status.
    
    Blocks requests from:
    - Cancelled subscriptions
    - Expired subscriptions
    - Halted (payment failed) subscriptions
    
    Must be called AFTER @require_paid_plan.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        ctx = getattr(g, 'entitlement_ctx', None)
        
        if not ctx:
            logger.error("require_billing_active called without entitlement context")
            return _access_denied()
        
        if not ctx.is_billing_active:
            logger.info(f"Billing not active: user={ctx.user_id}, status={ctx.billing_status}")
            return _payment_required()
        
        return f(*args, **kwargs)
    
    return decorated_function


def require_entitlement(feature: str):
    """
    Decorator factory: Require specific feature entitlement.
    
    Usage:
        @require_entitlement('otp_send')
        @require_entitlement('priority_routing')
    
    Args:
        feature: Feature key from PLAN_FEATURES
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from services.entitlement_service import get_entitlement_service
            
            ctx = getattr(g, 'entitlement_ctx', None)
            
            if not ctx:
                logger.error(f"require_entitlement({feature}) called without context")
                return _access_denied()
            
            service = get_entitlement_service()
            
            if not service.check_feature_access(ctx, feature):
                logger.info(f"Feature not entitled: user={ctx.user_id}, feature={feature}")
                return _access_denied()
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def require_tenant_access(resource_type: str):
    """
    Decorator factory: Enforce tenant isolation.
    
    Ensures the authenticated user can only access resources
    belonging to their own organization.
    
    Args:
        resource_type: Type of resource being accessed ('project', 'api_key', etc.)
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            ctx = getattr(g, 'entitlement_ctx', None)
            
            if not ctx:
                logger.error(f"require_tenant_access called without context")
                return _access_denied()
            
            # Get resource org_id from URL params or request body
            resource_org_id = kwargs.get('org_id') or request.args.get('org_id')
            
            # If resource has explicit org_id, verify it matches user's org
            if resource_org_id and resource_org_id != ctx.org_id:
                logger.warning(
                    f"Cross-tenant access attempt: user_org={ctx.org_id}, "
                    f"resource_org={resource_org_id}, resource_type={resource_type}"
                )
                return _access_denied()
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def require_usage_available(resource: str, amount: int = 1):
    """
    Decorator factory: Check usage limits before allowing action.
    
    Currently implements SOFT CAP behavior:
    - Logs warning when approaching limit (80%)
    - Does NOT hard-block (allows overage for billing)
    
    Future: Could implement hard caps for specific resources.
    
    Args:
        resource: Resource type ('otp_send', etc.)
        amount: Amount being consumed
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from services.entitlement_service import get_entitlement_service
            
            ctx = getattr(g, 'entitlement_ctx', None)
            
            if not ctx:
                return _access_denied()
            
            service = get_entitlement_service()
            
            # Check if approaching soft cap
            is_approaching, percentage = service.is_approaching_soft_cap(ctx, resource)
            
            if is_approaching:
                logger.info(
                    f"Usage approaching soft cap: user={ctx.user_id}, "
                    f"resource={resource}, usage={percentage}%"
                )
                # TODO: Trigger alert/notification to user
            
            # Allow the request (soft cap = no hard block)
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


def sandbox_only(f: Callable) -> Callable:
    """
    Decorator: Mark endpoint as sandbox-only.
    
    Allows execution without paid plan if using sandbox/test API key.
    Real OTP delivery is still blocked.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if this is a sandbox API key
        is_sandbox = getattr(g, 'otp_is_sandbox', False)
        
        if is_sandbox:
            # Allow sandbox execution (no real OTP sent)
            g.sandbox_mode = True
            return f(*args, **kwargs)
        
        # Not sandbox - must go through paid plan check
        return f(*args, **kwargs)
    
    return decorated_function


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _get_identity_from_context() -> tuple[Optional[str], Optional[str]]:
    """
    Extract user_id and org_id from Flask g context.
    
    Supports both:
    - OTP API key auth (g.otp_business)
    - Console JWT auth (g.console_user)
    
    Returns:
        Tuple of (user_id, org_id)
    """
    # OTP API key context
    if hasattr(g, 'otp_business') and g.otp_business:
        business = g.otp_business
        return (
            business.get('user_id') or business.get('owner_id'),
            business.get('org_id') or business.get('project_id')
        )
    
    # Console JWT context
    if hasattr(g, 'console_user') and g.console_user:
        user = g.console_user
        return (
            user.id,
            getattr(user, 'current_org_id', None) or getattr(g, 'console_org_id', None)
        )
    
    return None, None


def get_tier_rate_limits(ctx) -> dict:
    """
    Get rate limit configuration for the current plan tier.
    
    Returns dict with per_minute and per_hour limits.
    """
    if not ctx or not ctx.has_paid_plan:
        return {"per_minute": 0, "per_hour": 0}
    
    return {
        "per_minute": ctx.rate_limit_per_minute,
        "per_hour": ctx.rate_limit_per_hour
    }


# =============================================================================
# COMBINED DECORATOR FOR OTP ROUTES
# =============================================================================

def require_paid_otp_access(scopes: list = None):
    """
    Combined decorator for OTP API routes.
    
    Applies the full security pipeline:
    1. Authentication (via otp_auth_middleware)
    2. Paid plan check
    3. Billing active check
    4. OTP send entitlement
    5. Usage tracking
    
    Usage:
        @otp_bp.route('/v1/otp/send', methods=['POST'])
        @require_otp_auth(scopes=['send'])
        @require_paid_otp_access()
        def send_otp():
            ...
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip full check for sandbox mode
            if getattr(g, 'otp_is_sandbox', False):
                g.sandbox_mode = True
                logger.debug("Sandbox mode - skipping paid plan enforcement")
                return f(*args, **kwargs)
            
            # Import here to avoid circular imports
            from services.entitlement_service import get_entitlement_service
            import asyncio
            
            try:
                # Get identity
                user_id, org_id = _get_identity_from_context()
                
                if not user_id:
                    return _unauthorized()
                
                # Fetch entitlements
                service = get_entitlement_service()
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    ctx = loop.run_until_complete(service.get_entitlements(user_id, org_id))
                finally:
                    loop.close()
                
                # 1. PAID PLAN CHECK (Critical)
                if not ctx.has_paid_plan:
                    logger.info(f"Live OTP denied - no paid plan: user={user_id}")
                    return _payment_required()
                
                # 2. BILLING ACTIVE CHECK
                if not ctx.is_billing_active:
                    logger.info(f"Live OTP denied - billing not active: user={user_id}")
                    return _payment_required()
                
                # 3. FEATURE ENTITLEMENT CHECK
                if not service.check_feature_access(ctx, 'otp_send'):
                    logger.info(f"Live OTP denied - feature not entitled: user={user_id}")
                    return _access_denied()
                
                # Store context for use in route handler
                g.entitlement_ctx = ctx
                g.sandbox_mode = False
                
                # 4. Check soft cap (warning only)
                is_approaching, pct = service.is_approaching_soft_cap(ctx, 'otp_send')
                if is_approaching:
                    logger.info(f"Usage at {pct}% of soft cap: user={user_id}")
                
                return f(*args, **kwargs)
                
            except Exception as e:
                logger.error(f"Security check error: {e}")
                return _access_denied()
        
        return decorated_function
    
    return decorator
