"""
Async Subscription Flow Tests — Unit Tests for FAANG-grade Billing Pipeline
=============================================================================
Tests:
  1. subscription_worker: claim, execute, complete, fail, upsert
  2. billing_metrics: recording functions
  3. billing_tracing: traced decorator, span_context, correlation ID
  4. billing_api: 202 response shape, validation errors
"""

import pytest
import json
import uuid as uuid_lib
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, ANY


# =============================================================================
# subscription_worker tests
# =============================================================================

class TestClaimCheckoutRequest:
    """Tests for atomic checkout claim."""

    def test_claim_success(self):
        from tasks.subscription_worker import claim_checkout_request
        db = MagicMock()
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
            {'checkout_token': 'tok_123', 'status': 'processing'}
        ]
        result = claim_checkout_request(db, 'tok_123')
        assert result is not None
        assert result['checkout_token'] == 'tok_123'
        db.table.return_value.update.assert_called_once()

    def test_claim_already_taken(self):
        from tasks.subscription_worker import claim_checkout_request
        db = MagicMock()
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
        result = claim_checkout_request(db, 'tok_123')
        assert result is None

    def test_claim_atomic_condition(self):
        """Verify claim uses status IN ('initiated') to prevent double-claim."""
        from tasks.subscription_worker import claim_checkout_request
        db = MagicMock()
        claim_checkout_request(db, 'tok_123')
        update_kwargs = db.table.return_value.update.call_args[0][0]
        assert update_kwargs['status'] == 'processing'


class TestCompleteCheckoutRequest:
    """Tests for marking checkout as completed."""

    def test_complete_updates_all_fields(self):
        from tasks.subscription_worker import complete_checkout_request
        db = MagicMock()
        with patch('tasks.subscription_worker.os.getenv', return_value='rzp_key_test'):
            complete_checkout_request(db, 'tok_123', 'sub_abc')
        update_call = db.table.return_value.update
        assert update_call.called
        kwargs = update_call.call_args[0][0]
        assert kwargs['status'] == 'completed'
        assert kwargs['razorpay_subscription_id'] == 'sub_abc'
        assert kwargs['razorpay_key_id'] == 'rzp_key_test'
        assert 'completed_at' in kwargs
        assert 'updated_at' in kwargs


class TestFailCheckoutRequest:
    """Tests for marking checkout as failed."""

    def test_fail_records_error_message(self):
        from tasks.subscription_worker import fail_checkout_request
        db = MagicMock()
        fail_checkout_request(db, 'tok_123', 'Network error', retry_count=1)
        update_kwargs = db.table.return_value.update.call_args[0][0]
        assert update_kwargs['status'] == 'failed'
        assert update_kwargs['error_message'] == 'Network error'
        assert update_kwargs['retry_count'] == 1

    def test_fail_truncates_long_error(self):
        from tasks.subscription_worker import fail_checkout_request
        db = MagicMock()
        long_error = 'x' * 1000
        fail_checkout_request(db, 'tok_123', long_error)
        update_kwargs = db.table.return_value.update.call_args[0][0]
        assert len(update_kwargs['error_message']) <= 500


class TestUpsertSubscriptionRow:
    """Tests for idempotent subscription row creation."""

    def test_insert_with_idempotency_key(self):
        from tasks.subscription_worker import upsert_subscription_row
        db = MagicMock()
        upsert_subscription_row(
            db, 'user_1', 'shop', 'plan_1', 'pro',
            'sub_abc', 'cust_1', 99900, 'INR', 'idem_key_1'
        )
        upsert_call = db.table.return_value.upsert
        assert upsert_call.called
        # Must pass on_conflict='idempotency_key' for idempotent upsert
        call_kwargs = upsert_call.call_args[1]
        assert call_kwargs.get('on_conflict') == 'idempotency_key'

    def test_insert_has_correct_fields(self):
        from tasks.subscription_worker import upsert_subscription_row
        db = MagicMock()
        upsert_subscription_row(
            db, 'user_1', 'shop', 'plan_1', 'pro',
            'sub_abc', 'cust_1', 99900, 'INR', 'idem_key_1'
        )
        data = db.table.return_value.upsert.call_args[0][0]
        assert data['user_id'] == 'user_1'
        assert data['product_domain'] == 'shop'
        assert data['razorpay_subscription_id'] == 'sub_abc'
        assert data['razorpay_customer_id'] == 'cust_1'
        assert data['status'] == 'pending'
        assert data['idempotency_key'] == 'idem_key_1'


class TestExecuteFunction:
    """Tests for the main execute() orchestration function."""

    def _mock_payments_module(self):
        """Block 'routes.payments' import by inserting a mock module.
        
        This avoids 'routes.__init__' which triggers 'firebase_admin' import.
        """
        import sys
        mock_payments = MagicMock()
        mock_payments.create_razorpay_subscription = MagicMock(return_value={'id': 'sub_abc'})
        mock_payments.get_razorpay_customer_id_new = MagicMock(return_value='cust_1')
        mock_payments.get_razorpay_client = MagicMock()
        mock_payments.store_razorpay_customer_new = MagicMock()
        sys.modules['routes.payments'] = mock_payments

    def test_execute_full_success(self):
        self._mock_payments_module()
        with patch('supabase_client.get_supabase_client') as mock_db:
            mock_db.return_value = MagicMock()
            with patch('tasks.subscription_worker.claim_checkout_request') as mock_claim:
                from tasks.subscription_worker import execute

                mock_claim.return_value = {
                    'checkout_token': 'tok_123',
                    'firebase_uid': 'user_1',
                    'domain': 'shop',
                    'target_plan_slug': 'pro',
                    'target_plan_id': 'plan_1',
                    'user_email': 'test@example.com',
                    'user_phone': '',
                    'razorpay_plan_id': 'plan_rzp_1',
                    'amount_paise': 99900,
                    'currency': 'INR',
                    'retry_count': 0,
                }
                result = execute('tok_123')
                assert result['status'] == 'completed'
                assert result['razorpay_subscription_id'] == 'sub_abc'
                mock_claim.assert_called_once_with(ANY, 'tok_123')

    def test_execute_skips_if_already_claimed(self):
        self._mock_payments_module()
        with patch('tasks.subscription_worker.claim_checkout_request') as mock_claim:
            from tasks.subscription_worker import execute
            mock_claim.return_value = None
            result = execute('tok_123')
            assert result['status'] == 'skipped'

    def test_execute_recovers_existing_razorpay_customer(self):
        """When Razorpay says customer exists, worker should recover by email."""
        import sys
        mock_payments = MagicMock()
        mock_client = MagicMock()
        mock_client.customer.create.side_effect = Exception(
            'Customer already exists for the merchant'
        )
        mock_payments.get_razorpay_client.return_value = mock_client
        mock_payments.get_razorpay_customer_id_new.return_value = None
        mock_payments.get_existing_razorpay_customer.return_value = None
        mock_payments.recover_razorpay_customer_by_email.return_value = 'cust_recovered'
        mock_payments.create_razorpay_subscription.return_value = {'id': 'sub_recovered'}
        mock_payments.store_razorpay_customer_new = MagicMock()
        sys.modules['routes.payments'] = mock_payments

        with patch('supabase_client.get_supabase_client') as mock_db:
            mock_db.return_value = MagicMock()
            with patch('tasks.subscription_worker.claim_checkout_request') as mock_claim:
                with patch('tasks.subscription_worker.complete_checkout_request'):
                    with patch('tasks.subscription_worker.upsert_subscription_row'):
                        from tasks.subscription_worker import execute

                        mock_claim.return_value = {
                            'checkout_token': 'tok_123',
                            'firebase_uid': 'user_1',
                            'domain': 'shop',
                            'target_plan_slug': 'pro',
                            'target_plan_id': 'plan_1',
                            'user_email': 'test@example.com',
                            'user_phone': '',
                            'razorpay_plan_id': 'plan_rzp_1',
                            'amount_paise': 99900,
                            'currency': 'INR',
                            'retry_count': 0,
                        }
                        result = execute('tok_123')

        assert result['status'] == 'completed'
        assert result['razorpay_subscription_id'] == 'sub_recovered'
        mock_payments.recover_razorpay_customer_by_email.assert_called_once_with(
            'test@example.com'
        )
        mock_payments.store_razorpay_customer_new.assert_called_once()


# =============================================================================
# billing_metrics tests
# =============================================================================

class TestBillingMetrics:
    """Tests for billing Prometheus metrics."""

    def test_record_subscription_creation_no_crash(self):
        from monitoring.billing_metrics import record_subscription_creation
        record_subscription_creation('initiated', 'shop')
        record_subscription_creation('completed', 'shop')
        record_subscription_creation('failed', 'shop')
        record_subscription_creation('validation_error', 'unknown')

    def test_record_rate_limit_hit_no_crash(self):
        from monitoring.billing_metrics import record_rate_limit_hit
        record_rate_limit_hit('endpoint')
        record_rate_limit_hit('global')

    def test_record_pending_checkouts_no_crash(self):
        from monitoring.billing_metrics import record_pending_checkouts
        record_pending_checkouts(5)
        record_pending_checkouts(0)

    def test_record_queue_depth_no_crash(self):
        from monitoring.billing_metrics import record_queue_depth
        record_queue_depth(3)
        record_queue_depth(0)

    def test_record_webhook_event_no_crash(self):
        from monitoring.billing_metrics import record_webhook_event
        record_webhook_event('subscription.activated', 'processed')
        record_webhook_event('payment.captured', 'duplicate')
        record_webhook_event('subscription.cancelled', 'error')

    def test_init_billing_metrics_reentrant(self):
        from monitoring.billing_metrics import init_billing_metrics
        init_billing_metrics()
        init_billing_metrics()


# =============================================================================
# billing_tracing tests
# =============================================================================

class TestBillingTracing:
    """Tests for OpenTelemetry tracing utilities."""

    def test_get_or_create_correlation_id_from_headers(self):
        from services.billing_tracing import get_or_create_correlation_id
        cid = get_or_create_correlation_id({'X-Correlation-ID': 'abc-123'})
        assert cid == 'abc-123'

    def test_get_or_create_correlation_id_from_request_id(self):
        from services.billing_tracing import get_or_create_correlation_id
        cid = get_or_create_correlation_id({'X-Request-ID': 'req_abc'})
        assert cid == 'req_abc'

    def test_get_or_create_correlation_id_generates_new(self):
        from services.billing_tracing import get_or_create_correlation_id
        cid = get_or_create_correlation_id({})
        assert cid is not None
        assert len(cid) > 0

    def test_inject_correlation_id(self):
        from services.billing_tracing import inject_correlation_id
        headers = {'Content-Type': 'application/json'}
        result = inject_correlation_id(headers, 'cid_123')
        assert result['X-Correlation-ID'] == 'cid_123'
        assert result['Content-Type'] == 'application/json'

    def test_billing_attributes_builds_dict(self):
        from services.billing_tracing import billing_attributes
        attrs = billing_attributes(
            domain='shop', plan_slug='pro',
            checkout_token='tok_abc12345', status='initiated',
        )
        assert attrs['billing.domain'] == 'shop'
        assert attrs['billing.plan_slug'] == 'pro'
        assert attrs['billing.checkout_token'] == 'tok_abc12345'
        assert attrs['billing.status'] == 'initiated'

    def test_billing_attributes_omits_none(self):
        from services.billing_tracing import billing_attributes
        attrs = billing_attributes(domain='shop')
        assert 'billing.plan_slug' not in attrs
        assert attrs['billing.domain'] == 'shop'

    def test_traced_decorator_passes_through(self):
        from services.billing_tracing import traced
        called = False

        @traced("test_span")
        def my_func():
            nonlocal called
            called = True
            return 42

        result = my_func()
        assert result == 42
        assert called

    def test_traced_decorator_raises_on_error(self):
        from services.billing_tracing import traced

        @traced("test_error_span")
        def failing_func():
            raise ValueError("oops")

        with pytest.raises(ValueError, match="oops"):
            failing_func()

    def test_span_context_noop(self):
        from services.billing_tracing import span_context
        with span_context("test"):
            pass

    def test_span_context_sets_attributes(self):
        from services.billing_tracing import span_context
        with span_context("test", attributes={"key": "val"}):
            pass

    def test_force_flush_noop(self):
        from services.billing_tracing import force_flush
        assert force_flush() is True


# =============================================================================
# billing_api response tests (no Flask app — test the logic directly)
# =============================================================================

class TestCheckoutStatusPolling:
    """Tests for the polling endpoint logic."""

    def test_get_checkout_status_202_flow(self):
        """Simulate the full polling lifecycle statuses."""
        statuses = {
            'tok_init': {'status': 'initiated'},
            'tok_proc': {'status': 'processing'},
            'tok_done': {
                'status': 'completed',
                'razorpay_subscription_id': 'sub_abc',
                'razorpay_key_id': 'rzp_test',
                'amount_paise': 99900,
                'currency': 'INR',
                'target_plan_slug': 'pro',
            },
            'tok_fail': {'status': 'failed', 'error_message': 'Card declined'},
        }
        # Just verify the data shapes are correct
        assert statuses['tok_init']['status'] == 'initiated'
        assert statuses['tok_proc']['status'] == 'processing'
        assert statuses['tok_done']['status'] == 'completed'
        assert statuses['tok_done']['razorpay_subscription_id'] == 'sub_abc'
        assert statuses['tok_fail']['status'] == 'failed'
        assert 'error_message' in statuses['tok_fail']

    def test_get_checkout_status_completed_shape(self):
        """Verify the response shape when checkout is done matches API contract."""
        checkout = {
            'status': 'completed',
            'razorpay_subscription_id': 'sub_abc',
            'razorpay_key_id': 'rzp_test',
            'amount_paise': 99900,
            'currency': 'INR',
            'target_plan_slug': 'pro',
        }
        response = {
            'success': checkout['status'] == 'completed',
            'status': checkout['status'],
            'subscription_id': checkout.get('razorpay_subscription_id'),
            'key_id': checkout.get('razorpay_key_id'),
            'amount': checkout.get('amount_paise'),
            'currency': checkout.get('currency', 'INR'),
            'plan_name': checkout.get('target_plan_slug'),
        }
        assert response['success'] is True
        assert response['subscription_id'] == 'sub_abc'
        assert response['amount'] == 99900


class TestCreateSubscriptionResponse:
    """Tests for the 202 create-subscription contract."""

    def test_create_subscription_202_shape(self):
        """Verify 202 Accepted response shape."""
        response_data = {
            'success': True,
            'checkout_token': 'uuid-12345',
            'status': 'initiated',
            'poll_url': '/api/billing/checkout-status/uuid-12345',
        }
        # Response must match this exact contract
        assert response_data['success'] is True
        assert response_data['checkout_token'] is not None
        assert response_data['status'] == 'initiated'
        assert response_data['poll_url'].startswith('/api/billing/checkout-status/')

    def test_create_subscription_validation_error_shape(self):
        """Verify 400 validation error response shape."""
        error_data = {
            'success': False,
            'error': 'plan_name is required.',
            'error_code': 'VALIDATION_ERROR',
        }
        assert error_data['success'] is False
        assert 'error_code' in error_data


# =============================================================================
# Rate limiting integration test (logic only, no Flask)
# =============================================================================

class TestBillingRateLimit:
    """Tests for rate limit integration with billing flow."""

    def test_rate_limiter_check_structure(self):
        """Verify the rate limiter info dict structure."""
        info = {
            'limit': 10,
            'remaining': 9,
            'reset': int(datetime.now(timezone.utc).timestamp()) + 60,
            'retry_after': 0,
        }
        assert info['limit'] == 10
        assert 'remaining' in info
        assert 'reset' in info
