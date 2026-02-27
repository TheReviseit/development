"""
Entitlement Service Unit Tests
Tests for plan_slug-based access, billing state validation, and feature entitlements.

🔒 Core rule being tested: NO FREE OTP EXECUTION

Architecture:
    - plan_slug is an OPAQUE STRING ("starter", "business", "pro")
    - No PlanTier enum — plans managed in DB plan_features table
    - Rate limits are operational throttles, keyed by plan_slug
    - Feature access delegated to FeatureGateEngine
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, AsyncMock


class TestBillingStatus:
    """Tests for billing status handling."""

    def test_billing_status_values(self):
        """Verify all expected billing statuses exist."""
        from services.entitlement_service import BillingStatus

        statuses = [s.value for s in BillingStatus]

        assert 'active' in statuses
        assert 'cancelled' in statuses
        assert 'expired' in statuses
        assert 'halted' in statuses
        assert 'pending' in statuses
        assert 'paused' in statuses
        assert 'past_due' in statuses
        assert 'grace_period' in statuses
        assert 'trialing' in statuses


class TestRateLimitsConfig:
    """Tests for RATE_LIMITS configuration (operational throttles)."""

    def test_rate_limits_exist_for_known_plans(self):
        """All production plan slugs should have rate limits configured."""
        from services.entitlement_service import RATE_LIMITS

        for slug in ['starter', 'business', 'pro']:
            assert slug in RATE_LIMITS, f"Missing rate limits for plan: {slug}"
            assert 'per_minute' in RATE_LIMITS[slug]
            assert 'per_hour' in RATE_LIMITS[slug]

    def test_rate_limits_increase_with_tier(self):
        """Higher plans should have higher rate limits."""
        from services.entitlement_service import RATE_LIMITS

        starter = RATE_LIMITS['starter']
        business = RATE_LIMITS['business']
        pro = RATE_LIMITS['pro']

        assert business['per_minute'] > starter['per_minute']
        assert business['per_hour'] > starter['per_hour']
        assert pro['per_minute'] > business['per_minute']
        assert pro['per_hour'] > business['per_hour']

    def test_legacy_aliases_exist(self):
        """Legacy plan slugs should have rate limit aliases."""
        from services.entitlement_service import RATE_LIMITS

        assert 'growth' in RATE_LIMITS
        assert 'enterprise' in RATE_LIMITS

    def test_default_rate_limits_are_conservative(self):
        """Default rate limits for unknown plans should be low."""
        from services.entitlement_service import _DEFAULT_RATE_LIMITS

        assert _DEFAULT_RATE_LIMITS['per_minute'] <= 10
        assert _DEFAULT_RATE_LIMITS['per_hour'] <= 100


class TestEntitlementContext:
    """Tests for EntitlementContext behavior with plan_slug."""

    def test_has_paid_plan_with_slug(self):
        """User with plan_slug should have paid plan."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_slug='starter',
            billing_status=BillingStatus.ACTIVE
        )

        assert ctx.has_paid_plan is True

    def test_has_paid_plan_without_slug(self):
        """User without plan_slug should NOT have paid plan."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_slug=None,
            billing_status=BillingStatus.EXPIRED
        )

        assert ctx.has_paid_plan is False

    def test_is_billing_active_true(self):
        """Active billing status should return True."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_slug='business',
            billing_status=BillingStatus.ACTIVE
        )

        assert ctx.is_billing_active is True

    def test_is_billing_active_false_when_expired(self):
        """Expired billing status should return False."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_slug='starter',
            billing_status=BillingStatus.EXPIRED
        )

        assert ctx.is_billing_active is False

    def test_is_billing_active_false_when_cancelled(self):
        """Cancelled billing should not be considered active."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_slug='pro',
            billing_status=BillingStatus.CANCELLED
        )

        assert ctx.is_billing_active is False

    def test_can_send_live_otp_requires_both(self):
        """Live OTP requires BOTH paid plan AND active billing."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        # Has paid plan + active billing = can send
        ctx1 = EntitlementContext(
            user_id='user_123', org_id='org_456',
            plan_slug='starter', billing_status=BillingStatus.ACTIVE
        )
        assert ctx1.can_send_live_otp is True

        # Has paid plan + expired billing = cannot send
        ctx2 = EntitlementContext(
            user_id='user_123', org_id='org_456',
            plan_slug='starter', billing_status=BillingStatus.EXPIRED
        )
        assert ctx2.can_send_live_otp is False

        # No paid plan = cannot send regardless of billing
        ctx3 = EntitlementContext(
            user_id='user_123', org_id='org_456',
            plan_slug=None, billing_status=BillingStatus.ACTIVE
        )
        assert ctx3.can_send_live_otp is False

    def test_rate_limits_by_plan_slug(self):
        """Rate limits should match plan_slug configuration."""
        from services.entitlement_service import (
            EntitlementContext, BillingStatus, RATE_LIMITS
        )

        for slug in ['starter', 'business', 'pro']:
            ctx = EntitlementContext(
                user_id='user_123', org_id='org_456',
                plan_slug=slug, billing_status=BillingStatus.ACTIVE
            )

            expected = RATE_LIMITS[slug]
            assert ctx.rate_limit_per_minute == expected['per_minute']
            assert ctx.rate_limit_per_hour == expected['per_hour']

    def test_rate_limits_zero_without_plan(self):
        """Rate limits should be 0 without a plan."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        ctx = EntitlementContext(
            user_id='user_123', org_id='org_456',
            plan_slug=None, billing_status=BillingStatus.EXPIRED
        )

        assert ctx.rate_limit_per_minute == 0
        assert ctx.rate_limit_per_hour == 0

    def test_rate_limits_unknown_plan_uses_defaults(self):
        """Unknown plan slug should get conservative default limits."""
        from services.entitlement_service import (
            EntitlementContext, BillingStatus, _DEFAULT_RATE_LIMITS
        )

        ctx = EntitlementContext(
            user_id='user_123', org_id='org_456',
            plan_slug='mystery_plan_2030', billing_status=BillingStatus.ACTIVE
        )

        assert ctx.rate_limit_per_minute == _DEFAULT_RATE_LIMITS['per_minute']
        assert ctx.rate_limit_per_hour == _DEFAULT_RATE_LIMITS['per_hour']


class TestEntitlementService:
    """Tests for EntitlementService methods."""

    def test_normalize_plan_slug_valid(self):
        """Valid plan slugs should normalize correctly."""
        from services.entitlement_service import EntitlementService

        service = EntitlementService()

        assert service._normalize_plan_slug('starter') == 'starter'
        assert service._normalize_plan_slug('STARTER') == 'starter'
        assert service._normalize_plan_slug('  Business  ') == 'business'
        assert service._normalize_plan_slug('pro') == 'pro'

    def test_normalize_plan_slug_invalid(self):
        """Invalid plan slugs should return None."""
        from services.entitlement_service import EntitlementService

        service = EntitlementService()

        assert service._normalize_plan_slug(None) is None
        assert service._normalize_plan_slug('') is None

    def test_normalize_plan_slug_no_free_tier(self):
        """Free tier slug should still normalize (slug is opaque — gating is in DB)."""
        from services.entitlement_service import EntitlementService

        service = EntitlementService()

        # 'free' normalizes like any string — the DB plan_features table
        # determines what the plan can actually do. No Python-level denial.
        result = service._normalize_plan_slug('free')
        assert result == 'free'

    def test_parse_billing_status_valid(self):
        """Valid status strings should parse correctly."""
        from services.entitlement_service import EntitlementService, BillingStatus

        service = EntitlementService()

        assert service._parse_billing_status('active') == BillingStatus.ACTIVE
        assert service._parse_billing_status('expired') == BillingStatus.EXPIRED
        assert service._parse_billing_status('cancelled') == BillingStatus.CANCELLED

    def test_parse_billing_status_invalid_defaults_expired(self):
        """Invalid status should default to EXPIRED (fail secure)."""
        from services.entitlement_service import EntitlementService, BillingStatus

        service = EntitlementService()

        assert service._parse_billing_status(None) == BillingStatus.EXPIRED
        assert service._parse_billing_status('') == BillingStatus.EXPIRED
        assert service._parse_billing_status('unknown') == BillingStatus.EXPIRED

    def test_check_feature_access_delegates_to_engine(self):
        """Feature access should delegate to FeatureGateEngine."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, BillingStatus
        )

        service = EntitlementService()

        ctx = EntitlementContext(
            user_id='user_123', org_id='org_456',
            plan_slug='business', billing_status=BillingStatus.ACTIVE
        )

        # Mock the engine to return allowed=True
        mock_decision = MagicMock()
        mock_decision.allowed = True
        mock_engine = MagicMock()
        mock_engine.check_feature_access.return_value = mock_decision

        with patch('services.feature_gate_engine.get_feature_gate_engine', return_value=mock_engine):
            assert service.check_feature_access(ctx, 'otp_send', domain='shop') is True

    def test_check_feature_access_denied_without_plan(self):
        """Feature access denied for unpaid users (before engine is called)."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, BillingStatus
        )

        service = EntitlementService()

        ctx = EntitlementContext(
            user_id='user_123', org_id='org_456',
            plan_slug=None, billing_status=BillingStatus.EXPIRED
        )

        # No engine mock needed — denied before engine check
        assert service.check_feature_access(ctx, 'otp_send') is False
        assert service.check_feature_access(ctx, 'advanced_analytics') is False

    def test_plan_slug_is_opaque(self):
        """plan_slug should work with any string — no enum validation."""
        from services.entitlement_service import EntitlementContext, BillingStatus

        # Any slug should work — the DB defines what features it includes
        for slug in ['starter', 'business', 'pro', 'agency', 'enterprise_plus', 'legacy_2023']:
            ctx = EntitlementContext(
                user_id='user_123', org_id='org_456',
                plan_slug=slug, billing_status=BillingStatus.ACTIVE
            )
            assert ctx.has_paid_plan is True
            assert ctx.can_send_live_otp is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
