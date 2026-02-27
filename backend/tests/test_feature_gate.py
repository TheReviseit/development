"""
Feature Gate Engine Tests — Policy Engine Verification
========================================================
Tests the PURE evaluate_policy() function exhaustively.

No DB, no Redis, no network — pure input/output.
This is the heart of the feature gate system.
"""

import pytest
from services.feature_gate_engine import (
    PolicyContext,
    PolicyDecision,
    evaluate_policy,
    DenialReason,
    ALLOWED_STATUSES,
    WARN_STATUSES,
    BLOCKED_STATUSES,
)


# =============================================================================
# TEST FIXTURES
# =============================================================================

def make_context(**overrides) -> PolicyContext:
    """Build a PolicyContext with sensible defaults. Override any field."""
    defaults = {
        "user_id": "user-123",
        "domain": "shop",
        "feature_key": "create_product",
        "plan_slug": "starter",
        "plan_version": 1,
        "subscription_status": "active",
        "hard_limit": 500,
        "soft_limit": 400,
        "is_unlimited": False,
        "feature_exists_in_plan": True,
        "usage": 100,
        "is_feature_enabled": True,
    }
    defaults.update(overrides)
    return PolicyContext(**defaults)


# =============================================================================
# GATE 1: GLOBAL FEATURE FLAG
# =============================================================================

class TestFeatureFlagGate:
    """Feature disabled globally → DENY regardless of anything else."""

    def test_feature_disabled_globally_denies(self):
        ctx = make_context(is_feature_enabled=False)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.FEATURE_DISABLED
        assert decision.upgrade_required is False

    def test_feature_enabled_globally_passes(self):
        ctx = make_context(is_feature_enabled=True)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True

    def test_feature_disabled_overrides_unlimited(self):
        """Even unlimited features are blocked by global flag."""
        ctx = make_context(is_feature_enabled=False, is_unlimited=True)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.FEATURE_DISABLED


# =============================================================================
# GATE 2: NO SUBSCRIPTION
# =============================================================================

class TestNoSubscriptionGate:
    """No subscription → DENY."""

    def test_no_subscription_status_denies(self):
        ctx = make_context(subscription_status=None, plan_slug=None)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.NO_SUBSCRIPTION
        assert decision.upgrade_required is True

    def test_no_plan_slug_denies(self):
        ctx = make_context(plan_slug=None, subscription_status=None)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.NO_SUBSCRIPTION


# =============================================================================
# GATE 3: SUBSCRIPTION STATUS
# =============================================================================

class TestSubscriptionStatusGate:
    """Subscription status determines access."""

    @pytest.mark.parametrize("status", list(ALLOWED_STATUSES))
    def test_allowed_statuses_grant_access(self, status):
        ctx = make_context(subscription_status=status)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True

    @pytest.mark.parametrize("status", list(BLOCKED_STATUSES))
    def test_blocked_statuses_deny_access(self, status):
        ctx = make_context(subscription_status=status)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.SUBSCRIPTION_INACTIVE
        assert decision.upgrade_required is True

    @pytest.mark.parametrize("status", list(WARN_STATUSES))
    def test_warn_statuses_allow_with_flag(self, status):
        """past_due: allow but flag upgrade_required."""
        ctx = make_context(subscription_status=status)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.upgrade_required is True

    def test_active_no_upgrade_required(self):
        ctx = make_context(subscription_status="active", usage=0)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.upgrade_required is False

    def test_grace_period_allows(self):
        ctx = make_context(subscription_status="grace_period")
        decision = evaluate_policy(ctx)

        assert decision.allowed is True

    def test_trialing_allows(self):
        ctx = make_context(subscription_status="trialing")
        decision = evaluate_policy(ctx)

        assert decision.allowed is True


# =============================================================================
# GATE 4: FEATURE NOT IN PLAN
# =============================================================================

class TestFeatureNotInPlanGate:
    """Feature not configured for this plan → DENY."""

    def test_feature_not_in_plan_denies(self):
        ctx = make_context(feature_exists_in_plan=False)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.FEATURE_NOT_IN_PLAN
        assert decision.upgrade_required is True

    def test_feature_in_plan_passes(self):
        ctx = make_context(feature_exists_in_plan=True)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True


# =============================================================================
# GATE 5: UNLIMITED FEATURES
# =============================================================================

class TestUnlimitedFeatureGate:
    """Unlimited features always allowed (regardless of usage)."""

    def test_unlimited_allows_even_at_high_usage(self):
        ctx = make_context(is_unlimited=True, usage=999999)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.remaining is None  # No limit to track
        assert decision.soft_limit_exceeded is False

    def test_unlimited_with_past_due_still_flags(self):
        ctx = make_context(
            is_unlimited=True,
            subscription_status="past_due"
        )
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.upgrade_required is True  # past_due flag


# =============================================================================
# GATE 6: BOOLEAN FEATURES (no counting)
# =============================================================================

class TestBooleanFeatureGate:
    """Features with no hard_limit are boolean (on/off, no counting)."""

    def test_boolean_feature_allows(self):
        ctx = make_context(hard_limit=None, soft_limit=None)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.used == 0
        assert decision.hard_limit is None
        assert decision.remaining is None


# =============================================================================
# GATE 7/8: COUNTED FEATURES (soft/hard limits)
# =============================================================================

class TestCountedFeatureGate:
    """Features with a hard_limit track usage and enforce limits."""

    def test_under_both_limits_allows(self):
        ctx = make_context(usage=100, soft_limit=400, hard_limit=500)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.used == 100
        assert decision.remaining == 400
        assert decision.soft_limit_exceeded is False
        assert decision.upgrade_required is False

    def test_at_soft_limit_allows_with_warning(self):
        ctx = make_context(usage=400, soft_limit=400, hard_limit=500)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.used == 400
        assert decision.remaining == 100
        assert decision.soft_limit_exceeded is True
        assert decision.upgrade_required is True  # soft limit triggers

    def test_between_soft_and_hard_allows_with_warning(self):
        ctx = make_context(usage=450, soft_limit=400, hard_limit=500)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.remaining == 50
        assert decision.soft_limit_exceeded is True

    def test_at_hard_limit_denies(self):
        ctx = make_context(usage=500, soft_limit=400, hard_limit=500)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.remaining == 0
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED
        assert decision.upgrade_required is True

    def test_over_hard_limit_denies(self):
        ctx = make_context(usage=600, soft_limit=400, hard_limit=500)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.remaining == 0
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED

    def test_no_soft_limit_no_soft_exceeded(self):
        ctx = make_context(usage=100, soft_limit=None, hard_limit=500)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.soft_limit_exceeded is False

    def test_zero_usage_full_remaining(self):
        ctx = make_context(usage=0, soft_limit=400, hard_limit=500)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.remaining == 500
        assert decision.used == 0


# =============================================================================
# COMBINED SCENARIOS
# =============================================================================

class TestCombinedScenarios:
    """Multi-factor policy evaluation scenarios."""

    def test_past_due_at_soft_limit(self):
        """past_due + soft limit exceeded = allowed, double-flagged."""
        ctx = make_context(
            subscription_status="past_due",
            usage=420,
            soft_limit=400,
            hard_limit=500,
        )
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.soft_limit_exceeded is True
        assert decision.upgrade_required is True  # Both flags

    def test_trialing_at_hard_limit(self):
        """Trialing but hit hard limit → DENY."""
        ctx = make_context(
            subscription_status="trialing",
            usage=500,
            hard_limit=500,
        )
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED

    def test_grace_period_under_limit(self):
        """Grace period + under limit → ALLOW."""
        ctx = make_context(
            subscription_status="grace_period",
            usage=50,
            hard_limit=500,
        )
        decision = evaluate_policy(ctx)

        assert decision.allowed is True

    def test_cancelled_even_with_usage_remaining(self):
        """Cancelled = blocked, even if usage is low."""
        ctx = make_context(
            subscription_status="cancelled",
            usage=10,
            hard_limit=500,
        )
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.SUBSCRIPTION_INACTIVE


# =============================================================================
# IMMUTABILITY TESTS
# =============================================================================

class TestImmutability:
    """PolicyContext and PolicyDecision should be frozen (immutable)."""

    def test_context_is_frozen(self):
        ctx = make_context()
        with pytest.raises(AttributeError):
            ctx.user_id = "hacker"  # type: ignore

    def test_decision_is_frozen(self):
        decision = evaluate_policy(make_context())
        with pytest.raises(AttributeError):
            decision.allowed = False  # type: ignore


# =============================================================================
# SERIALIZATION
# =============================================================================

class TestSerialization:
    """PolicyDecision.to_dict() produces correct API response shape."""

    def test_to_dict_contains_all_fields(self):
        decision = evaluate_policy(make_context())
        d = decision.to_dict()

        expected_keys = {
            "allowed", "hard_limit", "soft_limit", "used",
            "remaining", "soft_limit_exceeded", "upgrade_required",
            "denial_reason", "feature_key",
        }
        assert set(d.keys()) == expected_keys

    def test_to_dict_feature_key_matches(self):
        ctx = make_context(feature_key="send_otp")
        decision = evaluate_policy(ctx)
        d = decision.to_dict()

        assert d["feature_key"] == "send_otp"

    def test_to_dict_denial_reason_is_string(self):
        ctx = make_context(is_feature_enabled=False)
        decision = evaluate_policy(ctx)
        d = decision.to_dict()

        assert isinstance(d["denial_reason"], str)


# =============================================================================
# EDGE CASES
# =============================================================================

class TestEdgeCases:
    """Boundary and degenerate input handling."""

    def test_hard_limit_of_1_allows_first_use(self):
        ctx = make_context(usage=0, hard_limit=1, soft_limit=None)
        decision = evaluate_policy(ctx)

        assert decision.allowed is True
        assert decision.remaining == 1

    def test_hard_limit_of_1_blocks_second_use(self):
        ctx = make_context(usage=1, hard_limit=1, soft_limit=None)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.remaining == 0

    def test_soft_equals_hard_limit(self):
        """soft_limit == hard_limit: soft exceeded when at limit (denied)."""
        ctx = make_context(usage=100, hard_limit=100, soft_limit=100)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.soft_limit_exceeded is True

    def test_zero_hard_limit_always_denies(self):
        """hard_limit=0: feature is effectively disabled for this plan."""
        ctx = make_context(usage=0, hard_limit=0, soft_limit=None)
        decision = evaluate_policy(ctx)

        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED
