"""
Entitlement Service Unit Tests
Tests for plan tier access, billing state validation, and feature entitlements.

🔒 Core rule being tested: NO FREE OTP EXECUTION
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, AsyncMock


class TestPlanTierDefinitions:
    """Tests for plan tier configuration."""
    
    def test_plan_tiers_no_free(self):
        """Ensure FREE tier does not exist."""
        from services.entitlement_service import PlanTier
        
        tier_values = [t.value for t in PlanTier]
        
        assert 'free' not in tier_values
        assert 'FREE' not in tier_values
        assert 'starter' in tier_values
        assert 'growth' in tier_values
        assert 'enterprise' in tier_values
    
    def test_plan_features_all_tiers_have_otp_send(self):
        """All paid tiers should have OTP send capability."""
        from services.entitlement_service import PLAN_FEATURES, PlanTier
        
        for tier in PlanTier:
            assert tier in PLAN_FEATURES
            assert PLAN_FEATURES[tier]['otp_send'] is True
    
    def test_plan_tier_rate_limits(self):
        """Verify rate limits increase with tier."""
        from services.entitlement_service import PLAN_FEATURES, PlanTier
        
        starter = PLAN_FEATURES[PlanTier.STARTER]
        growth = PLAN_FEATURES[PlanTier.GROWTH]
        enterprise = PLAN_FEATURES[PlanTier.ENTERPRISE]
        
        # Growth should have higher limits than Starter
        assert growth['rate_limit_per_minute'] > starter['rate_limit_per_minute']
        assert growth['rate_limit_per_hour'] > starter['rate_limit_per_hour']
        
        # Enterprise should have highest limits
        assert enterprise['rate_limit_per_minute'] > growth['rate_limit_per_minute']
        assert enterprise['rate_limit_per_hour'] > growth['rate_limit_per_hour']
    
    def test_starter_tier_pricing(self):
        """Verify Starter tier pricing matches spec."""
        from services.entitlement_service import PLAN_FEATURES, PlanTier
        
        starter = PLAN_FEATURES[PlanTier.STARTER]
        
        assert starter['monthly_price_inr'] == 799
        assert starter['otp_price_inr'] == 0.75
        assert starter['webhooks_limit'] == 1
        assert starter['priority_routing'] is False
    
    def test_growth_tier_pricing(self):
        """Verify Growth tier pricing matches spec."""
        from services.entitlement_service import PLAN_FEATURES, PlanTier
        
        growth = PLAN_FEATURES[PlanTier.GROWTH]
        
        assert growth['monthly_price_inr'] == 1999
        assert growth['otp_price_inr'] == 0.60
        assert growth['webhooks_limit'] == -1  # Unlimited
        assert growth['priority_routing'] is True


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


class TestEntitlementContext:
    """Tests for EntitlementContext behavior."""
    
    def test_has_paid_plan_with_tier(self):
        """User with plan tier should have paid plan."""
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus
        )
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.STARTER,
            billing_status=BillingStatus.ACTIVE
        )
        
        assert ctx.has_paid_plan is True
    
    def test_has_paid_plan_without_tier(self):
        """User without plan tier should NOT have paid plan."""
        from services.entitlement_service import (
            EntitlementContext, BillingStatus
        )
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=None,
            billing_status=BillingStatus.EXPIRED
        )
        
        assert ctx.has_paid_plan is False
    
    def test_is_billing_active_true(self):
        """Active billing status should return True."""
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus
        )
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.GROWTH,
            billing_status=BillingStatus.ACTIVE
        )
        
        assert ctx.is_billing_active is True
    
    def test_is_billing_active_false_when_expired(self):
        """Expired billing status should return False."""
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus
        )
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.STARTER,
            billing_status=BillingStatus.EXPIRED
        )
        
        assert ctx.is_billing_active is False
    
    def test_can_send_live_otp_requires_both(self):
        """Live OTP requires BOTH paid plan AND active billing."""
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus
        )
        
        # Has paid plan + active billing = can send
        ctx1 = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.STARTER,
            billing_status=BillingStatus.ACTIVE
        )
        assert ctx1.can_send_live_otp is True
        
        # Has paid plan + expired billing = cannot send
        ctx2 = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.STARTER,
            billing_status=BillingStatus.EXPIRED
        )
        assert ctx2.can_send_live_otp is False
        
        # No paid plan = cannot send
        ctx3 = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=None,
            billing_status=BillingStatus.ACTIVE
        )
        assert ctx3.can_send_live_otp is False
    
    def test_rate_limits_by_tier(self):
        """Rate limits should match tier configuration."""
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus, PLAN_FEATURES
        )
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.GROWTH,
            billing_status=BillingStatus.ACTIVE
        )
        
        expected = PLAN_FEATURES[PlanTier.GROWTH]
        
        assert ctx.rate_limit_per_minute == expected['rate_limit_per_minute']
        assert ctx.rate_limit_per_hour == expected['rate_limit_per_hour']
    
    def test_rate_limits_zero_without_plan(self):
        """Rate limits should be 0 without a plan."""
        from services.entitlement_service import (
            EntitlementContext, BillingStatus
        )
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=None,
            billing_status=BillingStatus.EXPIRED
        )
        
        assert ctx.rate_limit_per_minute == 0
        assert ctx.rate_limit_per_hour == 0


class TestEntitlementService:
    """Tests for EntitlementService methods."""
    
    def test_parse_plan_tier_valid(self):
        """Valid plan names should parse correctly."""
        from services.entitlement_service import EntitlementService, PlanTier
        
        service = EntitlementService()
        
        assert service._parse_plan_tier('starter') == PlanTier.STARTER
        assert service._parse_plan_tier('STARTER') == PlanTier.STARTER
        assert service._parse_plan_tier('growth') == PlanTier.GROWTH
        assert service._parse_plan_tier('enterprise') == PlanTier.ENTERPRISE
    
    def test_parse_plan_tier_legacy_mapping(self):
        """Legacy plan names should map to current tiers."""
        from services.entitlement_service import EntitlementService, PlanTier
        
        service = EntitlementService()
        
        # Legacy mappings
        assert service._parse_plan_tier('business') == PlanTier.GROWTH
        assert service._parse_plan_tier('pro') == PlanTier.GROWTH
    
    def test_parse_plan_tier_invalid(self):
        """Invalid plan names should return None."""
        from services.entitlement_service import EntitlementService
        
        service = EntitlementService()
        
        assert service._parse_plan_tier(None) is None
        assert service._parse_plan_tier('') is None
        assert service._parse_plan_tier('free') is None  # No free tier!
        assert service._parse_plan_tier('basic') is None
    
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
    
    def test_check_feature_access_with_plan(self):
        """Feature access should work for paid users."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, PlanTier, 
            BillingStatus, PLAN_FEATURES
        )
        
        service = EntitlementService()
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.GROWTH,
            billing_status=BillingStatus.ACTIVE,
            features=PLAN_FEATURES[PlanTier.GROWTH]
        )
        
        assert service.check_feature_access(ctx, 'otp_send') is True
        assert service.check_feature_access(ctx, 'priority_routing') is True
        assert service.check_feature_access(ctx, 'advanced_analytics') is True
    
    def test_check_feature_access_without_plan(self):
        """Feature access should fail for unpaid users."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, BillingStatus
        )
        
        service = EntitlementService()
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=None,
            billing_status=BillingStatus.EXPIRED,
            features={}
        )
        
        assert service.check_feature_access(ctx, 'otp_send') is False
        assert service.check_feature_access(ctx, 'priority_routing') is False
    
    def test_check_webhook_limit_starter(self):
        """Starter tier should be limited to 1 webhook."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, PlanTier,
            BillingStatus, PLAN_FEATURES
        )
        
        service = EntitlementService()
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.STARTER,
            billing_status=BillingStatus.ACTIVE,
            features=PLAN_FEATURES[PlanTier.STARTER]
        )
        
        assert service.check_webhook_limit(ctx, 0) is True  # 0 < 1
        assert service.check_webhook_limit(ctx, 1) is False  # 1 >= 1
        assert service.check_webhook_limit(ctx, 5) is False
    
    def test_check_webhook_limit_growth_unlimited(self):
        """Growth tier should have unlimited webhooks."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, PlanTier,
            BillingStatus, PLAN_FEATURES
        )
        
        service = EntitlementService()
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.GROWTH,
            billing_status=BillingStatus.ACTIVE,
            features=PLAN_FEATURES[PlanTier.GROWTH]
        )
        
        assert service.check_webhook_limit(ctx, 0) is True
        assert service.check_webhook_limit(ctx, 100) is True
        assert service.check_webhook_limit(ctx, 10000) is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
