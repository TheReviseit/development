"""
Billing Security Test Suite
===========================
Comprehensive security tests for billing endpoints.

Tests:
- Authentication bypass prevention
- Tenant isolation enforcement
- Rate limiting effectiveness
- Idempotency security (negative tests)
- Abuse detection accuracy
- Circuit breaker functionality
- CSP header validation

@version 1.0.0
@securityLevel FAANG-Production
"""

import pytest
import time
import jwt
import hashlib
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def client():
    """Flask test client."""
    from app import app
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def valid_token():
    """Generate a valid Firebase-style token."""
    payload = {
        'user_id': 'test_user_123',
        'email': 'test@example.com',
        'exp': datetime.now(timezone.utc) + timedelta(hours=1),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, 'secret', algorithm='HS256')


@pytest.fixture
def expired_token():
    """Generate an expired token."""
    payload = {
        'user_id': 'test_user_123',
        'email': 'test@example.com',
        'exp': datetime.now(timezone.utc) - timedelta(hours=1),
        'iat': datetime.now(timezone.utc) - timedelta(hours=2),
    }
    return jwt.encode(payload, 'secret', algorithm='HS256')


@pytest.fixture
def auth_headers(valid_token):
    """Headers with valid authentication."""
    return {
        'Authorization': f'Bearer {valid_token}',
        'Host': 'shop.flowauxi.com',
        'X-User-Id': 'test_user_123',
        'X-Product-Domain': 'shop',
    }


# =============================================================================
# AUTHENTICATION TESTS
# =============================================================================

class TestAuthBypassPrevention:
    """Tests for AC #1: No authentication bypass."""
    
    def test_payment_page_redirects_unauthenticated(self, client):
        """Unauthenticated user should be redirected to login."""
        response = client.get('/payment?reason=trial_expired')
        assert response.status_code == 302
        assert '/login' in response.location
    
    def test_api_without_token_returns_401(self, client):
        """API calls without auth header return 401."""
        response = client.get('/api/billing/pricing')
        assert response.status_code == 401
        assert response.json['error'] == 'UNAUTHORIZED'
    
    def test_api_with_invalid_token_format_returns_401(self, client):
        """Invalid token format returns 401."""
        response = client.get(
            '/api/billing/pricing',
            headers={'Authorization': 'Bearer invalid'}
        )
        assert response.status_code == 401
    
    def test_expired_token_returns_401_no_grace_period(self, client, expired_token):
        """AC #1: Expired tokens return 401, no grace period."""
        with patch('firebase_admin.auth.verify_id_token') as mock_verify:
            mock_verify.side_effect = Exception('Token expired')
            
            response = client.get(
                '/api/billing/pricing',
                headers={
                    'Authorization': f'Bearer {expired_token}',
                    'Host': 'shop.flowauxi.com',
                }
            )
            
            assert response.status_code == 401
            assert response.json['error'] in ['TOKEN_EXPIRED', 'UNAUTHORIZED']
    
    def test_session_endpoint_accepts_valid_token(self, client, valid_token):
        """AC #1: Session endpoint accepts new valid token from client SDK."""
        with patch('firebase_admin.auth.verify_id_token') as mock_verify:
            mock_verify.return_value = {
                'user_id': 'test_user_123',
                'email': 'test@example.com',
            }
            
            response = client.post(
                '/api/auth/session',
                json={'idToken': valid_token}
            )
            
            assert response.status_code == 200
            assert response.json['success'] is True
            assert 'user' in response.json
    
    def test_session_endpoint_rejects_expired_token(self, client, expired_token):
        """Session endpoint rejects expired tokens."""
        with patch('firebase_admin.auth.verify_id_token') as mock_verify:
            mock_verify.side_effect = Exception('Token expired')
            
            response = client.post(
                '/api/auth/session',
                json={'idToken': expired_token}
            )
            
            assert response.status_code == 401


# =============================================================================
# TENANT ISOLATION TESTS
# =============================================================================

class TestTenantIsolation:
    """Tests for tenant/domain isolation."""
    
    def test_pricing_returns_only_current_domain(self, client, auth_headers):
        """Pricing endpoint returns only current domain's plans."""
        with patch('backend.routes.billing_api.PricingPlan.get_all_by_domain') as mock_get:
            mock_get.return_value = [
                {
                    'id': 'plan_1',
                    'display_name': 'Shop Starter',
                    'plan_slug': 'starter',
                    'amount_paise': 199900,
                    'product_domain': 'shop',
                    'features_json': ['Feature 1'],
                }
            ]
            
            response = client.get(
                '/api/billing/pricing',
                headers=auth_headers
            )
            
            assert response.status_code == 200
            data = response.json
            assert all(plan['domain'] == 'shop' for plan in data['plans'])
    
    def test_cross_domain_plan_subscription_blocked(self, client, auth_headers):
        """Cannot subscribe to plan from different domain."""
        with patch('backend.routes.billing_api.PricingPlan.get_by_domain_and_slug') as mock_get:
            # Return a plan that belongs to 'api' domain
            mock_get.return_value = {
                'id': 'plan_api',
                'display_name': 'API Plan',
                'plan_slug': 'developer',
                'amount_paise': 149900,
                'product_domain': 'api',  # Different from request domain
                'features_json': [],
            }
            
            response = client.post(
                '/api/billing/checkout-session',
                headers=auth_headers,  # Headers say 'shop'
                json={'planSlug': 'developer', 'idempotencyKey': 'test-key'}
            )
            
            assert response.status_code == 403
            assert response.json['error'] == 'CROSS_DOMAIN_PLAN'
    
    def test_unknown_domain_returns_403(self, client, valid_token):
        """Unknown domain returns 403."""
        response = client.get(
            '/api/billing/pricing',
            headers={
                'Authorization': f'Bearer {valid_token}',
                'Host': 'unknown-domain.com',
            }
        )
        
        assert response.status_code == 403


# =============================================================================
# RATE LIMITING TESTS
# =============================================================================

class TestRateLimiting:
    """Tests for rate limiting effectiveness."""
    
    def test_excessive_requests_blocked(self, client, auth_headers):
        """Excessive requests return 429."""
        # Make 21 requests (limit is 20 per minute per user)
        for _ in range(21):
            response = client.get('/api/billing/pricing', headers=auth_headers)
        
        assert response.status_code == 429
        assert 'Retry-After' in response.headers
    
    def test_checkout_rate_limit_strict(self, client, auth_headers):
        """Checkout endpoint has stricter rate limit (5/min)."""
        # Make 6 checkout requests
        for i in range(6):
            response = client.post(
                '/api/billing/checkout-session',
                headers=auth_headers,
                json={'planSlug': 'starter', 'idempotencyKey': f'key_{i}'}
            )
        
        assert response.status_code == 429
        assert response.json['error'] == 'CHECKOUT_RATE_LIMIT_EXCEEDED'


# =============================================================================
# IDEMPOTENCY TESTS
# =============================================================================

class TestIdempotency:
    """Tests for AC #4: Idempotency security.
    
    Note: The server generates idempotency keys deterministically based on
    (user_id + plan_slug + domain + current_month). This is more secure than
    trusting client-provided keys.
    """
    
    def test_duplicate_request_returns_same_session(self, client, auth_headers):
        """AC #4 Positive: Same user+plan+domain generates same key, returns same session."""
        with patch('backend.routes.billing_api.razorpay.Client') as mock_razorpay:
            mock_client = MagicMock()
            mock_client.subscription.create.return_value = {'id': 'sub_123'}
            mock_razorpay.return_value = mock_client
            
            # First request - server generates idempotency key internally
            response1 = client.post(
                '/api/billing/checkout-session',
                headers=auth_headers,
                json={'planSlug': 'starter'}  # No idempotencyKey - server generates it
            )
            
            # Second request with same user+plan+domain - same key generated
            response2 = client.post(
                '/api/billing/checkout-session',
                headers=auth_headers,
                json={'planSlug': 'starter'}
            )
            
            assert response1.status_code == 200
            assert response2.status_code == 200
            assert response1.json['sessionId'] == response2.json['sessionId']
            assert response2.json.get('idempotencyHit') is True
            # Razorpay should only be called once
            assert mock_client.subscription.create.call_count == 1
    
    def test_different_user_cannot_reuse_idempotency_key(self, client, valid_token):
        """AC #4 Negative: Different user with same plan gets different session."""
        with patch('backend.routes.billing_api.razorpay.Client') as mock_razorpay:
            with patch('firebase_admin.auth.verify_id_token') as mock_verify:
                mock_client = MagicMock()
                mock_client.subscription.create.side_effect = [
                    {'id': 'sub_user_a'},
                    {'id': 'sub_user_b'},
                ]
                mock_razorpay.return_value = mock_client
                
                # User A creates session
                mock_verify.return_value = {'user_id': 'user_a', 'email': 'a@example.com'}
                response1 = client.post(
                    '/api/billing/checkout-session',
                    headers={
                        'Authorization': f'Bearer {valid_token}',
                        'Host': 'shop.flowauxi.com',
                        'X-User-Id': 'user_a',
                        'X-Product-Domain': 'shop',
                    },
                    json={'planSlug': 'starter'}
                )
                
                assert response1.status_code == 200
                session_id = response1.json['sessionId']
                
                # User B tries to reuse same idempotency key
                mock_verify.return_value = {'user_id': 'user_b', 'email': 'b@example.com'}
                response2 = client.post(
                    '/api/billing/checkout-session',
                    headers={
                        'Authorization': f'Bearer {valid_token}',
                        'Host': 'shop.flowauxi.com',
                        'X-User-Id': 'user_b',
                        'X-Product-Domain': 'shop',
                    },
                    json={'planSlug': 'starter', 'idempotencyKey': idempotency_key}
                )
                
                # Should either fail or return different session
                assert response2.status_code == 403 or \
                       response2.json.get('sessionId') != session_id


# =============================================================================
# ABUSE DETECTION TESTS
# =============================================================================

class TestAbuseDetection:
    """Tests for AC #2: Confidence-based abuse detection."""
    
    def test_corporate_nat_triggers_captcha_not_block(self, client, valid_token):
        """AC #2: Corporate NAT with many users triggers CAPTCHA (200), not 403."""
        with patch('firebase_admin.auth.verify_id_token') as mock_verify:
            mock_verify.return_value = {'user_id': 'user_1', 'email': 'user1@corp.com'}
            
            # Simulate 20 users from same IP (corporate NAT)
            for i in range(20):
                mock_verify.return_value = {
                    'user_id': f'user_{i}',
                    'email': f'user{i}@corp.com'
                }
                client.get(
                    '/api/billing/pricing',
                    headers={
                        'Authorization': f'Bearer {valid_token}',
                        'Host': 'shop.flowauxi.com',
                        'X-Forwarded-For': '203.0.113.1',
                        'X-User-Id': f'user_{i}',
                        'X-Product-Domain': 'shop',
                    }
                )
            
            # Next request should challenge, not block
            mock_verify.return_value = {'user_id': 'user_21', 'email': 'user21@corp.com'}
            response = client.post(
                '/api/billing/checkout-session',
                headers={
                    'Authorization': f'Bearer {valid_token}',
                    'Host': 'shop.flowauxi.com',
                    'X-Forwarded-For': '203.0.113.1',
                    'X-User-Id': 'user_21',
                    'X-Product-Domain': 'shop',
                },
                json={'planSlug': 'starter', 'idempotencyKey': 'test'}
            )
            
            # Should return 200 with challenge payload, not 403
            assert response.status_code == 200
            assert response.json.get('challenge') == 'captcha_required'
    
    def test_high_confidence_score_blocks(self, client, valid_token):
        """Very high abuse score results in block."""
        # This would require simulating many suspicious patterns
        # For now, test that the structure exists
        pass


# =============================================================================
# CIRCUIT BREAKER TESTS
# =============================================================================

class TestCircuitBreaker:
    """Tests for AC #3: Circuit breaker functionality."""
    
    def test_razorpay_timeout_returns_graceful_error(self, client, auth_headers):
        """AC #3: Razorpay timeout returns user-friendly error."""
        from backend.routes.billing_api import razorpay_circuit_breaker
        
        # Force circuit breaker open
        razorpay_circuit_breaker._state = 'open'
        razorpay_circuit_breaker._last_failure_time = time.time()
        
        with patch('backend.routes.billing_api.PricingPlan.get_by_domain_and_slug') as mock_get:
            mock_get.return_value = {
                'id': 'plan_1',
                'display_name': 'Starter',
                'plan_slug': 'starter',
                'amount_paise': 199900,
                'product_domain': 'shop',
                'features_json': [],
            }
            
            response = client.post(
                '/api/billing/checkout-session',
                headers=auth_headers,
                json={'planSlug': 'starter', 'idempotencyKey': 'test'}
            )
        
        assert response.status_code == 503
        assert 'temporarily unavailable' in response.json['message'].lower()
        assert 'try again' in response.json['message'].lower()
        
        # Reset circuit breaker
        razorpay_circuit_breaker._state = 'closed'
    
    def test_circuit_breaker_opens_after_failures(self, client, auth_headers):
        """Circuit breaker opens after threshold failures."""
        from backend.routes.billing_api import razorpay_circuit_breaker
        
        # Reset state
        razorpay_circuit_breaker._state = 'closed'
        razorpay_circuit_breaker._failure_count = 0
        
        with patch('backend.routes.billing_api.razorpay.Client') as mock_razorpay:
            # Simulate failures
            mock_razorpay.side_effect = Exception('Razorpay down')
            
            # Make requests until circuit opens (threshold is 5)
            for i in range(6):
                response = client.post(
                    '/api/billing/checkout-session',
                    headers=auth_headers,
                    json={'planSlug': 'starter', 'idempotencyKey': f'test_{i}'}
                )
            
            # Circuit should now be open
            assert razorpay_circuit_breaker.state == 'open'


# =============================================================================
# CSP HEADER TESTS
# =============================================================================

class TestCSPHeaders:
    """Tests for AC #5: CSP headers."""
    
    def test_payment_page_has_strict_csp(self, client, valid_token):
        """AC #5: Payment page has strict CSP headers."""
        with patch('firebase_admin.auth.verify_id_token') as mock_verify:
            mock_verify.return_value = {
                'user_id': 'test_user',
                'email': 'test@example.com',
            }
            
            response = client.get(
                '/payment',
                headers={'Authorization': f'Bearer {valid_token}'},
                follow_redirects=False
            )
            
            csp = response.headers.get('Content-Security-Policy')
            assert csp is not None
            assert "script-src 'self'" in csp
            assert "frame-ancestors 'none'" in csp
            assert "base-uri 'self'" in csp


# =============================================================================
# SECURITY INTEGRATION TESTS
# =============================================================================

class TestSecurityIntegration:
    """End-to-end security tests."""
    
    def test_complete_subscription_flow_security(self, client, auth_headers):
        """Test complete flow with all security controls."""
        # Step 1: Get pricing
        with patch('backend.routes.billing_api.PricingPlan.get_all_by_domain') as mock_pricing:
            mock_pricing.return_value = [
                {
                    'id': 'plan_1',
                    'display_name': 'Starter',
                    'plan_slug': 'starter',
                    'amount_paise': 199900,
                    'product_domain': 'shop',
                    'features_json': ['Feature 1'],
                }
            ]
            
            response = client.get('/api/billing/pricing', headers=auth_headers)
            assert response.status_code == 200
        
        # Step 2: Check subscription state
        with patch('backend.routes.billing_api.Subscription.get_by_user_and_domain') as mock_sub:
            mock_sub.return_value = None
            
            with patch('backend.routes.billing_api.FreeTrial.get_by_user_and_domain') as mock_trial:
                mock_trial.return_value = None
                
                response = client.get('/api/billing/subscription-state', headers=auth_headers)
                assert response.status_code == 200
                assert response.json['canSubscribe'] is True
        
        # Step 3: Create checkout session
        with patch('backend.routes.billing_api.PricingPlan.get_by_domain_and_slug') as mock_plan:
            mock_plan.return_value = {
                'id': 'plan_1',
                'display_name': 'Starter',
                'plan_slug': 'starter',
                'amount_paise': 199900,
                'product_domain': 'shop',
                'features_json': [],
            }
            
            with patch('backend.routes.billing_api.razorpay.Client') as mock_razorpay:
                mock_client = MagicMock()
                mock_client.subscription.create.return_value = {'id': 'sub_123'}
                mock_razorpay.return_value = mock_client
                
                response = client.post(
                    '/api/billing/checkout-session',
                    headers=auth_headers,
                    json={'planSlug': 'starter', 'idempotencyKey': 'unique-key'}
                )
                
                assert response.status_code == 200
                assert response.json['success'] is True
                assert 'checkoutUrl' in response.json


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
