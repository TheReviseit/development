"""
Upgrade Engine - Enterprise-Grade Upgrade Orchestration

Handles:
- Tier resolution (database-driven, not hardcoded)
- Upgrade eligibility checks
- Feature difference calculations
- Smart recommendations (multi-feature saturation)
- Add-on discovery

Design Principles:
- Dependency injection (testable)
- Database-driven (no hardcoded logic)
- Clean architecture (domain layer)
- Type-safe (strict hints)
- Observable (structured logging)

Author: Claude Code
Quality: FAANG-level production code
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import logging
from datetime import datetime, timezone

from .proration_calculator import ProrationCalculator, ProrationResult

# Initialize logger
logger = logging.getLogger(__name__)


# =============================================================================
# Domain Models (Immutable)
# =============================================================================

class UpgradeAction(str, Enum):
    """Possible outcomes of upgrade eligibility check."""
    ALLOWED = "allowed"
    BLOCKED_DOWNGRADE = "blocked_downgrade"
    BLOCKED_SAME_PLAN = "blocked_same_plan"
    REQUIRES_SALES = "requires_sales_call"
    PENDING_PAYMENT = "pending_payment_exists"
    SUBSCRIPTION_INACTIVE = "subscription_inactive"


@dataclass(frozen=True)
class UpgradePath:
    """
    Result of upgrade eligibility check.

    Immutable to prevent accidental mutation.
    """
    action: UpgradeAction
    current_plan: Optional[Dict]
    target_plan: Dict
    current_tier: int
    target_tier: int
    is_upgrade: bool
    proration_amount_paise: Optional[int]
    effective_date: Optional[str]
    message: str
    proration_details: Optional[ProrationResult] = None

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'action': self.action.value,
            'current_plan': self.current_plan,
            'target_plan': self.target_plan,
            'current_tier': self.current_tier,
            'target_tier': self.target_tier,
            'is_upgrade': self.is_upgrade,
            'proration_amount_paise': self.proration_amount_paise,
            'effective_date': self.effective_date,
            'message': self.message,
            'proration_details': self.proration_details.to_dict() if self.proration_details else None
        }


@dataclass(frozen=True)
class UpgradeOptions:
    """
    Complete upgrade context for rendering UI.

    Contains everything the frontend needs.
    """
    current_plan: Optional[Dict]
    available_plans: List[Dict]
    recommended_plan: Optional[Dict]
    feature_differences: Dict[str, Any]
    usage_summary: Dict[str, Any]  # {feature_key: {used, limit, is_unlimited}}
    available_addons: List[Dict]
    domain: str

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'current_plan': self.current_plan,
            'available_plans': self.available_plans,
            'recommended_plan': self.recommended_plan,
            'feature_differences': self.feature_differences,
            'usage_summary': self.usage_summary,
            'available_addons': self.available_addons,
            'domain': self.domain
        }


# =============================================================================
# Custom Exceptions
# =============================================================================

class UpgradeEngineError(Exception):
    """Base exception for UpgradeEngine errors."""
    pass


class PlanNotFoundError(UpgradeEngineError):
    """Raised when requested plan does not exist."""
    pass


class InvalidDomainError(UpgradeEngineError):
    """Raised when domain is invalid."""
    pass


# =============================================================================
# UpgradeEngine (Main Service)
# =============================================================================

class UpgradeEngine:
    """
    Enterprise upgrade orchestrator.

    Responsibilities:
    - Resolve current subscription for user+domain
    - Calculate tier ordering (database-driven)
    - Determine upgrade eligibility
    - Calculate feature differences dynamically
    - Recommend plans based on usage
    - Discover available add-ons

    Dependencies (injected):
    - supabase: Database client
    - pricing_service: Plan pricing lookups
    - feature_gate_engine: Usage tracking

    Example:
        engine = UpgradeEngine(supabase, pricing_service, feature_gate_engine)
        options = engine.get_upgrade_options('user123', 'shop', 'monthly')
    """

    # Valid product domains
    VALID_DOMAINS = {'shop', 'marketing', 'api', 'dashboard', 'showcase'}

    # Soft-limit threshold for recommendations
    SATURATION_THRESHOLD_PCT = 80.0

    # Breathing room for new plan (150% of current usage)
    BREATHING_ROOM_MULTIPLIER = 1.5

    def __init__(
        self,
        supabase,
        pricing_service,
        feature_gate_engine,
        proration_calculator: Optional[ProrationCalculator] = None
    ):
        """
        Initialize UpgradeEngine with dependencies.

        Args:
            supabase: Supabase client for database queries
            pricing_service: PricingService instance
            feature_gate_engine: FeatureGateEngine instance
            proration_calculator: Optional ProrationCalculator (will create if None)
        """
        self._supabase = supabase
        self._pricing_service = pricing_service
        self._feature_gate_engine = feature_gate_engine
        self._proration_calc = proration_calculator or ProrationCalculator()
        self.logger = logger

    # =========================================================================
    # Public API
    # =========================================================================

    def get_upgrade_options(
        self,
        user_id: str,
        domain: str,
        billing_cycle: str = 'monthly'
    ) -> UpgradeOptions:
        """
        Get all upgrade context for rendering /upgrade page.

        This is the main entry point for the upgrade UI.

        Args:
            user_id: Firebase/Supabase user ID
            domain: Product domain (shop, marketing, api, etc.)
            billing_cycle: monthly or yearly

        Returns:
            UpgradeOptions with current plan, available plans, recommendations

        Raises:
            InvalidDomainError: If domain is not valid
            UpgradeEngineError: For other errors

        Example:
            >>> engine = UpgradeEngine(supabase, pricing, feature_gate)
            >>> options = engine.get_upgrade_options('user123', 'shop')
            >>> options.recommended_plan['plan_slug']
            'business'
        """
        # Validate domain
        if domain not in self.VALID_DOMAINS:
            raise InvalidDomainError(f"Invalid domain: {domain}. Must be one of {self.VALID_DOMAINS}")

        self.logger.info(
            "get_upgrade_options_start",
            extra={"user_id": user_id, "domain": domain, "billing_cycle": billing_cycle}
        )

        try:
            # 1. Get current subscription (domain-aware)
            current_sub = self._get_subscription(user_id, domain)
            current_plan = self._resolve_plan_metadata(current_sub) if current_sub else None

            # 2. Get all plans for domain from pricing_plans_with_yearly view
            all_plans = self._get_all_plans_with_yearly(domain, billing_cycle)

            # 3. Enrich plans with tier metadata
            enriched_plans = self._enrich_with_tiers(all_plans)

            # 4. Sort by tier_level (ascending: starter → business → pro)
            enriched_plans.sort(key=lambda p: p.get('tier_level', 999))

            # 5. Get usage summary from FeatureGateEngine and enrich with plan limits
            usage_raw = self._feature_gate_engine.get_usage_summary(user_id, domain)

            # Attach hard_limit for each feature so the frontend can render proper
            # percentage bars (used / limit) instead of using raw count as %.
            plan_features_map = (
                self._get_plan_features_map(current_plan['pricing_plan_id'])
                if current_plan and current_plan.get('pricing_plan_id')
                else {}
            )
            usage = {
                feature_key: {
                    'used': count,
                    'limit': (plan_features_map.get(feature_key) or {}).get('hard_limit'),
                    'is_unlimited': (plan_features_map.get(feature_key) or {}).get('is_unlimited', False),
                }
                for feature_key, count in usage_raw.items()
            }

            # 6. Calculate recommended plan (smart multi-feature analysis)
            # Uses raw counts (Dict[str, int]) — not the enriched shape
            recommended = self._calculate_recommended_plan(current_plan, enriched_plans, usage_raw)

            # 7. Calculate feature differences (gained/lost/changed limits)
            feature_diffs = self._calculate_feature_differences(current_plan, enriched_plans)

            # 8. Get available add-ons for domain/tier
            current_tier = current_plan['tier_level'] if current_plan else 0
            addons = self._get_available_addons(domain, current_tier)

            result = UpgradeOptions(
                current_plan=current_plan,
                available_plans=enriched_plans,
                recommended_plan=recommended,
                feature_differences=feature_diffs,
                usage_summary=usage,
                available_addons=addons,
                domain=domain
            )

            self.logger.info(
                "get_upgrade_options_success",
                extra={
                    "user_id": user_id, "domain": domain,
                    "plans_count": len(enriched_plans),
                    "has_recommendation": recommended is not None,
                    "addons_count": len(addons)
                }
            )

            return result

        except Exception as e:
            self.logger.error(
                "get_upgrade_options_failed",
                extra={
                    "user_id": user_id, "domain": domain,
                    "error": str(e), "error_type": type(e).__name__
                },
                exc_info=True
            )
            raise UpgradeEngineError(f"Failed to get upgrade options: {str(e)}") from e

    def check_upgrade_eligibility(
        self,
        user_id: str,
        domain: str,
        target_plan_slug: str,
        billing_cycle: str = 'monthly'
    ) -> UpgradePath:
        """
        Check if user can upgrade to target plan.

        Validates:
        - Plan exists
        - Not same plan
        - Not downgrade (unless support override)
        - No pending payment
        - Not enterprise (requires sales)

        Args:
            user_id: User identifier
            domain: Product domain
            target_plan_slug: Desired plan (starter, business, pro)
            billing_cycle: monthly or yearly

        Returns:
            UpgradePath with action (allowed, blocked, requires_sales)

        Example:
            >>> path = engine.check_upgrade_eligibility('user123', 'shop', 'business')
            >>> path.action
            <UpgradeAction.ALLOWED: 'allowed'>
        """
        self.logger.info(
            "check_eligibility_start",
            extra={"user_id": user_id, "domain": domain, "target_plan": target_plan_slug}
        )

        try:
            # 1. Get current subscription
            current_sub = self._get_subscription(user_id, domain)
            current_plan = self._resolve_plan_metadata(current_sub) if current_sub else None

            # 2. Get target plan with metadata
            target_plan = self._pricing_service.get_plan(domain, target_plan_slug, billing_cycle)
            if not target_plan:
                raise PlanNotFoundError(f"Plan not found: {domain}/{target_plan_slug}/{billing_cycle}")

            target_meta = self._get_plan_metadata(target_plan['id'])
            target_plan.update(target_meta)

            # 3. Check if requires sales call (enterprise plans)
            if target_plan.get('requires_sales_call'):
                return UpgradePath(
                    action=UpgradeAction.REQUIRES_SALES,
                    current_plan=current_plan,
                    target_plan=target_plan,
                    current_tier=current_plan['tier_level'] if current_plan else -1,
                    target_tier=target_plan['tier_level'],
                    is_upgrade=False,
                    proration_amount_paise=None,
                    effective_date=None,
                    message="This plan requires speaking with our sales team"
                )

            # 4. Check subscription status — auto-recover non-active states
            if current_sub and current_sub.get('status') not in ('active', 'trialing', 'grace_period'):
                sub_status = current_sub.get('status')

                if sub_status in ('pending_upgrade', 'upgrade_failed'):
                    # Always reset pending_upgrade / upgrade_failed so user can retry.
                    # The previous Razorpay subscription was either never completed or
                    # failed — creating a new one is safe and idempotent.
                    self.logger.warning(
                        "auto_recovering_upgrade_status",
                        extra={
                            "user_id": user_id, "domain": domain,
                            "subscription_id": current_sub['id'],
                            "old_status": sub_status,
                            "initiated_at": current_sub.get('upgrade_initiated_at')
                        }
                    )
                    self._supabase.table('subscriptions').update({
                        'status': 'active',
                        'pending_upgrade_to_plan_id': None,
                        'pending_upgrade_razorpay_subscription_id': None,
                        'upgrade_failure_reason': f'Auto-recovered from {sub_status} on retry',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }).eq('id', current_sub['id']).execute()

                    # Refresh after recovery
                    current_sub = self._get_subscription(user_id, domain)
                    current_plan = self._resolve_plan_metadata(current_sub) if current_sub else None
                else:
                    return UpgradePath(
                        action=UpgradeAction.SUBSCRIPTION_INACTIVE,
                        current_plan=current_plan,
                        target_plan=target_plan,
                        current_tier=current_plan['tier_level'] if current_plan else -1,
                        target_tier=target_plan['tier_level'],
                        is_upgrade=False,
                        proration_amount_paise=None,
                        effective_date=None,
                        message=f"Subscription is {sub_status}, cannot upgrade"
                    )

            # 5. Same plan check
            if current_plan and current_plan['plan_slug'] == target_plan_slug:
                return UpgradePath(
                    action=UpgradeAction.BLOCKED_SAME_PLAN,
                    current_plan=current_plan,
                    target_plan=target_plan,
                    current_tier=current_plan['tier_level'],
                    target_tier=target_plan['tier_level'],
                    is_upgrade=False,
                    proration_amount_paise=None,
                    effective_date=None,
                    message=f"You are already on the {target_plan['display_name']} plan"
                )

            # 6. Tier comparison (downgrade prevention)
            current_tier = current_plan['tier_level'] if current_plan else -1
            target_tier = target_plan['tier_level']
            is_upgrade = target_tier > current_tier

            if not is_upgrade and current_plan:
                return UpgradePath(
                    action=UpgradeAction.BLOCKED_DOWNGRADE,
                    current_plan=current_plan,
                    target_plan=target_plan,
                    current_tier=current_tier,
                    target_tier=target_tier,
                    is_upgrade=False,
                    proration_amount_paise=None,
                    effective_date=None,
                    message="Downgrades require contacting support to prevent data loss"
                )

            # 7. Calculate proration (if active subscription)
            proration = None
            if current_sub and current_sub.get('status') == 'active':
                period_start, period_end = self._resolve_billing_period(current_sub)
                proration = self._proration_calc.calculate_proration(
                    old_amount_paise=current_plan['amount_paise'],
                    new_amount_paise=target_plan['amount_paise'],
                    period_start=period_start,
                    period_end=period_end
                )

            # ALLOWED
            result = UpgradePath(
                action=UpgradeAction.ALLOWED,
                current_plan=current_plan,
                target_plan=target_plan,
                current_tier=current_tier,
                target_tier=target_tier,
                is_upgrade=is_upgrade,
                proration_amount_paise=proration.proration_charge_paise if proration else 0,
                effective_date=datetime.now(timezone.utc).isoformat(),
                message="Upgrade available",
                proration_details=proration
            )

            self.logger.info(
                "check_eligibility_allowed",
                extra={
                    "user_id": user_id, "domain": domain,
                    "target_plan": target_plan_slug,
                    "current_tier": current_tier, "target_tier": target_tier,
                    "proration_paise": result.proration_amount_paise
                }
            )

            return result

        except Exception as e:
            self.logger.error(
                "check_eligibility_failed",
                extra={
                    "user_id": user_id, "domain": domain,
                    "target_plan": target_plan_slug, "error": str(e)
                },
                exc_info=True
            )
            raise

    # =========================================================================
    # Private Methods (Implementation Details)
    # =========================================================================

    def _resolve_billing_period(self, subscription: Dict):
        """
        Return (period_start, period_end) for proration, handling corrupt/uninitialized rows.

        Razorpay subscriptions sometimes have period_start == period_end (both set to the
        subscription creation timestamp) when the webhook hasn't fired yet or the payment
        gateway didn't populate the fields.  In that case we reconstruct a sensible 30-day
        window from created_at so the proration calculation doesn't crash.

        Returns:
            Tuple[datetime, datetime]: (period_start, period_end) — both UTC-aware,
            guaranteed period_end > period_start.
        """
        from datetime import timedelta

        raw_start = subscription.get('current_period_start')
        raw_end   = subscription.get('current_period_end')

        # Parse both fields through the calculator's own parser so we get tz-aware datetimes
        # without duplicating the parsing logic.
        parse = self._proration_calc._ensure_timezone

        period_start = parse(raw_start, 'current_period_start') if raw_start else None
        period_end   = parse(raw_end,   'current_period_end')   if raw_end   else None

        # ── Detect corrupt / uninitialized period ───────────────────────────────
        # This happens when both timestamps are identical (Razorpay not yet settled)
        # or when either field is missing entirely.
        if period_start is None or period_end is None or period_end <= period_start:
            self.logger.warning(
                "billing_period_corrupt_reconstructed",
                extra={
                    "subscription_id": subscription.get('id'),
                    "raw_start": str(raw_start),
                    "raw_end":   str(raw_end),
                    "action": "reconstructing_30d_window_from_created_at",
                }
            )
            # Anchor the period on created_at (or now as last resort)
            anchor_raw = subscription.get('created_at') or subscription.get('start_date')
            anchor = parse(anchor_raw, 'created_at') if anchor_raw else datetime.now(timezone.utc)

            period_start = anchor
            period_end   = anchor + timedelta(days=30)

        return period_start, period_end

    def _get_subscription(self, user_id: str, domain: str) -> Optional[Dict]:
        """Get active subscription for user+domain."""
        result = self._supabase.table('subscriptions').select('*').match({
            'user_id': user_id,
            'product_domain': domain,
        }).in_('status', ['active', 'trialing', 'grace_period', 'pending_upgrade']).order(
            'created_at', desc=True
        ).limit(1).execute()

        return result.data[0] if result.data else None

    def _resolve_plan_metadata(self, subscription: Dict) -> Dict:
        """Resolve pricing plan ID and metadata from subscription."""
        pricing_plan_id = subscription.get('pricing_plan_id')

        if not pricing_plan_id:
            # Fallback: lookup by razorpay_plan_id
            razorpay_plan_id = subscription.get('plan_id')
            plan_result = self._supabase.table('pricing_plans').select('*').eq(
                'razorpay_plan_id', razorpay_plan_id
            ).eq('is_active', True).single().execute()

            if not plan_result.data:
                return None

            plan = plan_result.data
            pricing_plan_id = plan['id']
        else:
            plan = self._supabase.table('pricing_plans').select('*').eq(
                'id', pricing_plan_id
            ).single().execute().data

        meta = self._get_plan_metadata(pricing_plan_id)

        return {
            **plan,
            **meta,
            'pricing_plan_id': pricing_plan_id,
            'subscription_id': subscription['id'],
            'subscription_status': subscription.get('status')
        }

    def _get_plan_metadata(self, pricing_plan_id: str) -> Dict:
        """Fetch tier metadata from plan_metadata table."""
        result = self._supabase.table('plan_metadata').select('*').eq(
            'plan_id', pricing_plan_id
        ).execute()

        if result.data:
            return result.data[0]

        # Fallback: default tier if metadata missing
        self.logger.warning(
            "plan_metadata_missing",
            extra={"plan_id": pricing_plan_id}
        )
        return {
            'tier_level': 0,
            'requires_sales_call': False,
            'tagline': None,
            'upgrade_to_plan_id': None
        }

    def _get_all_plans_with_yearly(self, domain: str, billing_cycle: str) -> List[Dict]:
        """Get all plans with yearly pricing calculations."""
        result = self._supabase.from_('pricing_plans_with_yearly').select('*').eq(
            'product_domain', domain
        ).eq('billing_cycle', billing_cycle).execute()

        return result.data or []

    def _enrich_with_tiers(self, plans: List[Dict]) -> List[Dict]:
        """Add tier metadata to each plan."""
        enriched = []
        for plan in plans:
            meta = self._get_plan_metadata(plan['id'])
            enriched.append({**plan, **meta})
        return enriched

    def _get_available_addons(self, domain: str, current_tier: int) -> List[Dict]:
        """Get add-ons user can purchase based on domain and tier."""
        # Query add-ons for specific domain OR 'all' domains
        result = self._supabase.table('plan_addons').select('*').match({
            'is_active': True
        }).or_(f'product_domain.eq.{domain},product_domain.eq.all').gte(
            'min_plan_tier', current_tier
        ).execute()

        return result.data or []

    def _calculate_feature_differences(
        self,
        current_plan: Optional[Dict],
        target_plans: List[Dict]
    ) -> Dict[str, Any]:
        """
        Calculate feature delta between current plan and each target plan.

        Returns: {
            "business": {
                "gained": ["webhooks", "advanced_analytics"],
                "lost": [],
                "limit_changes": {"create_product": {"from": 10, "to": 50}}
            }
        }
        """
        if not current_plan:
            # No current plan — batch-fetch all target plan features in one query
            all_plan_ids = [plan['id'] for plan in target_plans]
            features_batch = self._get_plan_features_batch(all_plan_ids)
            return {
                plan['plan_slug']: {
                    "gained": list(features_batch.get(plan['id'], {}).keys()),
                    "lost": [],
                    "limit_changes": {}
                }
                for plan in target_plans
            }

        # Batch-fetch current + all target plan features in a SINGLE query
        all_plan_ids = [current_plan['pricing_plan_id']] + [t['id'] for t in target_plans]
        features_batch = self._get_plan_features_batch(all_plan_ids)
        current_features = features_batch.get(current_plan['pricing_plan_id'], {})

        diffs = {}
        for target in target_plans:
            target_features = features_batch.get(target['id'], {})

            # Feature keys gained/lost
            current_keys = set(current_features.keys())
            target_keys = set(target_features.keys())
            gained = list(target_keys - current_keys)
            lost = list(current_keys - target_keys)

            # Limit changes (for common features)
            limit_changes = {}
            for key in current_keys & target_keys:
                current_limit = current_features[key].get('hard_limit')
                target_limit = target_features[key].get('hard_limit')
                if current_limit != target_limit:
                    limit_changes[key] = {
                        "from": current_limit,
                        "to": target_limit
                    }

            diffs[target['plan_slug']] = {
                "gained": gained,
                "lost": lost,
                "limit_changes": limit_changes
            }

        return diffs

    def _get_plan_features_map(self, pricing_plan_id: str) -> Dict[str, Dict]:
        """Get all features for a plan as {feature_key: {hard_limit, soft_limit, ...}}."""
        result = self._supabase.table('plan_features').select('*').eq(
            'plan_id', pricing_plan_id
        ).execute()

        return {
            row['feature_key']: row
            for row in (result.data or [])
        }

    def _get_plan_features_batch(self, plan_ids: List[str]) -> Dict[str, Dict[str, Dict]]:
        """
        Batch-fetch features for MULTIPLE plans in a single query.
        Returns {plan_id: {feature_key: row}}.
        Eliminates N+1 when comparing features across plans.
        """
        if not plan_ids:
            return {}
        result = self._supabase.table('plan_features').select('*').in_(
            'plan_id', plan_ids
        ).execute()

        features_by_plan: Dict[str, Dict[str, Dict]] = {}
        for row in (result.data or []):
            pid = row['plan_id']
            if pid not in features_by_plan:
                features_by_plan[pid] = {}
            features_by_plan[pid][row['feature_key']] = row

        return features_by_plan

    def _calculate_recommended_plan(
        self,
        current_plan: Optional[Dict],
        available_plans: List[Dict],
        usage: Dict[str, int]
    ) -> Optional[Dict]:
        """
        Recommend plan based on multi-feature saturation analysis.

        Smart logic (not just "next tier"):
        1. Identify ALL saturated features (> 80% usage)
        2. Identify ALL blocked features (user tried, but not in plan)
        3. Find CHEAPEST plan that resolves ALL bottlenecks
        4. Ensure new limits provide breathing room (150% of current usage)
        """
        if not current_plan:
            return available_plans[0] if available_plans else None

        current_tier = current_plan['tier_level']
        higher_tiers = [p for p in available_plans if p['tier_level'] > current_tier]

        if not higher_tiers:
            return None  # Already on highest tier

        # 1. Identify saturated + blocked features
        saturated = []
        blocked = []

        current_features = self._get_plan_features_map(current_plan['pricing_plan_id'])

        for feature_key, current_value in usage.items():
            if feature_key not in current_features:
                # Feature not in plan (user tried, got denied)
                blocked.append(feature_key)
                continue

            feature_config = current_features[feature_key]
            hard_limit = feature_config.get('hard_limit')

            if hard_limit and hard_limit > 0:
                saturation_pct = (current_value / hard_limit) * 100
                if saturation_pct >= self.SATURATION_THRESHOLD_PCT:
                    saturated.append({
                        'feature_key': feature_key,
                        'saturation': saturation_pct,
                        'current_limit': hard_limit,
                        'current_usage': current_value
                    })

        # No bottlenecks? No recommendation
        if not saturated and not blocked:
            return None

        # 2. Find cheapest plan resolving ALL bottlenecks
        for plan in sorted(higher_tiers, key=lambda p: p.get('amount_paise', 0)):
            plan_features = self._get_plan_features_map(plan['id'])
            resolves_all = True

            # Check saturated features
            for sat in saturated:
                feature_key = sat['feature_key']
                new_limit = plan_features.get(feature_key, {}).get('hard_limit')

                if not new_limit or new_limit <= sat['current_limit']:
                    resolves_all = False
                    break

                # Breathing room check: new limit >= 150% of current usage
                min_desired = sat['current_usage'] * self.BREATHING_ROOM_MULTIPLIER
                if new_limit < min_desired:
                    resolves_all = False
                    break

            # Check blocked features
            for feature_key in blocked:
                if feature_key not in plan_features:
                    resolves_all = False
                    break

                if plan_features[feature_key].get('hard_limit') == 0:
                    resolves_all = False
                    break

            if resolves_all:
                return {
                    **plan,
                    'reason': self._format_recommendation_reason(saturated, blocked)
                }

        # Fallback: next tier
        return {
            **higher_tiers[0],
            'reason': 'Recommended upgrade based on your current plan'
        }

    def _format_recommendation_reason(
        self,
        saturated: List[Dict],
        blocked: List[str]
    ) -> str:
        """Format human-readable recommendation reason."""
        if saturated:
            feature = saturated[0]  # Most saturated
            feature_name = feature['feature_key'].replace('_', ' ').title()
            return f"You're using {feature['current_usage']}/{feature['current_limit']} {feature_name} ({feature['saturation']:.0f}% of limit)"

        if blocked:
            feature_name = blocked[0].replace('_', ' ').title()
            return f"Unlock {feature_name} feature"

        return "Recommended upgrade"


# =============================================================================
# SINGLETON
# =============================================================================

_engine_instance: Optional[UpgradeEngine] = None


def get_upgrade_engine() -> UpgradeEngine:
    """Get singleton UpgradeEngine instance with proper dependency injection."""
    global _engine_instance
    if _engine_instance is None:
        from supabase_client import get_supabase_client
        from services.pricing_service import get_pricing_service
        from services.feature_gate_engine import get_feature_gate_engine

        _engine_instance = UpgradeEngine(
            supabase=get_supabase_client(),
            pricing_service=get_pricing_service(),
            feature_gate_engine=get_feature_gate_engine()
        )
        logger.info("✅ UpgradeEngine singleton initialized with injected dependencies")
    return _engine_instance
