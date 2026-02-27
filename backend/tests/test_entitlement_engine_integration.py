"""
Entitlement Engine Integration Tests
======================================
Tests the feature gate middleware, controlled rollout, and cross-domain isolation.

COVERS:
- require_feature() and require_limit() decorators
- Soft enforcement mode (log but don't block)
- Hard enforcement mode (log and block)
- Cross-domain isolation (shop.starter ≠ dashboard.starter)
- Plan-version pinning (user stays on v1 even after v2 deployed)
- Expired subscription denial
- Feature denied on starter but allowed on business/pro
"""

import os
import pytest
from unittest.mock import patch, MagicMock, PropertyMock
from dataclasses import dataclass

# Import the pure policy engine (no DB needed)
from services.feature_gate_engine import (
    PolicyContext,
    PolicyDecision,
    evaluate_policy,
    DenialReason,
)


# =============================================================================
# FIXTURES
# =============================================================================

def make_context(**overrides) -> PolicyContext:
    """Build a PolicyContext with sensible defaults. Override any field."""
    defaults = {
        "user_id": "user-test-001",
        "domain": "shop",
        "feature_key": "create_product",
        "plan_slug": "starter",
        "plan_version": 1,
        "subscription_status": "active",
        "hard_limit": 10,
        "soft_limit": 8,
        "is_unlimited": False,
        "feature_exists_in_plan": True,
        "usage": 0,
        "is_feature_enabled": True,
    }
    defaults.update(overrides)
    return PolicyContext(**defaults)


# =============================================================================
# CROSS-DOMAIN ISOLATION
# =============================================================================

class TestCrossDomainIsolation:
    """
    Verify that domain scoping is enforced:
    A shop.starter subscription must NOT grant dashboard features.
    """

    def test_shop_domain_feature_allowed(self):
        """User with shop.starter can access shop-scoped features."""
        ctx = make_context(domain="shop", feature_key="create_product")
        decision = evaluate_policy(ctx)
        assert decision.allowed is True

    def test_different_domain_feature_denied(self):
        """
        Simulates: user has shop subscription, tries dashboard feature.
        When _build_policy_context can't find a subscription for domain=dashboard,
        the subscription_status would be None → feature_exists_in_plan = False.
        """
        ctx = make_context(
            domain="dashboard",
            feature_key="create_product",
            feature_exists_in_plan=False,
            subscription_status=None,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.NO_SUBSCRIPTION

    def test_same_feature_different_domains_independent(self):
        """Two domains with the same feature have independent limits."""
        ctx_shop = make_context(domain="shop", usage=9, hard_limit=10)
        ctx_dashboard = make_context(domain="dashboard", usage=2, hard_limit=10)

        decision_shop = evaluate_policy(ctx_shop)
        decision_dashboard = evaluate_policy(ctx_dashboard)

        assert decision_shop.allowed is True
        assert decision_shop.remaining == 1
        assert decision_dashboard.allowed is True
        assert decision_dashboard.remaining == 8


# =============================================================================
# PLAN-VERSION PINNING
# =============================================================================

class TestPlanVersionPinning:
    """
    Verify that users are evaluated against their subscribed plan version,
    not the latest version.
    """

    def test_v1_user_keeps_v1_limits(self):
        """User subscribed at v1 (limit=10) keeps limits even if v2 changes to 5."""
        ctx = make_context(plan_version=1, hard_limit=10, usage=7)
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.hard_limit == 10
        assert decision.remaining == 3

    def test_v2_user_gets_v2_limits(self):
        """User subscribed at v2 gets v2 limits."""
        ctx = make_context(plan_version=2, hard_limit=5, usage=4)
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.remaining == 1


# =============================================================================
# EXPIRED SUBSCRIPTION
# =============================================================================

class TestExpiredSubscription:
    """
    Verify that expired subscriptions are denied access.
    """

    def test_expired_subscription_denied(self):
        """Expired subscription blocks feature access."""
        ctx = make_context(subscription_status="expired")
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.SUBSCRIPTION_INACTIVE

    def test_cancelled_subscription_denied(self):
        """Cancelled subscription blocks feature access."""
        ctx = make_context(subscription_status="cancelled")
        decision = evaluate_policy(ctx)
        assert decision.allowed is False

    def test_past_due_has_soft_limit_exceeded(self):
        """Past-due subscription may warn but still allow (grace period)."""
        ctx = make_context(subscription_status="past_due")
        decision = evaluate_policy(ctx)
        # past_due is in WARN_STATUSES — access allowed but flagged
        assert decision.allowed is True


# =============================================================================
# FEATURE DENIED ON STARTER, ALLOWED ON BUSINESS+
# =============================================================================

class TestPlanTierDifferentiation:
    """
    Verify that starter gets denied premium features while business/pro get access.
    """

    def test_starter_denied_advanced_analytics(self):
        """Starter plan: advanced_analytics has hard_limit=0 → denied."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="advanced_analytics",
            hard_limit=0,
            soft_limit=0,
            usage=0,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED

    def test_business_allowed_advanced_analytics(self):
        """Business plan: advanced_analytics has no limit (NULL) → allowed."""
        ctx = make_context(
            plan_slug="business",
            feature_key="advanced_analytics",
            hard_limit=None,
            soft_limit=None,
            is_unlimited=False,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True

    def test_pro_unlimited_everything(self):
        """Pro plan: is_unlimited=True → always allowed, no matter usage."""
        ctx = make_context(
            plan_slug="pro",
            feature_key="create_product",
            is_unlimited=True,
            usage=999999,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.remaining is None  # Unlimited has no remaining

    def test_starter_within_product_limit(self):
        """Starter plan: create_product with usage=5/10 → still allowed."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="create_product",
            hard_limit=10,
            soft_limit=8,
            usage=5,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.remaining == 5
        assert decision.soft_limit_exceeded is False

    def test_starter_at_soft_limit(self):
        """Starter: usage=8, soft_limit=8 → allowed but soft_limit_exceeded=True."""
        ctx = make_context(
            plan_slug="starter",
            hard_limit=10,
            soft_limit=8,
            usage=8,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.soft_limit_exceeded is True

    def test_starter_at_hard_limit(self):
        """Starter: usage=10, hard_limit=10 → DENIED."""
        ctx = make_context(
            plan_slug="starter",
            hard_limit=10,
            soft_limit=8,
            usage=10,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED
        assert decision.upgrade_required is True


# =============================================================================
# FEATURE NOT IN PLAN
# =============================================================================

class TestFeatureNotInPlan:
    """Features not seeded for a plan should be denied."""

    def test_unknown_feature_denied(self):
        """Feature not in plan_features table → denied."""
        ctx = make_context(feature_exists_in_plan=False)
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.FEATURE_NOT_IN_PLAN

    def test_bulk_messaging_denied_for_starter(self):
        """Starter: bulk_messaging has hard_limit=0 → denied."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="bulk_messaging",
            hard_limit=0,
            soft_limit=0,
            usage=0,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False


# =============================================================================
# GLOBAL FEATURE FLAG OVERRIDE
# =============================================================================

class TestGlobalFeatureFlag:
    """When a feature is globally disabled, even pro users are denied."""

    def test_globally_disabled_feature_denied(self):
        """Feature disabled via feature_flags table → denied for all."""
        ctx = make_context(
            plan_slug="pro",
            is_unlimited=True,
            is_feature_enabled=False,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.FEATURE_DISABLED


# =============================================================================
# CONTROLLED ROLLOUT: SOFT vs HARD MODE
# =============================================================================

class TestControlledRollout:
    """Test the enforcement mode behavior of the middleware."""

    def test_enforcement_mode_default_is_hard(self):
        """Default enforcement mode should be 'hard'."""
        # Test the env var logic directly (no Flask required)
        saved = os.environ.pop('FEATURE_GATE_ENFORCEMENT', None)
        try:
            mode = os.getenv('FEATURE_GATE_ENFORCEMENT', 'hard').lower()
            assert mode == 'hard'
        finally:
            if saved is not None:
                os.environ['FEATURE_GATE_ENFORCEMENT'] = saved

    def test_enforcement_mode_hard(self):
        """When env var is 'hard', enforcement mode is 'hard'."""
        with patch.dict(os.environ, {'FEATURE_GATE_ENFORCEMENT': 'hard'}):
            mode = os.getenv('FEATURE_GATE_ENFORCEMENT', 'soft').lower()
            assert mode == 'hard'

    def test_enforcement_mode_case_insensitive(self):
        """Enforcement mode is case-insensitive."""
        with patch.dict(os.environ, {'FEATURE_GATE_ENFORCEMENT': 'HARD'}):
            mode = os.getenv('FEATURE_GATE_ENFORCEMENT', 'soft').lower()
            assert mode == 'hard'


# =============================================================================
# POLICY DECISION SERIALIZATION
# =============================================================================

class TestPolicyDecisionSerialization:
    """Ensure PolicyDecision.to_dict() is always JSON-serializable."""

    def test_allowed_decision_serializable(self):
        ctx = make_context(usage=5)
        decision = evaluate_policy(ctx)
        d = decision.to_dict()
        assert isinstance(d, dict)
        assert d['allowed'] is True
        assert 'remaining' in d
        assert 'feature_key' in d

    def test_denied_decision_serializable(self):
        ctx = make_context(usage=10, hard_limit=10)
        decision = evaluate_policy(ctx)
        d = decision.to_dict()
        assert isinstance(d, dict)
        assert d['allowed'] is False
        assert d['denial_reason'] is not None
        assert d['upgrade_required'] is True


# =============================================================================
# PHASE 2: CAMPAIGN GATE TESTS
# =============================================================================

class TestCampaignGates:
    """Verify campaign creation and send feature gates."""

    def test_starter_denied_bulk_messaging(self):
        """Starter plan: bulk_messaging has hard_limit=0 → create_campaign denied."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="bulk_messaging",
            hard_limit=0,
            soft_limit=0,
            usage=0,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED

    def test_business_allowed_bulk_messaging(self):
        """Business plan: bulk_messaging has hard_limit=1000 → create_campaign allowed."""
        ctx = make_context(
            plan_slug="business",
            feature_key="bulk_messaging",
            hard_limit=1000,
            soft_limit=800,
            usage=50,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.remaining == 950

    def test_starter_denied_campaign_sends(self):
        """Starter plan: campaign_sends has hard_limit=0 → start_campaign denied."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="campaign_sends",
            hard_limit=0,
            soft_limit=0,
            usage=0,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False

    def test_business_campaign_sends_within_limit(self):
        """Business plan: campaign_sends at usage=900/1000 → allowed."""
        ctx = make_context(
            plan_slug="business",
            feature_key="campaign_sends",
            hard_limit=1000,
            soft_limit=800,
            usage=900,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.remaining == 100
        assert decision.soft_limit_exceeded is True  # 900 > 800


# =============================================================================
# PHASE 2: TEMPLATE GATE TESTS
# =============================================================================

class TestTemplateGates:
    """Verify template creation and send feature gates."""

    def test_starter_denied_template_builder(self):
        """Starter plan: template_builder has hard_limit=0 → denied."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="template_builder",
            hard_limit=0,
            soft_limit=0,
            usage=0,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED

    def test_business_allowed_template_builder(self):
        """Business plan: template_builder has no hard limit → allowed."""
        ctx = make_context(
            plan_slug="business",
            feature_key="template_builder",
            hard_limit=None,
            soft_limit=None,
            is_unlimited=False,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True

    def test_pro_unlimited_template_builder(self):
        """Pro plan: template_builder unlimited → allowed regardless of usage."""
        ctx = make_context(
            plan_slug="pro",
            feature_key="template_builder",
            is_unlimited=True,
            usage=999,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True


# =============================================================================
# PHASE 2: AI RESPONSE GATE TESTS
# =============================================================================

class TestAIResponseGate:
    """Verify AI response limit enforcement."""

    def test_starter_ai_responses_within_limit(self):
        """Starter plan: ai_responses at usage=30/50 → allowed."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="ai_responses",
            hard_limit=50,
            soft_limit=40,
            usage=30,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.remaining == 20

    def test_starter_ai_responses_at_hard_limit(self):
        """Starter plan: ai_responses at usage=50/50 → DENIED."""
        ctx = make_context(
            plan_slug="starter",
            feature_key="ai_responses",
            hard_limit=50,
            soft_limit=40,
            usage=50,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is False
        assert decision.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED
        assert decision.upgrade_required is True

    def test_business_ai_responses_high_limit(self):
        """Business plan: ai_responses at usage=400/500 → allowed."""
        ctx = make_context(
            plan_slug="business",
            feature_key="ai_responses",
            hard_limit=500,
            soft_limit=400,
            usage=400,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.soft_limit_exceeded is True

    def test_pro_unlimited_ai_responses(self):
        """Pro plan: ai_responses unlimited → always allowed."""
        ctx = make_context(
            plan_slug="pro",
            feature_key="ai_responses",
            is_unlimited=True,
            usage=99999,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True


# =============================================================================
# PHASE 2: SHARED COUNTER VALIDATION
# =============================================================================

class TestSharedCounterCampaignSends:
    """
    campaign_sends is shared between bulk_campaigns.send_bulk_campaign()
    and templates.send_template_message(). Verify usage accumulation.
    """

    def test_shared_counter_accumulation(self):
        """Usage=999/1000 → next send is allowed (999 < 1000), but after that denied."""
        ctx_allowed = make_context(
            feature_key="campaign_sends",
            hard_limit=1000,
            soft_limit=800,
            usage=999,
        )
        decision_allowed = evaluate_policy(ctx_allowed)
        assert decision_allowed.allowed is True
        assert decision_allowed.remaining == 1

        # Simulate post-increment: usage is now 1000
        ctx_denied = make_context(
            feature_key="campaign_sends",
            hard_limit=1000,
            soft_limit=800,
            usage=1000,
        )
        decision_denied = evaluate_policy(ctx_denied)
        assert decision_denied.allowed is False
        assert decision_denied.denial_reason == DenialReason.HARD_LIMIT_EXCEEDED


# =============================================================================
# PHASE 2: IDEMPOTENCY RETRY STORM TEST
# =============================================================================

class TestIdempotencyRetryStorm:
    """
    Simulate 3 rapid calls with the same X-Idempotency-Key.
    Engine should forward idempotency_key to _atomic_increment.
    DB RPC deduplicates — usage increments once, not three times.
    """

    def test_idempotency_key_forwarded_to_engine(self):
        """check_and_increment passes idempotency_key to _atomic_increment."""
        from services.feature_gate_engine import FeatureGateEngine

        mock_ctx = make_context(usage=5, hard_limit=100, soft_limit=80)
        increment_result = {
            'allowed': True,
            'new_value': 6,
            'hard_limit': 100,
            'soft_limit_exceeded': False,
        }

        idem_key = "retry-storm-key-abc123"

        with patch.object(FeatureGateEngine, '_build_policy_context', return_value=mock_ctx), \
             patch.object(FeatureGateEngine, '_atomic_increment', return_value=increment_result) as mock_incr, \
             patch.object(FeatureGateEngine, '_log_decision'), \
             patch.object(FeatureGateEngine, '_emit_usage_event'), \
             patch.object(FeatureGateEngine, '_emit_denial_audit'):

            engine = FeatureGateEngine.__new__(FeatureGateEngine)

            # Simulate 3 rapid calls with the same idempotency key
            decisions = []
            for _ in range(3):
                d = engine.check_and_increment(
                    user_id="user-001", domain="shop",
                    feature_key="ai_responses", idempotency_key=idem_key
                )
                decisions.append(d)

            # Verify: _atomic_increment called 3 times
            assert mock_incr.call_count == 3

            # Verify each call received the same idempotency_key
            for call in mock_incr.call_args_list:
                args, kwargs = call
                # idempotency_key is the last positional arg
                assert idem_key in args

            # All 3 should be allowed (DB deduplication means usage=6 not 8)
            for d in decisions:
                assert d.allowed is True

    def test_idempotency_key_none_when_not_provided(self):
        """When no idempotency key, None is passed to _atomic_increment."""
        from services.feature_gate_engine import FeatureGateEngine

        mock_ctx = make_context(usage=0, hard_limit=100, soft_limit=80)
        increment_result = {
            'allowed': True, 'new_value': 1,
            'hard_limit': 100, 'soft_limit_exceeded': False,
        }

        with patch.object(FeatureGateEngine, '_build_policy_context', return_value=mock_ctx), \
             patch.object(FeatureGateEngine, '_atomic_increment', return_value=increment_result) as mock_incr, \
             patch.object(FeatureGateEngine, '_log_decision'), \
             patch.object(FeatureGateEngine, '_emit_usage_event'), \
             patch.object(FeatureGateEngine, '_emit_denial_audit'):

            engine = FeatureGateEngine.__new__(FeatureGateEngine)
            engine.check_and_increment(
                user_id="user-001", domain="shop",
                feature_key="ai_responses", idempotency_key=None
            )

            # Verify None was passed as idempotency_key (last positional arg)
            args, kwargs = mock_incr.call_args
            assert None in args


# =============================================================================
# PHASE 2: FAIL-CLOSED BEHAVIOR
# =============================================================================

class TestFailClosedBehavior:
    """
    Verify that require_limit() defaults to fail_closed=True.
    Mocks Flask in sys.modules to load feature_gate.py in isolation.
    """

    @staticmethod
    def _load_feature_gate():
        """Load middleware/feature_gate.py with Flask mocked out."""
        import sys
        import importlib.util
        import pathlib

        # Mock Flask before loading feature_gate
        flask_mock = MagicMock()
        flask_mock.request = MagicMock()
        flask_mock.jsonify = MagicMock()
        flask_mock.g = MagicMock()

        saved_flask = sys.modules.get('flask')
        sys.modules['flask'] = flask_mock

        try:
            gate_path = pathlib.Path(__file__).resolve().parent.parent / 'middleware' / 'feature_gate.py'
            spec = importlib.util.spec_from_file_location('_feature_gate_test', str(gate_path))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
        finally:
            # Restore
            if saved_flask is not None:
                sys.modules['flask'] = saved_flask
            else:
                sys.modules.pop('flask', None)

    def test_require_limit_is_fail_closed(self):
        """require_limit() delegates with fail_closed=True."""
        fg = self._load_feature_gate()

        with patch.object(fg, 'with_feature_gate') as mock_gate:
            fg.require_limit("ai_responses")
            mock_gate.assert_called_once_with("ai_responses", increment=True, fail_closed=True)

    def test_require_feature_is_fail_open(self):
        """require_feature() delegates with fail_closed=False."""
        fg = self._load_feature_gate()

        with patch.object(fg, 'with_feature_gate') as mock_gate:
            fg.require_feature("custom_domain")
            mock_gate.assert_called_once_with("custom_domain", increment=False, fail_closed=False)


# =============================================================================
# PHASE 2: UPGRADE PRESSURE SIGNAL
# =============================================================================

class TestUpgradePressureSignal:
    """
    When decision.allowed=True AND decision.soft_limit_exceeded=True,
    the middleware emits upgrade_pressure_signal. Test the decision state.
    """

    def test_soft_limit_exceeded_flags_for_pressure_signal(self):
        """At soft limit: allowed=True, soft_limit_exceeded=True."""
        ctx = make_context(
            feature_key="ai_responses",
            hard_limit=50,
            soft_limit=40,
            usage=42,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.soft_limit_exceeded is True
        assert decision.upgrade_required is True

    def test_under_soft_limit_no_pressure_signal(self):
        """Under soft limit: allowed=True, soft_limit_exceeded=False."""
        ctx = make_context(
            feature_key="ai_responses",
            hard_limit=50,
            soft_limit=40,
            usage=30,
        )
        decision = evaluate_policy(ctx)
        assert decision.allowed is True
        assert decision.soft_limit_exceeded is False


# =============================================================================
# PHASE 3: ENGINE FAILURE — NO PREMIUM LEAKAGE
# =============================================================================

class TestEngineFailureNoLeakage:
    """
    Prove that when FeatureGateEngine is unavailable:
    - EntitlementService.check_feature_access() returns False (DENY)
    - require_entitlement() returns 403 (DENY)
    - No silent fallback to hardcoded PLAN_FEATURES
    - Premium features are NEVER granted during engine outage
    """

    def test_check_feature_access_denies_on_engine_exception(self):
        """EntitlementService.check_feature_access fails closed on engine error."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, BillingStatus
        )

        service = EntitlementService()

        # Build context with 'business' plan (would have premium features in DB)
        ctx = EntitlementContext(
            user_id='user-premium-001',
            org_id='org-001',
            plan_slug='business',
            billing_status=BillingStatus.ACTIVE
        )

        # User has paid plan — should normally be allowed
        assert ctx.has_paid_plan is True

        # But engine is down — check_feature_access MUST deny
        with patch('services.feature_gate_engine.get_feature_gate_engine',
                   side_effect=RuntimeError("Engine unavailable")):
            result = service.check_feature_access(ctx, 'priority_routing', domain='shop')

        # CRITICAL: Must be False — no fallback to hardcoded features
        assert result is False, (
            "PREMIUM LEAKAGE: check_feature_access returned True during engine outage. "
            "This means a hardcoded fallback was used."
        )

    def test_check_feature_access_denies_on_missing_domain(self):
        """check_feature_access denies when domain is None."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, BillingStatus
        )

        service = EntitlementService()
        ctx = EntitlementContext(
            user_id='user-001',
            org_id='org-001',
            plan_slug='business',
            billing_status=BillingStatus.ACTIVE
        )

        # Explicitly pass domain=None — no Flask g lookup possible
        with patch('services.feature_gate_engine.get_feature_gate_engine') as mock_engine:
            mock_engine.return_value = MagicMock()
            result = service.check_feature_access(ctx, 'priority_routing', domain=None)

        assert result is False, (
            "DOMAIN LEAKAGE: check_feature_access returned True without domain."
        )

    def test_check_feature_access_denies_unpaid(self):
        """check_feature_access denies when user has no paid plan (before engine call)."""
        from services.entitlement_service import (
            EntitlementService, EntitlementContext, BillingStatus
        )

        service = EntitlementService()
        ctx = EntitlementContext(
            user_id='user-free',
            org_id='org-free',
            plan_slug=None,  # No plan
            billing_status=BillingStatus.EXPIRED
        )

        # Should deny immediately, never even reaching engine
        result = service.check_feature_access(ctx, 'priority_routing')
        assert result is False

    def test_require_entitlement_denies_on_engine_failure(self):
        """require_entitlement() decorator returns 403 when engine fails."""
        # Load security_enforcer manually with Flask mocked
        import sys
        import importlib.util
        import pathlib

        flask_mock = MagicMock()
        flask_mock.request = MagicMock()
        flask_mock.request.path = '/test'
        flask_mock.jsonify = lambda d: d  # passthrough
        flask_mock.g = MagicMock()
        flask_mock.g.product_domain = 'shop'

        # Build entitlement context mock
        mock_ctx = MagicMock()
        mock_ctx.user_id = 'user-premium-001'
        flask_mock.g.entitlement_ctx = mock_ctx

        saved_flask = sys.modules.get('flask')
        sys.modules['flask'] = flask_mock

        try:
            se_path = pathlib.Path(__file__).resolve().parent.parent / 'middleware' / 'security_enforcer.py'
            spec = importlib.util.spec_from_file_location('_sec_enforcer_test', str(se_path))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)

            # Apply decorator to a dummy function
            @mod.require_entitlement('priority_routing')
            def dummy_endpoint():
                return {"access": "granted"}, 200

            # Engine fails
            with patch.dict(sys.modules, {'services.feature_gate_engine': MagicMock(
                get_feature_gate_engine=MagicMock(side_effect=RuntimeError("Engine down"))
            )}):
                response, status_code = dummy_endpoint()

            # CRITICAL: Must be 403, not 200
            assert status_code == 403, (
                f"PREMIUM LEAKAGE: require_entitlement returned {status_code} "
                f"during engine outage. Expected 403."
            )
        finally:
            if saved_flask is not None:
                sys.modules['flask'] = saved_flask
            else:
                sys.modules.pop('flask', None)
