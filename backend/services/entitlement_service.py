"""
Entitlement Service
Enterprise-grade subscription and feature entitlement management.

🔒 CORE RULE: NO FREE OTP EXECUTION
- Sandbox mode allowed without payment (no real OTP delivery)
- Live OTP sending requires active PAID subscription

ARCHITECTURE:
  plan_slug is an OPAQUE STRING from the DB.
  No Python enum encodes plan tiers — the DB plan_features table
  is the single source of truth for what each plan includes.
  All feature access MUST go through FeatureGateEngine.

  Rate limits are OPERATIONAL THROTTLES, NOT billable features.
  They live in RATE_LIMITS config, separate from the billing system.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any, List

logger = logging.getLogger('entitlement.service')


# =============================================================================
# BILLING STATUS (kept — this is subscription state, not plan identity)
# =============================================================================

class BillingStatus(Enum):
    """Subscription billing states."""
    PENDING = "pending"          # Payment initiated, not confirmed
    ACTIVE = "active"            # Paid and active
    CANCELLED = "cancelled"      # User cancelled, may have grace period
    EXPIRED = "expired"          # Subscription ended
    HALTED = "halted"            # Payment failed, service suspended
    PAUSED = "paused"            # Temporarily paused
    PAST_DUE = "past_due"        # Payment overdue — allow with upgrade warning
    GRACE_PERIOD = "grace_period" # Post-cancellation grace — allow temporarily
    TRIALING = "trialing"        # Trial period — allow full access


# =============================================================================
# RATE LIMITS — OPERATIONAL THROTTLES (not features)
# =============================================================================
# Rate limits protect infrastructure. They are NOT billing entitlements.
# Stored here as config, NOT in plan_features table.
# Keyed by plan_slug (opaque string from DB).

RATE_LIMITS: Dict[str, Dict[str, int]] = {
    "starter":    {"per_minute": 10,  "per_hour": 100},
    "business":   {"per_minute": 30,  "per_hour": 500},
    "pro":        {"per_minute": 500, "per_hour": 10_000},
    # Legacy aliases
    "growth":     {"per_minute": 30,  "per_hour": 500},
    "enterprise": {"per_minute": 500, "per_hour": 10_000},
}

# Default for unknown plans — fail conservative
_DEFAULT_RATE_LIMITS = {"per_minute": 5, "per_hour": 50}


# =============================================================================
# ENTITLEMENT CONTEXT
# =============================================================================

@dataclass
class EntitlementContext:
    """
    Immutable entitlement context for a request.
    Injected by security middleware, used by route handlers.

    plan_slug is an OPAQUE STRING (e.g., "starter", "business", "pro").
    No enum — if new plans are added (enterprise_plus, agency, legacy_2023),
    they work automatically without Python code changes.

    All feature checks go through FeatureGateEngine.check_feature_access().
    """
    # Identity
    user_id: str
    org_id: str

    # Plan & billing — plan_slug is an opaque string from DB
    plan_slug: Optional[str]
    billing_status: BillingStatus
    subscription_id: Optional[str] = None

    # Period
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None

    # Usage (current period)
    otp_used_this_month: int = 0

    @property
    def has_paid_plan(self) -> bool:
        """Check if user has ANY paid plan."""
        return self.plan_slug is not None

    @property
    def is_billing_active(self) -> bool:
        """Check if billing is in active state."""
        return self.billing_status == BillingStatus.ACTIVE

    @property
    def can_send_live_otp(self) -> bool:
        """
        Core entitlement check for live OTP sending.
        REQUIRES: paid plan + active billing
        """
        return self.has_paid_plan and self.is_billing_active

    @property
    def rate_limit_per_minute(self) -> int:
        """Get rate limit from RATE_LIMITS config (not features)."""
        if not self.plan_slug:
            return 0  # No plan = no access
        return RATE_LIMITS.get(self.plan_slug, _DEFAULT_RATE_LIMITS)["per_minute"]

    @property
    def rate_limit_per_hour(self) -> int:
        """Get rate limit from RATE_LIMITS config (not features)."""
        if not self.plan_slug:
            return 0
        return RATE_LIMITS.get(self.plan_slug, _DEFAULT_RATE_LIMITS)["per_hour"]


# =============================================================================
# ENTITLEMENT SERVICE
# =============================================================================

class EntitlementService:
    """
    Enterprise entitlement service.

    Responsibilities:
    - Fetch subscription state from database
    - Build EntitlementContext for requests
    - Feature access: delegates ENTIRELY to FeatureGateEngine (DB-backed)
    """

    def __init__(self, supabase_client=None):
        self._supabase = supabase_client

    def _get_supabase(self):
        """Lazy-load Supabase client."""
        if self._supabase is None:
            try:
                from supabase_client import get_supabase_client
                self._supabase = get_supabase_client()
            except ImportError:
                logger.error("Supabase client not available")
                raise
        return self._supabase

    async def get_entitlements(
        self,
        user_id: str,
        org_id: Optional[str] = None
    ) -> EntitlementContext:
        """
        Fetch entitlements for a user/org.

        Returns EntitlementContext with plan_slug, billing status.
        If no subscription found, returns context with plan_slug=None.
        """
        try:
            supabase = self._get_supabase()

            # CONSOLE SUBSCRIPTIONS: Primary lookup by org_id in otp_console_subscriptions
            # This is where console billing creates subscriptions
            if org_id:
                try:
                    result = supabase.table('otp_console_subscriptions').select('*').eq(
                        'org_id', org_id
                    ).limit(1).execute()

                    if result.data:
                        sub = result.data[0]
                        plan_slug = self._normalize_plan_slug(sub.get('plan_name'))
                        billing_status = self._parse_billing_status(sub.get('billing_status'))

                        # Get usage for current period
                        usage = await self._get_current_usage(
                            org_id,
                            sub.get('current_period_start')
                        )

                        logger.debug(f"Found console subscription for org={org_id}: plan={plan_slug}, status={billing_status}")

                        return EntitlementContext(
                            user_id=user_id,
                            org_id=org_id,
                            plan_slug=plan_slug,
                            billing_status=billing_status,
                            subscription_id=sub.get('id'),
                            current_period_start=self._parse_datetime(sub.get('current_period_start')),
                            current_period_end=self._parse_datetime(sub.get('current_period_end')),
                            otp_used_this_month=usage.get('otp_send', 0),
                        )
                except Exception as e:
                    logger.debug(f"No console subscription for org {org_id}: {e}")

            # FALLBACK: Legacy subscriptions table (for API-level subscriptions)
            query = supabase.table('subscriptions').select('*')

            if org_id:
                query = query.eq('org_id', org_id)
            else:
                query = query.eq('user_id', user_id)

            result = query.in_('status', ['active', 'trialing', 'grace_period', 'past_due', 'pending_upgrade', 'upgrade_failed']).order(
                'created_at', desc=True
            ).limit(1).execute()

            if not result.data:
                result = supabase.table('subscriptions').select('*').eq(
                    'user_id', user_id
                ).order('created_at', desc=True).limit(1).execute()

            if result.data:
                sub = result.data[0]
                plan_slug = self._normalize_plan_slug(sub.get('plan_name'))
                billing_status = self._parse_billing_status(sub.get('status'))

                usage = await self._get_current_usage(
                    org_id or user_id,
                    sub.get('current_period_start')
                )

                return EntitlementContext(
                    user_id=user_id,
                    org_id=org_id or user_id,
                    plan_slug=plan_slug,
                    billing_status=billing_status,
                    subscription_id=sub.get('id'),
                    current_period_start=self._parse_datetime(sub.get('current_period_start')),
                    current_period_end=self._parse_datetime(sub.get('current_period_end')),
                    otp_used_this_month=usage.get('otp_send', 0),
                )

            # No subscription at all
            logger.info(f"No subscription found for user={user_id}, org={org_id}")
            return EntitlementContext(
                user_id=user_id,
                org_id=org_id or user_id,
                plan_slug=None,
                billing_status=BillingStatus.EXPIRED,
            )

        except Exception as e:
            logger.error(f"Error fetching entitlements: {e}")
            # Fail secure - return no access
            return EntitlementContext(
                user_id=user_id,
                org_id=org_id or user_id,
                plan_slug=None,
                billing_status=BillingStatus.EXPIRED,
            )

    def _normalize_plan_slug(self, plan_name: Optional[str]) -> Optional[str]:
        """
        Normalize plan slug from DB.

        Returns the plan_slug as-is (lowercase, stripped).
        No enum mapping — plan_slug is an opaque string.
        The DB plan_features table defines what each slug includes.
        """
        if not plan_name:
            return None
        return plan_name.lower().strip()

    def _parse_billing_status(self, status: Optional[str]) -> BillingStatus:
        """Parse status string to BillingStatus enum."""
        if not status:
            return BillingStatus.EXPIRED

        status = status.lower().strip()

        try:
            return BillingStatus(status)
        except ValueError:
            logger.warning(f"Unknown billing status: {status}")
            return BillingStatus.EXPIRED

    def _parse_datetime(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse ISO datetime string."""
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            return None

    async def _get_current_usage(
        self,
        org_id: str,
        period_start: Optional[str]
    ) -> Dict[str, int]:
        """Get usage counts for current billing period."""
        try:
            supabase = self._get_supabase()

            # Default to current month if no period specified
            if period_start:
                start_date = period_start
            else:
                now = datetime.utcnow()
                start_date = now.replace(day=1, hour=0, minute=0, second=0).isoformat()

            result = supabase.table('usage_records').select(
                'resource_type', 'count'
            ).eq('org_id', org_id).gte('period_start', start_date).execute()

            usage = {}
            for record in result.data or []:
                usage[record['resource_type']] = record.get('count', 0)

            return usage

        except Exception as e:
            logger.error(f"Error fetching usage: {e}")
            return {}

    def check_feature_access(
        self,
        ctx: EntitlementContext,
        feature: str,
        domain: Optional[str] = None
    ) -> bool:
        """
        Check if feature is available for the user.

        Delegates to FeatureGateEngine (DB-backed, domain-aware).
        FAIL-CLOSED: if engine unavailable, access is denied.

        Args:
            ctx: EntitlementContext
            feature: Feature key (e.g., 'otp_send', 'priority_routing')
            domain: Product domain (e.g., 'shop'). If None, attempts
                    to read from Flask g.product_domain.

        Returns:
            True if feature is available, False otherwise
        """
        if not ctx.has_paid_plan:
            return False

        try:
            from services.feature_gate_engine import get_feature_gate_engine

            # Resolve domain: explicit param > Flask g > deny
            if domain is None:
                try:
                    from flask import g as flask_g
                    domain = getattr(flask_g, 'product_domain', None)
                except ImportError:
                    pass

            if not domain:
                logger.warning(
                    f"check_feature_access: product_domain not set, "
                    f"denying feature={feature} for user={ctx.user_id}"
                )
                return False

            engine = get_feature_gate_engine()
            decision = engine.check_feature_access(
                user_id=ctx.user_id,
                domain=domain,
                feature_key=feature
            )
            return decision.allowed
        except Exception as e:
            # FAIL CLOSED — no silent fallback
            logger.error(
                f"❌ FeatureGateEngine unavailable for check_feature_access: {e}. "
                f"DENYING feature={feature} for user={ctx.user_id}"
            )
            return False

    async def record_usage(
        self,
        org_id: str,
        resource_type: str,
        amount: int = 1
    ) -> bool:
        """
        Record usage for billing/tracking.
        Uses upsert with atomic increment.

        Returns True if recorded successfully.
        """
        try:
            supabase = self._get_supabase()

            now = datetime.utcnow()
            period_start = now.replace(day=1, hour=0, minute=0, second=0)
            period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)

            # Upsert with increment
            supabase.rpc('increment_usage', {
                'p_org_id': org_id,
                'p_resource_type': resource_type,
                'p_period_start': period_start.isoformat(),
                'p_period_end': period_end.isoformat(),
                'p_amount': amount
            }).execute()

            return True

        except Exception as e:
            logger.error(f"Error recording usage: {e}")
            return False


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_entitlement_service: Optional[EntitlementService] = None


def get_entitlement_service() -> EntitlementService:
    """Get global entitlement service instance."""
    global _entitlement_service
    if _entitlement_service is None:
        _entitlement_service = EntitlementService()
    return _entitlement_service
