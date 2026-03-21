"""
DomainAnswerer — FAANG-grade zero-LLM response engine.

Answers user queries directly from business_data WITHOUT calling LLM.
Handles 40-60% of all queries for a typical business: pricing, hours,
location, FAQs, product info, policies.

INVARIANTS:
- NEVER return "contact us for pricing" if prices exist in business_data
- NEVER return "our team will respond" if data exists
- Return None if cannot give a SPECIFIC answer (caller falls through to LLM)
- Use conversation_history to resolve contextual references ("it", "that", "how much?")
- query_pricing MUST check conversation_history before answering generically

Architecture:
    Message → can_answer() → answer() → query_*() → _build_response()
                                  ↕
                    _resolve_context_product(history)
"""

import re
import logging
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# FUZZY MATCHING ENGINE
# ═══════════════════════════════════════════════════════════════════

def _fuzzy_score(query: str, target: str) -> float:
    """
    Token-overlap ratio with substring boosting.
    
    Scoring strategy:
      1. Jaccard similarity on word tokens (baseline)
      2. Substring containment boost (handles "red kurta" in "Red Silk Kurta")
      3. Sequence bonus for consecutive matching words
    
    Returns 0.0-1.0 where ≥0.90 = high confidence, 0.55-0.89 = needs confirmation.
    """
    if not query or not target:
        return 0.0

    q_lower = query.lower().strip()
    t_lower = target.lower().strip()

    # Exact match → perfect score
    if q_lower == t_lower:
        return 1.0

    q_tokens = set(q_lower.split())
    t_tokens = set(t_lower.split())

    if not q_tokens or not t_tokens:
        return 0.0

    # ── Jaccard baseline ──
    overlap = len(q_tokens & t_tokens)
    union = len(q_tokens | t_tokens)
    jaccard = overlap / union if union else 0.0

    # ── Substring containment boost ──
    # "red kurta" in "Red Silk Kurta" → high confidence
    if q_lower in t_lower:
        jaccard = max(jaccard, 0.88)
    elif t_lower in q_lower:
        jaccard = max(jaccard, 0.78)

    # ── Sequence bonus: consecutive matching words ──
    # "haircut men" should score higher against "Haircut - Men" than separate matches
    q_words = q_lower.split()
    t_joined = ' '.join(t_lower.split())  # normalize whitespace
    consecutive = 0
    for i in range(len(q_words)):
        partial = ' '.join(q_words[i:])
        if partial in t_joined:
            consecutive = max(consecutive, len(q_words) - i)
            break
    if consecutive >= 2:
        seq_bonus = min(0.15, consecutive * 0.05)
        jaccard = min(1.0, jaccard + seq_bonus)

    return round(jaccard, 3)


# ═══════════════════════════════════════════════════════════════════
# STOP WORDS & KEYWORD SETS (multilingual: EN, HI, TA, BN, GU)
# ═══════════════════════════════════════════════════════════════════

_PRICE_STOP_WORDS = frozenset({
    # English
    'price', 'prices', 'cost', 'rate', 'rates', 'how', 'much', 'what', 'is',
    'the', 'of', 'for', 'a', 'an', 'show', 'me', 'tell', 'about', 'give',
    'please', 'plz', 'pls', 'check', 'get', 'i', 'want', 'need', 'can',
    'you', 'your', 'do', 'does', 'will',
    # Hindi
    'ka', 'ki', 'ke', 'batao', 'bata', 'kitna', 'kimat', 'kya', 'hai', 'hain',
    # Tamil
    'என்ன', 'விலை', 'எவ்வளவு',
    # Bengali
    'dam', 'koto',
    # Gujarati
    'bhav', 'che', 'shu',
})

_PRICE_KEYWORDS = frozenset({
    # English
    'price', 'prices', 'pricing', 'cost', 'rate', 'rates', 'how much',
    'price list', 'menu', 'tariff', 'charge', 'charges', 'fees',
    # Hindi
    'kitna', 'kimat', 'rate batao', 'kitna price', 'kya price',
    'kitna hai', 'kitne ka', 'kitne ki',
    # Tamil
    'விலை', 'எவ்வளவு', 'என்ன விலை',
    # Bengali
    'dam koto', 'koto', 'dam',
    # Gujarati
    'bhav', 'bhav shu che',
})

_HOURS_KEYWORDS = frozenset({
    'timing', 'timings', 'hours', 'open', 'close', 'closed', 'working hours',
    'business hours', 'schedule', 'available', 'when',
    # Hindi
    'kab', 'band', 'khula', 'samay', 'waqt',
    # Tamil
    'நேரம்', 'எப்போது',
})

_LOCATION_KEYWORDS = frozenset({
    'location', 'address', 'where', 'directions', 'map', 'route',
    'visit', 'reach', 'find you', 'situated', 'located', 'branch',
    # Hindi
    'kahan', 'jagah', 'pata',
    # Tamil
    'எங்கே', 'இடம்',
})

_PRODUCT_INFO_KEYWORDS = frozenset({
    'tell me about', 'details', 'describe', 'info', 'information',
    'what is', 'show me', 'features', 'specs', 'specification',
    'sizes', 'colors', 'variants', 'available', 'options',
})

# ═══════════════════════════════════════════════════════════════════
# BUSINESS INFO / DOMAIN KEYWORDS — "What do you sell?", "What is
# your domain?", etc.  Covers EN, HI, TA, KA, TE, ML, BN, GU, MR
# ═══════════════════════════════════════════════════════════════════

_BUSINESS_INFO_KEYWORDS = frozenset({
    # ── English ──
    'sell', 'selling', 'deal', 'deals', 'domain',
    'what do you', 'do you sell', 'what you sell', 'what all do you',
    'your products', 'your services', 'catalog', 'catalogue',
    'what all', 'offerings', 'specialize', 'specialise',
    'offer', 'collection', 'what do you do', 'about your business',
    'tell me about your', 'what are your', 'what can you',
    'what does your', 'about your shop', 'about your store',
    'what u sell', 'what r u selling', 'wat u sell',
    # ── Hindi / Hinglish ──
    'kya bechte', 'kya milta', 'kya karte', 'aap kya',
    'kya hai aapka', 'kya milta hai', 'kya bechte ho',
    'aapka business kya', 'aap kya karte', 'kya service dete',
    'aapke yahan kya', 'aapke paas kya',
    # ── Tamil (Tanglish) ──
    'enna sell', 'ena sell', 'enna panreenga', 'ena panreenga',
    'enna business', 'ena business', 'enna vechurukenga',
    'ena vechurukenga', 'enna vitpeenga', 'ena vitpeenga',
    'enna podreenga', 'ena podreenga', 'enna iruku', 'ena iruku',
    'enna viyabaaram', 'ena viyabaaram', 'enna category',
    'unga domain', 'unga kadai enna', 'unga shop enna',
    'enna elaam iruku', 'ena elaam iruku', 'enna items',
    'neenga enna sell', 'neenga ena sell',
    'niga enna sell', 'niga ena sell',  # colloquial Tamil
    # ── Kannada ──
    'enu maartirri', 'enu business', 'enu sell',
    'enu kodi', 'nim business enu', 'enu deal',
    # ── Telugu ──
    'emi ammutharu', 'emi chestharu', 'meeru emi',
    'emi sell chestharu', 'mee business enti',
    # ── Malayalam ──
    'enthaanu vilkkunnath', 'enthaanu business',
    'enth sell cheyyunnu', 'ningal enthanu',
    # ── Bengali ──
    'ki becho', 'ki koro', 'tomar business ki', 'ki sell koro',
    # ── Gujarati ──
    'su veche', 'su sell karo', 'tamaru business su',
    # ── Marathi ──
    'kay vikta', 'kay sell karta', 'tumcha business kay',
    # ── Punjabi ──
    'ki vechde', 'ki sell karde', 'tuhadda business ki',
})


class DomainAnswerer:
    """
    FAANG-grade zero-LLM response engine.
    
    Answers user queries directly from business_data WITHOUT calling LLM.
    Should handle 40-60% of all queries for a typical business.
    
    Pipeline position: BEFORE LocalResponder, AFTER intent classification.
    Uses exact catalog matching (vs LocalResponder's fuzzy matching).
    """

    # ─── PUBLIC API ────────────────────────────────────────────────

    def can_answer(self, message: str, business_data: dict) -> bool:
        """
        Returns True if business_data has enough info to answer WITHOUT LLM.
        Checks: products, timings, location, faqs, policies, contact.
        
        This is a cheap pre-check (no fuzzy matching) — answer() does the real work.
        """
        msg = message.lower().strip()

        # Price queries — answerable if products with prices exist
        if any(kw in msg for kw in _PRICE_KEYWORDS):
            products = business_data.get('products_services', [])
            if any(p.get('price') is not None for p in products):
                return True

        # Hours queries
        if any(kw in msg for kw in _HOURS_KEYWORDS):
            timings = business_data.get('timings', {})
            if timings and any(isinstance(timings.get(d), dict) for d in
                               ['monday', 'tuesday', 'wednesday', 'thursday',
                                'friday', 'saturday', 'sunday']):
                return True

        # Location queries
        if any(kw in msg for kw in _LOCATION_KEYWORDS):
            loc = business_data.get('location', {})
            if loc.get('address') or loc.get('google_maps_link'):
                return True

        # Business info / domain queries ("what do you sell?", "your domain?")
        if any(kw in msg for kw in _BUSINESS_INFO_KEYWORDS):
            products = business_data.get('products_services', [])
            if (products or business_data.get('description')
                    or business_data.get('industry')):
                return True

        # FAQ queries
        faqs = business_data.get('faqs', [])
        if faqs and self.query_faqs(msg, business_data):
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
        
        Returns None if no specific answer can be built — caller falls through to LLM.
        
        Response priority:
          1. Pricing (most common query type)
          2. Hours
          3. Location
          4. FAQs
          5. Product info
        """
        msg = message.lower().strip()

        # Resolve context product from history for follow-up queries
        context_product = self._resolve_context_product(conversation_history)

        # ── 1. Pricing ──
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

        # ── 2. Hours ──
        if any(kw in msg for kw in _HOURS_KEYWORDS):
            hours_reply = self.query_hours(msg, business_data)
            if hours_reply:
                return self._build_response(reply=hours_reply, intent="hours")

        # ── 3. Location ──
        if any(kw in msg for kw in _LOCATION_KEYWORDS):
            loc_reply = self.query_location(msg, business_data)
            if loc_reply:
                return self._build_response(reply=loc_reply, intent="location")

        # ── 4. FAQs (catch-all for non-keyword queries) ──
        faq_reply = self.query_faqs(msg, business_data)
        if faq_reply:
            return self._build_response(
                reply=faq_reply['text'],
                intent="faq_match",
                confidence=faq_reply.get('confidence', 0.80),
            )

        # ── 5. Business info / domain queries ──
        # "What do you sell?", "What is your domain?", "niga ena sell panurega"
        if any(kw in msg for kw in _BUSINESS_INFO_KEYWORDS):
            biz_reply = self.query_business_info(msg, business_data)
            if biz_reply:
                return self._build_response(
                    reply=biz_reply['text'],
                    intent="general_enquiry",
                    confidence=biz_reply.get('confidence', 0.90),
                )

        # ── 6. Product info (non-price: "tell me about the red kurta") ──
        product_result = self.query_products(msg, business_data)
        if product_result:
            return self._build_response(
                reply=product_result['text'],
                intent="product_info",
                confidence=product_result.get('confidence', 0.85),
                needs_confirmation=product_result.get('needs_confirmation', False),
                matched_product=product_result.get('matched_product'),
            )

        # Cannot answer specifically → None (fall through to LLM)
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

        # Strip noise to get product query
        query_words = [w for w in message.lower().split()
                       if w not in _PRICE_STOP_WORDS and len(w) > 1]
        product_query = ' '.join(query_words).strip()
        if not product_query or len(product_query) < 2:
            return None

        # Score every product
        scored: List[Tuple[dict, float]] = []
        for p in products:
            name = p.get('name', '')
            name_score = _fuzzy_score(product_query, name)
            # Also check category (weighted lower)
            cat_score = _fuzzy_score(product_query, p.get('category', '')) * 0.8
            best = max(name_score, cat_score)
            if best >= 0.40:
                scored.append((p, best))

        scored.sort(key=lambda x: x[1], reverse=True)

        if not scored:
            return None

        biz_name = business_data.get('business_name', 'our business')
        top_product, top_score = scored[0]

        # HIGH confidence — single definitive match
        if top_score >= 0.90:
            return self._format_product_detail(top_product, biz_name, top_score)

        # MEDIUM confidence — return with confirmation prompt
        if top_score >= 0.55:
            result = self._format_product_detail(top_product, biz_name, top_score)
            result['needs_confirmation'] = True
            result['text'] = (
                f"Did you mean **{top_product.get('name', '')}**?\n\n"
                + result['text']
            )
            return result

        # LOW confidence — list top matches if multiple
        if len(scored) >= 2:
            lines = [f"Here's what I found at {biz_name}:\n"]
            for p, s in scored[:5]:
                price = p.get('price')
                price_str = f" — ₹{price}" if price else ""
                lines.append(f"• {p.get('name', '')}{price_str}")
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
        Extract relevant pricing from business_data.
        
        Resolution order:
          1. Extract product name from message text
          2. If bare query ("price?", "kitna?") → resolve from conversation context
          3. If no context → return full price list
          4. Fuzzy match against catalog
          5. Score ≥ 0.90 → definitive answer
          6. Score 0.55-0.89 → answer WITH confirmation prompt
          7. Score < 0.55 → full price list
        """
        products = business_data.get('products_services', [])
        if not products:
            return None

        priced = [p for p in products if p.get('price') is not None]
        if not priced:
            return None

        biz_name = business_data.get('business_name', 'our business')

        # ── Step 1: Extract product name from message ──
        query_words = [w for w in message.lower().split()
                       if w not in _PRICE_STOP_WORDS and len(w) > 1]
        product_query = ' '.join(query_words).strip()

        # ── Step 2: Bare query → resolve from conversation context ──
        if not product_query or len(product_query) < 2:
            if context_product:
                product_query = context_product
                logger.info(
                    f"🧠 DomainAnswerer: Resolved context product → "
                    f"'{context_product}'"
                )
            else:
                # Generic price list (no specific product, no context)
                return self._format_price_list(priced, biz_name)

        # ── Step 3: Fuzzy match against catalog ──
        scored: List[Tuple[dict, float]] = []
        for p in priced:
            name = p.get('name', '')
            score = _fuzzy_score(product_query, name)
            if score >= 0.40:
                scored.append((p, score))

        scored.sort(key=lambda x: x[1], reverse=True)

        if not scored:
            return self._format_price_list(priced, biz_name)

        top_product, top_score = scored[0]

        # HIGH confidence
        if top_score >= 0.90:
            return self._format_single_price(top_product, top_score)

        # MEDIUM confidence — with confirmation
        if top_score >= 0.55:
            p = top_product
            price_str = f"₹{p.get('price')}"
            reply = (
                f"Did you mean **{p.get('name')}**? "
                f"It's priced at {price_str}.\n\n"
                "Let me know if you meant something else! 😊"
            )
            return {
                'text': reply,
                'confidence': round(top_score, 2),
                'needs_confirmation': True,
                'matched_product': p.get('name'),
            }

        # LOW confidence — full list
        return self._format_price_list(priced, biz_name)

    def query_hours(self, message: str, business_data: dict) -> Optional[str]:
        """
        Format and return actual business hours.
        Handles: specific day queries, "today", "tomorrow", "aaj", "kal",
        and full schedule display.
        """
        timings = business_data.get('timings', {})
        if not timings:
            return None

        biz_name = business_data.get('business_name', 'our business')
        days = [
            'monday', 'tuesday', 'wednesday', 'thursday',
            'friday', 'saturday', 'sunday'
        ]

        msg_lower = message.lower()

        # ── Check for specific day ──
        specific_day = None
        for day in days:
            if day in msg_lower or day[:3] in msg_lower:
                specific_day = day
                break

        # Today / tomorrow (multilingual)
        if any(w in msg_lower for w in ('today', 'aaj', 'இன்று')):
            from datetime import date
            specific_day = date.today().strftime('%A').lower()
        elif any(w in msg_lower for w in ('tomorrow', 'kal', 'நாளை')):
            from datetime import date, timedelta
            specific_day = (date.today() + timedelta(days=1)).strftime('%A').lower()

        if specific_day:
            timing = timings.get(specific_day, {})
            if isinstance(timing, dict):
                if timing.get('is_closed'):
                    return (
                        f"We're **closed** on {specific_day.capitalize()} ❌\n\n"
                        f"Feel free to check our other timings! 📅"
                    )
                elif timing.get('open') and timing.get('close'):
                    return (
                        f"On {specific_day.capitalize()}, {biz_name} is open "
                        f"from **{timing['open']}** to **{timing['close']}** 🕐"
                    )

        # ── Full schedule ──
        lines = [f"Here are our hours at {biz_name}! 🕐\n"]
        has_any = False
        for day in days:
            timing = timings.get(day, {})
            if isinstance(timing, dict):
                if timing.get('is_closed'):
                    has_any = True
                    lines.append(f"• {day.capitalize()}: Closed ❌")
                elif timing.get('open') and timing.get('close'):
                    has_any = True
                    lines.append(
                        f"• {day.capitalize()}: "
                        f"{timing['open']} - {timing['close']}"
                    )

        special = timings.get('special_notes')
        if special:
            lines.append(f"\n📌 {special}")

        if not has_any:
            return None

        lines.append("\nAnything else I can help with? 😊")
        return '\n'.join(lines)

    def query_location(self, message: str, business_data: dict) -> Optional[str]:
        """Return formatted address + google_maps_link if available."""
        location = business_data.get('location', {})
        if not location:
            return None

        biz_name = business_data.get('business_name', 'our business')
        parts = [f"📍 **{biz_name} Location:**\n"]

        has_content = False

        if location.get('address'):
            parts.append(location['address'])
            has_content = True

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
            has_content = True

        if location.get('landmarks'):
            landmarks = location['landmarks']
            if isinstance(landmarks, list):
                parts.append(f"\n🏷️ Landmarks: {', '.join(landmarks)}")
            else:
                parts.append(f"\n🏷️ Landmarks: {landmarks}")
            has_content = True

        if location.get('google_maps_link'):
            parts.append(f"\n🗺️ Google Maps: {location['google_maps_link']}")
            has_content = True

        if not has_content:
            return None

        parts.append("\nLooking forward to seeing you! 😊")
        return '\n'.join(parts)

    def query_faqs(self, message: str, business_data: dict) -> Optional[dict]:
        """
        Search FAQs for relevant answer using keyword overlap scoring.
        Uses Jaccard similarity with a 0.35 threshold.
        """
        faqs = business_data.get('faqs', [])
        if not faqs:
            return None

        msg_words = set(message.lower().split())
        # Remove very common words for better matching
        noise = {'i', 'a', 'an', 'the', 'is', 'do', 'does', 'can', 'you', 'your', 'how'}
        msg_words -= noise

        if not msg_words:
            return None

        best_match = None
        best_score = 0.0

        for faq in faqs:
            question = faq.get('question', '').lower()
            q_words = set(question.split()) - noise
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

    # ─── BUSINESS INFO QUERY ─────────────────────────────────────────

    def query_business_info(
        self, message: str, business_data: dict
    ) -> Optional[dict]:
        """
        Answer 'what do you sell / what is your domain / tell me about
        your business' directly from business_data.

        Produces SHORT, NATURAL, CONVERSATIONAL replies — like a real
        AI assistant talking. No templates, no markdown, no bullet lists.
        """
        biz_name = business_data.get('business_name', 'our business')
        industry = business_data.get('industry', '')
        description = business_data.get('description', '')
        products = business_data.get('products_services', [])

        # Must have SOMETHING to say
        if not products and not description and not industry:
            return None

        # Build a short, natural reply
        parts = []

        # Opening — keep it casual and brief
        if description:
            parts.append(f"{biz_name} — {description}.")
        elif industry:
            parts.append(f"We're {biz_name}, a {industry} business.")
        else:
            parts.append(f"Hey! This is {biz_name}.")

        # Mention products naturally — just names, no formatting
        if products:
            names = [p.get('name', '') for p in products[:5] if p.get('name')]
            remaining = len(products) - 5
            if names:
                product_list = ', '.join(names)
                if remaining > 0:
                    product_list += f" and {remaining} more"
                parts.append(f"We have {product_list}.")

        # Simple CTA
        parts.append("What would you like to know?")

        return {
            'text': ' '.join(parts),
            'confidence': 0.92,
        }

    # ─── CONTEXT RESOLUTION (Conversation Continuity) ──────────────

    def _resolve_context_product(
        self, conversation_history: list
    ) -> Optional[str]:
        """
        Scan last 3 message pairs for a product that was discussed.
        
        Enables conversational continuity:
          User: "tell me about the red kurta"
          Bot: "Red Silk Kurta is priced at ₹1299..."
          User: "how much?"  ← bare query
          → Resolves to "Red Silk Kurta" from history
        
        Pattern matching priority:
          1. Bold product names in assistant replies (**Product**)
          2. "price for X" patterns
          3. "about X" patterns  
          4. "show/see/view X" patterns
        """
        if not conversation_history:
            return None

        # Look at last 6 messages (3 pairs) in reverse
        recent = conversation_history[-6:]

        # Patterns that indicate a product was discussed
        product_patterns = [
            r'price for \*\*(.+?)\*\*',           # "The price for **Haircut** is ₹300"
            r'about (?:the |our )?(.+?)[\.\?!\n]', # "tell me about the red kurta."
            r'(?:show|see|view)\s+(.+?)[\.\?!]?$', # "show me red kurta"
            r'interested in\s+(.+?)[\.\?!]?$',     # "interested in red kurta"
            r'\*\*(.+?)\*\*',                       # Any bold product name in bot reply
        ]

        for msg in reversed(recent):
            content = msg.get('content', '') if isinstance(msg, dict) else str(msg)
            for pattern in product_patterns:
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    product_name = match.group(1).strip()
                    # Filter out non-product strings
                    skip = {
                        'our', 'your', 'the', 'a', 'an', 'this', 'that', 'it',
                        'here', 'welcome', 'hello', 'hi', 'location', 'hours',
                    }
                    if product_name.lower() not in skip and len(product_name) > 2:
                        logger.info(
                            f"🧠 Context resolved product: '{product_name}' "
                            f"from history"
                        )
                        return product_name

        return None

    # ─── PRIVATE HELPERS ───────────────────────────────────────────

    def _format_product_detail(
        self, product: dict, biz_name: str, score: float
    ) -> dict:
        """Format a single product's full details."""
        name = product.get('name', '')
        price = product.get('price')
        category = product.get('category', '')
        desc = product.get('description', '')

        lines = [f"**{name}**"]
        if price is not None:
            lines.append(f"💰 Price: ₹{price}")
        if category:
            lines.append(f"📂 Category: {category}")
        if desc:
            # Truncate long descriptions but keep them meaningful
            truncated = desc[:200] + ('...' if len(desc) > 200 else '')
            lines.append(f"\n{truncated}")
        lines.append("\nWould you like to order or know more? 😊")

        return {
            'text': '\n'.join(lines),
            'confidence': round(score, 2),
            'matched_product': name,
            'needs_confirmation': False,
        }

    def _format_single_price(self, product: dict, score: float) -> dict:
        """Format a single high-confidence price response."""
        name = product.get('name', '')
        price = product.get('price')
        price_str = f"₹{price}"
        desc = product.get('description', '')

        reply = f"The price for **{name}** is {price_str}"
        if desc:
            reply += f"\n{desc[:120]}"
        reply += "\n\nWould you like to order or know more? 😊"

        return {
            'text': reply,
            'confidence': round(score, 2),
            'matched_product': name,
        }

    def _format_price_list(self, priced: list, biz_name: str) -> dict:
        """Format a full price list from available products."""
        lines = [f"Here are our prices at {biz_name}! 💰\n"]
        for p in priced[:10]:
            name = p.get('name', '')
            price = p.get('price')
            category = p.get('category', '')
            price_str = f"₹{price}" if price is not None else "Price on request"
            line = f"• {name}: {price_str}"
            if category:
                line += f" ({category})"
            lines.append(line)

        if len(priced) > 10:
            lines.append(f"\n...and {len(priced) - 10} more items!")
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
        """Build standardized response dict (same schema as AIBrain)."""
        response = {
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
        # Add confirmation buttons for low-confidence matches
        if needs_confirmation:
            response["suggested_actions"] = ["Yes", "No, show all"]
        return response


# ═══════════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════════

_domain_answerer: Optional[DomainAnswerer] = None


def get_domain_answerer() -> DomainAnswerer:
    """Get the DomainAnswerer singleton."""
    global _domain_answerer
    if _domain_answerer is None:
        _domain_answerer = DomainAnswerer()
    return _domain_answerer
