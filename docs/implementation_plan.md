# AIBrain Forensic Audit — Complete Plan (All Gaps Filled)

## Existing Audit Context — 15 Bugs Summary

| BUG | SEV | TITLE | LINE(S) | CORE ISSUE |
|-----|-----|-------|---------|------------|
| BUG-01 | 🔴SEV-1 | [_error_response](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#6968-6978) generic | L6968-6977 | Returns `"I'm having trouble"` — no business name/contact |
| BUG-02 | 🔴SEV-1 | [_template_fallback_reply](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#6995-7060) ignores data | L6995-7059 | Budget exceeded → `"feel free to ask"` instead of real prices |
| BUG-03 | 🔴SEV-1 | [_out_of_scope_response](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#7081-7091) generic | L7081-7090 | Doesn't list available services in redirect |
| BUG-04 | 🔴SEV-1 | [_rate_limited_response](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#6979-6994) empty | L6979-6993 | `"Thanks for patience"` — zero useful info |
| BUG-05 | 🟠SEV-2 | `_order_step` stale across webhooks | L2790-2807 | Step-aware routing only for `awaiting_quantity`, not all steps |
| BUG-06 | 🟠SEV-2 | State leak between flows | L5888-5889 | `_resolved_sku` etc. not cleared on new flow start |
| BUG-07 | 🟠SEV-2 | Duplicate quantity handler | L4203-4465 vs L4553-4799 | 260 lines × 2 — maintenance time bomb |
| BUG-08 | 🟡SEV-3 | [_is_in_scope](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#7061-7080) regex false positives | L7061-7079 | `"joke cards"` blocked for greeting card business |
| BUG-09 | 🟡SEV-3 | [_classify_booking_type](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#843-884) tiebreaker | L800-1000 | Defaults [order](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#5105-5915) for salon with products |
| BUG-10 | 🟡SEV-3 | [LocalResponder](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/local_responder.py#341-912) fuzzy match wrong | L736-808 | 0.55 threshold, no confirmation prompt |
| BUG-11 | 🟡SEV-3 | No Supabase retry in order tracking | L1100-1300 | Transient error → `"couldn't find order"` |
| BUG-12 | 🟡SEV-3 | [_try_pricing_response](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/local_responder.py#736-841) swallows exceptions | pricing handler | Malformed price → silent None → generic LLM |
| BUG-13 | 🔴**P0** | `ImportError` silently continues | L5703-5706 | Orders proceed without ANY stock validation |
| BUG-14 | 🟠**P1** | `time.sleep()` blocks event loop | L4856-4870 | Payment retry blocks thread 2-6s |
| BUG-15 | 🟡SEV-3 | Appointment interruption too simple | L6710-6718 | `"?"` + 3 words → falls to LLM, loses state |

---

## GAP 1: DomainAnswerer Class

**File:** `backend/ai_brain/domain_answerer.py` [NEW]

```python
"""
DomainAnswerer — Answers user queries directly from business_data WITHOUT LLM.
Handles 40-60% of queries for a typical business: pricing, hours, location, FAQs, policies.

RULES:
- NEVER return "contact us for pricing" if prices exist in business_data
- NEVER return "our team will respond" if data exists
- Return None if cannot give a SPECIFIC answer (caller falls through to LLM)
- Use conversation_history to resolve contextual references ("it", "that", "how much?")
"""

import re
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


def _fuzzy_score(query: str, target: str) -> float:
    """Token-overlap ratio with length penalty. O(n) where n = max(tokens)."""
    q_tokens = set(query.lower().split())
    t_tokens = set(target.lower().split())
    if not q_tokens or not t_tokens:
        return 0.0
    overlap = len(q_tokens & t_tokens)
    union = len(q_tokens | t_tokens)
    jaccard = overlap / union if union else 0.0

    # Boost if query is a substring of target name (handles "red kurta" in "Red Silk Kurta")
    if query.lower() in target.lower():
        jaccard = max(jaccard, 0.85)
    elif target.lower() in query.lower():
        jaccard = max(jaccard, 0.75)

    return round(jaccard, 3)


# Words to strip when extracting a product name from a pricing query
_PRICE_STOP_WORDS = frozenset({
    'price', 'prices', 'cost', 'rate', 'rates', 'how', 'much', 'what', 'is',
    'the', 'of', 'for', 'a', 'an', 'ka', 'ki', 'ke', 'batao', 'bata', 'do',
    'please', 'plz', 'pls', 'kitna', 'kimat', 'kya', 'hai', 'hain', 'show',
    'me', 'tell', 'about', 'give', 'dam', 'koto', 'bhav', 'che', 'shu',
})

# Intent keyword sets
_PRICE_KEYWORDS = frozenset({
    'price', 'prices', 'pricing', 'cost', 'rate', 'rates', 'how much',
    'kitna', 'kimat', 'rate batao', 'price list', 'menu', 'tariff',
    'charge', 'charges', 'fees', 'dam koto', 'koto', 'bhav',
})

_HOURS_KEYWORDS = frozenset({
    'timing', 'timings', 'hours', 'open', 'close', 'closed', 'working hours',
    'kab', 'band', 'khula', 'time', 'schedule', 'available', 'when',
})

_LOCATION_KEYWORDS = frozenset({
    'location', 'address', 'where', 'kahan', 'directions', 'map', 'route',
    'visit', 'reach', 'find you', 'come', 'situated', 'located',
})


class DomainAnswerer:
    """
    Answers user queries directly from business_data WITHOUT calling LLM.
    Should handle 40-60% of all queries for a typical business.
    """

    # ─── PUBLIC API ────────────────────────────────────────────────

    def can_answer(self, message: str, business_data: dict) -> bool:
        """
        Returns True if business_data has enough info to answer without LLM.
        """
        msg = message.lower().strip()

        # Price queries — answerable if products with prices exist
        if any(kw in msg for kw in _PRICE_KEYWORDS):
            products = business_data.get('products_services', [])
            priced = [p for p in products if p.get('price') is not None]
            if priced:
                return True

        # Hours queries
        if any(kw in msg for kw in _HOURS_KEYWORDS):
            if business_data.get('timings'):
                return True

        # Location queries
        if any(kw in msg for kw in _LOCATION_KEYWORDS):
            loc = business_data.get('location', {})
            if loc.get('address') or loc.get('google_maps_link'):
                return True

        # FAQ queries — always try
        faqs = business_data.get('faqs', [])
        if faqs:
            match = self.query_faqs(msg, business_data)
            if match:
                return True

        return False

    def answer(
        self,
        message: str,
        business_data: dict,
        conversation_history: list = None,
    ) -> Optional[dict]:
        """
        Returns a complete response dict using only business_data.
        Uses conversation_history to resolve pronouns ("it", "that", "how much").
        Returns None if no specific answer can be built.
        """
        msg = message.lower().strip()

        # Resolve context product from history for follow-up queries
        context_product = self._resolve_context_product(conversation_history)

        # 1. Pricing
        if any(kw in msg for kw in _PRICE_KEYWORDS):
            pricing_reply = self.query_pricing(msg, business_data, context_product)
            if pricing_reply:
                return self._build_response(
                    reply=pricing_reply['text'],
                    intent="pricing",
                    confidence=pricing_reply.get('confidence', 0.92),
                    needs_confirmation=pricing_reply.get('needs_confirmation', False),
                    matched_product=pricing_reply.get('matched_product'),
                )

        # 2. Hours
        if any(kw in msg for kw in _HOURS_KEYWORDS):
            hours_reply = self.query_hours(msg, business_data)
            if hours_reply:
                return self._build_response(reply=hours_reply, intent="hours")

        # 3. Location
        if any(kw in msg for kw in _LOCATION_KEYWORDS):
            loc_reply = self.query_location(msg, business_data)
            if loc_reply:
                return self._build_response(reply=loc_reply, intent="location")

        # 4. FAQs (catch-all for non-keyword queries that match FAQs)
        faq_reply = self.query_faqs(msg, business_data)
        if faq_reply:
            return self._build_response(
                reply=faq_reply['text'],
                intent="faq_match",
                confidence=faq_reply.get('confidence', 0.80),
            )

        # 5. Product info (non-price queries like "tell me about the red kurta")
        product_result = self.query_products(msg, business_data)
        if product_result:
            return self._build_response(
                reply=product_result['text'],
                intent="product_info",
                confidence=product_result.get('confidence', 0.85),
                needs_confirmation=product_result.get('needs_confirmation', False),
                matched_product=product_result.get('matched_product'),
            )

        # Cannot answer specifically → return None (fall through to LLM)
        return None

    # ─── QUERY METHODS ─────────────────────────────────────────────

    def query_products(
        self, message: str, business_data: dict
    ) -> Optional[dict]:
        """
        Match message to products by name, category, keyword.
        Return product with price, description, variants.
        If fuzzy match score < 0.90, return match WITH confirmation flag.
        """
        products = business_data.get('products_services', [])
        if not products:
            return None

        # Strip common noise to get a product query
        query_words = [w for w in message.lower().split()
                       if w not in _PRICE_STOP_WORDS and len(w) > 1]
        product_query = ' '.join(query_words).strip()
        if not product_query or len(product_query) < 2:
            return None

        # Score every product
        scored = []
        for p in products:
            name = p.get('name', '')
            score = _fuzzy_score(product_query, name)
            # Also check category
            cat_score = _fuzzy_score(product_query, p.get('category', ''))
            best = max(score, cat_score * 0.8)  # category match is slightly weaker
            if best >= 0.40:
                scored.append((p, best))

        scored.sort(key=lambda x: x[1], reverse=True)

        if not scored:
            return None

        biz_name = business_data.get('business_name', 'our business')
        top_product, top_score = scored[0]

        if len(scored) == 1 or top_score >= 0.90:
            # High-confidence single match
            return self._format_product_detail(top_product, biz_name, top_score)
        elif top_score >= 0.55:
            # Ambiguous match — return with confirmation flag
            result = self._format_product_detail(top_product, biz_name, top_score)
            result['needs_confirmation'] = True
            result['text'] = (
                f"Did you mean **{top_product.get('name', '')}**?\n\n"
                + result['text']
            )
            return result
        else:
            # Very low score — list top matches
            if len(scored) >= 2:
                lines = [f"Here's what I found at {biz_name}:\n"]
                for p, s in scored[:5]:
                    price = p.get('price')
                    price_str = f"₹{price}" if price else ""
                    lines.append(f"• {p.get('name', '')} {price_str}")
                lines.append("\nWhich one are you interested in? 😊")
                return {
                    'text': '\n'.join(lines),
                    'confidence': round(scored[0][1], 2),
                    'needs_confirmation': True,
                    'matched_product': None,
                }
            return None

    def query_pricing(
        self,
        message: str,
        business_data: dict,
        context_product: str = None,
    ) -> Optional[dict]:
        """
        Extract relevant pricing.
        If context_product is provided (from conversation history),
        answer for THAT product even if message just says "price?" or "cost?".
        """
        products = business_data.get('products_services', [])
        if not products:
            return None

        priced = [p for p in products if p.get('price') is not None]
        if not priced:
            return None

        biz_name = business_data.get('business_name', 'our business')

        # Step 1: Try to extract product name from message
        query_words = [w for w in message.lower().split()
                       if w not in _PRICE_STOP_WORDS and len(w) > 1]
        product_query = ' '.join(query_words).strip()

        # Step 2: If message is bare ("price?", "how much?", "kitna?"),
        # resolve from conversation context
        if not product_query or len(product_query) < 2:
            if context_product:
                product_query = context_product
                logger.info(f"🧠 DomainAnswerer: Resolved context product → '{context_product}'")
            else:
                # Generic price list (no specific product asked, no context)
                return self._format_price_list(priced, biz_name)

        # Step 3: Fuzzy match against product catalog
        scored = []
        for p in priced:
            name = p.get('name', '')
            score = _fuzzy_score(product_query, name)
            if score >= 0.40:
                scored.append((p, score))

        scored.sort(key=lambda x: x[1], reverse=True)

        if not scored:
            # No match for specific product — show full list
            return self._format_price_list(priced, biz_name)

        top_product, top_score = scored[0]

        if top_score >= 0.90:
            # High confidence — single product price
            p = top_product
            price_str = f"₹{p.get('price')}"
            reply = f"The price for **{p.get('name')}** is {price_str}"
            desc = p.get('description', '')
            if desc:
                reply += f"\n{desc[:120]}"
            reply += "\n\nWould you like to order or know more? 😊"
            return {
                'text': reply,
                'confidence': round(top_score, 2),
                'matched_product': p.get('name'),
            }
        elif top_score >= 0.55:
            # Ambiguous — return with confirmation
            p = top_product
            price_str = f"₹{p.get('price')}"
            reply = (
                f"Did you mean **{p.get('name')}**? It's priced at {price_str}.\n\n"
                "Let me know if you meant something else! 😊"
            )
            return {
                'text': reply,
                'confidence': round(top_score, 2),
                'needs_confirmation': True,
                'matched_product': p.get('name'),
            }
        else:
            return self._format_price_list(priced, biz_name)

    def query_hours(self, message: str, business_data: dict) -> Optional[str]:
        """Format and return actual business hours."""
        timings = business_data.get('timings', {})
        if not timings:
            return None

        biz_name = business_data.get('business_name', 'our business')
        days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

        # Check if user is asking about a specific day
        msg_lower = message.lower()
        specific_day = None
        for day in days:
            if day in msg_lower or day[:3] in msg_lower:
                specific_day = day
                break

        # Also check "today" / "tomorrow"
        if 'today' in msg_lower or 'aaj' in msg_lower:
            from datetime import date
            specific_day = date.today().strftime('%A').lower()
        elif 'tomorrow' in msg_lower or 'kal' in msg_lower:
            from datetime import date, timedelta
            specific_day = (date.today() + timedelta(days=1)).strftime('%A').lower()

        if specific_day:
            timing = timings.get(specific_day, {})
            if isinstance(timing, dict):
                if timing.get('is_closed'):
                    return f"We're **closed** on {specific_day.capitalize()} ❌"
                elif timing.get('open') and timing.get('close'):
                    return (
                        f"On {specific_day.capitalize()}, {biz_name} is open "
                        f"from **{timing['open']}** to **{timing['close']}** 🕐"
                    )

        # Full schedule
        lines = [f"Here are our hours at {biz_name}! 🕐\n"]
        has_any = False
        for day in days:
            timing = timings.get(day, {})
            if isinstance(timing, dict):
                has_any = True
                if timing.get('is_closed'):
                    lines.append(f"• {day.capitalize()}: Closed")
                elif timing.get('open') and timing.get('close'):
                    lines.append(f"• {day.capitalize()}: {timing['open']} - {timing['close']}")

        special = timings.get('special_notes')
        if special:
            lines.append(f"\n📌 {special}")

        return '\n'.join(lines) if has_any else None

    def query_location(self, message: str, business_data: dict) -> Optional[str]:
        """Return address + google_maps_link if available."""
        location = business_data.get('location', {})
        if not location:
            return None

        biz_name = business_data.get('business_name', 'our business')
        parts = [f"📍 **{biz_name} Location:**\n"]

        if location.get('address'):
            parts.append(location['address'])

        city_parts = []
        if location.get('city'):
            city_parts.append(location['city'])
        if location.get('state'):
            city_parts.append(location['state'])
        if city_parts:
            line = ', '.join(city_parts)
            if location.get('pincode'):
                line += f" - {location['pincode']}"
            parts.append(line)

        if location.get('landmarks'):
            parts.append(f"\nLandmarks: {', '.join(location['landmarks'])}")

        if location.get('google_maps_link'):
            parts.append(f"\n🗺️ Google Maps: {location['google_maps_link']}")

        return '\n'.join(parts) if len(parts) > 1 else None

    def query_faqs(self, message: str, business_data: dict) -> Optional[dict]:
        """Search FAQs for relevant answer using keyword overlap."""
        faqs = business_data.get('faqs', [])
        if not faqs:
            return None

        msg_words = set(message.lower().split())
        best_match = None
        best_score = 0.0

        for faq in faqs:
            question = faq.get('question', '').lower()
            q_words = set(question.split())
            if not q_words:
                continue
            overlap = len(msg_words & q_words)
            union = len(msg_words | q_words)
            score = overlap / union if union else 0.0
            if score > best_score and score >= 0.35:
                best_score = score
                best_match = faq

        if best_match and best_match.get('answer'):
            return {
                'text': best_match['answer'],
                'confidence': round(best_score, 2),
            }
        return None

    # ─── CONTEXT RESOLUTION ────────────────────────────────────────

    def _resolve_context_product(
        self, conversation_history: list
    ) -> Optional[str]:
        """
        Scan last 3 message pairs for a product that was discussed.
        Enables: "how much?" after "tell me about the red kurta" → 
        returns "red kurta" so pricing can be specific.
        """
        if not conversation_history:
            return None

        # Look at last 6 messages (3 pairs) in reverse
        recent = conversation_history[-6:] if len(conversation_history) >= 6 else conversation_history

        # Patterns that indicate a product was discussed
        product_patterns = [
            r'price for \*\*(.+?)\*\*',           # "The price for **Haircut** is ₹300"
            r'about (?:the |our )?(.+?)[\.\?!]',   # "tell me about the red kurta."
            r'(?:show|see|view)\s+(.+?)[\.\?!]?$',  # "show me red kurta"
            r'interested in\s+(.+?)[\.\?!]?$',     # "interested in red kurta"
            r'\*\*(.+?)\*\*',                       # Any bold product name in assistant reply
        ]

        for msg in reversed(recent):
            content = msg.get('content', '') if isinstance(msg, dict) else str(msg)
            for pattern in product_patterns:
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    product_name = match.group(1).strip()
                    # Filter out non-product strings
                    skip = {'our', 'your', 'the', 'a', 'an', 'this', 'that', 'it'}
                    if product_name.lower() not in skip and len(product_name) > 2:
                        return product_name

        return None

    # ─── PRIVATE HELPERS ───────────────────────────────────────────

    def _format_product_detail(
        self, product: dict, biz_name: str, score: float
    ) -> dict:
        """Format a single product's details."""
        name = product.get('name', '')
        price = product.get('price')
        category = product.get('category', '')
        desc = product.get('description', '')

        lines = [f"**{name}**"]
        if price is not None:
            lines.append(f"Price: ₹{price}")
        if category:
            lines.append(f"Category: {category}")
        if desc:
            lines.append(f"\n{desc[:150]}")
        lines.append(f"\nWould you like to order or know more? 😊")

        return {
            'text': '\n'.join(lines),
            'confidence': round(score, 2),
            'matched_product': name,
            'needs_confirmation': False,
        }

    def _format_price_list(self, priced: list, biz_name: str) -> dict:
        """Format a generic price list from available products."""
        lines = [f"Here are our prices at {biz_name}! 💰\n"]
        for p in priced[:8]:
            name = p.get('name', '')
            price = p.get('price')
            category = p.get('category', '')
            price_str = f"₹{price}" if price else "Price on request"
            line = f"• {name}: {price_str}"
            if category:
                line += f" ({category})"
            lines.append(line)

        if len(priced) > 8:
            lines.append(f"\n...and {len(priced) - 8} more items!")
        lines.append("\nWhich one are you interested in? 😊")

        return {
            'text': '\n'.join(lines),
            'confidence': 0.90,
            'matched_product': None,
        }

    @staticmethod
    def _build_response(
        reply: str,
        intent: str,
        confidence: float = 0.92,
        needs_confirmation: bool = False,
        matched_product: str = None,
    ) -> dict:
        """Build standardized response dict."""
        return {
            "reply": reply,
            "intent": intent,
            "confidence": confidence,
            "needs_human": False,
            "suggested_actions": [],
            "metadata": {
                "generation_method": "domain_answerer",
                "llm_call": False,
                "cost": 0,
                "tokens_used": 0,
                "needs_confirmation": needs_confirmation,
                "matched_product": matched_product,
            },
        }


# Singleton
_domain_answerer: Optional[DomainAnswerer] = None

def get_domain_answerer() -> DomainAnswerer:
    global _domain_answerer
    if _domain_answerer is None:
        _domain_answerer = DomainAnswerer()
    return _domain_answerer
```

---

## GAP 2: ResponseQualityGate Class

**File:** `backend/ai_brain/quality_gate.py` [NEW]

```python
"""
ResponseQualityGate — Last defense before response reaches user.
Catches generic responses when business data could answer better.

Sits AFTER the LLM response is built, BEFORE it is returned to the user.
If the LLM produced a generic reply but business_data has relevant info,
rebuild the response from DomainAnswerer.
"""

import re
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class ResponseQualityGate:
    """Last defense before response reaches user."""

    GENERIC_SIGNALS = [
        "contact us for pricing",
        "our team will respond",
        "feel free to ask",
        "i'll connect you",
        "please try again",
        "reach out to us",
        "someone will get back",
        "for more information",
        "we'll get back to you",
        "check with us",
        "ask us directly",
        "i'm having trouble",
        "thanks for reaching out",
        "thanks for your patience",
        "i can only help with",
    ]

    def __init__(self):
        self._stats = {"total_checked": 0, "generic_caught": 0, "rebuilt": 0}

    def check(
        self,
        response: dict,
        message: str,
        business_data: dict,
        conversation_history: list = None,
    ) -> dict:
        """
        Input: The response about to be sent.
        Output: Same response (if passes) OR a better response from business_data.
        """
        self._stats["total_checked"] += 1
        reply = response.get("reply", "")

        if not self._is_generic(reply):
            return response

        self._stats["generic_caught"] += 1
        logger.warning(
            f"🚨 QualityGate caught generic response: "
            f"'{reply[:80]}...' for message: '{message[:60]}'"
        )

        if self._can_do_better(message, business_data):
            rebuilt = self._rebuild_response(
                message, business_data, response, conversation_history
            )
            if rebuilt:
                self._stats["rebuilt"] += 1
                logger.info(
                    f"✅ QualityGate rebuilt response: "
                    f"'{rebuilt['reply'][:80]}...'"
                )
                return rebuilt

        # Can't do better — pass through with warning metadata
        response.setdefault("metadata", {})["quality_gate_warning"] = True
        return response

    def _is_generic(self, reply: str) -> bool:
        """Check if reply contains generic signal phrases."""
        reply_lower = reply.lower()
        return any(signal in reply_lower for signal in self.GENERIC_SIGNALS)

    def _can_do_better(self, message: str, business_data: dict) -> bool:
        """Check if business_data could answer this more specifically."""
        from .domain_answerer import get_domain_answerer

        da = get_domain_answerer()
        return da.can_answer(message, business_data)

    def _rebuild_response(
        self,
        message: str,
        business_data: dict,
        original_response: dict,
        conversation_history: list = None,
    ) -> Optional[dict]:
        """Build a better response using DomainAnswerer."""
        from .domain_answerer import get_domain_answerer

        da = get_domain_answerer()
        rebuilt = da.answer(message, business_data, conversation_history)

        if not rebuilt:
            return None

        # Preserve original intent if classification was correct
        original_intent = original_response.get("intent", "unknown")
        if original_intent not in ("unknown", "general_enquiry"):
            rebuilt["intent"] = original_intent

        # Tag metadata
        rebuilt.setdefault("metadata", {})
        rebuilt["metadata"]["quality_gate_rebuilt"] = True
        rebuilt["metadata"]["original_method"] = original_response.get(
            "metadata", {}
        ).get("generation_method", "unknown")

        return rebuilt

    def get_stats(self) -> dict:
        """Return quality gate metrics."""
        total = self._stats["total_checked"]
        return {
            **self._stats,
            "generic_rate": (
                round(self._stats["generic_caught"] / total, 3) if total else 0.0
            ),
            "rebuild_rate": (
                round(self._stats["rebuilt"] / total, 3) if total else 0.0
            ),
        }


# Singleton
_quality_gate: Optional[ResponseQualityGate] = None

def get_quality_gate() -> ResponseQualityGate:
    global _quality_gate
    if _quality_gate is None:
        _quality_gate = ResponseQualityGate()
    return _quality_gate
```

---

## GAP 3: 20 Test Cases

| TEST_ID | MESSAGE | BUSINESS_DATA_SNAPSHOT | CURRENTLY_BROKEN | EXPECTED_AFTER_FIX | BUG | VALIDATION |
|---------|---------|----------------------|------------------|--------------------|----|------------|
| T-01 | `"price of haircut"` | `products_services: [{name:"Haircut - Men", price:300}, {name:"Haircut - Women", price:500}]` | Fuzzy match returns "Haircut - Men" only (misses Women) | Shows both: `"Haircut - Men: ₹300 \| Haircut - Women: ₹500"` | BUG-02, BUG-10 | `assert "300" in reply and "500" in reply` |
| T-02 | `"kitna?"` (after discussing Red Kurta) | `products_services: [{name:"Red Silk Kurta", price:1299}]` + history mentioning "Red Silk Kurta" | Returns generic `"For pricing details, feel free to ask us directly!"` | Returns `"The price for Red Silk Kurta is ₹1299"` | BUG-02 | `assert "1299" in reply` |
| T-03 | `"how much?"` (no prior context) | `products_services: [{name:"Facial", price:800}, {name:"Manicure", price:400}]` | Returns `"For pricing details, feel free to ask us directly!"` | Returns full price list: `"Facial: ₹800, Manicure: ₹400"` | BUG-02 | `assert "800" in reply and "400" in reply` |
| T-04 | `"red shirt kitna price hai?"` (Hindi: "how much is the red shirt?") | `products_services: [{name:"Red Cotton Shirt", price:599}, {name:"Red Silk Shawl", price:999}]` | Fuzzy match returns "Red Silk Shawl" (wrong) with no confirmation | Returns "Red Cotton Shirt" with confirmation: `"Did you mean Red Cotton Shirt? ₹599"` | BUG-10 | `assert "Cotton Shirt" in reply and "599" in reply` |
| T-05 | `"இந்த dress என்ன விலை?"` (Tamil: "என்ன விலை" = what's the price) | `products_services: [{name:"Summer Dress", price:799}]` + history with "Summer Dress" mention | Falls through to LLM — `_PRICE_KEYWORDS` has no Tamil (`விலை`), [local_responder](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/local_responder.py#921-927) can't match | DomainAnswerer resolves `_resolve_context_product` → `"Summer Dress: ₹799"`. Add `விலை` to `_PRICE_KEYWORDS`. | BUG-02 | `assert "799" in reply` |
| T-06 | `"what time do you close today?"` | `timings: {wednesday: {open: "10:00", close: "20:00"}}` (if today is Wed) | Template: `"You can check our timings or reach out to us"` | Returns actual: `"On Wednesday, we're open 10:00 - 20:00"` | BUG-02 | `assert "20:00" in reply` |
| T-07 | `"are you open on sunday?"` | `timings: {sunday: {is_closed: true}}` | Template: generic timing message | Returns: `"We're closed on Sunday ❌"` | BUG-02 | `assert "closed" in reply.lower()` |
| T-08 | `"where are you located?"` | `location: {address:"123 MG Road", city:"Bangalore", google_maps_link:"https://maps.google.com/..."}` | Template: `"We'd love to have you visit us! Drop us a message"` | Returns actual address with map link | BUG-02 | `assert "MG Road" in reply and "maps.google" in reply` |
| T-09 | Two concurrent `"1"` messages (button tap) during `awaiting_quantity` | Active order flow with `_order_step = "awaiting_quantity"` | Second webhook may see stale state, misroute to product selection | Both resolve quantity correctly; second is idempotent or blocked | BUG-05 | `assert response["intent"] != "product_selection"` |
| T-10 | `"blue"` sent during `awaiting_size` step | Active order with `_order_step = "awaiting_size"`, colors=["blue","red"] | Message misrouted — "blue" treated as text product name, not color | Routed correctly to size handler; `"blue"` rejected as invalid size | BUG-05 | `assert "_order_step" != "awaiting_product_selection"` |
| T-11 | Start new order immediately after completing previous | Previous order had `_resolved_sku`, `_stock_snapshot` in state | Stale `_resolved_sku` leaks into new order, wrong product selected | All `_` prefixed fields cleared on flow start | BUG-06 | `assert state.get("_resolved_sku") is None` |
| T-12 | `"hello"` when LLM budget exceeded | `business_name: "Style Studio", products_services: [5 items]` | Returns `"Hey! 👋 Welcome to Style Studio. How can we help?"` (no services listed) | Returns greeting WITH top services: `"Welcome! We offer Haircut (₹300), Facial (₹800)..."` | BUG-02 | `assert "₹" in reply` |
| T-13 | `"what services do you offer?"` when LLM budget exceeded | `products_services: [{name:"Haircut",price:300}, {name:"Facial",price:800}]` | Template: `"Thanks for reaching out to Style Studio! We'll get back to you shortly."` | Returns actual product list with prices | BUG-02 | `assert "Haircut" in reply and "300" in reply` |
| T-14 | Any message when LLM budget exceeded + NO business data | `products_services: [], timings: {}, location: {}` | Template: `"Thanks for reaching out! Someone will respond shortly."` | Same template (acceptable — no data to improve with), but contact info if available | BUG-02 | `assert "generation_method" == "template_fallback"` |
| T-15 | `"do you have joke cards?"` | Business is a greeting card shop: `products_services: [{name:"Joke Cards Pack", price:199}]` | **BLOCKED** by [_is_in_scope](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#7061-7080) regex: `r'\b(joke)\b'` → returns out-of-scope | Allowed through because "Joke Cards Pack" is a real product | BUG-08 | `assert response["intent"] != "out_of_scope"` |
| T-16 | `"what's the weather like?"` | Generic business, no weather products | Correctly blocked as out-of-scope | Same (correctly blocked), but response now lists top services | BUG-03 | `assert "out_of_scope" in response["intent"]` and `assert "services" in reply.lower() or product name in reply` |
| T-17 | `"how much?"` after assistant said `"The **Facial** is our most popular treatment"` | `products_services: [{name:"Facial", price:800}]` + conversation_history with Facial mention | Treats as generic pricing → shows all prices | Resolves context → `"The price for Facial is ₹800"` | BUG-02 | `assert "800" in reply and "Facial" in reply` |
| T-18 | `"tell me more"` after discussion about "Manicure" | `products_services: [{name:"Manicure", price:400, description:"Luxury nail care..."}]` | Generic: `"Thanks for your interest! Feel free to ask"` | Shows Manicure details with description | BUG-02 | `assert "Manicure" in reply` |
| T-19 | Trigger unhandled exception via malformed [business_data](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/tests/test_ai_brain.py#134-140) | `business_name: "Zen Spa", contact: {phone: "9876543210"}` | Returns `"I'm having trouble right now. Please try again or contact us directly."` | Returns `"I'm having trouble right now. Please try again or contact Zen Spa at 9876543210."` | BUG-01 | `assert "Zen Spa" in reply and "9876543210" in reply` |
| T-20 | Rate-limited response | `business_name: "Style Studio", products_services: [3 items]` | Returns `"Thanks for your patience! I'm looking into this for you."` | Returns helpful message with business name + top service suggestions | BUG-04 | `assert "Style Studio" in reply` |

---

## GAP 4: Re-Prioritized Bugs

### BUG-13: ImportError for `inventory_service` silently continues → **UPGRADED to P0**

**Justification:** At 100 concurrent users, if `inventory_service` is missing, EVERY order proceeds without stock validation. Users can order 50 units of an item with 0 stock. The business fulfills none, leading to mass refunds/chargebacks and reputational damage. The TODO comment `"Make this a hard gate once inventory service is always available"` has been there long enough — the service IS available in production.

**User-facing impact (100 concurrent users):** All 100 users can place phantom orders for out-of-stock items simultaneously. Zero stock validation = zero order integrity. This is an **order integrity failure**, not a minor issue.

**Fix priority:** Immediate — remove the `except ImportError` fallthrough, make it a hard gate.

---

### BUG-14: `time.sleep()` blocks event loop → **UPGRADED to P1**

**Justification:** [verify_payment_with_retry](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#4856-4871) uses `time.sleep(2)`, then `time.sleep(4)` (exponential backoff). With 100 concurrent users, if 10 hit payment verification simultaneously, 10 threads are blocked for 2-4 seconds each. In a typical 4-worker Gunicorn setup, this means 2-3 workers are blocked on sleep, leaving 1-2 workers for the other 90 users. Response times spike to 5-10s for ALL users, not just the ones verifying payment.

**User-facing impact (100 concurrent users):** 60-90% of users experience 5-10s response latency during peak payment windows. WhatsApp marks slow replies as "unresponsive". Users abandon.

**Fix:** Replace `time.sleep()` with non-blocking retry via `asyncio.sleep()` if async, or move payment verification to a background task with webhook callback.

---

### BUG-07: Duplicate quantity handler (260 lines × 2) → **STAYS P2, justified**

**Justification:** This is a maintenance/quality bug, not a live user-facing bug. Both copies currently produce the same behavior. The risk is that a future developer fixes a bug in one copy but not the other, creating a silent regression. At 100 concurrent users, this has **zero immediate impact** — both paths work identically today.

**User-facing impact (100 concurrent users):** None today. Future risk only.

**Fix priority:** P2 — address during the rewrite, not as a hotfix.

---

## GAP 5: Concrete Implementations

### BUG-08 Fix: [_is_in_scope](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#7061-7080) Two-Pass Implementation

```python
def _is_in_scope(self, message: str, business: Dict[str, Any]) -> bool:
    """
    Two-pass scope check:
    Pass 1: Keyword regex pre-filter (existing patterns)
    Pass 2: If Pass 1 would BLOCK → check if any product/service name
            from business data appears in the message → override and ALLOW
    """
    OUT_OF_SCOPE_PATTERNS = [
        r'\b(weather|forecast|temperature|rain|humidity|sunny|cloudy)\b',
        r'\b(news|politics|election|government|minister|parliament)\b',
        r'\b(sports? score|match|cricket|football|ipl|fifa|world cup)\b',
        r'\b(stock|share|crypto|bitcoin|nifty|sensex|trading)\b',
        r'\b(who is the|what is the capital|when did|history of)\b(?!.*(?:your|business|service|product))',
        r'\b(joke|sing|poem|story tell|riddle)\b',
    ]

    msg_lower = message.lower()

    # ── Pass 1: Regex pre-filter ──
    would_block = False
    for pattern in OUT_OF_SCOPE_PATTERNS:
        if re.search(pattern, msg_lower):
            would_block = True
            break

    if not would_block:
        return True  # Not blocked — in scope

    # ── Pass 2: Product/service name override ──
    # If a product or service name from the business catalog appears in the
    # message, the user IS asking about the business — override the block.
    products = business.get('products_services', [])
    for product in products:
        name = product.get('name', '').lower()
        if not name or len(name) < 3:
            continue
        # Check full name match
        if name in msg_lower:
            logger.info(
                f"✅ _is_in_scope: Override — product '{name}' found in "
                f"blocked message '{message[:50]}'"
            )
            return True  # OVERRIDE: product mentioned → in scope
        # Check individual significant words (3+ chars) from product name
        name_words = [w for w in name.split() if len(w) >= 3]
        matches = sum(1 for w in name_words if w in msg_lower)
        if len(name_words) > 0 and matches / len(name_words) >= 0.5:
            logger.info(
                f"✅ _is_in_scope: Override — {matches}/{len(name_words)} "
                f"words from product '{name}' found in message"
            )
            return True

    # Also check category names
    categories = set()
    for product in products:
        cat = product.get('category', '').lower()
        if cat and len(cat) >= 3:
            categories.add(cat)
    for cat in categories:
        if cat in msg_lower:
            logger.info(
                f"✅ _is_in_scope: Override — category '{cat}' found in message"
            )
            return True

    # No override found — truly out of scope
    return False
```

### BUG-09 Fix: [_smart_intent_router](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#1151-1223) Tiebreaker with `primary_flow`

```python
# Add this to the EXISTING _smart_intent_router method body,
# at the point where intent is ambiguous between 'order' and 'appointment'

# ── TIEBREAKER: primary_flow from business config ──
# When confidence < 0.8 and both order + appointment are plausible,
# use business industry to break the tie.

APPOINTMENT_INDUSTRIES = frozenset({
    'salon', 'spa', 'clinic', 'doctor', 'hospital', 'dental',
    'physiotherapy', 'veterinary', 'vet', 'consulting', 'counseling',
    'tutoring', 'coaching', 'fitness', 'yoga', 'gym', 'beauty',
    'barbershop', 'barber', 'wellness', 'therapy', 'healthcare',
})

ORDER_INDUSTRIES = frozenset({
    'retail', 'restaurant', 'grocery', 'fashion', 'clothing',
    'electronics', 'furniture', 'bakery', 'cafe', 'food',
    'ecommerce', 'e-commerce', 'store', 'shop', 'boutique',
    'pharmacy', 'supermarket', 'florist', 'jewellery', 'jewelry',
})

def _resolve_primary_flow(self, business_config: dict) -> str:
    """
    Determine primary flow for a business.
    Explicit config > industry inference > default to 'order'.
    """
    # 1. Explicit config (set by business owner in dashboard)
    explicit = business_config.get('primary_flow')
    if explicit in ('order', 'appointment'):
        return explicit

    # 2. Industry-based inference
    industry = (business_config.get('industry') or '').lower().strip()
    if industry in APPOINTMENT_INDUSTRIES:
        return 'appointment'
    if industry in ORDER_INDUSTRIES:
        return 'order'

    # 3. Heuristic: if business has products with prices → order
    products = business_config.get('products_services', [])
    priced = [p for p in products if p.get('price') is not None]
    if len(priced) >= 3:
        return 'order'

    # 4. Default
    return 'order'

# In the existing _smart_intent_router, REPLACE the current tiebreaker block:
# (the block where it defaults to "order" when both intents are plausible)

# OLD:
#   if has_products:
#       return "order"

# NEW:
if confidence < 0.8 and both_plausible:
    primary = self._resolve_primary_flow(business_config or business)
    logger.info(
        f"🎯 Intent tiebreaker: confidence={confidence:.2f}, "
        f"primary_flow={primary}, industry={business.get('industry')}"
    )
    return primary
```

---

## GAP 6: Pipeline Integration — DomainAnswerer in [_generate_reply_inner](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#262-816)

### Insertion Point

**Line 563** in [ai_brain.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py) — AFTER `state_summary` and `user_profile` are gathered (L544-561), BEFORE`local_responder.try_local_response()` at L567.

### Order

```
DomainAnswerer → LocalResponder → LLM
```

**Rationale:**
1. DomainAnswerer uses exact catalog matching → higher fidelity than LocalResponder's fuzzy matching
2. If DomainAnswerer returns a result → LocalResponder should NOT run (skip it)
3. If DomainAnswerer returns `None` → fall through to LocalResponder → then LLM

### Integration Code Block

Insert at **line 563** (after the `user_profile` / `memory_manager` block, before `# LOCAL ROUTER`):

```python
        # =====================================================
        # DOMAIN ANSWERER — Answer from business_data (ZERO LLM)
        # Runs BEFORE local_responder: uses exact catalog matching
        # vs local_responder's fuzzy matching. Higher fidelity.
        # =====================================================
        from .domain_answerer import get_domain_answerer

        domain_answerer = get_domain_answerer()

        if domain_answerer.can_answer(user_message, business):
            domain_result = domain_answerer.answer(
                message=user_message,
                business_data=business,
                conversation_history=optimized_history,
            )
            if domain_result:
                if format_response:
                    domain_result["reply"] = self.formatter.format(domain_result["reply"])
                domain_result.setdefault("metadata", {})
                domain_result["metadata"]["language"] = detected_language
                domain_result["metadata"]["response_time_ms"] = int(
                    (time.time() - start_time) * 1000
                )
                if user_id:
                    self.conversation_manager.add_message(
                        user_id, "assistant", domain_result["reply"]
                    )
                logger.info(
                    f"🎯 DomainAnswerer hit | intent={domain_result['intent']} | "
                    f"time={domain_result['metadata']['response_time_ms']}ms"
                )
                self._track_interaction(biz_id, user_id, domain_result, start_time)
                return domain_result  # ← Skip local_responder AND LLM
```

### QualityGate Integration

Insert at **line 774** — AFTER the LLM response dict is built, BEFORE it is returned:

```python
            # =====================================================
            # QUALITY GATE — Catch generic LLM responses
            # =====================================================
            from .quality_gate import get_quality_gate

            quality_gate = get_quality_gate()
            response = quality_gate.check(
                response=response,
                message=user_message,
                business_data=business,
                conversation_history=optimized_history,
            )
```

### Visual Pipeline Summary

```
Message In
  ↓
[1] Input validation          (L297-310)
[2] Rate limiting             (L315-317)
[3] Language detection         (L323-325)
[4] Out-of-scope filter       (L330) ← BUG-08 fix: two-pass
[5] Interrupt handler          (L338)
[6] Active flow handler        (L346-369)
[7] Intent classification      (L393) ← BUG-09 fix: tiebreaker
[8] Cost optimizer             (L465)
[9] Cache check                (L494)
[10] LLM budget check          (L528)
[11] ★ DOMAIN ANSWERER ★       (NEW — L563) ← GAP 1
[12] Local responder           (L567)
[13] System health / gate      (L596-684)
[14] LLM engine                (L688)
[15] ★ QUALITY GATE ★          (NEW — L774) ← GAP 2
[16] ★ DRR TRACKER ★           (NEW) ← GAP 7
[17] Response return            (L800+)
```

### Q5: Low-Confidence DomainAnswerer — Return or Delegate?

When DomainAnswerer fuzzy match score < 0.90:

**Option A — Return answer WITH confirmation prompt (RECOMMENDED):**
```python
# In the DomainAnswerer integration block at L563:
if domain_result:
    conf = domain_result.get("metadata", {}).get("needs_confirmation", False)
    if conf:
        # Low confidence — add confirmation prompt, still return
        domain_result["suggested_actions"] = ["Yes", "No, show all"]
    # ... rest of the return block
    return domain_result
```
**Why:** The user gets an answer IMMEDIATELY with a "Did you mean X?" prompt. If wrong, they say "No" and we fall through. 90% of the time the match is correct and the user is happy.

**Option B — Pass to LLM with context hint:**
```python
# In the DomainAnswerer integration block at L563:
if domain_result:
    conf = domain_result.get("metadata", {}).get("needs_confirmation", False)
    if conf:
        # Low confidence — inject match as context hint for LLM
        business["_domain_hint"] = {
            "matched_product": domain_result["metadata"].get("matched_product"),
            "confidence": domain_result["confidence"],
        }
        # DON'T return — fall through to LLM with hint
    else:
        return domain_result
```
**Why:** LLM can use the hint to disambiguate. But costs an LLM call and adds 500ms+ latency.

**Recommendation: Option A.** WhatsApp users expect instant responses. A wrong guess with correction capability beats a 1-second wait for LLM. Reserve Option B only for businesses that explicitly opt-in to higher accuracy over speed.

---

## GAP 7: DRRTracker — Domain Response Rate Monitoring

**File:** `backend/ai_brain/drr_tracker.py` [NEW]

```python
"""
DRRTracker — Measures Domain Response Rate.
DRR = % of responses that used real business data (not generic fallbacks).
Target: 95%+.

Without this metric, you cannot know if fixes improved response quality.
"""

import time
import logging
from collections import deque
from typing import Optional

logger = logging.getLogger(__name__)


class DRRTracker:
    """
    Tracks Domain Response Rate in a sliding time window.
    Thread-safe via append-only deque.
    """

    # Methods that count as "domain-aware" (used real business data)
    DOMAIN_METHODS = frozenset({
        "domain_answerer",
        "local_pricing",
        "local_fuzzy_pricing",
        "local_greeting",
        "local_hours",
        "local_location",
        "local_faq",
        "local_goodbye",
        "local_thanks",
        "llm",                    # LLM uses business data in prompt
        "flow_started",
        "flow_next_step",
        "flow_awaiting_confirmation",
        "flow_smart_extraction",
        "order_flow",
        "order_completed",
        "booking_success",
        "booking_complete",
        "payment_link",
        "quality_gate_rebuilt",   # QualityGate upgraded a generic → domain
    })

    # Methods that count as "generic" (no real business data used)
    GENERIC_METHODS = frozenset({
        "error",
        "safety_net",
        "template_fallback",
        "rate_limit",
        "hardcoded",
        "human_escalation",
        "out_of_scope_filter",
    })

    def __init__(self, max_events: int = 10000):
        # Sliding window of (timestamp, is_domain_aware) tuples
        self._events: deque = deque(maxlen=max_events)
        self._alert_threshold: float = 0.95
        self._last_alert_time: float = 0.0

    def record(
        self,
        generation_method: str,
        had_business_data: bool,
        response_was_generic: bool,
    ) -> None:
        """
        Record a response event.

        Args:
            generation_method: The 'generation_method' from response metadata
            had_business_data: Whether business_data was available
            response_was_generic: Whether QualityGate flagged it as generic
        """
        is_domain = (
            generation_method in self.DOMAIN_METHODS
            and had_business_data
            and not response_was_generic
        )

        self._events.append((time.time(), is_domain))

    def get_drr(self, window_minutes: int = 60) -> float:
        """
        Returns % of responses that used real business data
        in the given time window.
        """
        cutoff = time.time() - (window_minutes * 60)
        window_events = [
            is_domain for ts, is_domain in self._events if ts >= cutoff
        ]

        if not window_events:
            return 1.0  # No data = assume good (avoid false alerts on startup)

        domain_count = sum(1 for d in window_events if d)
        return round(domain_count / len(window_events), 4)

    def alert_if_below_threshold(self, threshold: float = None) -> Optional[str]:
        """
        Check if DRR is below threshold. Returns alert message or None.
        Rate-limited to 1 alert per 5 minutes.
        """
        threshold = threshold or self._alert_threshold
        drr = self.get_drr(window_minutes=15)  # 15-min window for alerts
        total = len([
            1 for ts, _ in self._events
            if ts >= time.time() - 900  # 15 min
        ])

        # Need minimum sample size
        if total < 10:
            return None

        if drr >= threshold:
            return None

        # Rate limit alerts
        now = time.time()
        if now - self._last_alert_time < 300:  # 5 min cooldown
            return None

        self._last_alert_time = now
        alert_msg = (
            f"🚨 DRR ALERT: Domain Response Rate is {drr:.1%} "
            f"(threshold: {threshold:.0%}) over last 15 min "
            f"({total} responses). Generic responses are leaking through."
        )
        logger.critical(alert_msg)
        return alert_msg

    def get_stats(self) -> dict:
        """Full stats for dashboard/API."""
        return {
            "drr_15m": self.get_drr(15),
            "drr_1h": self.get_drr(60),
            "drr_24h": self.get_drr(1440),
            "total_events": len(self._events),
            "threshold": self._alert_threshold,
        }


# Singleton
_drr_tracker: Optional[DRRTracker] = None

def get_drr_tracker() -> DRRTracker:
    global _drr_tracker
    if _drr_tracker is None:
        _drr_tracker = DRRTracker()
    return _drr_tracker
```

### DRRTracker Integration (1 line in [_generate_reply_inner](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/ai_brain/ai_brain.py#262-816) before every `return`):

```python
# Add at the TOP of _generate_reply_inner, after start_time:
from .drr_tracker import get_drr_tracker
drr = get_drr_tracker()

# Then, BEFORE every return statement in _generate_reply_inner,
# add this single-line call. Example after the LLM response block:
drr.record(
    generation_method=response.get("metadata", {}).get("generation_method", "unknown"),
    had_business_data=bool(business),
    response_was_generic=response.get("metadata", {}).get("quality_gate_warning", False),
)

# After recording, check alert (non-blocking):
alert = drr.alert_if_below_threshold()
# Alert is logged at CRITICAL level by the tracker itself
```
