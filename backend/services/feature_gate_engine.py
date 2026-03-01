"""
Feature Gate Engine — Principal-Grade Policy Engine
=====================================================
3-layer architecture for enterprise feature gating.

Layer 1: Data Fetch  (Redis L1/L2 → Supabase fallback)
Layer 2: Policy Eval (PURE function — no side effects)
Layer 3: Side Effects (logging, events, audit)

Core design principles:
  - evaluate_policy() is a PURE FUNCTION — deterministic, testable
  - PolicyContext is frozen/immutable — all facts for a decision
  - PolicyDecision is structured — never a bare boolean
  - Soft limits warn, hard limits block
  - Grace states: active/trialing/grace_period → allow
  - Idempotent usage increments via DB RPC
  - Active cache invalidation on mutation events

Usage:
    from services.feature_gate_engine import get_feature_gate_engine

    engine = get_feature_gate_engine()
    decision = engine.check_feature_access(user_id, domain, "create_product")

    if not decision.allowed:
        return {"error": decision.denial_reason}, 403
"""

import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Dict, Any, List

logger = logging.getLogger('reviseit.feature_gate')


# =============================================================================
# CONSTANTS
# =============================================================================

# Subscription statuses that ALLOW feature access
ALLOWED_STATUSES = frozenset({"active", "completed", "trialing", "grace_period"})

# Statuses that allow but flag upgrade_required (warn user)
WARN_STATUSES = frozenset({"past_due"})

# Statuses that BLOCK all feature access
BLOCKED_STATUSES = frozenset({"cancelled", "expired", "halted", "paused", "pending"})

# Cache TTLs (seconds)
SUBSCRIPTION_CACHE_TTL = 60      # 1 minute — may change on payment events
PLAN_FEATURES_CACHE_TTL = 300    # 5 minutes — rarely changes
FEATURE_FLAGS_CACHE_TTL = 300    # 5 minutes — admin toggle

# Cache key prefixes
CACHE_PREFIX_SUB = "fg:sub"
CACHE_PREFIX_PLAN = "fg:plan"
CACHE_PREFIX_FLAGS = "fg:flags"


# =============================================================================
# DENIAL REASONS — Structured error codes
# =============================================================================

class DenialReason(str, Enum):
    """Machine-readable denial codes. Used in API responses and audit logs."""
    FEATURE_DISABLED = "feature_disabled_globally"
    NO_SUBSCRIPTION = "no_active_subscription"
    SUBSCRIPTION_INACTIVE = "subscription_inactive"
    FEATURE_NOT_IN_PLAN = "feature_not_in_plan"
    HARD_LIMIT_EXCEEDED = "hard_limit_exceeded"
    INTERNAL_ERROR = "internal_error"


# =============================================================================
# LAYER 2 DATA STRUCTURES — Immutable
# =============================================================================

@dataclass(frozen=True)
class PolicyContext:
    """
    Immutable evaluation context. Contains ALL facts needed for a decision.
    Built by Layer 1 (data fetch). Consumed by Layer 2 (pure evaluation).

    No references to DB, Redis, or external services.
    """
    # Identity
    user_id: str
    domain: str
    feature_key: str

    # Plan
    plan_slug: Optional[str]
    plan_version: int

    # Subscription
    subscription_status: Optional[str]      # active | past_due | grace_period | etc.

    # Feature config (from plan_features table)
    hard_limit: Optional[int]               # None = boolean/uncounted feature
    soft_limit: Optional[int]               # Warning threshold
    is_unlimited: bool                      # True = no cap regardless
    feature_exists_in_plan: bool            # False = feature not configured for plan

    # Usage (from usage_counters)
    usage: int                              # Current period usage count

    # Global toggle (from feature_flags)
    is_feature_enabled: bool                # False = killed globally


@dataclass(frozen=True)
class PolicyDecision:
    """
    Structured result. Never a bare boolean.
    Returned to middleware, API endpoints, and frontend.
    """
    allowed: bool
    hard_limit: Optional[int]
    soft_limit: Optional[int]
    used: int
    remaining: Optional[int]
    soft_limit_exceeded: bool
    upgrade_required: bool
    denial_reason: Optional[str]            # DenialReason value or None
    feature_key: str

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for API response."""
        return {
            "allowed": self.allowed,
            "hard_limit": self.hard_limit,
            "soft_limit": self.soft_limit,
            "used": self.used,
            "remaining": self.remaining,
            "soft_limit_exceeded": self.soft_limit_exceeded,
            "upgrade_required": self.upgrade_required,
            "denial_reason": self.denial_reason,
            "feature_key": self.feature_key,
        }


# =============================================================================
# LAYER 2: PURE POLICY EVALUATION
# =============================================================================
# This function has NO side effects.
# No DB. No Redis. No logging. No Celery.
# Pure input → output. Deterministic. Testable.

def evaluate_policy(ctx: PolicyContext) -> PolicyDecision:
    """
    Pure policy evaluation function.

    Decision tree:
    1. Feature globally disabled?  → DENY
    2. No subscription?            → DENY
    3. Subscription inactive?      → DENY (or WARN for past_due)
    4. Feature not in plan?        → DENY
    5. Unlimited feature?          → ALLOW
    6. Boolean feature (no limit)? → ALLOW
    7. Under hard limit?           → ALLOW (check soft limit)
    8. At/over hard limit?         → DENY

    Returns PolicyDecision with full context for the frontend.
    """

    # --- Gate 1: Global feature flag ---
    if not ctx.is_feature_enabled:
        return PolicyDecision(
            allowed=False,
            hard_limit=ctx.hard_limit,
            soft_limit=ctx.soft_limit,
            used=ctx.usage,
            remaining=None,
            soft_limit_exceeded=False,
            upgrade_required=False,
            denial_reason=DenialReason.FEATURE_DISABLED,
            feature_key=ctx.feature_key,
        )

    # --- Gate 2: Subscription exists ---
    if ctx.subscription_status is None or ctx.plan_slug is None:
        return PolicyDecision(
            allowed=False,
            hard_limit=None,
            soft_limit=None,
            used=0,
            remaining=None,
            soft_limit_exceeded=False,
            upgrade_required=True,
            denial_reason=DenialReason.NO_SUBSCRIPTION,
            feature_key=ctx.feature_key,
        )

    # --- Gate 3: Subscription status ---
    status = ctx.subscription_status.lower()

    if status in BLOCKED_STATUSES:
        return PolicyDecision(
            allowed=False,
            hard_limit=ctx.hard_limit,
            soft_limit=ctx.soft_limit,
            used=ctx.usage,
            remaining=None,
            soft_limit_exceeded=False,
            upgrade_required=True,
            denial_reason=DenialReason.SUBSCRIPTION_INACTIVE,
            feature_key=ctx.feature_key,
        )

    # past_due: allow but flag upgrade_required
    is_warn_status = status in WARN_STATUSES

    # --- Gate 4: Feature exists in plan ---
    if not ctx.feature_exists_in_plan:
        return PolicyDecision(
            allowed=False,
            hard_limit=None,
            soft_limit=None,
            used=ctx.usage,
            remaining=None,
            soft_limit_exceeded=False,
            upgrade_required=True,
            denial_reason=DenialReason.FEATURE_NOT_IN_PLAN,
            feature_key=ctx.feature_key,
        )

    # --- Gate 5: Unlimited feature ---
    if ctx.is_unlimited:
        return PolicyDecision(
            allowed=True,
            hard_limit=None,
            soft_limit=None,
            used=ctx.usage,
            remaining=None,
            soft_limit_exceeded=False,
            upgrade_required=is_warn_status,
            denial_reason=None,
            feature_key=ctx.feature_key,
        )

    # --- Gate 6: Boolean feature (no counting) ---
    if ctx.hard_limit is None:
        return PolicyDecision(
            allowed=True,
            hard_limit=None,
            soft_limit=None,
            used=0,
            remaining=None,
            soft_limit_exceeded=False,
            upgrade_required=is_warn_status,
            denial_reason=None,
            feature_key=ctx.feature_key,
        )

    # --- Gate 7/8: Counted feature — check hard limit ---
    remaining = max(0, ctx.hard_limit - ctx.usage)
    soft_exceeded = (
        ctx.soft_limit is not None
        and ctx.usage >= ctx.soft_limit
    )

    if ctx.usage >= ctx.hard_limit:
        # HARD LIMIT EXCEEDED — DENY
        return PolicyDecision(
            allowed=False,
            hard_limit=ctx.hard_limit,
            soft_limit=ctx.soft_limit,
            used=ctx.usage,
            remaining=0,
            soft_limit_exceeded=True,
            upgrade_required=True,
            denial_reason=DenialReason.HARD_LIMIT_EXCEEDED,
            feature_key=ctx.feature_key,
        )

    # UNDER LIMIT — ALLOW (may have soft limit warning)
    return PolicyDecision(
        allowed=True,
        hard_limit=ctx.hard_limit,
        soft_limit=ctx.soft_limit,
        used=ctx.usage,
        remaining=remaining,
        soft_limit_exceeded=soft_exceeded,
        upgrade_required=is_warn_status or soft_exceeded,
        denial_reason=None,
        feature_key=ctx.feature_key,
    )


# =============================================================================
# LAYER 1 + 3: FEATURE GATE ENGINE (Orchestrator)
# =============================================================================

class FeatureGateEngine:
    """
    Enterprise feature gate orchestrator.

    Layer 1: Fetches data from Redis cache → Supabase DB fallback
    Layer 2: Calls evaluate_policy() (pure function)
    Layer 3: Structured logging, Celery events, audit trail

    Thread-safe. Singleton via get_feature_gate_engine().
    """

    def __init__(self):
        self._supabase = None
        self._cache = None

    # -------------------------------------------------------------------------
    # Lazy-loaded dependencies
    # -------------------------------------------------------------------------

    @property
    def supabase(self):
        if self._supabase is None:
            from supabase_client import get_supabase_client
            self._supabase = get_supabase_client()
        return self._supabase

    @property
    def cache(self):
        if self._cache is None:
            try:
                from cache import get_cache
                self._cache = get_cache()
            except Exception:
                self._cache = None
        return self._cache

    # =========================================================================
    # PUBLIC API
    # =========================================================================

    def check_feature_access(
        self,
        user_id: str,
        domain: str,
        feature_key: str,
    ) -> PolicyDecision:
        """
        Check if a user can access a feature. Does NOT increment usage.

        Use this for read-only checks (e.g., UI rendering, pre-flight).

        Args:
            user_id: Firebase/Supabase user ID
            domain: Product domain (e.g., 'shop', 'dashboard')
            feature_key: Feature identifier (e.g., 'create_product')

        Returns:
            PolicyDecision with full context
        """
        start_time = time.monotonic()

        try:
            # Layer 1: Build context from cached/fetched data
            ctx = self._build_policy_context(user_id, domain, feature_key)

            # Layer 2: Pure evaluation
            decision = evaluate_policy(ctx)

            # Layer 3: Side effects
            elapsed_ms = (time.monotonic() - start_time) * 1000
            self._log_decision(ctx, decision, elapsed_ms)

            if not decision.allowed:
                self._emit_denial_audit(ctx, decision)

            return decision

        except Exception as e:
            logger.error(
                f"Feature gate error: user={user_id}, domain={domain}, "
                f"feature={feature_key}, error={e}",
                exc_info=True
            )
            # Fail CLOSED — deny on error (enterprise security posture)
            return PolicyDecision(
                allowed=False,
                hard_limit=None,
                soft_limit=None,
                used=0,
                remaining=None,
                soft_limit_exceeded=False,
                upgrade_required=False,
                denial_reason=DenialReason.INTERNAL_ERROR,
                feature_key=feature_key,
            )

    def check_and_increment(
        self,
        user_id: str,
        domain: str,
        feature_key: str,
        idempotency_key: Optional[str] = None,
    ) -> PolicyDecision:
        """
        Check access AND atomically increment usage if allowed.

        Use this for write operations (e.g., sending OTP, creating product).
        Supports idempotency via X-Idempotency-Key header.

        Args:
            user_id: Firebase/Supabase user ID
            domain: Product domain
            feature_key: Feature identifier
            idempotency_key: Optional key to prevent double-increment

        Returns:
            PolicyDecision with updated usage count
        """
        start_time = time.monotonic()

        try:
            # Layer 1: Build context
            ctx = self._build_policy_context(user_id, domain, feature_key)

            # Layer 2: Pure evaluation (pre-check)
            decision = evaluate_policy(ctx)

            if not decision.allowed:
                elapsed_ms = (time.monotonic() - start_time) * 1000
                self._log_decision(ctx, decision, elapsed_ms)
                self._emit_denial_audit(ctx, decision)
                return decision

            # Feature is allowed — atomically increment in DB
            # Resolve to Supabase UUID — usage_counters.user_id is Supabase UUID
            supabase_uuid_for_increment = self._resolve_to_supabase_uuid(user_id)
            if ctx.hard_limit is not None or ctx.is_unlimited:
                # Counted feature: use atomic RPC
                increment_result = self._atomic_increment(
                    supabase_uuid_for_increment, domain, feature_key,
                    ctx.hard_limit, ctx.soft_limit, ctx.is_unlimited,
                    idempotency_key
                )

                # Build final decision from DB result
                new_value = increment_result.get('new_value', ctx.usage)
                hard_limit = increment_result.get('hard_limit', ctx.hard_limit)
                soft_exceeded = increment_result.get('soft_limit_exceeded', False)
                was_allowed = increment_result.get('allowed', True)

                remaining = max(0, hard_limit - new_value) if hard_limit else None

                decision = PolicyDecision(
                    allowed=was_allowed,
                    hard_limit=hard_limit,
                    soft_limit=ctx.soft_limit,
                    used=new_value,
                    remaining=remaining,
                    soft_limit_exceeded=soft_exceeded,
                    upgrade_required=soft_exceeded or not was_allowed,
                    denial_reason=DenialReason.HARD_LIMIT_EXCEEDED if not was_allowed else None,
                    feature_key=feature_key,
                )

            # Layer 3: Side effects
            elapsed_ms = (time.monotonic() - start_time) * 1000
            self._log_decision(ctx, decision, elapsed_ms)

            if decision.allowed:
                self._emit_usage_event(user_id, domain, feature_key, decision)

            if not decision.allowed:
                self._emit_denial_audit(ctx, decision)

            return decision

        except Exception as e:
            logger.error(
                f"Feature gate increment error: user={user_id}, domain={domain}, "
                f"feature={feature_key}, error={e}",
                exc_info=True
            )
            return PolicyDecision(
                allowed=False,
                hard_limit=None,
                soft_limit=None,
                used=0,
                remaining=None,
                soft_limit_exceeded=False,
                upgrade_required=False,
                denial_reason=DenialReason.INTERNAL_ERROR,
                feature_key=feature_key,
            )

    def get_usage_summary(
        self,
        user_id: str,
        domain: str,
        format: str = 'dict'
    ) -> Dict[str, int] | List[Dict[str, Any]]:
        """
        Get all usage counters for a user+domain.

        Used by:
        - /api/features/usage endpoint (format='list')
        - UpgradeEngine for recommendation logic (format='dict')

        Args:
            user_id: User's Supabase UUID
            domain: Product domain (e.g., 'shop')
            format: 'dict' for {feature_key: value} or 'list' for full details

        Returns:
            If format='dict': {"create_product": 8, "ai_responses": 450, ...}
            If format='list': [{"feature_key": "...", "current_value": ..., ...}, ...]
        """
        try:
            supabase_uuid = self._resolve_to_supabase_uuid(user_id)
            result = self.supabase.table('usage_counters').select(
                'feature_key, current_value, reset_at, period_start'
            ).match({
                'user_id': supabase_uuid,
                'domain': domain,
            }).execute()

            if not result.data:
                return {} if format == 'dict' else []

            if format == 'dict':
                # Return simple map of feature_key -> current_value
                return {
                    row['feature_key']: row['current_value']
                    for row in result.data
                }
            else:
                # Return full details
                return result.data

        except Exception as e:
            logger.error(f"Usage summary error: {e}", exc_info=True)
            return {} if format == 'dict' else []

    # =========================================================================
    # CACHE INVALIDATION — Active, not just TTL
    # =========================================================================

    def invalidate_subscription_cache(self, user_id: str, domain: str):
        """
        Called from: webhook handler, plan_change_service.
        Immediately evicts the cached subscription data.
        """
        if self.cache:
            key = f"{CACHE_PREFIX_SUB}:{user_id}:{domain}"
            try:
                self.cache.delete(key)
                logger.info(f"🗑️ Cache invalidated: {key}")
            except Exception as e:
                logger.warning(f"Cache invalidation failed: {key}, error={e}")

    def invalidate_plan_cache(self, plan_id: str):
        """
        Called from: admin plan update.
        Evicts cached plan features for a specific plan.
        """
        if self.cache:
            pattern = f"{CACHE_PREFIX_PLAN}:{plan_id}:*"
            try:
                self.cache.invalidate_pattern(pattern)
                logger.info(f"🗑️ Cache invalidated: {pattern}")
            except Exception as e:
                logger.warning(f"Cache invalidation failed: {pattern}, error={e}")

    def invalidate_feature_flags_cache(self):
        """
        Called from: feature flag toggle API.
        Evicts the global feature flags cache.
        """
        if self.cache:
            try:
                self.cache.delete(CACHE_PREFIX_FLAGS)
                logger.info(f"🗑️ Cache invalidated: {CACHE_PREFIX_FLAGS}")
            except Exception as e:
                logger.warning(f"Cache invalidation failed: {CACHE_PREFIX_FLAGS}, error={e}")

    def invalidate_usage_counter_cache(self, user_id: str, domain: str, feature_key: str = None):
        """
        Called after: usage counter increment, counter reset.
        Evicts cached usage counter data to force fresh DB reads.

        CRITICAL: Usage counters are NOT cached by this engine (see _get_current_usage),
        but this method exists for defensive programming and future-proofing if caching
        is added to other layers (e.g., API responses, frontend state).

        Args:
            user_id: User's Supabase UUID
            domain: Product domain (e.g., 'shop')
            feature_key: Optional specific feature key. If None, invalidates all counters.
        """
        if self.cache:
            try:
                if feature_key:
                    # Invalidate specific counter cache (if it exists)
                    key = f"usage_counter:{user_id}:{domain}:{feature_key}"
                    self.cache.delete(key)
                    logger.debug(f"🗑️ Usage counter cache invalidated: {key}")
                else:
                    # Invalidate all counters for user+domain
                    pattern = f"usage_counter:{user_id}:{domain}:*"
                    self.cache.invalidate_pattern(pattern)
                    logger.debug(f"🗑️ Usage counter cache pattern invalidated: {pattern}")
            except Exception as e:
                logger.warning(f"Usage counter cache invalidation failed: {e}")

    def invalidate_all_usage_counters(self, user_id: str, domain: str):
        """
        Convenience method to invalidate all usage counters for a user+domain.
        Called from UpgradeOrchestrator after plan changes.

        Args:
            user_id: User's Supabase UUID
            domain: Product domain (e.g., 'shop')
        """
        self.invalidate_usage_counter_cache(user_id, domain, feature_key=None)

    def increment_subscription_version(self, user_id: str, domain: str):
        """
        Increment subscription version to invalidate all cached data.

        Called after mutations that change entitlements:
        - Plan upgrade/downgrade
        - Add-on added/removed
        - Plan override applied

        This forces all caches using versioned keys to miss, ensuring
        immediate consistency after plan changes.

        Args:
            user_id: User's Supabase UUID
            domain: Product domain (e.g., 'shop')
        """
        if self.cache:
            try:
                version_key = f"subscription_version:{user_id}:{domain}"
                new_version = self.cache.incr(version_key)

                # Set TTL if this is a new key
                if new_version == 1:
                    self.cache.expire(version_key, 86400)  # 24h TTL

                logger.info(
                    f"🔄 Subscription version incremented to {new_version} for {user_id}:{domain}"
                )

                # Also invalidate the subscription cache directly (belt + suspenders)
                self.invalidate_subscription_cache(user_id, domain)

            except Exception as e:
                logger.warning(f"Subscription version increment failed: {e}")

    # =========================================================================
    # LAYER 1: DATA FETCH (Redis → DB fallback)
    # =========================================================================

    def _get_subscription_cache_key(self, user_id: str, domain: str) -> str:
        """
        Get versioned cache key for subscription data.

        Format: fg:sub:{user_id}:{domain}:v{version}

        When subscription changes (upgrade, add-on, override), we increment
        the version number to force cache miss, ensuring immediate consistency.

        Args:
            user_id: User's Supabase UUID
            domain: Product domain (e.g., 'shop')

        Returns:
            Versioned cache key string
        """
        if not self.cache:
            # No cache available, return non-versioned key
            return f"{CACHE_PREFIX_SUB}:{user_id}:{domain}"

        try:
            version_key = f"subscription_version:{user_id}:{domain}"
            version = self.cache.get(version_key)

            if version is None:
                # First access, initialize version
                version = 1
                self.cache.set(version_key, version, ttl=86400)  # 24h TTL

            return f"{CACHE_PREFIX_SUB}:{user_id}:{domain}:v{version}"

        except Exception as e:
            logger.warning(f"Failed to get subscription version: {e}")
            # Fallback to non-versioned key
            return f"{CACHE_PREFIX_SUB}:{user_id}:{domain}"

    def _get_effective_limit(
        self,
        user_id: str,
        domain: str,
        feature_key: str,
        plan_hard_limit: Optional[int],
        is_unlimited: bool,
        subscription_id: Optional[str] = None
    ) -> tuple[Optional[int], bool]:
        """
        Calculate effective limit by merging:
        1. Plan base limit
        2. Add-on limit increases
        3. Plan overrides (manual exceptions)

        Returns: (effective_hard_limit, is_unlimited)

        Formula:
            effective_limit = plan_hard_limit
                            + sum(addon.limit_increase * quantity)
                            + override_limit

        Precedence (highest to lowest):
        1. Plan override (support granted exception)
        2. is_unlimited flag from any source
        3. Base plan + add-ons

        Args:
            user_id: User's Supabase UUID
            domain: Product domain
            feature_key: Feature identifier
            plan_hard_limit: Base limit from plan_features table
            is_unlimited: Unlimited flag from plan_features
            subscription_id: Optional subscription ID (for performance)

        Returns:
            Tuple of (effective_limit, is_unlimited)
        """
        try:
            # 1. Check plan_overrides first (highest priority)
            from datetime import datetime, timezone

            override_result = self.supabase.table('plan_overrides').select('*').match({
                'user_id': user_id,
                'domain': domain,
                'feature_key': feature_key
            }).execute()

            if override_result.data:
                override_data = override_result.data[0]
                # Check if expired
                expires_at = override_data.get('expires_at')
                if not expires_at or datetime.fromisoformat(expires_at.replace('Z', '+00:00')) > datetime.now(timezone.utc):
                    # Override is active
                    if override_data.get('override_is_unlimited'):
                        logger.debug(f"Plan override: {feature_key} unlimited for {user_id}:{domain}")
                        return (None, True)
                    if override_data.get('override_hard_limit') is not None:
                        override_limit = override_data['override_hard_limit']
                        logger.debug(f"Plan override: {feature_key} limit={override_limit} for {user_id}:{domain}")
                        return (override_limit, False)

            # 2. Check unlimited flag (from plan or override)
            if is_unlimited:
                return (None, True)

            # 3. Calculate base + add-ons
            effective_limit = plan_hard_limit or 0

            # Get subscription if not provided
            if subscription_id is None:
                sub = self._get_subscription(user_id, domain)
                if sub:
                    subscription_id = sub.get('id')

            if subscription_id:
                # Fetch active add-ons for this subscription
                addons_result = self.supabase.table('subscription_addons').select(
                    'addon_id, quantity'
                ).match({
                    'subscription_id': subscription_id,
                    'status': 'active'
                }).execute()

                if addons_result.data:
                    # Batch-fetch ALL addon details in one query instead of N+1
                    addon_ids = [row['addon_id'] for row in addons_result.data]
                    all_addons_result = self.supabase.table('plan_addons').select(
                        'id, addon_slug, feature_key, limit_increase'
                    ).in_('id', addon_ids).execute()

                    addon_map = {a['id']: a for a in (all_addons_result.data or [])}

                    for addon_row in addons_result.data:
                        addon = addon_map.get(addon_row['addon_id'])
                        if addon and addon.get('feature_key') == feature_key:
                            quantity = addon_row.get('quantity', 1)
                            limit_increase = addon.get('limit_increase', 0) * quantity
                            effective_limit += limit_increase
                            logger.debug(
                                f"Add-on '{addon.get('addon_slug')}' increased {feature_key} "
                                f"by {limit_increase} for {user_id}:{domain}"
                            )

            return (effective_limit if effective_limit > 0 else plan_hard_limit, False)

        except Exception as e:
            logger.error(f"Error calculating effective limit: {e}", exc_info=True)
            # Fallback to plan limit only
            return (plan_hard_limit, is_unlimited)

    def _build_policy_context(
        self, user_id: str, domain: str, feature_key: str
    ) -> PolicyContext:
        """
        Assemble all facts needed for policy evaluation.
        Reads from Redis cache first, falls back to Supabase.
        """
        # 1. Feature flags (global toggle)
        flags = self._get_feature_flags()
        is_enabled = flags.get(feature_key, True)  # Default: enabled

        # Resolve user_id to Supabase UUID once — all downstream DB calls
        # (subscriptions, usage_counters, plan_overrides) use Supabase UUID.
        # _get_subscription, _get_current_usage also do their own resolution,
        # but resolving here avoids repeated DB lookups for each sub-call.
        supabase_uuid = self._resolve_to_supabase_uuid(user_id)

        # 2. Subscription
        sub = self._get_subscription(supabase_uuid, domain)

        if not sub:
            return PolicyContext(
                user_id=user_id,
                domain=domain,
                feature_key=feature_key,
                plan_slug=None,
                plan_version=1,
                subscription_status=None,
                hard_limit=None,
                soft_limit=None,
                is_unlimited=False,
                feature_exists_in_plan=False,
                usage=0,
                is_feature_enabled=is_enabled,
            )

        plan_slug = sub.get('plan_name', '')
        plan_version = sub.get('plan_version', 1)
        sub_status = sub.get('status', 'expired')
        pricing_plan_id = sub.get('pricing_plan_id')

        # 3. Plan features
        feature_config = self._get_plan_feature(pricing_plan_id, plan_version, feature_key)

        if not feature_config:
            return PolicyContext(
                user_id=user_id,
                domain=domain,
                feature_key=feature_key,
                plan_slug=plan_slug,
                plan_version=plan_version,
                subscription_status=sub_status,
                hard_limit=None,
                soft_limit=None,
                is_unlimited=False,
                feature_exists_in_plan=False,
                usage=0,
                is_feature_enabled=is_enabled,
            )

        # 4. Calculate effective limit (plan + add-ons + overrides)
        subscription_id = sub.get('id')
        effective_hard_limit, effective_is_unlimited = self._get_effective_limit(
            user_id=supabase_uuid,
            domain=domain,
            feature_key=feature_key,
            plan_hard_limit=feature_config.get('hard_limit'),
            is_unlimited=feature_config.get('is_unlimited', False),
            subscription_id=subscription_id
        )

        # 5. Usage counter (always from DB, never cached)
        usage = self._get_current_usage(supabase_uuid, domain, feature_key)

        # 5b. Counter reconciliation for create_product
        # Product deletions don't decrement usage_counters, causing drift.
        # Reconcile counter with actual product count before evaluating limits.
        # CRITICAL: Must run even when usage == 0. If no usage_counters row
        # exists (new user or row never created), usage defaults to 0 — but
        # the user may already have products created before the feature gate
        # was deployed, or the counter row was never initialized. Without
        # this check, the gate sees usage=0 < hard_limit → ALLOW, bypassing
        # the limit entirely. Domain-agnostic: works for all domains/plans.
        if feature_key == 'create_product':
            usage = self._reconcile_product_counter(supabase_uuid, domain, feature_key, usage)

        return PolicyContext(
            user_id=user_id,  # Keep original for logging/audit trail
            domain=domain,
            feature_key=feature_key,
            plan_slug=plan_slug,
            plan_version=plan_version,
            subscription_status=sub_status,
            hard_limit=effective_hard_limit,  # ← Now includes add-ons + overrides
            soft_limit=feature_config.get('soft_limit'),
            is_unlimited=effective_is_unlimited,  # ← Can be true from override
            feature_exists_in_plan=True,
            usage=usage,
            is_feature_enabled=is_enabled,
        )

    def _get_feature_flags(self) -> Dict[str, bool]:
        """Get all feature flags. Cached in Redis for 5 min."""
        # Try cache
        if self.cache:
            try:
                cached = self.cache.get(CACHE_PREFIX_FLAGS)
                if cached:
                    return cached
            except Exception:
                pass

        # DB fallback
        try:
            result = self.supabase.table('feature_flags').select(
                'feature_key, is_enabled_globally'
            ).execute()

            flags = {}
            if result.data:
                flags = {
                    row['feature_key']: row['is_enabled_globally']
                    for row in result.data
                }

            # Cache
            if self.cache and flags:
                try:
                    self.cache.set(CACHE_PREFIX_FLAGS, flags, ttl=FEATURE_FLAGS_CACHE_TTL)
                except Exception:
                    pass

            return flags
        except Exception as e:
            logger.error(f"Feature flags fetch error: {e}", exc_info=True)
            return {}  # Default: all enabled

    def _resolve_to_supabase_uuid(self, user_id: str) -> str:
        """
        Resolve Firebase UID → Supabase UUID if needed.

        subscriptions.user_id is a FK to users.id (Supabase UUID).
        Callers may pass either a Firebase UID (alphanumeric, no dashes)
        or a Supabase UUID (36-char, with dashes). This method normalises
        the input so all DB queries use the correct UUID.

        Returns the Supabase UUID if resolution succeeds, otherwise the
        original value (so the caller can still try the query).
        """
        # Already a UUID (36 chars with dashes)
        if user_id and '-' in user_id and len(user_id) == 36:
            return user_id

        # Firebase UID: look up the Supabase UUID
        try:
            users_result = self.supabase.table('users').select('id').eq(
                'firebase_uid', user_id
            ).limit(1).execute()
            if users_result.data and users_result.data[0].get('id'):
                supabase_uuid = users_result.data[0]['id']
                logger.debug(
                    f"[FEATURE_GATE] Resolved Firebase UID → Supabase UUID: "
                    f"{user_id[:8]}... → {supabase_uuid}"
                )
                return supabase_uuid
        except Exception as e:
            logger.warning(f"[FEATURE_GATE] UID resolution failed for {user_id}: {e}")

        return user_id  # Fallback: return as-is

    def _get_subscription(self, user_id: str, domain: str) -> Optional[Dict]:
        """
        Get user's active subscription. Cached in Redis with versioned key.

        Uses versioned cache keys (subscription_version) to ensure immediate
        consistency after plan changes. When UpgradeOrchestrator increments
        the version, this cache automatically misses and refetches from DB.
        """
        # Use versioned cache key (keyed on original user_id for cache consistency)
        cache_key = self._get_subscription_cache_key(user_id, domain)

        # Try cache
        if self.cache:
            try:
                cached = self.cache.get(cache_key)
                if cached:
                    return cached
            except Exception:
                pass

        # DB fallback
        try:
            # Resolve Firebase UID → Supabase UUID.
            # subscriptions.user_id is a FK to users.id (Supabase UUID).
            supabase_uuid = self._resolve_to_supabase_uuid(user_id)

            # Step 1: Get subscription filtered by product_domain.
            # CRITICAL: Select both plan_id (Razorpay) AND pricing_plan_id (UUID FK).
            # pricing_plan_id is the authoritative source of truth — it is always
            # updated when the plan changes (upgrade, webhook, verify-payment).
            # plan_id (Razorpay plan ID) may lag if an older code path didn't update it.
            result = self.supabase.table('subscriptions').select(
                'id, user_id, plan_id, pricing_plan_id, plan_name, status, product_domain, created_at'
            ).match({
                'user_id': supabase_uuid,
                'product_domain': domain,
            }).in_(
                'status', ['active', 'completed', 'past_due', 'grace_period', 'trialing', 'trial', 'processing', 'pending_upgrade', 'upgrade_failed']
            ).order('created_at', desc=True).limit(1).execute()

            if not result.data:
                return None

            sub = result.data[0]

            # Step 2: Resolve to a pricing_plans row.
            # Priority: pricing_plan_id (UUID FK) > plan_id (Razorpay ID) lookup.
            # This makes the gate resilient against plan_id drift that occurs when
            # old upgrade paths didn't update the Razorpay plan ID column.
            plan = None

            direct_pricing_plan_id = sub.get('pricing_plan_id')
            if direct_pricing_plan_id:
                # Fast path: pricing_plan_id is already the UUID FK — one lookup
                direct_result = self.supabase.table('pricing_plans').select(
                    'id, plan_slug, product_domain, pricing_version, is_active'
                ).eq('id', direct_pricing_plan_id).limit(1).execute()
                if direct_result.data:
                    plan = direct_result.data[0]
                    logger.debug(
                        f"[FEATURE_GATE] Resolved via pricing_plan_id={direct_pricing_plan_id[:8]}..."
                    )

            if not plan:
                # Fallback: derive from razorpay plan_id (legacy path)
                razorpay_plan_id = sub.get('plan_id')
                if not razorpay_plan_id:
                    logger.warning(
                        f"Subscription {sub.get('id')} has neither pricing_plan_id nor plan_id"
                    )
                    return None

                plan_result = self.supabase.table('pricing_plans').select(
                    'id, plan_slug, product_domain, pricing_version, is_active'
                ).eq('razorpay_plan_id', razorpay_plan_id).eq(
                    'is_active', True
                ).execute()

                if not plan_result.data:
                    logger.error(
                        f"No pricing_plan found for razorpay_plan_id={razorpay_plan_id}"
                    )
                    return None

                plan = plan_result.data[0]
                logger.debug(
                    f"[FEATURE_GATE] Resolved via razorpay plan_id (fallback) → {plan.get('plan_slug')}"
                )

            # Step 3: Combine subscription + plan data
            combined = {
                'id': sub.get('id'),
                'user_id': sub.get('user_id'),
                'status': sub.get('status'),
                'plan_name': plan.get('plan_slug'),  # "starter", "business", etc.
                'pricing_plan_id': plan.get('id'),   # UUID for plan_features lookup
                'plan_version': plan.get('pricing_version', 1),
                'product_domain': plan.get('product_domain'),
                'razorpay_plan_id': sub.get('plan_id'),
            }

            # Cache
            if self.cache and combined:
                try:
                    self.cache.set(cache_key, combined, ttl=SUBSCRIPTION_CACHE_TTL)
                except Exception:
                    pass

            return combined
        except Exception as e:
            logger.error(f"[FEATURE_GATE] ❌ Subscription fetch error: {e}", exc_info=True)
            return None

    def _get_plan_feature(
        self, pricing_plan_id: Optional[str], plan_version: int, feature_key: str
    ) -> Optional[Dict]:
        """Get feature config for a plan. Cached in Redis for 5 min."""
        if not pricing_plan_id:
            return None

        # Get all features for the plan, then filter
        all_features = self._get_plan_features_map(pricing_plan_id, plan_version)
        return all_features.get(feature_key) if all_features else None

    def _get_plan_features_map(
        self, pricing_plan_id: Optional[str], plan_version: int = 1
    ) -> Dict[str, Dict]:
        """
        Get all features for a plan as a dictionary.

        Used by:
        - _get_plan_feature() - fetch single feature
        - UpgradeEngine - calculate feature differences

        Returns:
            {"create_product": {"hard_limit": 10, ...}, "webhooks": {...}, ...}
        """
        if not pricing_plan_id:
            return {}

        cache_key = f"{CACHE_PREFIX_PLAN}:{pricing_plan_id}:{plan_version}"

        # Try cache — we cache ALL features for a plan
        all_features = None
        if self.cache:
            try:
                all_features = self.cache.get(cache_key)
            except Exception:
                pass

        if all_features is None:
            # DB fallback
            try:
                result = self.supabase.table('plan_features').select(
                    'feature_key, hard_limit, soft_limit, is_unlimited'
                ).eq('plan_id', pricing_plan_id).execute()

                all_features = {}
                if result.data:
                    all_features = {
                        row['feature_key']: row
                        for row in result.data
                    }

                # Fallback: if no features found, try sibling plan with same slug
                # (monthly vs yearly have different UUIDs but same plan_slug)
                if not all_features:
                    try:
                        plan_result = self.supabase.table('pricing_plans').select(
                            'plan_slug, product_domain'
                        ).eq('id', pricing_plan_id).limit(1).execute()

                        if plan_result.data:
                            slug = plan_result.data[0]['plan_slug']
                            domain = plan_result.data[0].get('product_domain', 'shop')

                            sibling_result = self.supabase.table('pricing_plans').select(
                                'id'
                            ).eq('plan_slug', slug).eq(
                                'product_domain', domain
                            ).eq('is_active', True).neq(
                                'id', pricing_plan_id
                            ).limit(1).execute()

                            if sibling_result.data:
                                sibling_id = sibling_result.data[0]['id']
                                sibling_features = self.supabase.table('plan_features').select(
                                    'feature_key, hard_limit, soft_limit, is_unlimited'
                                ).eq('plan_id', sibling_id).execute()

                                if sibling_features.data:
                                    all_features = {
                                        row['feature_key']: row
                                        for row in sibling_features.data
                                    }
                                    logger.info(
                                        f"plan_features_sibling_fallback slug={slug} "
                                        f"from={sibling_id} for={pricing_plan_id}"
                                    )
                    except Exception as e:
                        logger.warning(f"Sibling plan fallback failed: {e}")

                # Cache ALL features for this plan (one Redis key)
                if self.cache:
                    try:
                        self.cache.set(cache_key, all_features, ttl=PLAN_FEATURES_CACHE_TTL)
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"Plan features fetch error: {e}", exc_info=True)
                return {}

        return all_features or {}

    def _get_current_usage(self, user_id: str, domain: str, feature_key: str) -> int:
        """Get current usage count. NEVER cached — always real-time from DB."""
        try:
            supabase_uuid = self._resolve_to_supabase_uuid(user_id)
            result = self.supabase.table('usage_counters').select(
                'current_value, reset_at'
            ).match({
                'user_id': supabase_uuid,
                'domain': domain,
                'feature_key': feature_key,
            }).limit(1).execute()

            if not result.data:
                return 0

            counter = result.data[0]

            # Check if period expired (auto-reset handled by RPC, but we
            # need correct data for read-only checks)
            from datetime import datetime, timezone
            reset_at = counter.get('reset_at')
            if reset_at:
                try:
                    reset_dt = datetime.fromisoformat(reset_at.replace('Z', '+00:00'))
                    if datetime.now(timezone.utc) >= reset_dt:
                        return 0  # Period expired, treat as reset
                except (ValueError, TypeError):
                    pass

            return counter.get('current_value', 0)
        except Exception as e:
            logger.error(f"Usage counter fetch error: {e}", exc_info=True)
            return 0  # Default: 0 usage (fail open for reads)

    def _reconcile_product_counter(
        self, user_id: str, domain: str, feature_key: str, counter_value: int
    ) -> int:
        """
        Reconcile usage counter with actual product count.
        
        Products table uses Firebase UID as user_id, but usage_counters
        uses the Supabase UUID. We look up the Firebase UID from users
        table, then count actual non-deleted products.
        
        Handles all edge cases:
        - Counter row missing (new user, pre-feature-gate products)
        - Counter drift (product deleted but counter not decremented)
        - Zero counter with actual products (most critical bypass vector)
        
        Returns the reconciled usage value.
        """
        try:
            # 1. Get Firebase UID — user_id may be Firebase UID or Supabase UUID
            # Detect format: Firebase UIDs are alphanumeric (no dashes),
            # Supabase UUIDs are 36 chars with dashes.
            if '-' in user_id and len(user_id) == 36:
                # Already a Supabase UUID — look up Firebase UID
                user_result = self.supabase.table('users').select(
                    'firebase_uid'
                ).eq('id', user_id).limit(1).execute()

                if not user_result.data:
                    logger.warning(f"[RECONCILE] No user found for id={user_id}")
                    return counter_value

                firebase_uid = user_result.data[0].get('firebase_uid')
            else:
                # Already a Firebase UID
                firebase_uid = user_id

            if not firebase_uid:
                return counter_value

            # 2. Count actual non-deleted products + their variants
            # Each product counts as 1, each variant also counts as 1.
            # Example: 1 product with 2 variants = 3 items toward limit.
            product_result = self.supabase.table('products').select(
                'id', count='exact'
            ).eq('user_id', firebase_uid).neq(
                'is_deleted', True
            ).execute()

            product_count = product_result.count if product_result.count is not None else 0

            # Count variants belonging to non-deleted products
            variant_count = 0
            if product_count > 0:
                # Get IDs of non-deleted products, then count their variants
                product_ids_result = self.supabase.table('products').select(
                    'id'
                ).eq('user_id', firebase_uid).neq(
                    'is_deleted', True
                ).execute()

                if product_ids_result.data:
                    product_ids = [p['id'] for p in product_ids_result.data]
                    variant_result = self.supabase.table('product_variants').select(
                        'id', count='exact'
                    ).in_('product_id', product_ids).execute()
                    variant_count = variant_result.count if variant_result.count is not None else 0

            actual_count = product_count + variant_count

            # 3. If counter matches reality, no correction needed
            if counter_value == actual_count:
                return counter_value

            # 4. Counter drifted — correct it
            logger.warning(
                f"[RECONCILE] Counter drift detected for user={user_id}: "
                f"counter={counter_value}, actual={actual_count}. Correcting."
            )
            try:
                # Use upsert to handle both cases:
                # - Row exists but value is wrong → update
                # - Row doesn't exist at all → insert
                self.supabase.table('usage_counters').upsert({
                    'user_id': user_id,
                    'domain': domain,
                    'feature_key': feature_key,
                    'current_value': actual_count,
                }, on_conflict='user_id,domain,feature_key').execute()
            except Exception as update_err:
                logger.error(
                    f"[RECONCILE] Failed to upsert counter: {update_err}"
                )
                # Still return actual count for this request even if DB write failed
            return actual_count

        except Exception as e:
            logger.error(f"[RECONCILE] Error reconciling counter: {e}", exc_info=True)
            return counter_value  # Fail safe: use existing counter value


    def _atomic_increment(
        self,
        user_id: str,
        domain: str,
        feature_key: str,
        hard_limit: Optional[int],
        soft_limit: Optional[int],
        is_unlimited: bool,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Atomically check limit + increment via Supabase RPC.
        Returns the DB result dict.
        
        CRITICAL: After successful increment, invalidates any cached usage counter data
        to ensure subsequent reads get fresh values from the database.
        """
        try:
            result = self.supabase.rpc('check_and_increment_usage', {
                'p_user_id': user_id,
                'p_domain': domain,
                'p_feature_key': feature_key,
                'p_hard_limit': hard_limit,
                'p_soft_limit': soft_limit,
                'p_is_unlimited': is_unlimited,
                'p_idempotency_key': idempotency_key,
            }).execute()

            if result.data:
                # CACHE INVALIDATION: Ensure subsequent reads get fresh counter values
                # This prevents stale cache from showing incorrect "limit reached" errors
                try:
                    self.invalidate_usage_counter_cache(user_id, domain, feature_key)
                except Exception as cache_err:
                    # Cache invalidation failure is non-critical, log and continue
                    logger.warning(f"Cache invalidation failed after increment: {cache_err}")
                
                return result.data
            return {'allowed': True, 'new_value': 0, 'soft_limit_exceeded': False}
        except Exception as e:
            logger.error(f"Atomic increment failed: {e}", exc_info=True)
            # Fail CLOSED on increment errors
            return {'allowed': False, 'new_value': 0, 'soft_limit_exceeded': False}

    # =========================================================================
    # LAYER 3: SIDE EFFECTS
    # =========================================================================

    def _log_decision(
        self, ctx: PolicyContext, decision: PolicyDecision, elapsed_ms: float
    ):
        """Structured observability log. Every decision is logged."""
        log_data = {
            "user_id": ctx.user_id,
            "domain": ctx.domain,
            "feature_key": ctx.feature_key,
            "plan_slug": ctx.plan_slug,
            "subscription_status": ctx.subscription_status,
            "allowed": decision.allowed,
            "used": decision.used,
            "hard_limit": decision.hard_limit,
            "soft_limit_exceeded": decision.soft_limit_exceeded,
            "denial_reason": decision.denial_reason,
            "latency_ms": round(elapsed_ms, 2),
        }

        if decision.allowed:
            logger.info("feature_gate_decision", extra=log_data)
        else:
            logger.warning("feature_gate_denied", extra=log_data)

    def _emit_usage_event(
        self,
        user_id: str,
        domain: str,
        feature_key: str,
        decision: PolicyDecision,
    ):
        """Emit async event via Celery for analytics/billing/abuse detection."""
        try:
            from tasks.usage_events import process_feature_usage_event
            process_feature_usage_event.delay({
                "user_id": user_id,
                "domain": domain,
                "feature_key": feature_key,
                "allowed": decision.allowed,
                "used": decision.used,
                "hard_limit": decision.hard_limit,
                "soft_limit_exceeded": decision.soft_limit_exceeded,
                "timestamp": time.time(),
            })
        except Exception as e:
            # Event emission failure must NEVER block the main flow
            logger.warning(f"Usage event emission failed: {e}")

    def _emit_denial_audit(self, ctx: PolicyContext, decision: PolicyDecision):
        """Log denial to audit trail for compliance."""
        try:
            from audit_logger import AuditLogger
            audit = AuditLogger(self.supabase)
            audit.log_event(
                event_type="feature_gate_denied",
                user_id=ctx.user_id,
                metadata={
                    "domain": ctx.domain,
                    "feature_key": ctx.feature_key,
                    "denial_reason": decision.denial_reason,
                    "plan_slug": ctx.plan_slug,
                    "subscription_status": ctx.subscription_status,
                    "used": decision.used,
                    "hard_limit": decision.hard_limit,
                },
            )
        except Exception as e:
            # Audit failure must NEVER block the main flow
            logger.warning(f"Denial audit failed: {e}")


# =============================================================================
# SINGLETON
# =============================================================================

_engine_instance: Optional[FeatureGateEngine] = None


def get_feature_gate_engine() -> FeatureGateEngine:
    """Get singleton FeatureGateEngine instance."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = FeatureGateEngine()
    return _engine_instance
