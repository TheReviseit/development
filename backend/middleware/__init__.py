"""
Middleware package initialization.
"""

from .rate_limiter import (
    RateLimiter,
    get_rate_limiter,
    rate_limit,
    rate_limit_by_api_key,
    rate_limit_by_ip,
    WebhookSecurityMiddleware,
    get_webhook_security
)

from .security_enforcer import (
    require_authenticated,
    require_paid_plan,
    require_paid_plan_sync,
    require_billing_active,
    require_entitlement,
    require_tenant_access,
    require_usage_available,
    require_paid_otp_access,
)

from .resource_guard import (
    generate_signed_url,
    verify_signed_url,
    require_resource_ownership,
    require_signed_access,
)

__all__ = [
    # Rate limiting
    'RateLimiter',
    'get_rate_limiter',
    'rate_limit',
    'rate_limit_by_api_key',
    'rate_limit_by_ip',
    'WebhookSecurityMiddleware',
    'get_webhook_security',
    # Security enforcer
    'require_authenticated',
    'require_paid_plan',
    'require_paid_plan_sync',
    'require_billing_active',
    'require_entitlement',
    'require_tenant_access',
    'require_usage_available',
    'require_paid_otp_access',
    # Resource guard
    'generate_signed_url',
    'verify_signed_url',
    'require_resource_ownership',
    'require_signed_access',
]

