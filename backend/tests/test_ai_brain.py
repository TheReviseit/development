"""
Unit tests for AI Brain module.
Run with: python -m pytest tests/test_ai_brain.py -v
"""

import pytest
from ai_brain import AIBrain
from ai_brain.schemas import BusinessData, ProductService
from ai_brain.intents import IntentDetector, IntentType
from ai_brain.config import AIBrainConfig


# Sample business data for testing
SAMPLE_BUSINESS = {
    "business_id": "test_salon_001",
    "business_name": "Style Studio",
    "industry": "salon",
    "description": "Premium hair and beauty salon",
    "contact": {
        "phone": "9876543210",
        "whatsapp": "9876543210",
        "email": "hello@stylestudio.com"
    },
    "location": {
        "address": "123, MG Road",
        "city": "Bangalore",
        "state": "Karnataka",
        "pincode": "560001",
        "google_maps_link": "https://maps.google.com/?q=style+studio",
        "landmarks": ["Near Metro Station", "Opposite Big Bazaar"]
    },
    "timings": {
        "monday": {"open": "10:00", "close": "20:00", "is_closed": False},
        "tuesday": {"open": "10:00", "close": "20:00", "is_closed": False},
        "wednesday": {"open": "10:00", "close": "20:00", "is_closed": False},
        "thursday": {"open": "10:00", "close": "20:00", "is_closed": False},
        "friday": {"open": "10:00", "close": "20:00", "is_closed": False},
        "saturday": {"open": "09:00", "close": "21:00", "is_closed": False},
        "sunday": {"open": "10:00", "close": "18:00", "is_closed": False}
    },
    "products_services": [
        {"name": "Haircut - Men", "price": 300, "category": "Hair"},
        {"name": "Haircut - Women", "price": 500, "category": "Hair"},
        {"name": "Hair Coloring", "price": 1500, "category": "Hair"},
        {"name": "Facial", "price": 800, "category": "Skin Care"},
        {"name": "Manicure", "price": 400, "category": "Nails"}
    ],
    "policies": {
        "refund": "No refunds after service is completed",
        "cancellation": "Free cancellation up to 2 hours before appointment",
        "payment_methods": ["Cash", "UPI", "Card"]
    },
    "faqs": [
        {"question": "Do you take walk-ins?", "answer": "Yes, walk-ins are welcome but appointments are preferred"},
        {"question": "Do you have parking?", "answer": "Yes, free parking available for customers"}
    ],
    "brand_voice": {
        "tone": "friendly",
        "language_preference": "en"
    }
}


class TestIntentDetector:
    """Tests for intent detection."""
    
    def setup_method(self):
        self.detector = IntentDetector()
    
    def test_greeting_detection(self):
        """Test greeting intent detection."""
        test_cases = ["hi", "hello", "hey", "namaste", "good morning"]
        for msg in test_cases:
            intent, confidence = self.detector.detect(msg)
            assert intent == IntentType.GREETING, f"Failed for: {msg}"
            assert confidence >= 0.5
    
    def test_pricing_detection(self):
        """Test pricing intent detection."""
        test_cases = [
            "What is the price for haircut?",
            "How much does it cost?",
            "Haircut kitna?",
            "rate batao"
        ]
        for msg in test_cases:
            intent, confidence = self.detector.detect(msg)
            assert intent == IntentType.PRICING, f"Failed for: {msg}"
    
    def test_booking_detection(self):
        """Test booking intent detection."""
        test_cases = [
            "I want to book an appointment",
            "Book a slot for tomorrow",
            "Available slots?",
            "appointment lena hai"
        ]
        for msg in test_cases:
            intent, confidence = self.detector.detect(msg)
            assert intent == IntentType.BOOKING, f"Failed for: {msg}"
    
    def test_hours_detection(self):
        """Test operating hours intent detection."""
        test_cases = [
            "What are your timings?",
            "When do you open?",
            "kab band hota hai?",
            "working hours"
        ]
        for msg in test_cases:
            intent, confidence = self.detector.detect(msg)
            assert intent == IntentType.HOURS, f"Failed for: {msg}"
    
    def test_location_detection(self):
        """Test location intent detection."""
        test_cases = [
            "Where are you located?",
            "What is your address?",
            "kahan hai?",
            "directions please"
        ]
        for msg in test_cases:
            intent, confidence = self.detector.detect(msg)
            assert intent == IntentType.LOCATION, f"Failed for: {msg}"


class TestBusinessDataSchema:
    """Tests for business data schema."""
    
    def test_valid_business_data(self):
        """Test valid business data parsing."""
        business = BusinessData(**SAMPLE_BUSINESS)
        assert business.business_name == "Style Studio"
        assert business.industry == "salon"
        assert len(business.products_services) == 5
    
    def test_find_product_by_name(self):
        """Test product search functionality."""
        business = BusinessData(**SAMPLE_BUSINESS)
        
        product = business.find_product_by_name("haircut")
        assert product is not None
        assert "Haircut" in product.name
    
    def test_get_timing_for_day(self):
        """Test timing lookup."""
        business = BusinessData(**SAMPLE_BUSINESS)
        
        monday = business.get_timing_for_day("monday")
        assert monday is not None
        assert monday.open == "10:00"
        assert monday.close == "20:00"
    
    def test_context_string_generation(self):
        """Test context string for LLM."""
        business = BusinessData(**SAMPLE_BUSINESS)
        
        context = business.to_context_string()
        assert "Style Studio" in context
        assert "salon" in context
        assert "Haircut" in context


class TestAIBrain:
    """Tests for main AIBrain class."""
    
    def setup_method(self):
        # Use default config without requiring API key
        self.brain = AIBrain()
    
    def test_generate_reply_greeting(self):
        """Test greeting response generation."""
        result = self.brain.generate_reply(
            business_data=SAMPLE_BUSINESS,
            user_message="Hi",
            history=[]
        )
        
        assert "reply" in result
        assert result["intent"] == "greeting"
        assert result["confidence"] >= 0.5
        assert isinstance(result["suggested_actions"], list)
    
    def test_generate_reply_hours(self):
        """Test hours response generation."""
        result = self.brain.generate_reply(
            business_data=SAMPLE_BUSINESS,
            user_message="What are your timings?",
            history=[]
        )
        
        assert "reply" in result
        assert result["intent"] == "hours"
        # Response should contain timing information
        assert any(time in result["reply"].lower() for time in ["10:00", "20:00", "am", "pm"])
    
    def test_generate_reply_location(self):
        """Test location response generation."""
        result = self.brain.generate_reply(
            business_data=SAMPLE_BUSINESS,
            user_message="Where are you located?",
            history=[]
        )
        
        assert "reply" in result
        assert result["intent"] == "location"
        # Response should contain address information
        assert "bangalore" in result["reply"].lower() or "mg road" in result["reply"].lower()
    
    def test_detect_intent_standalone(self):
        """Test standalone intent detection."""
        result = self.brain.detect_intent("What is the price?")
        
        assert result["intent"] == "pricing"
        assert "description" in result
    
    def test_empty_message_handling(self):
        """Test handling of empty messages."""
        result = self.brain.generate_reply(
            business_data=SAMPLE_BUSINESS,
            user_message="",
            history=[]
        )
        
        assert result["needs_human"] == True
        assert "error" in result.get("metadata", {})
    
    def test_missing_business_data(self):
        """Test handling of missing business data."""
        result = self.brain.generate_reply(
            business_data=None,
            user_message="Hi",
            history=[]
        )
        
        assert result["needs_human"] == True


class TestResponseLimits:
    """Tests for response length limiting."""
    
    def test_response_not_too_long(self):
        """Test that responses stay within limits."""
        brain = AIBrain()
        
        result = brain.generate_reply(
            business_data=SAMPLE_BUSINESS,
            user_message="Tell me everything about your salon",
            history=[]
        )
        
        # Response should be reasonably short for WhatsApp
        assert len(result["reply"]) <= 600  # Allow some buffer


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
