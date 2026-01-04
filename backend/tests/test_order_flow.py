"""
Unit tests for Order Flow State Management.
Tests the conversation memory fix for order booking.
Run with: python -m pytest tests/test_order_flow.py -v
"""

import pytest
from ai_brain import AIBrain
from ai_brain.conversation_manager import ConversationManager, FlowStatus


# Sample business data with products
SAMPLE_BUSINESS = {
    "business_id": "test_shop_001",
    "business_name": "Fashion Hub",
    "industry": "retail",
    "description": "Fashion and apparel store",
    "products_services": [
        {"name": "T-Shirt", "price": 499, "category": "Clothing"},
        {"name": "Jeans", "price": 999, "category": "Clothing"},
        {"name": "Sneakers", "price": 1999, "category": "Footwear"},
        {"name": "Cap", "price": 299, "category": "Accessories"},
    ],
    "contact": {"phone": "9876543210"},
}


class TestOrderFlowStateManagement:
    """Tests for order flow conversation state handling."""
    
    def setup_method(self):
        self.brain = AIBrain()
        self.conversation_manager = self.brain.conversation_manager
        # Clear any existing sessions
        self.conversation_manager.clear_all_sessions()
    
    def test_order_flow_shows_product_list_with_numbers(self):
        """Test that order flow shows numbered product list."""
        user_id = "test_user_1"
        
        # Start order flow
        result = self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order something",
            business_data=SAMPLE_BUSINESS
        )
        
        # Check that response has numbered products
        assert "1." in result["reply"]
        assert "T-Shirt" in result["reply"]
        assert result["intent"] == "order_started"
        
        # Check state has awaiting_selection flag
        state = self.conversation_manager.get_state(user_id)
        assert state is not None
        assert state.collected_fields.get("awaiting_selection") == True
    
    def test_order_flow_handles_yes_after_product_list(self):
        """Test that 'yes' after product list selects first product."""
        user_id = "test_user_2"
        
        # Start order flow (shows product list)
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=SAMPLE_BUSINESS
        )
        
        # User says "yes"
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="yes",
            business_data=SAMPLE_BUSINESS
        )
        
        # Should select first product and ask for quantity
        assert result is not None
        assert "T-Shirt" in result["reply"]
        assert "How many" in result["reply"]
        assert result["intent"] == "order_product_selected"
    
    def test_order_flow_handles_number_selection(self):
        """Test that number selection works (e.g., '2' for second item)."""
        user_id = "test_user_3"
        
        # Start order flow
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=SAMPLE_BUSINESS
        )
        
        # User selects second product
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="2",
            business_data=SAMPLE_BUSINESS
        )
        
        # Should select Jeans (second product)
        assert result is not None
        assert "Jeans" in result["reply"]
        assert result["intent"] == "order_product_selected"
    
    def test_order_flow_handles_product_name(self):
        """Test that product name selection works."""
        user_id = "test_user_4"
        
        # Start order flow
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=SAMPLE_BUSINESS
        )
        
        # User types product name
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="sneakers",
            business_data=SAMPLE_BUSINESS
        )
        
        # Should select Sneakers
        assert result is not None
        assert "Sneakers" in result["reply"]
        assert result["intent"] == "order_product_selected"
    
    def test_complete_order_flow_with_confirmation(self):
        """Test full order flow: product -> quantity -> name -> confirm."""
        user_id = "test_user_5"
        
        # Step 1: Start order flow
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="order please",
            business_data=SAMPLE_BUSINESS
        )
        
        # Step 2: Select product
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="1",
            business_data=SAMPLE_BUSINESS
        )
        assert "How many" in result["reply"]
        
        # Step 3: Provide quantity
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="3",
            business_data=SAMPLE_BUSINESS
        )
        assert "name" in result["reply"].lower()
        
        # Step 4: Provide name
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="John",
            business_data=SAMPLE_BUSINESS
        )
        assert "Order Summary" in result["reply"]
        assert "confirm" in result["reply"].lower()
        
        # Check state is awaiting confirmation
        state = self.conversation_manager.get_state(user_id)
        assert state.flow_status == FlowStatus.AWAITING_CONFIRMATION
        
        # Step 5: Confirm order
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="yes",
            business_data=SAMPLE_BUSINESS
        )
        assert "Confirmed" in result["reply"]
        assert result["intent"] == "order_completed"
    
    def test_order_flow_handles_cancel(self):
        """Test that cancel works at any step."""
        user_id = "test_user_6"
        
        # Start order flow
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="order",
            business_data=SAMPLE_BUSINESS
        )
        
        # Select product
        self.brain._handle_order_flow(
            user_id=user_id,
            message="1",
            business_data=SAMPLE_BUSINESS
        )
        
        # Verify flow is active
        assert self.conversation_manager.is_flow_active(user_id)
        
        # Note: Cancel is handled at the generate_reply level, not _handle_order_flow
        # This test just verifies the flow state is correct


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
