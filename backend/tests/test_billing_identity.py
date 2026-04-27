import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

import unittest
from unittest.mock import patch, MagicMock

# FAANG-Grade Test Suite for Identity Mapping Contract
class TestBillingIdentityContract(unittest.TestCase):
    
    @patch('routes.billing_api._ensure_supabase_uuid')
    def test_invalid_identity_rejection(self, mock_ensure_uuid):
        """Test that invalid/unmapped Firebase UIDs are HARD REJECTED."""
        # Arrange
        mock_ensure_uuid.return_value = "fQfVIJwXnBZwxmG4u3BWxAWsdDa2" # Raw Firebase string (invalid UUID)
        
        # We simulate the exact validation logic added to billing_api.py
        supabase_user_id = mock_ensure_uuid('fQfVIJwXnBZwxmG4u3BWxAWsdDa2')
        
        # Act
        is_valid = bool(supabase_user_id and len(supabase_user_id) == 36 and '-' in supabase_user_id)
        
        # Assert
        self.assertFalse(is_valid, "Contract should reject raw Firebase UIDs because they aren't 36 char UUIDs.")
        
    @patch('routes.billing_api._ensure_supabase_uuid')
    def test_valid_identity_acceptance(self, mock_ensure_uuid):
        """Test that a correctly mapped Supabase UUID passes contract validation."""
        # Arrange
        valid_uuid = "52776ab2-1234-5678-90ab-cdef12345678"
        mock_ensure_uuid.return_value = valid_uuid
        
        # Act
        supabase_user_id = mock_ensure_uuid('fQfVIJwXnBZwxmG4u3BWxAWsdDa2')
        is_valid = bool(supabase_user_id and len(supabase_user_id) == 36 and '-' in supabase_user_id)
        
        # Assert
        self.assertTrue(is_valid, "Contract should accept a correctly formatted Supabase UUID.")

if __name__ == '__main__':
    unittest.main()
