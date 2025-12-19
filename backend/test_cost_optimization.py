"""
Test script for Cost Optimization modules.
Run with: py test_cost_optimization.py
"""

import sys
sys.path.insert(0, '.')

def test_hardcoded_replies():
    """Test hardcoded reply detection."""
    print("Testing hardcoded reply detection...")
    
    from ai_brain.cost_optimizer import check_hardcoded_reply
    
    # These should match hardcoded patterns
    hardcoded_inputs = [
        "hi",
        "Hello!",
        "thanks",
        "Thank you so much",
        "bye",
        "ok",
        "yes",
    ]
    
    # These should NOT match (needs LLM)
    llm_inputs = [
        "What is the price for haircut?",
        "I want to book an appointment",
        "Where are you located?",
        "What time do you open?",
    ]
    
    hardcoded_count = 0
    for msg in hardcoded_inputs:
        result = check_hardcoded_reply(msg)
        if result:
            hardcoded_count += 1
            print(f"  ✅ '{msg}' -> Hardcoded ({result[0]})")
        else:
            print(f"  ❌ '{msg}' -> Expected hardcoded, got LLM")
    
    llm_count = 0
    for msg in llm_inputs:
        result = check_hardcoded_reply(msg)
        if result is None:
            llm_count += 1
            print(f"  ✅ '{msg}' -> Needs LLM (correct)")
        else:
            print(f"  ❌ '{msg}' -> Expected LLM, got hardcoded")
    
    print(f"\n  Hardcoded: {hardcoded_count}/{len(hardcoded_inputs)}")
    print(f"  LLM-required: {llm_count}/{len(llm_inputs)}")
    
    return hardcoded_count >= 5 and llm_count >= 3


def test_cost_optimizer():
    """Test cost optimizer routing."""
    print("\nTesting cost optimizer routing...")
    
    from ai_brain.cost_optimizer import CostOptimizer
    
    optimizer = CostOptimizer()
    
    # Test 1: Simple greeting should skip LLM
    decision = optimizer.analyze_query(
        message="hi",
        business_id="test",
        plan="starter"
    )
    assert decision.skip_llm == True, "Greeting should skip LLM"
    print("  ✅ Greeting skips LLM")
    
    # Test 2: Pricing query should use LLM
    decision = optimizer.analyze_query(
        message="what is the price for haircut",
        business_id="test",
        plan="starter"
    )
    assert decision.skip_llm == False, "Pricing should use LLM"
    print("  ✅ Pricing uses LLM")
    
    # Test 3: Enterprise plan should enable retrieval
    decision = optimizer.analyze_query(
        message="tell me about services",
        business_id="test",
        plan="enterprise"
    )
    assert decision.use_retrieval == True, "Enterprise should enable retrieval"
    print("  ✅ Enterprise enables retrieval")
    
    # Test 4: Free plan should not enable retrieval
    decision = optimizer.analyze_query(
        message="tell me about services",
        business_id="test",
        plan="free"
    )
    assert decision.use_retrieval == False, "Free should not enable retrieval"
    print("  ✅ Free disables retrieval")
    
    return True


def test_business_retriever():
    """Test business data retrieval."""
    print("\nTesting business retriever...")
    
    from ai_brain.business_retriever import BusinessRetriever
    
    retriever = BusinessRetriever(max_tokens=400)
    
    business_data = {
        "business_name": "Style Studio",
        "industry": "salon",
        "description": "A premium salon in Mumbai offering top-notch services.",
        "products_services": [
            {"name": "Haircut", "price": 300},
            {"name": "Hair Spa", "price": 800},
            {"name": "Facial", "price": 500},
            {"name": "Manicure", "price": 350},
            {"name": "Pedicure", "price": 400},
        ],
        "timings": {
            "monday": {"open": "10:00", "close": "20:00"},
            "tuesday": {"open": "10:00", "close": "20:00"},
            "wednesday": {"open": "10:00", "close": "20:00"},
            "thursday": {"open": "10:00", "close": "20:00"},
            "friday": {"open": "10:00", "close": "20:00"},
            "saturday": {"open": "09:00", "close": "21:00"},
            "sunday": {"is_closed": True}
        },
        "location": {
            "address": "123 Main Street",
            "city": "Mumbai",
            "pincode": "400001"
        }
    }
    
    # Test pricing retrieval
    result = retriever.retrieve(business_data, "pricing", "price for haircut")
    assert result.savings_percent > 0, "Should have savings"
    assert "Haircut" in result.context, "Should include haircut"
    print(f"  ✅ Pricing: {result.token_estimate} tokens ({result.savings_percent}% saved)")
    
    # Test hours retrieval
    result = retriever.retrieve(business_data, "hours", "when do you open")
    assert "Monday" in result.context or "monday" in result.context.lower(), "Should include hours"
    print(f"  ✅ Hours: {result.token_estimate} tokens ({result.savings_percent}% saved)")
    
    # Test location retrieval
    result = retriever.retrieve(business_data, "location", "where are you")
    assert "Mumbai" in result.context, "Should include location"
    print(f"  ✅ Location: {result.token_estimate} tokens ({result.savings_percent}% saved)")
    
    # Test greeting (minimal retrieval)
    result = retriever.retrieve(business_data, "greeting", "hi")
    assert result.token_estimate < 50, "Greeting should have minimal retrieval"
    print(f"  ✅ Greeting: {result.token_estimate} tokens (minimal)")
    
    return True


def main():
    """Run all tests."""
    print("=" * 50)
    print("Cost Optimization Tests")
    print("=" * 50)
    
    tests = [
        ("Hardcoded Replies", test_hardcoded_replies),
        ("Cost Optimizer", test_cost_optimizer),
        ("Business Retriever", test_business_retriever),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_fn in tests:
        try:
            if test_fn():
                passed += 1
        except Exception as e:
            print(f"\n❌ {name} FAILED: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)
    
    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
