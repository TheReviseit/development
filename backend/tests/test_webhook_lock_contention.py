"""Tests for webhook lock contention handling (RC-7)."""

import pytest
from unittest.mock import MagicMock, patch


class TestWebhookLockContention:
    @patch('services.webhook_processor.is_redis_available', return_value=True)
    @patch('services.webhook_processor.acquire_lock', return_value=None)
    @patch('config.billing_flags.get_bool_flag', return_value=True)
    def test_lock_contention_raises_when_flag_enabled(
        self, mock_flag, mock_acquire, mock_redis
    ):
        from services.webhook_processor import WebhookProcessor, WebhookLockContentionError

        lifecycle = MagicMock()
        processor = WebhookProcessor(supabase=MagicMock(), lifecycle_engine=lifecycle)

        with pytest.raises(WebhookLockContentionError):
            processor._require_activation(
                subscription_id='sub-1',
                razorpay_payment_id='pay-1',
                razorpay_event_id='evt-1',
                razorpay_subscription_id='rzp-sub-1',
                domain='shop',
            )

        lifecycle.handle_payment_success.assert_not_called()

    @patch('services.webhook_processor.is_redis_available', return_value=False)
    @patch('config.billing_flags.get_bool_flag', return_value=True)
    def test_no_redis_proceeds_without_contention(self, mock_flag, mock_redis):
        from services.webhook_processor import WebhookProcessor

        lifecycle = MagicMock()
        processor = WebhookProcessor(supabase=MagicMock(), lifecycle_engine=lifecycle)

        processor._require_activation(
            subscription_id='sub-1',
            razorpay_payment_id='pay-1',
            razorpay_event_id='evt-1',
            razorpay_subscription_id='rzp-sub-1',
            domain='shop',
        )

        lifecycle.handle_payment_success.assert_called_once()
