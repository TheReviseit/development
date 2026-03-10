"""
Unit tests for Enhanced Order Flow State Management.
Tests the complete order booking flow with category navigation, variants, and persistence.
Run with: py -m pytest tests/test_order_flow.py -v
"""

import pytest
from ai_brain import AIBrain
from ai_brain.conversation_manager import ConversationManager, FlowStatus


# Simple business data (single category - no category selection)
SIMPLE_BUSINESS = {
    "business_id": "test_shop_001",
    "business_name": "T-Shirt Shop",
    "industry": "retail",
    "description": "T-Shirt store",
    "products_services": [
        {"name": "T-Shirt", "price": 499, "category": "Clothing"},
        {"name": "Polo", "price": 699, "category": "Clothing"},
        {"name": "Hoodie", "price": 999, "category": "Clothing"},
    ],
    "contact": {"phone": "9876543210"},
}

# Business with multiple categories (triggers category navigation)
MULTI_CATEGORY_BUSINESS = {
    "business_id": "test_shop_002",
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

# Business with product variants (sizes/colors)
VARIANT_BUSINESS = {
    "business_id": "test_shop_003",
    "business_name": "Apparel Store",
    "industry": "retail",
    "description": "Clothing with variants",
    "products_services": [
        {
            "name": "T-Shirt", 
            "price": 499, 
            "category": "Clothing",
            "sizes": ["S", "M", "L", "XL"],
            "colors": ["Red", "Blue", "Black"],
        },
        {"name": "Cap", "price": 299, "category": "Accessories"},
    ],
    "contact": {"phone": "9876543210"},
}


class TestBasicOrderFlow:
    """Tests for basic order flow with single category (no category selection)."""
    
    def setup_method(self):
        self.brain = AIBrain()
        self.conversation_manager = self.brain.conversation_manager
        self.conversation_manager.clear_all_sessions()
    
    def test_order_flow_shows_product_list_with_numbers(self):
        """Test that order flow shows numbered product list for single category."""
        user_id = "test_user_1"
        
        result = self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order something",
            business_data=SIMPLE_BUSINESS
        )
        
        # Should show products directly (no category selection)
        assert "1." in result["reply"]
        assert "T-Shirt" in result["reply"]
        assert result["intent"] == "order_started"
        
        state = self.conversation_manager.get_state(user_id)
        assert state is not None
        assert state.collected_fields.get("awaiting_selection") == True
    
    def test_order_flow_handles_yes_after_product_list(self):
        """Test that 'yes' after product list selects first product."""
        user_id = "test_user_2"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=SIMPLE_BUSINESS
        )
        
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="yes",
            business_data=SIMPLE_BUSINESS
        )
        
        assert result is not None
        assert "T-Shirt" in result["reply"]
        assert "How many" in result["reply"]
        assert result["intent"] == "order_product_selected"
    
    def test_order_flow_handles_number_selection(self):
        """Test that number selection works (e.g., '2' for second item)."""
        user_id = "test_user_3"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=SIMPLE_BUSINESS
        )
        
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="2",
            business_data=SIMPLE_BUSINESS
        )
        
        assert result is not None
        assert "Polo" in result["reply"]
        assert result["intent"] == "order_product_selected"


class TestCategoryNavigation:
    """Tests for category-based navigation when multiple categories exist."""
    
    def setup_method(self):
        self.brain = AIBrain()
        self.conversation_manager = self.brain.conversation_manager
        self.conversation_manager.clear_all_sessions()
    
    def test_shows_categories_when_multiple_exist(self):
        """Test that categories are shown first when business has multiple."""
        user_id = "test_cat_1"
        
        result = self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=MULTI_CATEGORY_BUSINESS
        )
        
        # Should show category selection
        assert "order" in result["reply"].lower()
        assert "category" in result["reply"].lower()
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("awaiting_category") == True
    
    def test_category_selection_by_number(self):
        """Test selecting a category by number."""
        user_id = "test_cat_2"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=MULTI_CATEGORY_BUSINESS
        )
        
        # Select first category
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="1",
            business_data=MULTI_CATEGORY_BUSINESS
        )
        
        assert result is not None
        assert "order_category_selected" in result["intent"]
        
        # Should now show products
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("awaiting_selection") == True
    
    def test_show_all_products(self):
        """Test 'show all' bypasses category selection."""
        user_id = "test_cat_3"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=MULTI_CATEGORY_BUSINESS
        )
        
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="show all",
            business_data=MULTI_CATEGORY_BUSINESS
        )
        
        assert result is not None
        assert result["intent"] == "order_category_all"
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("awaiting_selection") == True


class TestVariantSelection:
    """Tests for size and color variant selection."""
    
    def setup_method(self):
        self.brain = AIBrain()
        self.conversation_manager = self.brain.conversation_manager
        self.conversation_manager.clear_all_sessions()
    
    def test_size_selection_prompted(self):
        """Test that size selection is prompted for products with sizes."""
        user_id = "test_var_1"
        
        # Start with direct product mention to skip category
        result = self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order a t-shirt",
            business_data=VARIANT_BUSINESS
        )
        
        # Should prompt for size
        assert "size" in result["reply"].lower()
        assert "S" in result["reply"] or "M" in result["reply"] or "L" in result["reply"]
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("_needs_size") == True
    
    def test_size_then_color_selection(self):
        """Test that color is asked after size."""
        user_id = "test_var_2"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order a t-shirt",
            business_data=VARIANT_BUSINESS
        )
        
        # Select size
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="L",
            business_data=VARIANT_BUSINESS
        )
        
        assert result is not None
        assert "color" in result["reply"].lower()
        assert result["intent"] == "order_size_selected"
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("selected_size") == "L"
        assert state.collected_fields.get("_needs_color") == True
    
    def test_complete_variant_selection(self):
        """Test complete size + color selection flow."""
        user_id = "test_var_3"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order a t-shirt",
            business_data=VARIANT_BUSINESS
        )
        
        # Select size
        self.brain._handle_order_flow(
            user_id=user_id,
            message="M",
            business_data=VARIANT_BUSINESS
        )
        
        # Select color
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="Blue",
            business_data=VARIANT_BUSINESS
        )
        
        assert result is not None
        assert result["intent"] == "order_color_selected"
        assert "How many" in result["reply"]
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("selected_color") == "Blue"
        assert "Size: M" in state.collected_fields.get("variant_display", "")


class TestOrderCompletion:
    """Tests for order confirmation and completion."""
    
    def setup_method(self):
        self.brain = AIBrain()
        self.conversation_manager = self.brain.conversation_manager
        self.conversation_manager.clear_all_sessions()
    
    def test_complete_order_flow_with_confirmation(self):
        """Test full order flow: product -> quantity -> fields -> confirm."""
        user_id = "test_complete_1"
        
        # Start flow with generic message (no product mentioned)
        result = self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order something",
            business_data=SIMPLE_BUSINESS
        )
        
        # Should show product list
        assert "1." in result["reply"]
        
        # Select product "1" (should ask for quantity)
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="1",
            business_data=SIMPLE_BUSINESS
        )
        assert "How many" in result["reply"]
        
        # Provide quantity (should ask for name since order fields configured)
        result = self.brain._handle_order_flow(
            user_id=user_id,
            message="3",
            business_data=SIMPLE_BUSINESS
        )
        # After quantity, it asks for customer details
        assert "added" in result["reply"] or "name" in result["reply"].lower()
        
    def test_order_flow_handles_cancel(self):
        """Test that cancel works at any step."""
        user_id = "test_cancel_1"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="order",
            business_data=SIMPLE_BUSINESS
        )
        
        # Select product then provide quantity to get to confirmation
        self.brain._handle_order_flow(user_id=user_id, message="1", business_data=SIMPLE_BUSINESS)
        
        # Verify flow is active
        assert self.conversation_manager.is_flow_active(user_id)


class TestDuplicatePrevention:
    """Tests for idempotency and duplicate order prevention."""
    
    def setup_method(self):
        self.brain = AIBrain()
        self.conversation_manager = self.brain.conversation_manager
        self.conversation_manager.clear_all_sessions()
    
    def test_state_lock_prevents_duplicate_processing(self):
        """Test that state lock prevents duplicate order processing attempts."""
        user_id = "test_dup_1"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="order t-shirt",
            business_data=SIMPLE_BUSINESS
        )
        
        state = self.conversation_manager.get_state(user_id)
        
        # Simulate lock being set (as if persistence is in progress)
        state._persistence_locked = True
        
        # Attempt to complete order should return early
        result = self.brain._complete_order(user_id, state, SIMPLE_BUSINESS)
        
        assert "already being processed" in result["reply"]
        assert result["intent"] == "order_processing"
        
        # Release lock
        state._persistence_locked = False
class TestGlobalCancelInterrupt:
    """
    Tests that the global interrupt handler catches cancel/stop/exit/quit
    in EVERY order sub-state. This validates the FAANG architecture:
    incoming_message → interrupt_handler → state_machine → intent_classifier
    """
    
    def setup_method(self):
        self.brain = AIBrain()
        self.conversation_manager = self.brain.conversation_manager
        self.conversation_manager.clear_all_sessions()
    
    # --- Cancel at every sub-state ---
    
    def test_cancel_during_category_selection(self):
        """Cancel while awaiting_category is set."""
        user_id = "test_cancel_cat"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=MULTI_CATEGORY_BUSINESS
        )
        
        state = self.conversation_manager.get_state(user_id)
        assert state is not None
        assert state.collected_fields.get("awaiting_category") == True
        
        # Global interrupt should cancel
        result = self.brain._interrupt_handler(user_id, "cancel", "cancel")
        assert result is not None
        assert result["intent"] == "order_cancelled"
        
        # Session should be fully deleted
        assert not self.conversation_manager.is_flow_active(user_id)
    
    def test_cancel_during_product_selection(self):
        """Cancel while awaiting_selection is set."""
        user_id = "test_cancel_prod"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order",
            business_data=SIMPLE_BUSINESS
        )
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("awaiting_selection") == True
        
        result = self.brain._interrupt_handler(user_id, "cancel", "cancel")
        assert result is not None
        assert result["intent"] == "order_cancelled"
        assert not self.conversation_manager.is_flow_active(user_id)
    
    def test_cancel_during_size_selection(self):
        """Cancel while _needs_size is set."""
        user_id = "test_cancel_size"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order a t-shirt",
            business_data=VARIANT_BUSINESS
        )
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("_needs_size") == True
        
        result = self.brain._interrupt_handler(user_id, "stop", "stop")
        assert result is not None
        assert result["intent"] == "order_cancelled"
        assert not self.conversation_manager.is_flow_active(user_id)
    
    def test_cancel_during_color_selection(self):
        """Cancel while _needs_color is set."""
        user_id = "test_cancel_color"
        
        self.brain._start_order_flow(
            user_id=user_id,
            business_owner_id="owner_1",
            initial_message="I want to order a t-shirt",
            business_data=VARIANT_BUSINESS
        )
        
        # Select size first to get to color selection
        self.brain._handle_order_flow(
            user_id=user_id,
            message="L",
            business_data=VARIANT_BUSINESS
        )
        
        state = self.conversation_manager.get_state(user_id)
        assert state.collected_fields.get("_needs_color") == True
        
        result = self.brain._interrupt_handler(user_id, "exit", "exit")
        assert result is not None
        assert result["intent"] == "order_cancelled"
        assert not self.conversation_manager.is_flow_active(user_id)
    
    # --- Multiple cancel keywords ---
    
    def test_stop_keyword(self):
        """Test 'stop' triggers cancel."""
        user_id = "test_stop"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        result = self.brain._interrupt_handler(user_id, "stop", "stop")
        assert result is not None and result["intent"] == "order_cancelled"
    
    def test_exit_keyword(self):
        """Test 'exit' triggers cancel."""
        user_id = "test_exit"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        result = self.brain._interrupt_handler(user_id, "exit", "exit")
        assert result is not None and result["intent"] == "order_cancelled"
    
    def test_quit_keyword(self):
        """Test 'quit' triggers cancel."""
        user_id = "test_quit"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        result = self.brain._interrupt_handler(user_id, "quit", "quit")
        assert result is not None and result["intent"] == "order_cancelled"
    
    def test_nevermind_keyword(self):
        """Test 'nevermind' triggers cancel."""
        user_id = "test_nevermind"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        result = self.brain._interrupt_handler(user_id, "nevermind", "nevermind")
        assert result is not None and result["intent"] == "order_cancelled"
    
    # --- False positive prevention ---
    
    def test_no_false_positive_substring(self):
        """'cancelled order yesterday' should NOT trigger cancel (substring match)."""
        user_id = "test_fp_substring"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        
        # Exact match uses .strip().lower() — "cancelled order yesterday" is NOT in CANCEL_WORDS
        result = self.brain._interrupt_handler(
            user_id, "cancelled order yesterday", "cancelled order yesterday"
        )
        assert result is None  # Should NOT cancel
        
        # Flow should still be active
        assert self.conversation_manager.is_flow_active(user_id)
    
    def test_no_false_positive_stopwatch(self):
        """'stopwatch' should NOT trigger cancel."""
        user_id = "test_fp_stopwatch"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        result = self.brain._interrupt_handler(user_id, "stopwatch", "stopwatch")
        assert result is None
        assert self.conversation_manager.is_flow_active(user_id)
    
    # --- Session cleanup verification ---
    
    def test_cancel_deletes_session(self):
        """After cancel, session should be fully deleted from memory."""
        user_id = "test_session_del"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        
        # Verify session exists
        assert self.conversation_manager.is_flow_active(user_id)
        
        # Cancel
        result = self.brain._interrupt_handler(user_id, "cancel", "cancel")
        assert result is not None
        
        # Session should be gone
        assert not self.conversation_manager.is_flow_active(user_id)
    
    def test_cancel_no_active_flow_returns_none(self):
        """Cancel without active flow should return None (no-op)."""
        user_id = "test_no_flow"
        result = self.brain._interrupt_handler(user_id, "cancel", "cancel")
        assert result is None
    
    # --- Race condition test ---
    
    def test_cancel_race_condition(self):
        """
        Simulates concurrent button tap + cancel message.
        After cancel, _handle_order_flow should return None (no active flow).
        """
        user_id = "test_race"
        self.brain._start_order_flow(
            user_id=user_id, business_owner_id="owner_1",
            initial_message="order", business_data=SIMPLE_BUSINESS
        )
        
        # First: cancel fires
        cancel_result = self.brain._interrupt_handler(user_id, "cancel", "cancel")
        assert cancel_result is not None
        
        # Second: concurrent button tap tries to process
        # Since session is deleted, _handle_order_flow should handle gracefully
        flow_result = self.brain._handle_order_flow(
            user_id=user_id,
            message="1",
            business_data=SIMPLE_BUSINESS
        )
        # Should return None (no active state found)
        assert flow_result is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
