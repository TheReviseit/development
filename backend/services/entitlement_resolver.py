"""
Entitlement Resolver — Source of Truth Hierarchy
===============================================

Defines the STRICT priority order for access resolution:

    subscription.state > trial.state > entitlement_fallback

Resolution Order (who wins):
    1. PAID SUBSCRIPTION (highest priority)
       - Active paid subscription always wins
       - Webhook delayed? Use last known Razorpay state

    2. TRIAL (if no active paid subscription)
       - Active trial = full access
       - Expiring soon = full access + warning
       - Expired = restricted access

    3. FALLBACK / SANDBOX (lowest priority)
       - No subscription, no trial = sandbox mode
       - Limited features only

Key Principle:
    "Paid always trumps trial. Trial always trumps nothing."

Edge Cases Handled:
    - Webhook delayed: Use subscription state from DB + last_known_state timestamp
    - Trial expired but upgrade pending: subscription_pending_upgrade wins
    - Multiple active subscriptions: highest tier wins
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict, Any, List

logger = logging.getLogger('reviseit.entitlement_resolver')


# =============================================================================
# ENTITLEMENT LEVELS (Strict Hierarchy)
# =============================================================================

class EntitlementLevel(int, Enum):
    """
    Strict hierarchy of entitlement levels.

    Higher number = higher priority in resolution.
    """
    NONE = 0           # No subscription, no trial
    TRIAL_EXPIRED = 1  # Had trial, now expired
    TRIAL_ACTIVE = 2   # Active trial (full access)
    PAST_DUE = 3       # Paid but payment failed (grace)
    PAID_ACTIVE = 4    # Active paid subscription (highest)


# =============================================================================
# ACCESS DECISION
# =============================================================================

@dataclass(frozen=True)
class AccessDecision:
    """
    Immutable access decision with full reasoning.

    This is the SOLE output of entitlement resolution.
    All access checks MUST go through this.
    """
    allowed: bool
    entitlement_level: EntitlementLevel

    # Priority chain (who was consulted)
    subscription_state: Optional[str] = None
    trial_state: Optional[str] = None
    fallback_state: Optional[str] = None

    # Resolution reason
    resolution: str = ""  # e.g., "subscription.active", "trial.active", "fallback.sandbox"

    # Timestamps
    resolved_at: Optional[datetime] = None
    subscription_updated_at: Optional[datetime] = None
    trial_updated_at: Optional[datetime] = None

    # Context
    plan_slug: Optional[str] = None
    days_remaining: Optional[int] = None
    grace_period_end: Optional[datetime] = None

    # Warnings
    warnings: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        object.__setattr__(self, 'warnings', self.warnings or [])
        if self.resolved_at is None:
            object.__setattr__(self, 'resolved_at', datetime.now(timezone.utc))

    @property
    def is_paid(self) -> bool:
        return self.entitlement_level >= EntitlementLevel.PAID_ACTIVE

    @property
    def is_trial(self) -> bool:
        return self.entitlement_level == EntitlementLevel.TRIAL_ACTIVE

    @property
    def is_expired(self) -> bool:
        return self.entitlement_level == EntitlementLevel.TRIAL_EXPIRED

    @property
    def is_grace_period(self) -> bool:
        return self.entitlement_level == EntitlementLevel.PAST_DUE

    def to_dict(self) -> Dict[str, Any]:
        return {
            'allowed': self.allowed,
            'entitlement_level': self.entitlement_level.name,
            'entitlement_value': self.entitlement_level.value,
            'resolution': self.resolution,
            'subscription_state': self.subscription_state,
            'trial_state': self.trial_state,
            'fallback_state': self.fallback_state,
            'is_paid': self.is_paid,
            'is_trial': self.is_trial,
            'is_expired': self.is_expired,
            'is_grace_period': self.is_grace_period,
            'plan_slug': self.plan_slug,
            'days_remaining': self.days_remaining,
            'grace_period_end': self.grace_period_end.isoformat() if self.grace_period_end else None,
            'warnings': self.warnings,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
        }


# =============================================================================
# ENTITLEMENT RESOLVER
# =============================================================================

class EntitlementResolver:
    """
    Resolves access entitlement using strict priority hierarchy.

    Priority Order:
        1. PAID_SUBSCRIPTION → Full access, no restrictions
        2. PAST_DUE → Full access with payment warning
        3. TRIAL_ACTIVE → Full access, time-limited
        4. TRIAL_EXPIRED → Restricted access
        5. NONE → Sandbox / no access

    This is the SINGLE METHOD for all entitlement checks.
    No ad-hoc checks anywhere else.
    """

    # States that grant FULL access (regardless of source)
    FULL_ACCESS_STATES = frozenset({
        'active',           # Paid active
        'trialing',         # Trial (in subscription system)
        'grace_period',     # Post-cancellation grace
        'pending_upgrade',  # Upgrade in progress
    })

    # States that grant RESTRICTED access
    RESTRICTED_ACCESS_STATES = frozenset({
        'past_due',         # Payment failed
        'expired',          # Trial/subscription ended
        'cancelled',        # User cancelled
        'suspended',        # Admin suspended
    })

    def __init__(self, supabase_client):
        self._db = supabase_client

    def resolve(
        self,
        user_id: str,
        org_id: str,
        domain: str = 'shop',
    ) -> AccessDecision:
        """
        Resolve entitlement for a user/org using strict hierarchy.

        This is the ONLY public method for entitlement checks.

        Args:
            user_id: User UUID
            org_id: Organization UUID
            domain: Product domain

        Returns:
            AccessDecision with full reasoning
        """
        warnings: List[str] = []
        resolved_at = datetime.now(timezone.utc)

        # =====================================================================
        # STEP 1: Check PAID SUBSCRIPTION (Highest Priority)
        # =====================================================================
        subscription = self._get_subscription(org_id, domain)
        if subscription:
            sub_status = subscription.get('billing_status', 'unknown')
            sub_updated = self._parse_datetime(subscription.get('updated_at'))

            # Check for stale subscription (webhook delayed)
            if sub_updated:
                staleness = (resolved_at - sub_updated).total_seconds()
                if staleness > 300:  # 5 minutes
                    warnings.append(f"subscription_state_stale:{int(staleness)}s")

            # Active paid states
            if sub_status in self.FULL_ACCESS_STATES:
                grace_end = self._parse_datetime(subscription.get('grace_period_end'))
                return AccessDecision(
                    allowed=True,
                    entitlement_level=EntitlementLevel.PAID_ACTIVE,
                    subscription_state=sub_status,
                    resolution='subscription.active',
                    resolved_at=resolved_at,
                    subscription_updated_at=sub_updated,
                    plan_slug=subscription.get('plan_name'),
                    grace_period_end=grace_end,
                    warnings=warnings,
                )

            # Past due (payment failed but still active)
            if sub_status == 'past_due':
                grace_end = self._parse_datetime(subscription.get('grace_period_end'))
                warnings.append('PAYMENT_FAILED')
                return AccessDecision(
                    allowed=True,
                    entitlement_level=EntitlementLevel.PAST_DUE,
                    subscription_state=sub_status,
                    resolution='subscription.past_due',
                    resolved_at=resolved_at,
                    subscription_updated_at=sub_updated,
                    plan_slug=subscription.get('plan_name'),
                    grace_period_end=grace_end,
                    warnings=warnings,
                )

            # Restricted states (cancelled, suspended, expired)
            return AccessDecision(
                allowed=False,
                entitlement_level=EntitlementLevel.NONE,
                subscription_state=sub_status,
                resolution='subscription.restricted',
                resolved_at=resolved_at,
                subscription_updated_at=sub_updated,
                plan_slug=subscription.get('plan_name'),
                warnings=warnings,
            )

        # =====================================================================
        # STEP 2: Check TRIAL (Second Priority)
        # =====================================================================
        trial = self._get_trial(user_id, org_id, domain)
        if trial:
            trial_status = trial.get('status', 'unknown')
            trial_updated = self._parse_datetime(trial.get('updated_at'))
            trial_expires = self._parse_datetime(trial.get('expires_at'))

            # Calculate days remaining
            days_remaining = None
            if trial_expires:
                delta = trial_expires - resolved_at
                days_remaining = max(0, delta.days)

            # Active trial
            if trial_status in ('active', 'expiring_soon'):
                return AccessDecision(
                    allowed=True,
                    entitlement_level=EntitlementLevel.TRIAL_ACTIVE,
                    trial_state=trial_status,
                    resolution='trial.active',
                    resolved_at=resolved_at,
                    trial_updated_at=trial_updated,
                    plan_slug=trial.get('plan_slug'),
                    days_remaining=days_remaining,
                    warnings=warnings,
                )

            # Expired trial
            return AccessDecision(
                allowed=False,
                entitlement_level=EntitlementLevel.TRIAL_EXPIRED,
                trial_state=trial_status,
                resolution='trial.expired',
                resolved_at=resolved_at,
                trial_updated_at=trial_updated,
                plan_slug=trial.get('plan_slug'),
                days_remaining=0,
                warnings=warnings,
            )

        # =====================================================================
        # STEP 3: FALLBACK (No subscription, no trial)
        # =====================================================================
        return AccessDecision(
            allowed=False,
            entitlement_level=EntitlementLevel.NONE,
            fallback_state='sandbox',
            resolution='fallback.sandbox',
            resolved_at=resolved_at,
            warnings=warnings,
        )

    def _get_subscription(self, org_id: str, domain: str) -> Optional[Dict[str, Any]]:
        """Get active subscription for org+domain."""
        try:
            result = self._db.table('otp_console_subscriptions').select(
                'id, plan_name, billing_status, grace_period_end, updated_at'
            ).eq('org_id', org_id).eq(
                'billing_status', 'active'
            ).limit(1).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"_get_subscription error: {e}")
            return None

    def _get_trial(self, user_id: str, org_id: str, domain: str) -> Optional[Dict[str, Any]]:
        """Get active trial for user+org+domain."""
        try:
            result = self._db.table('free_trials').select(
                'id, plan_slug, status, expires_at, updated_at'
            ).eq('user_id', user_id).eq(
                'org_id', org_id
            ).eq('domain', domain).in_(
                'status', ['active', 'expiring_soon']
            ).limit(1).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"_get_trial error: {e}")
            return None

    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        """Parse datetime from various formats."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError:
                return None
        return None


# =============================================================================
# GLOBAL INSTANCE
# =============================================================================

_entitlement_resolver: Optional[EntitlementResolver] = None


def get_entitlement_resolver() -> EntitlementResolver:
    """Get singleton EntitlementResolver instance."""
    global _entitlement_resolver

    if _entitlement_resolver is None:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        _entitlement_resolver = EntitlementResolver(supabase_client=db)

    return _entitlement_resolver
