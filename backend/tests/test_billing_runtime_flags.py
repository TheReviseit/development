"""Tests for billing runtime flags admin API and idempotency fencing edge cases."""

import importlib.util
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask


def _load_billing_admin():
    if 'redis' not in sys.modules:
        sys.modules['redis'] = MagicMock()
    path = Path(__file__).resolve().parent.parent / 'routes' / 'billing_admin.py'
    spec = importlib.util.spec_from_file_location('billing_admin_isolated', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestRuntimeFlagsAdmin:
    def test_update_flag_rejects_short_reason(self):
        billing_admin = _load_billing_admin()
        with patch.dict(os.environ, {'MONITOR_ADMIN_KEY': 'test-admin-key'}):
            billing_admin.ADMIN_KEY = 'test-admin-key'

            app = Flask(__name__)
            with app.test_request_context(
                '/api/admin/billing/flags/canary_percent',
                method='PUT',
                json={'value': 10, 'reason': 'bad'},
                headers={'X-Admin-Key': 'test-admin-key'},
            ):
                resp, status = billing_admin.update_runtime_flag('canary_percent')

        assert status == 400
        data = resp.get_json()
        assert data['success'] is False
        assert 'reason' in data['error'].lower()

    def test_update_flag_requires_admin_key(self):
        billing_admin = _load_billing_admin()
        with patch.dict(os.environ, {'MONITOR_ADMIN_KEY': 'test-admin-key'}):
            billing_admin.ADMIN_KEY = 'test-admin-key'

            app = Flask(__name__)
            with app.test_request_context(
                '/api/admin/billing/flags/canary_percent',
                method='PUT',
                json={'value': 10, 'reason': 'valid rollback reason'},
            ):
                resp, status = billing_admin.update_runtime_flag('canary_percent')

        assert status == 401


class TestSlowNotDeadIdempotency:
    """Worker B reclaims stale PROCESSING; Worker A completion must lose fencing."""

    @patch('services.billing_checkout_idempotency.get_bool_flag', return_value=True)
    @patch('services.billing_checkout_idempotency.get_int_flag', return_value=60)
    def test_reclaim_rotates_token_invalidating_worker_a(self, mock_ttl, mock_flag):
        from services.billing_checkout_idempotency import claim_or_reclaim, complete_claim

        db = MagicMock()
        db.table.return_value.insert.side_effect = Exception('23505 duplicate')
        stale_time = '2020-01-01T00:00:00+00:00'
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
            data={
                'status': 'PROCESSING',
                'updated_at': stale_time,
                'created_at': stale_time,
                'reclaim_count': 0,
                'claim_token': 'worker-a-token',
            }
        )

        execute_results = [
            MagicMock(data=[{'key': 'race-key'}]),
            MagicMock(data=[]),
            MagicMock(data=[{'key': 'race-key'}]),
        ]
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.side_effect = (
            execute_results
        )

        _, worker_b_token = claim_or_reclaim(db, 'race-key', 'user-1', 'shop')
        worker_a_wins = complete_claim(
            db, 'race-key', 'worker-a-token', {'success': True, 'subscription_id': 'sub_dup'}
        )
        worker_b_wins = complete_claim(
            db, 'race-key', worker_b_token, {'success': True, 'subscription_id': 'sub_ok'}
        )

        assert worker_a_wins is False
        assert worker_b_wins is True
