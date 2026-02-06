"""
Entitlement Service
Enterprise-grade subscription, plan tier, and feature entitlement management.

🔒 CORE RULE: NO FREE OTP EXECUTION
- Sandbox mode allowed without payment (no real OTP delivery)
- Live OTP sending requires active PAID subscription

Plan Tiers: STARTER / GROWTH / ENTERPRISE
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any, List

logger = logging.getLogger('entitlement.service')


# =============================================================================
# PLAN TIER DEFINITIONS
# =============================================================================

class PlanTier(Enum):
    """
    Official plan tiers - NO FREE TIER.
    Aligned with frontend pricing UI.
    """
    STARTER = "starter"      # ₹799/month
    GROWTH = "growth"        # ₹1,999/month
    ENTERPRISE = "enterprise"  # Custom pricing


class BillingStatus(Enum):
    """Subscription billing states."""
    PENDING = "pending"      # Payment initiated, not confirmed
    ACTIVE = "active"        # Paid and active
    CANCELLED = "cancelled"  # User cancelled, may have grace period
    EXPIRED = "expired"      # Subscription ended
    HALTED = "halted"        # Payment failed, service suspended
    PAUSED = "paused"        # Temporarily paused


# =============================================================================
# PLAN FEATURE MATRIX
# =============================================================================

PLAN_FEATURES: Dict[PlanTier, Dict[str, Any]] = {
    PlanTier.STARTER: {
        # Pricing
        "monthly_price_inr": 799,
        "otp_price_inr": 0.75,
        
        # Features
        "otp_send": True,
        "live_api_keys": True,
        "sandbox_mode": True,
        "webhooks_limit": 1,
        "priority_routing": False,
        "advanced_analytics": False,
        "custom_sla": False,
        "white_label": False,
        
        # Rate limits
        "rate_limit_per_minute": 10,
        "rate_limit_per_hour": 100,
        
        # Soft caps (alerts, not hard blocks)
        "otp_monthly_soft_cap": 10_000,
    },
    
    PlanTier.GROWTH: {
        # Pricing
        "monthly_price_inr": 1999,
        "otp_price_inr": 0.60,
        
        # Features
        "otp_send": True,
        "live_api_keys": True,
        "sandbox_mode": True,
        "webhooks_limit": -1,  # Unlimited
        "priority_routing": True,
        "advanced_analytics": True,
        "custom_sla": False,
        "white_label": False,
        
        # Rate limits
        "rate_limit_per_minute": 30,
        "rate_limit_per_hour": 500,
        
        # Soft caps
        "otp_monthly_soft_cap": 50_000,
    },
    
    PlanTier.ENTERPRISE: {
        # Pricing
        "monthly_price_inr": None,  # Custom
        "otp_price_inr": 0.50,      # Starting price
        
        # Features
        "otp_send": True,
        "live_api_keys": True,
        "sandbox_mode": True,
        "webhooks_limit": -1,  # Unlimited
        "priority_routing": True,
        "advanced_analytics": True,
        "custom_sla": True,
        "white_label": True,
        
        # Rate limits
        "rate_limit_per_minute": 500,
        "rate_limit_per_hour": 10_000,
        
        # Soft caps
        "otp_monthly_soft_cap": 500_000,
    },
}


# =============================================================================
# ENTITLEMENT CONTEXT
# =============================================================================

@dataclass
class EntitlementContext:
    """
    Immutable entitlement context for a request.
    Injected by security middleware, used by route handlers.
    """
    # Identity
    user_id: str
    org_id: str
    
    # Plan & billing
    plan_tier: Optional[PlanTier]
    billing_status: BillingStatus
    subscription_id: Optional[str] = None
    
    # Period
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    
    # Usage (current period)
    otp_used_this_month: int = 0
    
    # Computed properties
    features: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def has_paid_plan(self) -> bool:
        """Check if user has ANY paid plan."""
        return self.plan_tier is not None
    
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
        """Get rate limit based on plan tier."""
        if not self.plan_tier:
            return 0  # No plan = no access
        return PLAN_FEATURES[self.plan_tier].get("rate_limit_per_minute", 0)
    
    @property
    def rate_limit_per_hour(self) -> int:
        """Get rate limit based on plan tier."""
        if not self.plan_tier:
            return 0
        return PLAN_FEATURES[self.plan_tier].get("rate_limit_per_hour", 0)


# =============================================================================
# ENTITLEMENT SERVICE
# =============================================================================

class EntitlementService:
    """
    Enterprise entitlement service.
    
    Responsibilities:
    - Fetch subscription state from database
    - Build EntitlementContext for requests
    - Check feature access
    - Track usage (soft caps)
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
        
        Returns EntitlementContext with plan tier, billing status, and features.
        If no subscription found, returns context with plan_tier=None.
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
                        plan_tier = self._parse_plan_tier(sub.get('plan_name'))
                        billing_status = self._parse_billing_status(sub.get('billing_status'))
                        
                        # Get usage for current period
                        usage = await self._get_current_usage(
                            org_id,
                            sub.get('current_period_start')
                        )
                        
                        logger.debug(f"Found console subscription for org={org_id}: plan={plan_tier}, status={billing_status}")
                        
                        return EntitlementContext(
                            user_id=user_id,
                            org_id=org_id,
                            plan_tier=plan_tier,
                            billing_status=billing_status,
                            subscription_id=sub.get('id'),
                            current_period_start=self._parse_datetime(sub.get('current_period_start')),
                            current_period_end=self._parse_datetime(sub.get('current_period_end')),
                            otp_used_this_month=usage.get('otp_send', 0),
                            features=PLAN_FEATURES.get(plan_tier, {}) if plan_tier else {},
                        )
                except Exception as e:
                    logger.debug(f"No console subscription for org {org_id}: {e}")
            
            # FALLBACK: Legacy subscriptions table (for API-level subscriptions)
            query = supabase.table('subscriptions').select('*')
            
            if org_id:
                query = query.eq('org_id', org_id)
            else:
                query = query.eq('user_id', user_id)
            
            result = query.eq('status', 'active').order(
                'created_at', desc=True
            ).limit(1).execute()
            
            if not result.data:
                result = supabase.table('subscriptions').select('*').eq(
                    'user_id', user_id
                ).order('created_at', desc=True).limit(1).execute()
            
            if result.data:
                sub = result.data[0]
                plan_tier = self._parse_plan_tier(sub.get('plan_name'))
                billing_status = self._parse_billing_status(sub.get('status'))
                
                usage = await self._get_current_usage(
                    org_id or user_id,
                    sub.get('current_period_start')
                )
                
                return EntitlementContext(
                    user_id=user_id,
                    org_id=org_id or user_id,
                    plan_tier=plan_tier,
                    billing_status=billing_status,
                    subscription_id=sub.get('id'),
                    current_period_start=self._parse_datetime(sub.get('current_period_start')),
                    current_period_end=self._parse_datetime(sub.get('current_period_end')),
                    otp_used_this_month=usage.get('otp_send', 0),
                    features=PLAN_FEATURES.get(plan_tier, {}) if plan_tier else {},
                )
            
            # No subscription at all
            logger.info(f"No subscription found for user={user_id}, org={org_id}")
            return EntitlementContext(
                user_id=user_id,
                org_id=org_id or user_id,
                plan_tier=None,
                billing_status=BillingStatus.EXPIRED,
                features={},
            )
            
        except Exception as e:
            logger.error(f"Error fetching entitlements: {e}")
            # Fail secure - return no access
            return EntitlementContext(
                user_id=user_id,
                org_id=org_id or user_id,
                plan_tier=None,
                billing_status=BillingStatus.EXPIRED,
                features={},
            )
    
    def _parse_plan_tier(self, plan_name: Optional[str]) -> Optional[PlanTier]:
        """Parse plan name string to PlanTier enum."""
        if not plan_name:
            return None
        
        plan_name = plan_name.lower().strip()
        
        # Map various plan names to tiers
        tier_mapping = {
            'starter': PlanTier.STARTER,
            'growth': PlanTier.GROWTH,
            'enterprise': PlanTier.ENTERPRISE,
            # Legacy mappings (if any exist in DB)
            'business': PlanTier.GROWTH,
            'pro': PlanTier.GROWTH,
        }
        
        return tier_mapping.get(plan_name)
    
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
        feature: str
    ) -> bool:
        """
        Check if feature is available for the plan.
        
        Args:
            ctx: EntitlementContext
            feature: Feature key (e.g., 'otp_send', 'priority_routing')
            
        Returns:
            True if feature is available, False otherwise
        """
        if not ctx.has_paid_plan:
            return False
        
        return ctx.features.get(feature, False)
    
    def check_webhook_limit(
        self,
        ctx: EntitlementContext,
        current_count: int
    ) -> bool:
        """Check if org can add more webhooks."""
        if not ctx.has_paid_plan:
            return False
        
        limit = ctx.features.get('webhooks_limit', 0)
        
        # -1 = unlimited
        if limit == -1:
            return True
        
        return current_count < limit
    
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
    
    def is_approaching_soft_cap(
        self,
        ctx: EntitlementContext,
        resource_type: str = 'otp_send'
    ) -> tuple[bool, int]:
        """
        Check if usage is approaching soft cap (80% threshold).
        
        Returns:
            Tuple of (is_approaching: bool, percentage_used: int)
        """
        if not ctx.has_paid_plan:
            return False, 0
        
        soft_cap_key = f"{resource_type.replace('_send', '')}_monthly_soft_cap"
        soft_cap = ctx.features.get(soft_cap_key, 0)
        
        if soft_cap <= 0:
            return False, 0
        
        current_usage = ctx.otp_used_this_month
        percentage = int((current_usage / soft_cap) * 100)
        
        return percentage >= 80, percentage


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
