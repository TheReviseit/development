"""
Example: Using the AI Brain for WhatsApp Business Chatbot

This script demonstrates how to use the AI Brain module to generate
intelligent responses for WhatsApp customer messages.

Run: python example_usage.py
"""

from ai_brain import AIBrain, AIBrainConfig

# Sample business data (in production, this comes from your database)
sample_business = {
    "business_id": "salon_001",
    "business_name": "Glamour Studio",
    "industry": "salon",
    "description": "Premium hair and beauty salon in the heart of Mumbai",
    
    "contact": {
        "phone": "9876543210",
        "whatsapp": "9876543210",
        "email": "hello@glamourstudio.com",
        "website": "https://glamourstudio.com"
    },
    
    "location": {
        "address": "Shop No. 5, Marine Drive",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400020",
        "google_maps_link": "https://maps.google.com/?q=glamour+studio+mumbai",
        "landmarks": ["Opposite NCPA", "Near Churchgate Station"]
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
        {"name": "Haircut - Men", "price": 400, "category": "Hair", "duration": "30 min"},
        {"name": "Haircut - Women", "price": 600, "category": "Hair", "duration": "45 min"},
        {"name": "Hair Coloring", "price": 2000, "category": "Hair", "duration": "2 hours"},
        {"name": "Hair Spa", "price": 1500, "category": "Hair", "duration": "1 hour"},
        {"name": "Facial - Classic", "price": 1000, "category": "Skin Care", "duration": "45 min"},
        {"name": "Facial - Gold", "price": 2500, "category": "Skin Care", "duration": "1 hour"},
        {"name": "Manicure", "price": 500, "category": "Nails", "duration": "30 min"},
        {"name": "Pedicure", "price": 700, "category": "Nails", "duration": "45 min"},
        {"name": "Bridal Makeup", "price": 15000, "category": "Makeup", "duration": "3 hours"}
    ],
    
    "policies": {
        "refund": "No refunds after service is completed",
        "cancellation": "Free cancellation up to 4 hours before appointment",
        "payment_methods": ["Cash", "UPI", "Debit Card", "Credit Card"]
    },
    
    "faqs": [
        {"question": "Do you accept walk-ins?", "answer": "Yes! Walk-ins are welcome, but we recommend booking in advance to avoid waiting."},
        {"question": "Is parking available?", "answer": "Yes, valet parking is available for all customers."},
        {"question": "Do you offer home services?", "answer": "Yes, we provide home services for bridal makeup and special occasions. Extra charges apply."}
    ],
    
    "brand_voice": {
        "tone": "friendly",
        "language_preference": "en"
    }
}


def simulate_conversation():
    """Simulate a WhatsApp conversation with the AI Brain."""
    
    # Initialize AI Brain
    brain = AIBrain()
    
    # Simulated customer messages
    messages = [
        "Hi",
        "What services do you offer?",
        "How much for a haircut?",
        "What are your timings on Saturday?",
        "Where are you located?",
        "I want to book an appointment",
        "Thanks!"
    ]
    
    conversation_history = []
    
    print("=" * 60)
    print("🧠 WhatsApp AI Brain - Demo Conversation")
    print("=" * 60)
    print()
    
    for message in messages:
        print(f"👤 Customer: {message}")
        print()
        
        # Generate AI response
        result = brain.generate_reply(
            business_data=sample_business,
            user_message=message,
            history=conversation_history
        )
        
        print(f"🤖 AI ({result['intent']}, {result['confidence']:.0%}): {result['reply']}")
        print()
        
        if result['needs_human']:
            print("⚠️  [Flagged for human review]")
            print()
        
        if result['suggested_actions']:
            print(f"   Quick replies: {result['suggested_actions']}")
            print()
        
        # Update conversation history
        conversation_history.append({"role": "user", "content": message})
        conversation_history.append({"role": "assistant", "content": result['reply']})
        
        print("-" * 60)
        print()


def test_specific_queries():
    """Test specific query types."""
    
    brain = AIBrain()
    
    test_queries = [
        ("What is the price for bridal makeup?", "pricing"),
        ("Do you have parking?", "general_enquiry"),
        ("Sunday timing?", "hours"),
        ("kahan hai salon?", "location"),
        ("I have a complaint about my last visit", "complaint"),
    ]
    
    print("=" * 60)
    print("🧪 Testing Specific Query Types")
    print("=" * 60)
    print()
    
    for query, expected_intent in test_queries:
        result = brain.generate_reply(
            business_data=sample_business,
            user_message=query,
            history=[]
        )
        
        status = "✅" if result['intent'] == expected_intent else "❌"
        print(f"{status} Query: '{query}'")
        print(f"   Expected: {expected_intent} | Detected: {result['intent']} ({result['confidence']:.0%})")
        print(f"   Reply: {result['reply'][:100]}...")
        print()


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("WhatsApp AI Brain - Example Usage")
    print("=" * 60 + "\n")
    
    # Run demo conversation
    simulate_conversation()
    
    print("\n")
    
    # Test specific queries
    test_specific_queries()
