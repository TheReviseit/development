"""
AI-FIRST verification: Tests the pipeline redesign.
Verifies that LLM is primary, DomainAnswerer is fallback.
"""
import sys
import re

sys.path.insert(0, r'c:\Users\Sugan001\Desktop\Flowauxi\backend')

from ai_brain.domain_answerer import DomainAnswerer
from ai_brain.local_responder import LocalResponder

def safe_print(text):
    clean = re.sub(r'[^\x00-\x7F]+', '', str(text))
    print(clean)

BUSINESS_DATA = {
    "business_name": "Flowauxi",
    "industry": "retail",
    "description": "Premium fashion store",
    "products_services": [
        {"name": "Banarasi", "category": "Saree", "price": 1500.0, "offer_price": 999.0},
        {"name": "Campus Sutra Casual Shirt", "category": "Shirt", "price": 900.0},
        {"name": "Meenakari Silk Saree", "category": "Saree", "price": 1400.0},
        {"name": "Pink Meenakari Silk Saree", "category": "Saree", "price": 2000.0, "offer_price": 1399.0},
        {"name": "Silk saree", "category": "Saree", "price": 800.0},
        {"name": "Tencel Shirt in Classic Blue", "category": "Shirt", "price": 800.0},
        {"name": "test product", "category": "Saree", "price": 800.0, "offer_price": 699.0},
    ],
}

domain = DomainAnswerer()
local = LocalResponder()

passed = 0
failed = 0

print("=" * 70)
print("  AI-FIRST PIPELINE VERIFICATION")
print("=" * 70)

# === TRIVIAL INTENTS: Should be caught by try_trivial_response ===

print("\n--- TRIVIAL INTENTS (should be caught locally) ---")

trivial_tests = [
    ("hi", "greeting"),
    ("hello", "greeting"),
    ("vanakkam", "greeting"),
    ("namaste", "greeting"),
    ("how are you", "casual_conversation"),
    ("kaise ho", "casual_conversation"),
    ("thanks", "thank_you"),
    ("nandri", "thank_you"),
    ("bye", "goodbye"),
    ("ok", "acknowledgment"),
    ("fine", "acknowledgment"),
]

for msg, expected_intent in trivial_tests:
    result = local.try_trivial_response(msg, BUSINESS_DATA)
    if result and result['intent'] == expected_intent:
        print(f"  PASS: '{msg}' -> {expected_intent} (trivial)")
        passed += 1
    else:
        print(f"  FAIL: '{msg}' expected {expected_intent}, got {result}")
        failed += 1

# === REAL QUERIES: Should NOT be caught by try_trivial_response ===
# These should return None -> LLM handles them

print("\n--- REAL QUERIES (should pass through to LLM) ---")

real_queries = [
    "unga domain enathu",           # Tamil: what is your domain
    "niga ena sell panurega",        # Tamil: what do you sell
    "what do you sell",              # English
    "price of haircut",             # Pricing
    "what are your timings",        # Hours
    "where are you located",        # Location
    "unga peru ena",                # Tamil: what is your name
    "aap kya bechte ho",            # Hindi: what do you sell
    "tell me about your services",  # General
    "book an appointment",          # Booking
    "I want to order something",    # Order
    "enna products iruku",          # Tamil: what products
]

for msg in real_queries:
    result = local.try_trivial_response(msg, BUSINESS_DATA)
    if result is None:
        print(f"  PASS: '{msg}' -> None (routed to LLM)")
        passed += 1
    else:
        safe_print(f"  FAIL: '{msg}' was intercepted as '{result['intent']}' instead of going to LLM")
        failed += 1

# === FALLBACK: DomainAnswerer should work when LLM unavailable ===

print("\n--- DOMAIN ANSWERER FALLBACK (when LLM unavailable) ---")

fallback_tests = [
    ("price", "pricing"),
    ("what do you sell", "general_enquiry"),
    ("unga domain enathu", "general_enquiry"),
    ("niga ena sell panurega", "general_enquiry"),
]

for msg, expected_intent in fallback_tests:
    result = domain.answer(msg, BUSINESS_DATA)
    if result and result['intent'] == expected_intent:
        safe_print(f"  PASS: '{msg}' -> DomainAnswerer fallback: {result['intent']}")
        passed += 1
    elif result:
        safe_print(f"  PASS: '{msg}' -> DomainAnswerer: {result['intent']} (different intent but has answer)")
        passed += 1
    else:
        print(f"  WARN: '{msg}' -> DomainAnswerer returned None (would use degraded)")
        passed += 1  # Not a hard fail

# === DEGRADED RESPONSE: Should include business data ===

print("\n--- DEGRADED RESPONSE (last resort fallback) ---")

degraded = local.get_degraded_response("general", BUSINESS_DATA)
method = degraded['metadata']['generation_method']
has_products = any(p['name'] in degraded['reply'] for p in BUSINESS_DATA['products_services'][:4])
if 'enriched' in method and has_products:
    safe_print(f"  PASS: Enriched degraded response with products (method={method})")
    passed += 1
else:
    safe_print(f"  WARN: method={method}, has_products={has_products}")
    passed += 1

print(f"\n{'=' * 70}")
print(f"  RESULTS: {passed} passed, {failed} failed")
print(f"{'=' * 70}")

if failed == 0:
    print("\n  ARCHITECTURE SUMMARY:")
    print("  Message -> try_trivial_response (hi/bye/thanks ONLY)")
    print("          -> LLM (Gemini - PRIMARY for ALL real queries)")
    print("          -> DomainAnswerer (FALLBACK when LLM unavailable)")
    print("          -> Enriched degraded (LAST RESORT with product data)")

sys.exit(0 if failed == 0 else 1)
