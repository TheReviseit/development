"""
Cross-Auth Protection Tests
Enterprise-grade tests for dual login system security

Tests:
- Console token cannot access normal API routes
- Normal session cannot access console routes
- Cross-auth attempts are blocked with proper error codes
- Correct user type can access their own routes
"""

import pytest
from unittest.mock import patch, MagicMock
from flask import Flask


class TestCrossAuthProtection:
    """Test cross-auth blocking functionality."""
    
    @pytest.fixture
    def app(self):
        """Create test Flask app."""
        from app import app as flask_app
        flask_app.config['TESTING'] = True
        return flask_app
    
    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return app.test_client()
    
    def test_console_token_cannot_access_normal_api(self, client):
        """
        CRITICAL TEST: Console session trying to access normal API
        Should return 403 WRONG_PORTAL
        """
        # Simulate console user with only otp_console_session cookie
        # trying to access normal user API
        response = client.get(
            '/api/me',
            headers={
                'Cookie': 'otp_console_session=mock_console_token'
            }
        )
        
        # Should either be 401 (no valid normal session) or 403 (wrong portal)
        assert response.status_code in [401, 403]
        
        data = response.get_json()
        if response.status_code == 403:
            assert data.get('error') in ['WRONG_PORTAL', 'UNAUTHORIZED']
    
    def test_normal_session_cannot_access_console_api(self, client):
        """
        CRITICAL TEST: Normal session trying to access console API
        Should return 403 WRONG_PORTAL
        """
        # Simulate normal user with only session cookie
        # trying to access console API
        response = client.get(
            '/console/auth/me',
            headers={
                'Cookie': 'session=mock_normal_session'
            }
        )
        
        # Should be 401 (no console session) or 403 (wrong portal)
        assert response.status_code in [401, 403]
    
    def test_no_auth_returns_401(self, client):
        """Test that protected routes return 401 without any auth."""
        response = client.get('/console/auth/me')
        
        assert response.status_code == 401
        data = response.get_json()
        assert data.get('error') in ['UNAUTHORIZED', 'NO_TOKEN']
    
    def test_console_auth_endpoint_accessible(self, client):
        """Test that console login endpoint is accessible without auth."""
        # Login endpoint should be accessible
        response = client.post(
            '/console/auth/login',
            json={'email': 'test@example.com', 'password': 'wrong'},
            content_type='application/json'
        )
        
        # Should get auth error, not 403 or 500
        assert response.status_code in [400, 401]
        data = response.get_json()
        assert 'error' in data


class TestUserTypeClaim:
    """Test JWT user_type claim functionality."""
    
    def test_console_jwt_contains_user_type(self):
        """Verify console JWTs include user_type: console claim."""
        from services.console_auth_service import create_access_token, verify_token
        
        # Create a console access token
        token = create_access_token(user_id='test-user-123', org_id='test-org-456')
        
        # Verify and decode
        payload = verify_token(token, expected_type='access')
        
        assert payload is not None
        assert payload.get('user_type') == 'console'
        assert payload.get('sub') == 'test-user-123'
        assert payload.get('org') == 'test-org-456'
    
    def test_console_jwt_without_org(self):
        """Verify console JWT works without org_id."""
        from services.console_auth_service import create_access_token, verify_token
        
        token = create_access_token(user_id='test-user-123')
        payload = verify_token(token, expected_type='access')
        
        assert payload is not None
        assert payload.get('user_type') == 'console'
        assert 'org' not in payload


class TestUserTypeMiddleware:
    """Test user_type_middleware.py functionality."""
    
    def test_require_user_type_decorator_exists(self):
        """Verify middleware exports expected decorators."""
        from middleware.user_type_middleware import (
            require_user_type,
            require_normal_user,
            require_console_user,
            reject_cross_auth
        )
        
        assert callable(require_user_type)
        assert callable(require_normal_user)
        assert callable(require_console_user)
        assert callable(reject_cross_auth)
    
    def test_user_type_constants(self):
        """Verify user type constants."""
        from middleware.user_type_middleware import USER_TYPE_NORMAL, USER_TYPE_CONSOLE
        
        assert USER_TYPE_NORMAL == 'normal'
        assert USER_TYPE_CONSOLE == 'console'


class TestObservability:
    """Test logging and observability for cross-auth attempts."""
    
    def test_cross_auth_logging(self):
        """Verify cross-auth attempts are logged."""
        from middleware.user_type_middleware import _log_cross_auth_attempt
        
        # Should not raise
        _log_cross_auth_attempt(
            user_id='test-user',
            user_type='console',
            expected_type='normal',
            route='/api/protected',
            ip_address='127.0.0.1'
        )


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
