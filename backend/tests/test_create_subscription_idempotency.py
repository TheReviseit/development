"""Tests for checkout idempotency fencing and reclaim."""

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest


class TestCheckoutIdempotency:
    @patch('services.billing_checkout_idempotency.get_bool_flag', return_value=True)
    @patch('services.billing_checkout_idempotency.get_int_flag', return_value=90)
    def test_young_processing_raises_in_progress(self, mock_ttl, mock_flag):
        from services.billing_checkout_idempotency import claim_or_reclaim, IdempotencyInProgress

        db = MagicMock()
        db.table.return_value.insert.side_effect = Exception('duplicate key value violates unique constraint')
        now = datetime.now(timezone.utc).isoformat()
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
            data={
                'status': 'PROCESSING',
                'updated_at': now,
                'created_at': now,
                'reclaim_count': 0,
            }
        )

        with pytest.raises(IdempotencyInProgress):
            claim_or_reclaim(db, 'test-key', 'user-1', 'shop')

    @patch('services.billing_checkout_idempotency.get_bool_flag', return_value=True)
    def test_complete_requires_matching_claim_token(self, mock_flag):
        from services.billing_checkout_idempotency import complete_claim

        db = MagicMock()
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        result = complete_claim(db, 'key-1', 'token-a', {'success': True})
        assert result is False

    @patch('services.billing_checkout_idempotency.get_bool_flag', return_value=True)
    def test_complete_succeeds_with_matching_token(self, mock_flag):
        from services.billing_checkout_idempotency import complete_claim

        db = MagicMock()
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{'key': 'key-1'}]
        )

        result = complete_claim(db, 'key-1', 'token-a', {'success': True})
        assert result is True

    @patch('services.billing_checkout_idempotency.get_bool_flag', return_value=True)
    @patch('services.billing_checkout_idempotency.get_int_flag', return_value=60)
    def test_stale_processing_reclaim_rotates_token(self, mock_ttl, mock_flag):
        from services.billing_checkout_idempotency import claim_or_reclaim

        db = MagicMock()
        db.table.return_value.insert.side_effect = Exception('23505 duplicate')
        stale_time = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
            data={
                'status': 'PROCESSING',
                'updated_at': stale_time,
                'created_at': stale_time,
                'reclaim_count': 0,
            }
        )
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{'key': 'test-key'}]
        )

        key, token = claim_or_reclaim(db, 'test-key', 'user-1', 'shop', firebase_uid='fb-uid')
        assert key == 'test-key'
        assert token

    @patch('services.billing_checkout_idempotency.get_bool_flag', return_value=True)
    def test_fk_violation_retries_with_null_user_id(self, mock_flag):
        from services.billing_checkout_idempotency import claim_or_reclaim

        db = MagicMock()
        users_select = MagicMock()
        users_select.execute.return_value = MagicMock(
            data=[{'id': 'd47a7043-42ad-4e43-b7db-f387887eef02'}]
        )
        db.table.return_value.select.return_value.eq.return_value.limit.return_value = users_select

        fk_error = Exception(
            "{'code': '23503', 'message': 'violates foreign key constraint idempotency_records_user_id_fkey'}"
        )
        success = MagicMock(data=[{'key': 'test-key'}])
        db.table.return_value.insert.side_effect = [fk_error, success]

        key, token = claim_or_reclaim(
            db,
            'test-key',
            'd47a7043-42ad-4e43-b7db-f387887eef02',
            'shop',
            firebase_uid='firebase-uid-1',
        )
        assert key == 'test-key'
        assert token
        assert db.table.return_value.insert.call_count == 2
        assert db.table.return_value.insert.call_args_list[1][0][0]['user_id'] is None
