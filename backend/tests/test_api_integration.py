"""
Integration tests for AI Brain API endpoints.
Run with: python -m pytest tests/test_api_integration.py -v
"""

import pytest
import json
from app import app


@pytest.fixture
def client():
    """Create test client."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


SAMPLE_BUSINESS = {
    "business_id": "test_001",
    "business_name": "Test Salon",
    "industry": "salon",
    "products_services": [
        {"name": "Haircut", "price": 300}
    ],
    "timings": {
        "monday": {"open": "10:00", "close": "20:00", "is_closed": False}
    },
    "location": {
        "address": "123 Test Street",
        "city": "Test City"
    }
}


class TestHealthEndpoints:
    """Tests for health check endpoints."""
    
    def test_health_check(self, client):
        """Test main health endpoint."""
        response = client.get('/api/health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
    
    def test_ai_status(self, client):
        """Test AI Brain status endpoint."""
        response = client.get('/api/ai/status')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'available' in data


class TestGenerateReplyEndpoint:
    """Tests for /api/ai/generate-reply endpoint."""
    
    def test_successful_reply(self, client):
        """Test successful reply generation."""
        response = client.post(
            '/api/ai/generate-reply',
            data=json.dumps({
                "business_data": SAMPLE_BUSINESS,
                "user_message": "Hi",
                "history": []
            }),
            content_type='application/json'
        )
        
        # May return 503 if AI Brain not configured (no API key)
        assert response.status_code in [200, 503]
        data = json.loads(response.data)
        
        if response.status_code == 200:
            assert data['success'] == True
            assert 'reply' in data
            assert 'intent' in data
    
    def test_missing_message(self, client):
        """Test error when message is missing."""
        response = client.post(
            '/api/ai/generate-reply',
            data=json.dumps({
                "business_data": SAMPLE_BUSINESS,
                "user_message": "",
                "history": []
            }),
            content_type='application/json'
        )
        
        # Should return 400 Bad Request
        if response.status_code != 503:  # Skip if AI Brain not available
            assert response.status_code == 400
            data = json.loads(response.data)
            assert data['success'] == False
    
    def test_missing_business_data(self, client):
        """Test error when business data is missing."""
        response = client.post(
            '/api/ai/generate-reply',
            data=json.dumps({
                "user_message": "Hi",
                "history": []
            }),
            content_type='application/json'
        )
        
        if response.status_code != 503:
            assert response.status_code == 400
            data = json.loads(response.data)
            assert 'error' in data


class TestIntentEndpoint:
    """Tests for /api/ai/detect-intent endpoint."""
    
    def test_detect_intent(self, client):
        """Test intent detection endpoint."""
        response = client.post(
            '/api/ai/detect-intent',
            data=json.dumps({
                "message": "What is the price?",
                "history": []
            }),
            content_type='application/json'
        )
        
        assert response.status_code in [200, 503]
        data = json.loads(response.data)
        
        if response.status_code == 200:
            assert data['success'] == True
            assert data['intent'] == 'pricing'
    
    def test_missing_message(self, client):
        """Test error when message is missing."""
        response = client.post(
            '/api/ai/detect-intent',
            data=json.dumps({
                "message": "",
                "history": []
            }),
            content_type='application/json'
        )
        
        if response.status_code != 503:
            assert response.status_code == 400


class Test404Handling:
    """Tests for 404 error handling."""
    
    def test_not_found(self, client):
        """Test 404 response for unknown endpoints."""
        response = client.get('/api/unknown-endpoint')
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
