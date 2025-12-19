"""
Test script for AI Brain v2.0 components.
Run with: py test_v2_components.py
"""

import sys
sys.path.insert(0, '.')

def test_imports():
    """Test that all components can be imported."""
    print("Testing imports...")
    
    from ai_brain import (
        AIBrain, AIBrainConfig, validate_config,
        ChatGPTEngine, ConversationManager, ResponseCache,
        WhatsAppFormatter, LanguageDetector, AnalyticsTracker,
        IntentType, Language
    )
    print("  ✅ All v2.0 components imported successfully!")
    return True


def test_language_detector():
    """Test language detection."""
    print("\nTesting language detector...")
    
    from ai_brain.language_detector import LanguageDetector, Language
    
    detector = LanguageDetector()
    
    # Test English
    result = detector.detect("Hello, how are you?")
    assert result.language == Language.ENGLISH, f"Expected ENGLISH, got {result.language}"
    print(f"  ✅ English: {result.language.value} (conf: {result.confidence:.2f})")
    
    # Test Hinglish
    result = detector.detect("Kya price hai haircut ka?")
    assert result.language in [Language.HINGLISH, Language.HINDI], f"Expected HINGLISH/HINDI, got {result.language}"
    print(f"  ✅ Hinglish: {result.language.value} (conf: {result.confidence:.2f})")
    
    # Test mixed
    result = detector.detect("Hello bhai, kaise ho?")
    print(f"  ✅ Mixed: {result.language.value} (conf: {result.confidence:.2f})")
    
    return True


def test_whatsapp_formatter():
    """Test WhatsApp message formatting."""
    print("\nTesting WhatsApp formatter...")
    
    from ai_brain.whatsapp_formatter import WhatsAppFormatter
    
    formatter = WhatsAppFormatter()
    
    # Test length limiting
    long_text = "A" * 1000
    formatted = formatter.format(long_text)
    assert len(formatted) <= 503, f"Text too long: {len(formatted)}"
    print(f"  ✅ Length limiting: {len(formatted)} chars")
    
    # Test list formatting
    items = ["Item 1", "Item 2", "Item 3"]
    formatted = formatter.format_list(items, "Available items:")
    assert "•" in formatted, "Missing bullet points"
    print(f"  ✅ List formatting works")
    
    # Test price formatting
    products = [
        {"name": "Haircut", "price": 300},
        {"name": "Facial", "price": 500}
    ]
    formatted = formatter.format_price_list(products)
    assert "₹300" in formatted, "Missing price"
    print(f"  ✅ Price formatting works")
    
    return True


def test_conversation_manager():
    """Test conversation management."""
    print("\nTesting conversation manager...")
    
    from ai_brain.conversation_manager import ConversationManager
    
    manager = ConversationManager(max_history=5)
    
    # Add messages
    manager.add_message("user123", "user", "Hello")
    manager.add_message("user123", "assistant", "Hi there!")
    manager.add_message("user123", "user", "What's your price?")
    
    # Get history
    history = manager.get_history("user123")
    assert len(history) == 3, f"Expected 3 messages, got {len(history)}"
    print(f"  ✅ History: {len(history)} messages")
    
    # Test context
    manager.add_message("user123", "user", "I want haircut", entities={"service": "haircut"})
    context = manager.get_context("user123")
    assert "service" in context, "Context not stored"
    print(f"  ✅ Context: {context}")
    
    # Test clear
    manager.clear_session("user123")
    history = manager.get_history("user123")
    assert len(history) == 0, "Session not cleared"
    print(f"  ✅ Session cleared")
    
    return True


def test_response_cache():
    """Test response caching."""
    print("\nTesting response cache...")
    
    from ai_brain.response_cache import ResponseCache
    
    cache = ResponseCache(default_ttl=60)
    
    # Set cache
    response = {"reply": "Hello!", "intent": "greeting"}
    cache.set("biz123", "greeting", "hello", response)
    
    # Get cache
    cached = cache.get("biz123", "greeting", "hello")
    assert cached is not None, "Cache miss"
    assert cached["reply"] == "Hello!", "Wrong cached value"
    print(f"  ✅ Cache hit works")
    
    # Test miss
    cached = cache.get("biz123", "pricing", "cost")
    assert cached is None, "Unexpected cache hit"
    print(f"  ✅ Cache miss works")
    
    # Stats
    stats = cache.get_stats()
    assert stats["hits"] > 0, "No hits recorded"
    print(f"  ✅ Stats: {stats}")
    
    return True


def test_analytics():
    """Test analytics tracking."""
    print("\nTesting analytics...")
    
    from ai_brain.analytics import AnalyticsTracker, ResolutionOutcome
    
    tracker = AnalyticsTracker()
    
    # Track interaction
    event_id = tracker.track_interaction(
        business_id="biz123",
        user_id="user456",
        intent="pricing",
        confidence=0.85,
        user_message="What's the price?",
        ai_response="Haircut is ₹300",
        response_time_ms=150,
        tokens_used=100,
        outcome=ResolutionOutcome.RESOLVED
    )
    
    assert event_id, "No event ID returned"
    print(f"  ✅ Event tracked: {event_id}")
    
    # Get analytics
    analytics = tracker.get_business_analytics("biz123", hours=24)
    assert analytics.total_interactions > 0, "No interactions"
    print(f"  ✅ Analytics: {analytics.total_interactions} interactions")
    
    return True


def test_config():
    """Test configuration."""
    print("\nTesting configuration...")
    
    from ai_brain.config import AIBrainConfig, validate_config
    
    config = AIBrainConfig.from_env()
    
    # Check defaults
    assert config.use_llm_intent_detection == True
    assert config.enable_function_calling == True
    print(f"  ✅ Config loaded: model={config.llm.model}")
    
    # Validate
    issues = validate_config(config)
    if issues:
        print(f"  ⚠️ Validation issues: {issues}")
    else:
        print(f"  ✅ Config valid")
    
    return True


def main():
    """Run all tests."""
    print("=" * 50)
    print("AI Brain v2.0 Component Tests")
    print("=" * 50)
    
    tests = [
        ("Imports", test_imports),
        ("Language Detector", test_language_detector),
        ("WhatsApp Formatter", test_whatsapp_formatter),
        ("Conversation Manager", test_conversation_manager),
        ("Response Cache", test_response_cache),
        ("Analytics", test_analytics),
        ("Configuration", test_config),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_fn in tests:
        try:
            if test_fn():
                passed += 1
        except Exception as e:
            print(f"\n❌ {name} FAILED: {e}")
            failed += 1
    
    print("\n" + "=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)
    
    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
