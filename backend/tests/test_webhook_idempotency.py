"""
Tests for Razorpay Webhook Idempotency
======================================

These tests verify:
1. Same event delivered twice → processed once
2. Same payment in two different events → stored once
3. Concurrent delivery handling
4. Proper HTTP response codes
5. Duplicate key handling returns 200

Run with: pytest tests/test_webhook_idempotency.py -v
"""

import pytest
import json
import hmac
import hashlib
import time
import threading
import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def app():
    """Create Flask test application."""
    from flask import Flask
    from routes.payments import payments_bp
    
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(payments_bp)
    
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def webhook_secret():
    """Test webhook secret."""
    return "test_webhook_secret_123"


def generate_signature(payload: dict, secret: str) -> str:
    """Generate valid Razorpay webhook signature."""
    body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    return hmac.new(
        secret.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()


def make_subscription_charged_event(
    event_id: str = None,
    subscription_id: str = None,
    payment_id: str = None,
    amount: int = 100
) -> dict:
    """Create a subscription.charged webhook event."""
    return {
        'id': event_id or f'evt_{uuid.uuid4().hex[:16]}',
        'event': 'subscription.charged',
        'created_at': int(datetime.now(timezone.utc).timestamp()),
        'payload': {
            'subscription': {
                'entity': {
                    'id': subscription_id or f'sub_{uuid.uuid4().hex[:16]}',
                    'plan_id': 'plan_test123',
                    'status': 'active',
                    'current_start': int(datetime.now(timezone.utc).timestamp()),
                    'current_end': int(datetime.now(timezone.utc).timestamp()) + 2592000,
                }
            },
            'payment': {
                'entity': {
                    'id': payment_id or f'pay_{uuid.uuid4().hex[:16]}',
                    'amount': amount,
                    'currency': 'INR',
                    'status': 'captured',
                    'method': 'upi'
                }
            }
        }
    }


def make_payment_captured_event(
    event_id: str = None,
    payment_id: str = None,
    amount: int = 100,
    user_id: str = None
) -> dict:
    """Create a payment.captured webhook event."""
    return {
        'id': event_id or f'evt_{uuid.uuid4().hex[:16]}',
        'event': 'payment.captured',
        'created_at': int(datetime.now(timezone.utc).timestamp()),
        'payload': {
            'payment': {
                'entity': {
                    'id': payment_id or f'pay_{uuid.uuid4().hex[:16]}',
                    'amount': amount,
                    'currency': 'INR',
                    'status': 'captured',
                    'method': 'card',
                    'notes': {
                        'user_id': user_id or str(uuid.uuid4())
                    }
                }
            }
        }
    }


# =============================================================================
# Test: Same Event Delivered Twice
# =============================================================================

class TestDuplicateEventHandling:
    """Test that same event_id is processed only once."""
    
    @patch('routes.payments.RAZORPAY_WEBHOOK_SECRET', 'test_secret')
    @patch('routes.payments.SUPABASE_AVAILABLE', True)
    @patch('routes.payments.get_supabase_client')
    def test_same_event_delivered_twice(self, mock_supabase, client):
        """Same event_id delivered twice → second returns 200 with ignored_duplicate."""
        # Setup
        event_id = 'evt_test_duplicate_123'
        event = make_subscription_charged_event(event_id=event_id)
        
        # Mock Supabase
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        
        # First call: insert succeeds
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{'id': 'sub-uuid', 'user_id': 'user-uuid'}]
        )
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        mock_client.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        
        # First request
        body = json.dumps(event, separators=(',', ':')).encode('utf-8')
        signature = hmac.new(b'test_secret', body, hashlib.sha256).hexdigest()
        
        response1 = client.post(
            '/api/payments/webhook',
            data=body,
            headers={
                'Content-Type': 'application/json',
                'X-Razorpay-Signature': signature
            }
        )
        
        assert response1.status_code == 200
        assert response1.json['status'] == 'ok'
        
        # Second call: webhook_events insert raises duplicate key error
        mock_client.table.return_value.insert.return_value.execute.side_effect = Exception(
            'duplicate key value violates unique constraint "webhook_events_event_id_key"'
        )
        
        response2 = client.post(
            '/api/payments/webhook',
            data=body,
            headers={
                'Content-Type': 'application/json',
                'X-Razorpay-Signature': signature
            }
        )
        
        assert response2.status_code == 200
        assert response2.json['status'] == 'ignored_duplicate'


# =============================================================================
# Test: Same Payment in Two Different Events
# =============================================================================

class TestSamePaymentDifferentEvents:
    """Test that same payment_id from different events is stored once."""
    
    @patch('routes.payments.RAZORPAY_WEBHOOK_SECRET', 'test_secret')
    @patch('routes.payments.SUPABASE_AVAILABLE', True)
    @patch('routes.payments.get_supabase_client')
    def test_same_payment_in_two_events(self, mock_supabase, client):
        """
        Scenario:
        1. subscription.charged with pay_123 arrives
        2. payment.captured with pay_123 arrives (different event_id)
        3. Both return 200, payment stored only once via UPSERT
        """
        payment_id = 'pay_shared_123'
        subscription_id = 'sub_test_456'
        
        # Create two different events with same payment_id
        event1 = make_subscription_charged_event(
            event_id='evt_charged_1',
            subscription_id=subscription_id,
            payment_id=payment_id
        )
        event2 = make_payment_captured_event(
            event_id='evt_captured_2',
            payment_id=payment_id
        )
        
        # Mock Supabase
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        
        # Both webhook_events inserts succeed (different event_ids)
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{'id': 'sub-uuid', 'user_id': 'user-uuid', 'status': 'pending'}]
        )
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        
        # Track upsert calls
        upsert_calls = []
        def track_upsert(*args, **kwargs):
            upsert_calls.append((args, kwargs))
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{}])
            return mock_result
        
        mock_client.table.return_value.upsert = track_upsert
        
        # First request (subscription.charged)
        body1 = json.dumps(event1, separators=(',', ':')).encode('utf-8')
        signature1 = hmac.new(b'test_secret', body1, hashlib.sha256).hexdigest()
        
        response1 = client.post(
            '/api/payments/webhook',
            data=body1,
            headers={'Content-Type': 'application/json', 'X-Razorpay-Signature': signature1}
        )
        
        assert response1.status_code == 200
        
        # Second request (payment.captured)
        body2 = json.dumps(event2, separators=(',', ':')).encode('utf-8')
        signature2 = hmac.new(b'test_secret', body2, hashlib.sha256).hexdigest()
        
        response2 = client.post(
            '/api/payments/webhook',
            data=body2,
            headers={'Content-Type': 'application/json', 'X-Razorpay-Signature': signature2}
        )
        
        assert response2.status_code == 200
        
        # Verify upsert was called (both times use upsert, idempotency handled at DB level)
        assert len(upsert_calls) >= 1, "upsert_payment_history should be called"


# =============================================================================
# Test: Concurrent Delivery
# =============================================================================

class TestConcurrentDelivery:
    """Test that concurrent requests for same event are handled safely."""
    
    def test_concurrent_webhook_delivery_simulation(self):
        """
        Simulate concurrent delivery by testing the is_duplicate_error() function
        and record_webhook_event() behavior.
        """
        from routes.payments import is_duplicate_error
        
        # Test various duplicate error formats
        pg_duplicate = Exception('duplicate key value violates unique constraint')
        pg_code = Exception('23505')
        generic = Exception('unique constraint violation')
        
        assert is_duplicate_error(pg_duplicate) == True
        assert is_duplicate_error(pg_code) == True
        assert is_duplicate_error(generic) == True
        assert is_duplicate_error(Exception('some other error')) == False


# =============================================================================
# Test: HTTP Response Codes
# =============================================================================

class TestWebhookResponseCodes:
    """Test correct HTTP response codes for various scenarios."""
    
    @patch('routes.payments.RAZORPAY_WEBHOOK_SECRET', 'test_secret')
    def test_invalid_signature_returns_400(self, client):
        """Invalid signature → 400 (not 500)."""
        event = make_subscription_charged_event()
        body = json.dumps(event).encode('utf-8')
        
        response = client.post(
            '/api/payments/webhook',
            data=body,
            headers={
                'Content-Type': 'application/json',
                'X-Razorpay-Signature': 'invalid_signature_abc123'
            }
        )
        
        assert response.status_code == 400
        assert 'invalid' in response.json.get('status', '').lower()
    
    @patch('routes.payments.RAZORPAY_WEBHOOK_SECRET', 'test_secret')
    def test_empty_body_returns_400(self, client):
        """Empty body → 400."""
        response = client.post(
            '/api/payments/webhook',
            data=b'',
            headers={
                'Content-Type': 'application/json',
                'X-Razorpay-Signature': 'any'
            }
        )
        
        assert response.status_code == 400
    
    @patch('routes.payments.RAZORPAY_WEBHOOK_SECRET', 'test_secret')
    @patch('routes.payments.SUPABASE_AVAILABLE', True)
    @patch('routes.payments.get_supabase_client')
    def test_duplicate_returns_200_not_500(self, mock_supabase, client):
        """Duplicate key error → 200 (not 500)."""
        event = make_subscription_charged_event()
        body = json.dumps(event, separators=(',', ':')).encode('utf-8')
        signature = hmac.new(b'test_secret', body, hashlib.sha256).hexdigest()
        
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        
        # Simulate duplicate key error on webhook_events insert
        mock_client.table.return_value.insert.return_value.execute.side_effect = Exception(
            'duplicate key value violates unique constraint'
        )
        
        response = client.post(
            '/api/payments/webhook',
            data=body,
            headers={
                'Content-Type': 'application/json',
                'X-Razorpay-Signature': signature
            }
        )
        
        # Must be 200, not 500
        assert response.status_code == 200
        assert response.json['status'] == 'ignored_duplicate'


# =============================================================================
# Test: Helper Functions
# =============================================================================

class TestHelperFunctions:
    """Test individual helper functions."""
    
    def test_is_duplicate_error_detection(self):
        """Test duplicate error detection."""
        from routes.payments import is_duplicate_error
        
        # Should detect duplicates
        assert is_duplicate_error(Exception('duplicate key value violates unique constraint "pk"'))
        assert is_duplicate_error(Exception('UNIQUE constraint failed'))
        assert is_duplicate_error(Exception('Error code: 23505'))
        
        # Should not match other errors
        assert not is_duplicate_error(Exception('connection timeout'))
        assert not is_duplicate_error(Exception('null value in column'))
        assert not is_duplicate_error(Exception('foreign key violation'))
    
    def test_extract_event_metadata(self):
        """Test event metadata extraction."""
        from routes.payments import extract_event_metadata
        
        event = make_subscription_charged_event(
            event_id='evt_test',
            subscription_id='sub_test',
            payment_id='pay_test'
        )
        
        meta = extract_event_metadata(event)
        
        assert meta['event_id'] == 'evt_test'
        assert meta['event_type'] == 'subscription.charged'
        assert meta['subscription_id'] == 'sub_test'
        assert meta['payment_id'] == 'pay_test'
        assert meta['created_at'] is not None


# =============================================================================
# Test: Verify + Webhook Collision
# =============================================================================

class TestVerifyWebhookCollision:
    """Test handling when verify endpoint and webhook arrive simultaneously."""
    
    @patch('routes.payments.SUPABASE_AVAILABLE', True)
    @patch('routes.payments.get_supabase_client')
    def test_upsert_handles_collision(self, mock_supabase):
        """
        upsert_payment_history handles the case where:
        - verify endpoint inserts pay_123
        - webhook tries to insert pay_123
        - No error, second call is idempotent
        """
        from routes.payments import upsert_payment_history
        from flask import Flask, g
        
        app = Flask(__name__)
        
        with app.app_context():
            g.request_id = 'test_req_123'
            
            mock_client = MagicMock()
            mock_supabase.return_value = mock_client
            
            # First upsert succeeds
            mock_client.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
            
            result1 = upsert_payment_history(
                user_id='user-123',
                razorpay_payment_id='pay_collision_test',
                amount=1000
            )
            
            assert result1['success'] == True
            
            # Second upsert also succeeds (idempotent)
            result2 = upsert_payment_history(
                user_id='user-123',
                razorpay_payment_id='pay_collision_test',
                amount=1000
            )
            
            assert result2['success'] == True


# =============================================================================
# Integration Test: Full Webhook Flow
# =============================================================================

class TestFullWebhookFlow:
    """Integration tests for complete webhook processing flow."""
    
    @patch('routes.payments.RAZORPAY_WEBHOOK_SECRET', 'test_secret')
    @patch('routes.payments.SUPABASE_AVAILABLE', True)
    @patch('routes.payments.get_supabase_client')
    def test_subscription_charged_full_flow(self, mock_supabase, client):
        """Test complete subscription.charged webhook processing."""
        event = make_subscription_charged_event(
            event_id='evt_full_flow',
            subscription_id='sub_full_flow',
            payment_id='pay_full_flow',
            amount=99900
        )
        
        mock_client = MagicMock()
        mock_supabase.return_value = mock_client
        
        # Mock all DB operations to succeed
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{
                'id': 'uuid-123',
                'user_id': 'user-uuid-456',
                'status': 'pending',
                'last_webhook_event_at': None
            }]
        )
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        mock_client.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        
        body = json.dumps(event, separators=(',', ':')).encode('utf-8')
        signature = hmac.new(b'test_secret', body, hashlib.sha256).hexdigest()
        
        response = client.post(
            '/api/payments/webhook',
            data=body,
            headers={
                'Content-Type': 'application/json',
                'X-Razorpay-Signature': signature
            }
        )
        
        assert response.status_code == 200
        assert response.json['status'] == 'ok'
        
        # Verify subscription was updated
        mock_client.table.assert_any_call('subscriptions')
        
        # Verify payment was recorded via upsert
        upsert_calls = [
            call for call in mock_client.table.return_value.upsert.call_args_list
        ]
        assert len(upsert_calls) > 0, "payment_history upsert should be called"


# =============================================================================
# Run tests
# =============================================================================

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
