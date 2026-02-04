"""
Security Enforcer Middleware Unit Tests
Tests for access control pipeline and paid plan enforcement.

🔒 Core rule being tested: NO OTP WITHOUT PAID PLAN
"""

import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
from flask import Flask, g


@pytest.fixture
def app():
    """Create Flask test app."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


class TestErrorResponses:
    """Tests for generic error responses (no info leaks)."""
    
    def test_access_denied_generic(self, app):
        """Access denied should have generic message."""
        from middleware.security_enforcer import _access_denied
        
        with app.app_context():
            response, status = _access_denied()
            data = response.get_json()
            
            assert status == 403
            assert data['success'] is False
            assert data['error'] == 'ACCESS_DENIED'
            assert data['message'] == 'Access denied'
            
            # Ensure no internal details leaked
            assert 'file' not in str(data).lower()
            assert 'path' not in str(data).lower()
            assert 'stack' not in str(data).lower()
    
    def test_unauthorized_generic(self, app):
        """Unauthorized should have generic message."""
        from middleware.security_enforcer import _unauthorized
        
        with app.app_context():
            response, status = _unauthorized()
            data = response.get_json()
            
            assert status == 401
            assert data['success'] is False
            assert data['error'] == 'UNAUTHORIZED'
    
    def test_payment_required_generic(self, app):
        """Payment required should not expose billing details."""
        from middleware.security_enforcer import _payment_required
        
        with app.app_context():
            response, status = _payment_required()
            data = response.get_json()
            
            assert status == 402
            assert data['success'] is False
            assert data['error'] == 'PAYMENT_REQUIRED'
            
            # Ensure no billing details leaked
            assert 'price' not in str(data).lower()
            assert 'amount' not in str(data).lower()
            assert 'tier' not in str(data).lower()
    
    def test_rate_limited_has_retry_after(self, app):
        """Rate limited response should have Retry-After header."""
        from middleware.security_enforcer import _rate_limited
        
        with app.app_context():
            response, status = _rate_limited(retry_after=120)
            
            assert status == 429
            assert response.headers.get('Retry-After') == '120'


class TestRequireAuthenticated:
    """Tests for @require_authenticated decorator."""
    
    def test_passes_with_otp_business_context(self, app):
        """Should pass when g.otp_business is set."""
        from middleware.security_enforcer import require_authenticated
        
        @require_authenticated
        def protected_route():
            return {"success": True}
        
        with app.app_context():
            with app.test_request_context():
                g.otp_business = {'business_id': 'biz_123'}
                
                result = protected_route()
                assert result['success'] is True
    
    def test_passes_with_console_user_context(self, app):
        """Should pass when g.console_user is set."""
        from middleware.security_enforcer import require_authenticated
        
        @require_authenticated
        def protected_route():
            return {"success": True}
        
        mock_user = MagicMock()
        mock_user.id = 'user_123'
        
        with app.app_context():
            with app.test_request_context():
                g.console_user = mock_user
                
                result = protected_route()
                assert result['success'] is True
    
    def test_fails_without_auth_context(self, app):
        """Should return 401 when no auth context."""
        from middleware.security_enforcer import require_authenticated
        
        @require_authenticated
        def protected_route():
            return {"success": True}
        
        with app.app_context():
            with app.test_request_context():
                # No g.otp_business or g.console_user set
                response, status = protected_route()
                
                assert status == 401
                assert response.get_json()['error'] == 'UNAUTHORIZED'


class TestRequirePaidOtpAccess:
    """Tests for @require_paid_otp_access decorator."""
    
    def test_allows_sandbox_mode_without_paid_plan(self, app):
        """Sandbox mode should bypass paid plan check."""
        from middleware.security_enforcer import require_paid_otp_access
        
        @require_paid_otp_access()
        def send_otp():
            return {"success": True, "sandbox": g.sandbox_mode}
        
        with app.app_context():
            with app.test_request_context():
                g.otp_business = {'business_id': 'biz_123'}
                g.otp_is_sandbox = True  # Sandbox mode
                
                result = send_otp()
                
                assert result['success'] is True
                assert result['sandbox'] is True
    
    def test_blocks_live_mode_without_paid_plan(self, app):
        """Live mode without paid plan should return 402."""
        from middleware.security_enforcer import require_paid_otp_access
        from services.entitlement_service import EntitlementContext, BillingStatus
        
        @require_paid_otp_access()
        def send_otp():
            return {"success": True}
        
        # Mock entitlement service to return no paid plan
        mock_ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=None,  # No paid plan!
            billing_status=BillingStatus.EXPIRED
        )
        
        with patch('middleware.security_enforcer.get_entitlement_service') as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_entitlements = AsyncMock(return_value=mock_ctx)
            mock_service.return_value = mock_instance
            
            with app.app_context():
                with app.test_request_context():
                    g.otp_business = {
                        'business_id': 'biz_123',
                        'user_id': 'user_123',
                        'org_id': 'org_456'
                    }
                    g.otp_is_sandbox = False  # Live mode
                    
                    response, status = send_otp()
                    
                    assert status == 402
                    assert response.get_json()['error'] == 'PAYMENT_REQUIRED'
    
    def test_blocks_inactive_billing(self, app):
        """Active plan but inactive billing should return 402."""
        from middleware.security_enforcer import require_paid_otp_access
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus
        )
        
        @require_paid_otp_access()
        def send_otp():
            return {"success": True}
        
        # Mock: has plan but billing cancelled
        mock_ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.STARTER,  # Has paid plan
            billing_status=BillingStatus.CANCELLED  # But cancelled!
        )
        
        with patch('middleware.security_enforcer.get_entitlement_service') as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_entitlements = AsyncMock(return_value=mock_ctx)
            mock_instance.check_feature_access = MagicMock(return_value=True)
            mock_service.return_value = mock_instance
            
            with app.app_context():
                with app.test_request_context():
                    g.otp_business = {
                        'business_id': 'biz_123',
                        'user_id': 'user_123',
                        'org_id': 'org_456'
                    }
                    g.otp_is_sandbox = False
                    
                    response, status = send_otp()
                    
                    assert status == 402
    
    def test_allows_active_paid_subscription(self, app):
        """Active paid subscription should allow OTP send."""
        from middleware.security_enforcer import require_paid_otp_access
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus, PLAN_FEATURES
        )
        
        @require_paid_otp_access()
        def send_otp():
            return {"success": True}
        
        # Mock: active paid subscription
        mock_ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_456',
            plan_tier=PlanTier.GROWTH,
            billing_status=BillingStatus.ACTIVE,
            features=PLAN_FEATURES[PlanTier.GROWTH]
        )
        
        with patch('middleware.security_enforcer.get_entitlement_service') as mock_service:
            mock_instance = MagicMock()
            mock_instance.get_entitlements = AsyncMock(return_value=mock_ctx)
            mock_instance.check_feature_access = MagicMock(return_value=True)
            mock_instance.is_approaching_soft_cap = MagicMock(return_value=(False, 10))
            mock_service.return_value = mock_instance
            
            with app.app_context():
                with app.test_request_context():
                    g.otp_business = {
                        'business_id': 'biz_123',
                        'user_id': 'user_123',
                        'org_id': 'org_456'
                    }
                    g.otp_is_sandbox = False
                    
                    result = send_otp()
                    
                    assert result['success'] is True


class TestIdentityExtraction:
    """Tests for identity extraction from context."""
    
    def test_extracts_from_otp_business(self, app):
        """Should extract user_id and org_id from OTP business context."""
        from middleware.security_enforcer import _get_identity_from_context
        
        with app.app_context():
            with app.test_request_context():
                g.otp_business = {
                    'user_id': 'user_123',
                    'org_id': 'org_456',
                    'business_id': 'biz_789'
                }
                
                user_id, org_id = _get_identity_from_context()
                
                assert user_id == 'user_123'
                assert org_id == 'org_456'
    
    def test_extracts_from_console_user(self, app):
        """Should extract from console user context."""
        from middleware.security_enforcer import _get_identity_from_context
        
        mock_user = MagicMock()
        mock_user.id = 'console_user_123'
        mock_user.current_org_id = 'console_org_456'
        
        with app.app_context():
            with app.test_request_context():
                g.console_user = mock_user
                
                user_id, org_id = _get_identity_from_context()
                
                assert user_id == 'console_user_123'
                assert org_id == 'console_org_456'
    
    def test_returns_none_without_context(self, app):
        """Should return None when no auth context."""
        from middleware.security_enforcer import _get_identity_from_context
        
        with app.app_context():
            with app.test_request_context():
                user_id, org_id = _get_identity_from_context()
                
                assert user_id is None
                assert org_id is None


class TestTenantAccess:
    """Tests for @require_tenant_access decorator."""
    
    def test_blocks_cross_tenant_access(self, app):
        """Should deny access when org_id doesn't match."""
        from middleware.security_enforcer import require_tenant_access
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus
        )
        
        @require_tenant_access('project')
        def get_project(org_id):
            return {"success": True}
        
        # User's org is different from requested org
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_A',  # User belongs to org_A
            plan_tier=PlanTier.GROWTH,
            billing_status=BillingStatus.ACTIVE
        )
        
        with app.app_context():
            with app.test_request_context():
                g.entitlement_ctx = ctx
                
                # Trying to access org_B's resource
                response, status = get_project(org_id='org_B')
                
                assert status == 403
    
    def test_allows_same_tenant_access(self, app):
        """Should allow access when org_id matches."""
        from middleware.security_enforcer import require_tenant_access
        from services.entitlement_service import (
            EntitlementContext, PlanTier, BillingStatus
        )
        
        @require_tenant_access('project')
        def get_project(org_id):
            return {"success": True}
        
        ctx = EntitlementContext(
            user_id='user_123',
            org_id='org_A',
            plan_tier=PlanTier.GROWTH,
            billing_status=BillingStatus.ACTIVE
        )
        
        with app.app_context():
            with app.test_request_context():
                g.entitlement_ctx = ctx
                
                result = get_project(org_id='org_A')
                
                assert result['success'] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
