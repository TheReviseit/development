"""Tests for bounded checkout dispatch pool (504 fix v2)."""

from unittest.mock import MagicMock, patch

import pytest


class TestCheckoutDispatchPool:
    def test_try_submit_respects_max_workers(self):
        from services.checkout_dispatch_pool import CheckoutDispatchPool

        pool = CheckoutDispatchPool(max_workers=2)
        with pool._lock:
            pool._in_flight = 2
        assert pool.try_submit('token-c') is False
        pool.shutdown(wait=False)

    def test_claim_token_passed_to_complete_claim(self):
        from flask import Flask
        from services.checkout_dispatch_pool import _run_checkout_job

        flask_app = Flask(__name__)
        with patch('app.app', flask_app), patch(
            'tasks.subscription_worker.execute', return_value={
                'status': 'completed',
                'razorpay_subscription_id': 'sub_123',
            }
        ), patch('config.billing_flags.get_bool_flag', return_value=True), patch(
            'supabase_client.get_supabase_client'
        ) as mock_db, patch(
            'services.billing_checkout_idempotency.complete_claim'
        ) as mock_complete:
            db = MagicMock()
            mock_db.return_value = db
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{'amount_paise': 99900, 'currency': 'INR', 'target_plan_slug': 'pro'}]
            )

            _run_checkout_job('tok_abc', 'idem-key-1', 'claim-token-xyz', 'req_test')

            mock_complete.assert_called_once()
            args = mock_complete.call_args[0]
            assert args[1] == 'idem-key-1'
            assert args[2] == 'claim-token-xyz'

    def test_pool_full_returns_false_without_extra_threads(self):
        from services.checkout_dispatch_pool import CheckoutDispatchPool

        pool = CheckoutDispatchPool(max_workers=1)
        with pool._lock:
            pool._in_flight = 1
        assert pool.try_submit('t2') is False
        pool.shutdown(wait=False)


class TestCompleteCheckoutFromWebhook:
    def test_completes_by_checkout_token(self):
        from services.checkout_dispatch_pool import complete_checkout_from_webhook

        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{'status': 'processing', 'checkout_token': 'tok_1'}]
        )

        with patch('tasks.subscription_worker.complete_checkout_request') as mock_complete:
            result = complete_checkout_from_webhook(
                db, 'sub_rzp_1', checkout_token='tok_1'
            )
            assert result is True
            mock_complete.assert_called_once_with(db, 'tok_1', 'sub_rzp_1')


class TestCreateSubscriptionAsync202:
    """POST create-subscription returns 202 without blocking on execute()."""

    def test_returns_202_and_dispatches_to_pool(self):
        import importlib.util
        import sys
        from pathlib import Path

        from flask import Flask, g

        if 'redis' not in sys.modules:
            sys.modules['redis'] = MagicMock()

        mod_path = Path(__file__).resolve().parents[1] / 'routes' / 'billing_api.py'
        spec = importlib.util.spec_from_file_location('billing_api_isolated', mod_path)
        billing_api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(billing_api)

        app = Flask(__name__)
        mock_pool = MagicMock()
        mock_pool.try_submit.return_value = True
        mock_execute = MagicMock()

        with app.test_request_context(
            '/api/billing/create-subscription',
            method='POST',
            headers={
                'Host': 'shop.flowauxi.com',
                'Authorization': 'Bearer test-token',
                'Content-Type': 'application/json',
            },
            json={'plan_name': 'pro', 'customer_email': 'user@example.com'},
        ):
            g.firebase_uid = 'fb-user-1'
            g.user_id = 'uuid-user-1'
            g.product_domain = 'shop'
            g.request_id = 'req_test'

            with patch('middleware.auth.get_firebase_uid', return_value='fb-user-1'), patch(
                'middleware.auth.map_to_supabase_user_id', return_value='uuid-user-1'
            ), patch.object(
                billing_api,
                'PricingPlan',
            ) as mock_pricing, patch.dict('os.environ', {'RAZORPAY_KEY_ID': 'rzp_test_key'}), patch(
                'config.billing_flags.get_bool_flag',
                side_effect=lambda key, default=None: {
                    'fix_server_idempotency': False,
                    'billing_sync_checkout': False,
                }.get(key, default),
            ), patch('supabase_client.get_supabase_client') as mock_db_fn, patch(
                'services.checkout_dispatch_pool.get_checkout_dispatch_pool',
                return_value=mock_pool,
            ), patch('tasks.subscription_worker.execute', mock_execute), patch.object(
                billing_api, 'record_subscription_creation'
            ), patch.object(billing_api, 'record_pending_checkouts'):
                mock_pricing.get_by_domain_and_slug.return_value = {
                    'id': 'plan-1',
                    'razorpay_plan_id': 'plan_rzp_1',
                    'amount_paise': 99900,
                    'currency': 'INR',
                }
                db = MagicMock()
                mock_db_fn.return_value = db
                db.table.return_value.insert.return_value.execute.return_value = MagicMock(
                    data=[{'id': 'checkout-row-1'}]
                )

                response, status = billing_api.create_subscription()

        body = response.get_json()
        assert status == 202
        assert body['success'] is True
        assert body['status'] == 'initiated'
        assert body['checkout_token']
        assert body['poll_url'].startswith('/api/billing/checkout-status/')
        mock_pool.try_submit.assert_called_once()
        mock_execute.assert_not_called()
