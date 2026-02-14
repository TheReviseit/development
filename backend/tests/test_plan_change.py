"""
Plan Change Tests — Enterprise Grade
=======================================
Tests for upgrade, downgrade, proration, safety guards,
and webhook-driven plan application.

Run: python -m pytest tests/test_plan_change.py -v
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, PropertyMock
from services.plan_change_service import (
    PlanChangeService,
    calculate_proration,
    PlanChangeError,
    PlanChangePendingError,
    PlanChangeLockedError,
    PaymentPendingError,
    UsageExceedsLimitError,
    SamePlanError,
    SubscriptionNotActiveError,
)


# =============================================================================
# PRORATION CALCULATION TESTS (seconds-based, integer-only)
# =============================================================================

class TestProrationCalculation:
    """Test the proration engine with various scenarios."""

    def test_upgrade_mid_cycle_exact_half(self):
        """Upgrade from Starter (₹999) to Business (₹3,999) at exactly mid-cycle."""
        period_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        period_end = datetime(2026, 2, 1, tzinfo=timezone.utc)
        now = datetime(2026, 1, 16, 12, 0, 0, tzinfo=timezone.utc)

        result = calculate_proration(
            current_amount_paise=99900,      # ₹999
            new_amount_paise=399900,          # ₹3,999
            period_start=period_start,
            period_end=period_end,
            now=now,
        )

        assert result['is_upgrade'] is True
        assert result['proration_amount_paise'] > 0

        # At roughly half the cycle, proration ≈ (3999-999) * 0.5 = ₹1,500
        # Exact value depends on seconds ratio
        total_seconds = (period_end - period_start).total_seconds()
        remaining_seconds = (period_end - now).total_seconds()
        expected_ratio = remaining_seconds / total_seconds
        expected_charge = int((399900 - 99900) * expected_ratio)

        assert result['proration_amount_paise'] == expected_charge
        assert result['ratio'] == round(expected_ratio, 6)

    def test_upgrade_near_end_of_cycle(self):
        """Upgrade near end of cycle — minimal proration."""
        period_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        period_end = datetime(2026, 2, 1, tzinfo=timezone.utc)
        now = datetime(2026, 1, 30, tzinfo=timezone.utc)  # 2 days remaining

        result = calculate_proration(
            current_amount_paise=99900,
            new_amount_paise=399900,
            period_start=period_start,
            period_end=period_end,
            now=now,
        )

        assert result['is_upgrade'] is True
        assert result['proration_amount_paise'] > 0
        assert result['proration_amount_paise'] < 30000  # Should be small

    def test_downgrade_no_charge(self):
        """Downgrade should have zero proration charge."""
        result = calculate_proration(
            current_amount_paise=399900,  # ₹3,999
            new_amount_paise=99900,        # ₹999
            period_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2026, 2, 1, tzinfo=timezone.utc),
            now=datetime(2026, 1, 15, tzinfo=timezone.utc),
        )

        assert result['is_upgrade'] is False
        assert result['proration_amount_paise'] == 0

    def test_minimum_proration_amount(self):
        """Proration below ₹1 should be rounded up to ₹1 (100 paise)."""
        period_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        period_end = datetime(2026, 2, 1, tzinfo=timezone.utc)
        # 1 second before period ends
        now = period_end - timedelta(seconds=1)

        result = calculate_proration(
            current_amount_paise=99900,
            new_amount_paise=99950,  # Only ₹0.50 difference
            period_start=period_start,
            period_end=period_end,
            now=now,
        )

        if result['proration_amount_paise'] > 0:
            assert result['proration_amount_paise'] >= 100  # Minimum ₹1

    def test_seconds_precision_vs_days(self):
        """Verify seconds-based calculation differs from naive days approach."""
        period_start = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        period_end = datetime(2026, 2, 1, 0, 0, 0, tzinfo=timezone.utc)
        # Mid-day, not midnight — days truncation would lose half-day
        now = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

        result = calculate_proration(
            current_amount_paise=100000,
            new_amount_paise=200000,
            period_start=period_start,
            period_end=period_end,
            now=now,
        )

        # Days-based would give 16/31 ≈ 0.516
        # Seconds-based gives a more precise ratio
        assert result['ratio'] != round(16 / 31, 6)  # Different from days

    def test_period_already_ended(self):
        """If period has ended, remaining_seconds should be 0."""
        result = calculate_proration(
            current_amount_paise=99900,
            new_amount_paise=399900,
            period_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2026, 1, 31, tzinfo=timezone.utc),
            now=datetime(2026, 2, 5, tzinfo=timezone.utc),  # After period end
        )

        assert result['remaining_seconds'] == 0
        assert result['proration_amount_paise'] == 0

    def test_invalid_period_raises_error(self):
        """Invalid period (end before start) should raise error."""
        with pytest.raises(PlanChangeError) as exc_info:
            calculate_proration(
                current_amount_paise=99900,
                new_amount_paise=399900,
                period_start=datetime(2026, 2, 1, tzinfo=timezone.utc),
                period_end=datetime(2026, 1, 1, tzinfo=timezone.utc),
                now=datetime(2026, 1, 15, tzinfo=timezone.utc),
            )
        assert exc_info.value.error_code == 'INVALID_PERIOD'

    def test_all_amounts_are_integers(self):
        """Ensure all output amounts are integers (no floats)."""
        result = calculate_proration(
            current_amount_paise=99900,
            new_amount_paise=399900,
            period_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2026, 2, 1, tzinfo=timezone.utc),
            now=datetime(2026, 1, 15, 12, 30, 45, tzinfo=timezone.utc),
        )

        assert isinstance(result['proration_amount_paise'], int)
        assert isinstance(result['unused_value_paise'], int)
        assert isinstance(result['new_cost_remaining_paise'], int)


# =============================================================================
# SAFETY VALIDATOR TESTS
# =============================================================================

class TestSafetyValidators:
    """Test all safety guards."""

    def setup_method(self):
        self.service = PlanChangeService()

    def test_reject_same_plan(self):
        """Cannot change to the same plan."""
        subscription = {'plan_name': 'business', 'status': 'active'}
        with pytest.raises(SamePlanError):
            self.service._validate_change_allowed(subscription, 'business')

    def test_reject_inactive_subscription(self):
        """Cannot change plan on cancelled subscription."""
        subscription = {'plan_name': 'starter', 'status': 'cancelled'}
        with pytest.raises(SubscriptionNotActiveError):
            self.service._validate_change_allowed(subscription, 'business')

    def test_reject_pending_change(self):
        """Cannot start new change when one is pending."""
        subscription = {
            'plan_name': 'starter',
            'status': 'active',
            'pending_plan_slug': 'business',
        }
        with pytest.raises(PlanChangePendingError):
            self.service._validate_change_allowed(subscription, 'pro')

    def test_reject_locked_change(self):
        """Cannot change when plan_change_locked is TRUE."""
        subscription = {
            'plan_name': 'starter',
            'status': 'active',
            'plan_change_locked': True,
        }
        with pytest.raises(PlanChangeLockedError):
            self.service._validate_change_allowed(subscription, 'business')

    def test_reject_pending_payment(self):
        """Cannot start new change when proration payment is pending."""
        subscription = {
            'plan_name': 'starter',
            'status': 'active',
            'proration_payment_status': 'pending',
        }
        with pytest.raises(PaymentPendingError):
            self.service._validate_change_allowed(subscription, 'business')

    def test_reject_downgrade_exceeds_usage(self):
        """Downgrade blocked when usage exceeds new plan limits."""
        subscription = {'ai_responses_used': 8000}
        new_limits = {'ai_responses': 2500}

        with pytest.raises(UsageExceedsLimitError) as exc_info:
            self.service._validate_usage_limits(
                subscription, new_limits, 'downgrade'
            )
        assert exc_info.value.current_usage == 8000
        assert exc_info.value.new_limit == 2500

    def test_upgrade_allows_any_usage(self):
        """Upgrade should not check usage limits."""
        subscription = {'ai_responses_used': 8000}
        new_limits = {'ai_responses': 2500}

        # Should not raise
        self.service._validate_usage_limits(
            subscription, new_limits, 'upgrade'
        )

    def test_allow_valid_change(self):
        """Valid change request should pass all validators."""
        subscription = {
            'plan_name': 'starter',
            'status': 'active',
            'pending_plan_slug': None,
            'plan_change_locked': False,
            'proration_payment_status': None,
        }
        # Should not raise
        self.service._validate_change_allowed(subscription, 'business')


# =============================================================================
# WEBHOOK IDEMPOTENCY TESTS
# =============================================================================

class TestWebhookIdempotency:
    """Test that webhook handlers are idempotent."""

    def setup_method(self):
        self.service = PlanChangeService()

    @patch.object(PlanChangeService, 'supabase', new_callable=PropertyMock)
    def test_duplicate_event_skipped(self, mock_supabase):
        """Same event_id should be skipped."""
        mock_table = MagicMock()
        mock_supabase.return_value.table.return_value = mock_table

        # Simulate subscription with this event already processed
        mock_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                'id': 'sub-uuid',
                'razorpay_subscription_id': 'sub_123',
                'pending_plan_slug': 'business',
                'last_processed_event_id': 'evt_duplicate_123',
                'proration_payment_status': 'pending',
                'plan_change_locked': False,
            }]
        )

        result = self.service.handle_proration_payment_captured(
            order_id='order_abc',
            payment_id='pay_xyz',
            event_id='evt_duplicate_123',
            request_id='req_test',
        )

        assert result['handled'] is True
        assert result['reason'] == 'already_processed'

    @patch.object(PlanChangeService, 'supabase', new_callable=PropertyMock)
    def test_no_matching_order(self, mock_supabase):
        """Order not found should return not_proration_order."""
        mock_table = MagicMock()
        mock_supabase.return_value.table.return_value = mock_table
        mock_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        result = self.service.handle_proration_payment_captured(
            order_id='order_nonexistent',
            payment_id='pay_xyz',
            event_id='evt_new',
            request_id='req_test',
        )

        assert result['handled'] is False
        assert result['reason'] == 'not_proration_order'


# =============================================================================
# EDGE CASE TESTS
# =============================================================================

class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_proration_with_naive_datetimes(self):
        """Naive datetimes should be treated as UTC."""
        result = calculate_proration(
            current_amount_paise=99900,
            new_amount_paise=399900,
            period_start=datetime(2026, 1, 1),  # Naive
            period_end=datetime(2026, 2, 1),      # Naive
            now=datetime(2026, 1, 15),             # Naive
        )
        assert result['is_upgrade'] is True
        assert result['proration_amount_paise'] > 0

    def test_proration_zero_difference(self):
        """Same price plans should have 0 proration."""
        result = calculate_proration(
            current_amount_paise=99900,
            new_amount_paise=99900,
            period_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2026, 2, 1, tzinfo=timezone.utc),
            now=datetime(2026, 1, 15, tzinfo=timezone.utc),
        )
        assert result['proration_amount_paise'] == 0
        assert result['is_upgrade'] is False

    def test_exception_hierarchy(self):
        """All specific errors should be PlanChangeError subclasses."""
        assert issubclass(PlanChangePendingError, PlanChangeError)
        assert issubclass(PlanChangeLockedError, PlanChangeError)
        assert issubclass(PaymentPendingError, PlanChangeError)
        assert issubclass(UsageExceedsLimitError, PlanChangeError)
        assert issubclass(SamePlanError, PlanChangeError)
        assert issubclass(SubscriptionNotActiveError, PlanChangeError)

    def test_error_codes_and_status(self):
        """Verify error codes and HTTP status codes."""
        assert PlanChangePendingError().error_code == 'CHANGE_ALREADY_PENDING'
        assert PlanChangePendingError().status_code == 409

        assert PlanChangeLockedError().error_code == 'CHANGE_LOCKED'
        assert PlanChangeLockedError().status_code == 409

        assert PaymentPendingError().error_code == 'PAYMENT_PENDING'
        assert PaymentPendingError().status_code == 409

        err = UsageExceedsLimitError(8000, 2500)
        assert err.error_code == 'USAGE_EXCEEDS_LIMIT'
        assert err.status_code == 400

        assert SamePlanError('business').error_code == 'SAME_PLAN'
        assert SamePlanError('business').status_code == 400

        assert SubscriptionNotActiveError('cancelled').error_code == 'NOT_ACTIVE'
        assert SubscriptionNotActiveError('cancelled').status_code == 400


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
