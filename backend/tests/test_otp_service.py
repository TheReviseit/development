"""
OTP Service Unit Tests
Tests for OTP generation, hashing, and verification
"""

import pytest
import time
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch


class TestOTPGeneration:
    """Tests for OTP generation."""
    
    def test_generate_otp_default_length(self):
        """Test OTP generation with default length (6 digits)."""
        from services.otp_service import generate_otp
        
        otp = generate_otp()
        assert len(otp) == 6
        assert otp.isdigit()
    
    def test_generate_otp_custom_length(self):
        """Test OTP generation with custom length."""
        from services.otp_service import generate_otp
        
        for length in [4, 5, 6, 7, 8]:
            otp = generate_otp(length)
            assert len(otp) == length
            assert otp.isdigit()
    
    def test_generate_otp_invalid_length_fallback(self):
        """Test OTP generation falls back to default for invalid lengths."""
        from services.otp_service import generate_otp
        
        # Too short
        otp = generate_otp(2)
        assert len(otp) == 6  # Default
        
        # Too long
        otp = generate_otp(10)
        assert len(otp) == 6  # Default
    
    def test_generate_otp_randomness(self):
        """Test that OTPs are random (not the same each time)."""
        from services.otp_service import generate_otp
        
        otps = [generate_otp() for _ in range(100)]
        unique_otps = set(otps)
        
        # Should have mostly unique values
        assert len(unique_otps) > 90  # At least 90% unique
    
    def test_generate_otp_leading_zeros(self):
        """Test that OTPs preserve leading zeros."""
        from services.otp_service import generate_otp
        
        # Generate many OTPs to statistically get some with leading zeros
        otps = [generate_otp(6) for _ in range(1000)]
        
        # All should be exactly 6 characters
        for otp in otps:
            assert len(otp) == 6


class TestOTPHashing:
    """Tests for OTP hashing."""
    
    def test_hash_otp_deterministic(self):
        """Test that hashing the same inputs produces the same hash."""
        from services.otp_service import hash_otp
        
        hash1 = hash_otp("123456", "+919876543210", "login")
        hash2 = hash_otp("123456", "+919876543210", "login")
        
        assert hash1 == hash2
    
    def test_hash_otp_different_inputs(self):
        """Test that different inputs produce different hashes."""
        from services.otp_service import hash_otp
        
        hash1 = hash_otp("123456", "+919876543210", "login")
        hash2 = hash_otp("654321", "+919876543210", "login")
        hash3 = hash_otp("123456", "+911234567890", "login")
        hash4 = hash_otp("123456", "+919876543210", "signup")
        
        assert hash1 != hash2  # Different OTP
        assert hash1 != hash3  # Different phone
        assert hash1 != hash4  # Different purpose
    
    def test_hash_otp_length(self):
        """Test that hash is SHA256 (64 hex chars)."""
        from services.otp_service import hash_otp
        
        h = hash_otp("123456", "+919876543210", "login")
        assert len(h) == 64
        assert all(c in '0123456789abcdef' for c in h)


class TestOTPVerification:
    """Tests for OTP verification."""
    
    def test_verify_otp_hash_correct(self):
        """Test verification with correct OTP."""
        from services.otp_service import hash_otp, verify_otp_hash
        
        otp = "123456"
        phone = "+919876543210"
        purpose = "login"
        
        stored_hash = hash_otp(otp, phone, purpose)
        
        assert verify_otp_hash(otp, phone, purpose, stored_hash) is True
    
    def test_verify_otp_hash_wrong_otp(self):
        """Test verification with wrong OTP."""
        from services.otp_service import hash_otp, verify_otp_hash
        
        phone = "+919876543210"
        purpose = "login"
        
        stored_hash = hash_otp("123456", phone, purpose)
        
        assert verify_otp_hash("654321", phone, purpose, stored_hash) is False
    
    def test_verify_otp_hash_wrong_phone(self):
        """Test verification with wrong phone number."""
        from services.otp_service import hash_otp, verify_otp_hash
        
        otp = "123456"
        purpose = "login"
        
        stored_hash = hash_otp(otp, "+919876543210", purpose)
        
        assert verify_otp_hash(otp, "+911111111111", purpose, stored_hash) is False
    
    def test_verify_otp_hash_wrong_purpose(self):
        """Test verification with wrong purpose (prevents cross-flow attacks)."""
        from services.otp_service import hash_otp, verify_otp_hash
        
        otp = "123456"
        phone = "+919876543210"
        
        stored_hash = hash_otp(otp, phone, "login")
        
        # Same OTP/phone but different purpose should fail
        assert verify_otp_hash(otp, phone, "signup", stored_hash) is False


class TestRequestIDGeneration:
    """Tests for request ID generation."""
    
    def test_generate_request_id_format(self):
        """Test request ID format."""
        from services.otp_service import generate_request_id
        
        request_id = generate_request_id()
        
        assert request_id.startswith("otp_req_")
        assert len(request_id) == 20  # "otp_req_" (8) + 12 hex chars
    
    def test_generate_request_id_unique(self):
        """Test request IDs are unique."""
        from services.otp_service import generate_request_id
        
        ids = [generate_request_id() for _ in range(1000)]
        assert len(set(ids)) == 1000


class TestAPIKeyGeneration:
    """Tests for API key generation."""
    
    def test_generate_api_key_live(self):
        """Test live API key generation."""
        from services.otp_service import generate_api_key
        
        full_key, prefix, key_hash = generate_api_key(is_test=False)
        
        assert full_key.startswith("otp_live_")
        assert prefix == full_key[:16]
        assert len(key_hash) == 64
    
    def test_generate_api_key_test(self):
        """Test test/sandbox API key generation."""
        from services.otp_service import generate_api_key
        
        full_key, prefix, key_hash = generate_api_key(is_test=True)
        
        assert full_key.startswith("otp_test_")
        assert prefix == full_key[:16]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
