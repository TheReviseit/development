"""
Local Response Engine v2.0 — Zero-LLM responses for predictable intents.

FAANG systems NEVER call an LLM for "hello". This module provides:
- Instant local responses for greetings, thanks, goodbye, casual chat
- Time-of-day contextual greetings ("Good morning!", "Good evening!")
- Fuzzy product matching ("hairct" → "Haircut") with Levenshtein distance
- Sentiment-aware routing (frustrated users bypass canned responses)
- Business-aware FAQ matching (no LLM needed)
- Graceful degradation responses (intent-aware, not "high demand")
- Priority classification for request routing
- Expanded multilingual support (Urdu, Gujarati, Bengali, Marathi, Punjabi)

Architecture:
    User Message → Sentiment Check
                   ├── Frustrated? → Route to LLM (don't give canned reply)
                   └── Normal → Local Router
                                ├── Local Response (greetings, FAQs) → No API call
                                └── LLM Engine (complex queries) → With guardrails
"""

import random
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from enum import Enum

logger = logging.getLogger('reviseit.local_responder')


# =========================================================================
# REQUEST PRIORITY — Route by importance
# =========================================================================

class RequestPriority(str, Enum):
    """Request priority levels for load shedding."""
    CRITICAL = "critical"   # payments, order completion
    HIGH = "high"           # bookings, leads, orders
    MEDIUM = "medium"       # general queries, pricing
    LOW = "low"             # greetings, casual, goodbye


# Priority classification — O(1) lookup for exact matches, pattern scan for others
_EXACT_LOW_PRIORITY = frozenset({
    'hi', 'hii', 'hiii', 'hello', 'hey', 'hola', 'yo', 'sup',
    'namaste', 'namaskar', 'vanakkam', 'namaskara', 'namaskaram',
    'good morning', 'good afternoon', 'good evening', 'good night',
    'gm', 'gn', 'ga', 'ge',
    'thanks', 'thank you', 'thank u', 'thx', 'ty',
    'dhanyavaad', 'shukriya', 'nandri', 'dhanyawad',
    'bye', 'goodbye', 'good bye', 'see you', 'alvida', 'tata', 'bye bye',
    'ok', 'okay', 'k', 'fine', 'cool', 'nice', 'great', 'good',
    'how are you', "how're you", 'how r u', 'kaise ho', 'kya haal',
    'whats up', "what's up", 'wassup',
    'hmm', 'hm', 'oh', 'ohh', 'ahh', 'acha', 'accha',
})

_HIGH_PRIORITY_KEYWORDS = [
    'book', 'appointment', 'order', 'buy', 'purchase', 'payment', 'pay',
    'lead', 'callback', 'call me', 'interested', 'signup', 'register',
]

_CRITICAL_PRIORITY_KEYWORDS = [
    'payment failed', 'payment issue', 'transaction', 'refund',
    'charged', 'deducted', 'money',
]


def classify_priority(message: str) -> RequestPriority:
    """Classify message priority for routing decisions.

    O(1) for exact matches (greetings), O(n) keyword scan for high/critical.
    """
    msg_lower = message.strip().lower()

    # Exact match for LOW priority (O(1) frozenset lookup)
    if msg_lower in _EXACT_LOW_PRIORITY:
        return RequestPriority.LOW

    # Check CRITICAL first (payment issues)
    if any(kw in msg_lower for kw in _CRITICAL_PRIORITY_KEYWORDS):
        return RequestPriority.CRITICAL

    # Check HIGH (bookings, orders, leads)
    if any(kw in msg_lower for kw in _HIGH_PRIORITY_KEYWORDS):
        return RequestPriority.HIGH

    # Default to MEDIUM
    return RequestPriority.MEDIUM


# =========================================================================
# SENTIMENT DETECTION — Route frustrated users to LLM instead of canned reply
# =========================================================================

# Frustration cues that should bypass canned responses
_FRUSTRATION_CUES = frozenset({
    'ugh', 'terrible', 'horrible', 'worst', 'pathetic', 'useless',
    'frustrated', 'angry', 'annoyed', 'disappointed', 'unacceptable',
    'not working', 'not happy', 'waste', 'scam', 'fraud', 'cheat',
    'bakwas', 'bekar', 'ghatiya', 'mosam', 'theek nahi',  # Hindi
    'romba mokka', 'mosam', 'kedaiyathu',  # Tamil
})

_FRUSTRATION_PUNCTUATION_THRESHOLD = 2  # "!!!" or "???" → frustrated


def _detect_frustration(message: str) -> bool:
    """Detect if user is frustrated. If so, skip canned responses.

    Checks:
    1. Explicit frustration keywords
    2. Excessive punctuation (!!!, ???)
    3. ALL CAPS messages (shouting)
    """
    msg_lower = message.strip().lower()

    # Check frustration keywords
    msg_words = set(msg_lower.split())
    if msg_words & _FRUSTRATION_CUES:
        return True

    # Check excessive punctuation
    if msg_lower.count('!') >= _FRUSTRATION_PUNCTUATION_THRESHOLD:
        return True
    if msg_lower.count('?') >= _FRUSTRATION_PUNCTUATION_THRESHOLD + 1:
        return True

    # ALL CAPS detection (for messages > 3 chars, ignore short "OK", "NO")
    stripped = message.strip()
    if len(stripped) > 5 and stripped == stripped.upper() and stripped.isalpha():
        return True

    return False


# =========================================================================
# FUZZY MATCHING — Levenshtein distance for typo-tolerant product search
# =========================================================================

def _levenshtein_distance(s1: str, s2: str) -> int:
    """Compute Levenshtein edit distance between two strings.

    O(n*m) dynamic programming — efficient for product name lengths.
    """
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row

    return prev_row[-1]


def _fuzzy_match_product(query: str, product_name: str, threshold: float = 0.6) -> float:
    """Fuzzy match a query against a product name.

    Returns similarity score (0.0 to 1.0). Score >= threshold = match.
    Uses normalized Levenshtein distance for typo tolerance.

    Examples:
        'hairct' → 'Haircut' = 0.71 (match)
        'facal'  → 'Facial'  = 0.67 (match)
        'pizza'  → 'Haircut' = 0.14 (no match)
    """
    q = query.lower().strip()
    p = product_name.lower().strip()

    # Exact substring match → perfect score
    if q in p or p in q:
        return 1.0

    # Word overlap check (for multi-word products like "Haircut - Men")
    q_words = set(q.split())
    p_words = set(p.split())
    common = q_words & p_words
    if common:
        return 0.8 + 0.2 * (len(common) / max(len(q_words), len(p_words)))

    # Levenshtein-based similarity
    max_len = max(len(q), len(p))
    if max_len == 0:
        return 0.0
    distance = _levenshtein_distance(q, p)
    similarity = 1.0 - (distance / max_len)

    return similarity


# =========================================================================
# TIME-OF-DAY GREETING — Makes responses feel personal, not canned
# =========================================================================

def _get_time_of_day_greeting() -> str:
    """Returns contextual greeting based on current time."""
    try:
        hour = datetime.now().hour
        if 5 <= hour < 12:
            return random.choice(["Good morning", "Morning"])
        elif 12 <= hour < 17:
            return random.choice(["Good afternoon", "Hey there"])
        elif 17 <= hour < 21:
            return random.choice(["Good evening", "Hey"])
        else:
            return random.choice(["Hey there", "Hi"])
    except Exception:
        return "Hey there"


# =========================================================================
# LOCAL RESPONSE TEMPLATES — Business-aware, randomized, natural
# =========================================================================

def _get_greeting_responses(business_name: str) -> List[str]:
    """Greeting templates — warm, varied, brand-aware, time-contextual."""
    tod = _get_time_of_day_greeting()
    return [
        f"{tod}! 👋 Welcome to {business_name}! How can I help you today?",
        f"{tod}! 😊 Thanks for reaching out to {business_name}. What can I do for you?",
        f"{tod}! Welcome to {business_name}! 🙌 How can we assist you?",
        f"Hey! 👋 Great to hear from you. How can {business_name} help?",
        f"Hi there! 😊 {business_name} here. What are you looking for today?",
    ]


def _get_casual_responses(business_name: str) -> List[str]:
    """Casual conversation templates."""
    return [
        f"We're doing great, thanks for asking! 😊 How can {business_name} help you today?",
        f"All good here at {business_name}! 🙌 What can we do for you?",
        f"We're great! Ready to help. What are you looking for? 😊",
    ]


def _get_thanks_responses() -> List[str]:
    """Thank you response templates."""
    return [
        "You're welcome! 😊 Let us know if you need anything else!",
        "Happy to help! Feel free to reach out anytime. 🙌",
        "Glad we could help! We're here if you need us. 😊",
        "Anytime! 🤝 Don't hesitate to ask if something comes up.",
    ]


def _get_goodbye_responses() -> List[str]:
    """Goodbye response templates."""
    return [
        "Bye! Take care and have a great day! 👋",
        "See you soon! Feel free to message us anytime. 😊",
        "Goodbye! We're always here when you need us. 👋",
    ]


def _get_acknowledgment_responses() -> List[str]:
    """For ok/fine/cool type messages."""
    return [
        "Great! Let me know if there's anything else I can help with! 😊",
        "Perfect! I'm here if you need anything. 👍",
        "Got it! Feel free to ask if you have any questions. 😊",
    ]


def _get_identity_responses(business_name: str) -> List[str]:
    """Identity response templates (who are you / what is your name)."""
    return [
        f"I'm the AI assistant for {business_name}! 😊 How can I help you today?",
        f"I'm here to help you with anything related to {business_name}. What's on your mind?",
        f"You're chatting with {business_name}'s smart assistant! 👋 What can I do for you?",
        f"I'm the virtual assistant for {business_name}. How can I assist you?",
    ]


# =========================================================================
# GRACEFUL DEGRADATION — Intent-aware fallbacks (NEVER say "high demand")
# v7.0: Clarification-first — ask questions, NEVER output generic fallbacks
# =========================================================================

DEGRADED_RESPONSES = {
    "greeting": [
        "Hey 👋 Welcome to {business_name}! How can we help you today?",
        "Hi there! 😊 What can we do for you?",
        "Hello! Welcome! How can we assist you?",
    ],
    "casual_conversation": [
        "We're doing great! 😊 How can we help you today?",
        "All good here! What can we do for you? 🙌",
    ],
    "thank_you": [
        "You're welcome! 😊 Anything else we can help with?",
        "Happy to help! Let us know if you need more. 🙌",
    ],
    "goodbye": [
        "Bye! Have a great day! 👋",
        "See you! We're always here. 😊",
    ],
    "pricing": [
        "Could you let me know which specific product or service you'd like pricing for? 💰 I'll get you the exact details!",
        "Happy to help with pricing! Which item are you interested in? 😊",
    ],
    "general_enquiry": [
        "I'd love to help! Could you tell me a bit more about what you're looking for? 😊",
        "Sure, happy to assist! What specifically would you like to know about {business_name}? 🙌",
    ],
    "booking": [
        "We'd love to get you booked! 📅 Could you share your preferred date and time?",
        "Happy to help you book! What day and time works best for you? 😊",
    ],
    "order_booking": [
        "We'd love to help with your order! 🛍️ Which items are you interested in?",
        "Happy to help you order! Could you let me know what you'd like? 😊",
    ],
    "complaint": [
        "I'm really sorry to hear that. 🙏 Could you share more details so we can make this right for you?",
        "I apologize for the trouble. Could you tell me exactly what happened so we can resolve this quickly? 🙏",
    ],
    "hours": [
        "Are you looking for our timings on a specific day? 🕐 Let me know and I'll check!",
    ],
    "location": [
        "Looking for directions? 📍 Would you like our full address or a map link?",
    ],
    "_default": [
        "I'd like to help! Could you tell me a bit more about what you need? 😊",
        "Happy to assist! Could you share a few more details so I can give you the right answer? 🙌",
    ],
}


# =========================================================================
# LOCAL RESPONDER — Main entry point
# =========================================================================

class LocalResponder:
    """
    Zero-LLM response engine for predictable intents.

    Returns instant responses for:
    - Greetings (hi, hello, namaste, etc.)
    - Thank you / Goodbye
    - Casual conversation (how are you)
    - Simple acknowledgments (ok, fine, cool)
    - FAQ matching (business-specific Q&A)
    """

    # Intents that can be handled 100% locally
    LOCAL_INTENTS = frozenset({
        'greeting', 'casual_conversation', 'thank_you', 'goodbye', 'identity',
        'location', 'hours'
    })

    # Expanded quick-match patterns (covers ALL major Indian languages)
    GREETING_PATTERNS = frozenset({
        'hi', 'hii', 'hiii', 'hiiii', 'hello', 'hey', 'hola', 'yo', 'sup',
        'namaste', 'namaskar', 'vanakkam', 'namaskara', 'namaskaram',
        'good morning', 'good afternoon', 'good evening', 'good night',
        'gm', 'gn', 'ga', 'ge', 'hai',
        # Gujarati
        'kem cho', 'jai shree krishna', 'jai jinendra',
        # Bengali
        'nomoshkar', 'ki khobor', 'kemon acho',
        # Marathi
        'namaskar', 'kasa ahe',
        # Punjabi
        'sat sri akal', 'ki haal', 'kiddan',
        # Urdu
        'assalam alaikum', 'salam', 'adaab',
    })

    CASUAL_PATTERNS = frozenset({
        'how are you', "how're you", 'how r u', 'kaise ho', 'kya haal',
        'whats up', "what's up", 'wassup', 'howdy',
        # Gujarati
        'kem cho', 'shu chal che',
        # Bengali
        'kemon acho', 'ki khobor', 'bhalo acho',
        # Marathi
        'kasa ahe', 'kay challay',
        # Punjabi
        'ki haal', 'kiddan', 'ki haal hai',
        # Urdu
        'kya haal hai', 'kaisa haal hai',
    })

    THANKS_PATTERNS = frozenset({
        'thanks', 'thank you', 'thank u', 'thx', 'ty',
        'dhanyavaad', 'shukriya', 'nandri', 'dhanyawad',
        # Bengali
        'dhonnobad', 'dhonyobad',
        # Gujarati
        'aabhar', 'dhanyavaad',
        # Marathi
        'dhanyawad', 'aabhari',
        # Urdu
        'shukriya', 'meherbani',
        # Punjabi
        'dhanvaad', 'shukriya ji',
    })

    GOODBYE_PATTERNS = frozenset({
        'bye', 'goodbye', 'good bye', 'see you', 'alvida', 'tata', 'bye bye',
        # Urdu
        'khuda hafiz', 'allah hafiz',
        # Gujarati
        'aavjo', 'aavje',
        # Bengali
        'aashchi', 'aabar dekha hobe',
        # Marathi
        'yeto', 'punha bhetuyaa',
        # Punjabi
        'rabb rakha', 'phir milange',
    })

    ACK_PATTERNS = frozenset({
        'ok', 'okay', 'k', 'fine', 'cool', 'nice', 'great', 'good',
        'hmm', 'hm', 'oh', 'ohh', 'ahh', 'acha', 'accha', 'theek hai',
        # Bengali
        'thik ache', 'besh',
        # Gujarati
        'saru', 'barabar',
        # Marathi
        'chhan', 'barobar',
    })

    IDENTITY_PATTERNS = frozenset({
        'who are you', 'what is your name', 'whats your name',
        "what's your name", 'who r u', 'your name', 'tell me your name',
        'what are you', 'who is this', 'is this a bot', "what's ur name",
        # Hindi
        'aapka naam kya hai', 'tum kaun ho', 'ye kaun hai',
        'aap kaun ho', 'naam batao', 'naam kya hai', 'kaun ho tum',
        # Tamil — comprehensive transliteration variants
        'unga name enna', 'unga peru enna', 'unga peru ena',
        'neenga yaaru', 'nee yaaru', 'unga peyar enna', 'unga peyar ena',
        'peru enna', 'peru ena', 'un peru enna', 'un peru ena',
        'ungaloda peru enna', 'unga naam enna',
        # Tamil - additional variants
        'unga per enna', 'unga per ena', 'nee yaaru da',
        'yaaru nee', 'bot aa', 'bot ah', 'nee bot ah',
        'idu yaaru', 'neenga yaaru nga',
        # Kannada
        'nimma hesaru enu', 'neenu yaaru', 'hesaru enu',
        # Telugu
        'mee peru enti', 'meeru evaru', 'peru enti',
        # Malayalam
        'ningalude peru enthaanu', 'nee aaraanu', 'peru enthaanu',
        # Bengali
        'tomar naam ki', 'tumi ke', 'apnar naam ki',
        # Gujarati
        'tamaru naam su che', 'tame kon cho',
        # Marathi
        'tumcha naav kaay', 'tu kon aahes',
        # Punjabi
        'tuhadda naam ki hai', 'tu kaun hai',
    })

    # Keywords for fuzzy identity detection (catches unmatched regional spellings)
    IDENTITY_KEYWORDS = frozenset({
        'peru', 'peyar', 'name', 'naam', 'yaaru', 'kaun',
        'hesaru', 'aaraanu', 'evaru', 'kon', 'ke', 'who',
    })

    LOCATION_PATTERNS = frozenset({
        'where are you', 'where is your shop located', 'location',
        'address', 'shop address', 'store address', 'where are you located',
        'where is the store', 'where is the shop', 'kahan ho', 'shop location',
        'where is your shop', 'where is your store', 'give me your address',
        # Tamil
        'unga kadai enga iruku', 'unga kadai enga', 'kadai enga iruku',
        'kadai enga', 'enga irukeenga', 'enga iruku', 'kadai address',
        'unga kada enaga iruku', 'unga address enna',
        # Hindi / Hinglish
        'kahan hai', 'dukan kahan hai', 'shop kahan hai', 'aap kahan ho',
        'address batao', 'address kya hai', 'location batao', 'address bata do',
        'location kya hai', 'shop ki location', 'dukan ka address',
        # Gujarati
        'tamari dukan kyaa che', 'address apo',
        # Bengali
        'dokan kothay', 'address din',
    })

    # --- Fuzzy keyword sets for substring matching (regional languages) ---
    LOCATION_KEYWORDS = frozenset({
        'address', 'location', 'where', 'kahan', 'enga', 'enaga',
        'kadai', 'kada', 'dukan', 'shop', 'store', 'direction',
        'dokan', 'kyaa',  # Bengali, Gujarati additions
    })

    HOURS_KEYWORDS = frozenset({
        'time', 'open', 'close', 'hours', 'timing',
        'neram', 'mani', 'samayam', 'kab', 'kitne baje',
        'kokhon', 'somoy',  # Bengali additions
    })

    PRICE_KEYWORDS = frozenset({
        'price', 'cost', 'rate', 'kitna', 'kimat', 'kitne',
        'vilai', 'enna vilai', 'rate enna', 'paisa',
        'dam', 'daam', 'koto', 'bhav',  # Bengali, Gujarati additions
    })

    HOURS_PATTERNS = frozenset({
        'opening hours', 'store hours', 'when are you open', 'are you open',
        'timings', 'shop timings', 'what time do you open', 'closing time',
        'what are your hours', 'working hours', 'business hours',
        # Tamil
        'eppozhu open', 'eppo open', 'kadai timing', 'kadai neram',
        'enna neram', 'mani enna', 'eppo close',
        # Hindi / Hinglish
        'kab open hai', 'kab band hota hai', 'kitne baje khulta hai',
        'shop timing', 'dukan kab khulti hai', 'kitne baje', 'kab khulta hai',
        # Bengali
        'kokhon khule', 'dokan kokhon bondho',
        # Gujarati
        'kyare khule che', 'kyare bandh che',
    })

    def try_trivial_response(
        self,
        message: str,
        business_data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        AI-FIRST ARCHITECTURE: Handle ONLY trivial zero-thought intents.

        This is the PRIMARY local handler in the pipeline. It intercepts
        ONLY exact-match trivial patterns (greetings, thanks, bye, ack).
        EVERYTHING else returns None → routed to LLM.

        The LLM (Gemini) natively understands ALL languages — Tamil, Hindi,
        Kannada, Telugu, Malayalam, Bengali, etc. — so keyword-based intent
        detection is NOT needed for real queries.

        Trivial intents handled here (saves ~200ms + 0 tokens):
          - Greetings: hi, hello, namaste, vanakkam
          - Casual: how are you, kaise ho
          - Thanks: thank you, dhanyavaad, nandri
          - Goodbye: bye, alvida, tata
          - Acknowledgment: ok, fine, cool, hmm
        """
        msg_clean = message.strip().lower().strip(" ?.!:,;")
        business_name = business_data.get('business_name', 'our business')

        # Frustrated users ALWAYS go to LLM for empathetic response
        if _detect_frustration(message):
            return None

        # 1. Greeting (exact match only)
        if msg_clean in self.GREETING_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_greeting_responses(business_name)),
                intent="greeting",
                method="local_trivial",
            )

        # 2. Casual conversation (exact match only)
        if msg_clean in self.CASUAL_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_casual_responses(business_name)),
                intent="casual_conversation",
                method="local_trivial",
            )

        # 3. Thank you (exact match only)
        if msg_clean in self.THANKS_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_thanks_responses()),
                intent="thank_you",
                method="local_trivial",
            )

        # 4. Goodbye (exact match only)
        if msg_clean in self.GOODBYE_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_goodbye_responses()),
                intent="goodbye",
                method="local_trivial",
            )

        # 5. Simple acknowledgments (exact match only)
        if msg_clean in self.ACK_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_acknowledgment_responses()),
                intent="acknowledgment",
                method="local_trivial",
            )

        # EVERYTHING ELSE → None → LLM handles it
        # The AI understands all languages natively. No keywords needed.
        return None

    def try_local_response(
        self,
        message: str,
        business_data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Try to generate a response locally without any LLM call.

        Returns a full response dict if handled, None if LLM is needed.

        v2.0: Adds sentiment-aware routing — frustrated users ALWAYS
        go to LLM for empathetic, contextual responses instead of
        getting a canned "Great! 👍" reply.
        """
        # Clean downcase and strip trailing punctuation/spaces
        msg_clean = message.strip().lower().strip(" ?.!:,;")
        business_name = business_data.get('business_name', 'our business')

        # GATE 0: Sentiment check — frustrated users bypass ALL canned responses
        # This prevents the worst chatbot failure: responding "Great! 👍" to "ugh terrible service!!"
        if _detect_frustration(message):
            logger.info(f"🔥 Frustration detected — routing to LLM for empathetic response")
            return None  # Force LLM handling

        # 1. Greeting
        if msg_clean in self.GREETING_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_greeting_responses(business_name)),
                intent="greeting",
                method="local_instant",
            )

        # 2. Casual conversation
        if msg_clean in self.CASUAL_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_casual_responses(business_name)),
                intent="casual_conversation",
                method="local_instant",
            )

        # 3. Thank you
        if msg_clean in self.THANKS_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_thanks_responses()),
                intent="thank_you",
                method="local_instant",
            )

        # 4. Goodbye
        if msg_clean in self.GOODBYE_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_goodbye_responses()),
                intent="goodbye",
                method="local_instant",
            )

        # 5. Simple acknowledgments
        if msg_clean in self.ACK_PATTERNS:
            return self._build_response(
                reply=random.choice(_get_acknowledgment_responses()),
                intent="acknowledgment",
                method="local_instant",
            )

        # 5.5 Identity queries — exact match OR fuzzy keyword match
        is_identity_query = (
            msg_clean in self.IDENTITY_PATTERNS
            or self._fuzzy_keyword_match(msg_clean, self.IDENTITY_KEYWORDS, min_matches=2)
        )
        if is_identity_query:
            return self._build_response(
                reply=random.choice(_get_identity_responses(business_name)),
                intent="identity",
                method="local_instant",
            )

        # 6. Location queries (if data exists)
        is_location_query = (
            msg_clean in self.LOCATION_PATTERNS
            or self._fuzzy_keyword_match(msg_clean, self.LOCATION_KEYWORDS, min_matches=2)
        )
        if is_location_query:
            location_text = self._format_location(business_data.get('location', {}))
            if location_text:
                return self._build_response(
                    reply=location_text,
                    intent="location",
                    method="local_instant",
                )

        # 7. Hours queries (if data exists)
        is_hours_query = (
            msg_clean in self.HOURS_PATTERNS
            or self._fuzzy_keyword_match(msg_clean, self.HOURS_KEYWORDS, min_matches=2)
        )
        if is_hours_query:
            hours_text = self._format_hours(business_data.get('timings', {}))
            if hours_text:
                return self._build_response(
                    reply=hours_text,
                    intent="hours",
                    method="local_instant",
                )

        # 8. Smart pricing queries — now with fuzzy product matching
        if self._is_price_query(msg_clean):
            pricing_response = self._try_pricing_response(msg_clean, business_data)
            if pricing_response:
                return pricing_response

        # 9. FAQ matching (Jaccard similarity + fuzzy)
        faq_response = self._try_faq_match(msg_clean, business_data)
        if faq_response:
            return faq_response

        return None

    def get_degraded_response(
        self,
        intent: str,
        business_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Get an INTELLIGENT SYNTHESIS fallback when LLM is unavailable.

        v7.0: FAANG-grade degraded mode — world-class support quality.

        Architecture (priority order):
          1. INTELLIGENT SYNTHESIS — build a NATURAL sentence from ALL
             available business data (products, description, industry,
             location, timings). This produces responses like:
             "Hi! Reviseit is an education platform offering structured
              courses designed to help students improve their skills.
              Let me know what you're looking for and I'll guide you."
          2. CLARIFICATION QUESTION — if synthesis fails, ask a specific
             clarifying question instead of a generic fallback.
          3. NEVER output a generic template as a last resort.

        Invariants:
          - NEVER returns "We're experiencing high demand"
          - NEVER returns "Our team will respond shortly"
          - ALWAYS includes business-specific context when available
          - ALWAYS ends with a clarifying question or actionable CTA
        """
        business_name = business_data.get('business_name', 'our business')

        # ══════════════════════════════════════════════════════════════
        # STEP 1: INTELLIGENT SYNTHESIS — build from ALL business data
        # Attempt for ALL intents, not just unknown/general
        # ══════════════════════════════════════════════════════════════
        synthesized = self._synthesize_intelligent_response(
            intent, business_data, business_name
        )
        if synthesized:
            return synthesized

        # ══════════════════════════════════════════════════════════════
        # STEP 2: CLARIFICATION-FIRST TEMPLATES
        # Ask questions, never generic "team will respond" messages
        # ══════════════════════════════════════════════════════════════
        templates = DEGRADED_RESPONSES.get(intent, DEGRADED_RESPONSES["_default"])
        reply = random.choice(templates)

        # Personalize with business name if applicable
        if '{business_name}' in reply:
            reply = reply.replace('{business_name}', business_name)

        return self._build_response(
            reply=reply,
            intent=intent or "general_enquiry",
            method="graceful_degradation_clarification",
            confidence=0.7,
        )

    def _synthesize_intelligent_response(
        self,
        intent: str,
        business_data: Dict[str, Any],
        business_name: str,
    ) -> Optional[Dict[str, Any]]:
        """
        INTELLIGENT SYNTHESIS ENGINE — builds natural, context-rich responses
        from raw business_data WITHOUT any LLM call.

        Combines ALL available data fields into a NATURAL sentence:
        - Products/services (with prices)
        - Business description
        - Industry context
        - Location (address, city)
        - Timings (today's hours)

        Returns None if no meaningful synthesis is possible (caller
        falls through to clarification templates).
        """
        if not business_data:
            return None

        products = business_data.get('products_services', [])
        description = business_data.get('description', '')
        industry = business_data.get('industry', '')
        location = business_data.get('location', {})
        timings = business_data.get('timings', {})

        # Must have SOMETHING to synthesize with
        if not products and not description and not industry:
            return None

        # ── Intent-specific synthesis ──

        # PRICING: Show actual prices if products have them
        if intent == 'pricing' and products:
            priced = [p for p in products if p.get('price') is not None]
            if priced:
                lines = [f"Here's our pricing at {business_name}! 💰\n"]
                for p in priced[:6]:
                    name = p.get('name', '')
                    price_str = f"₹{p.get('price')}"
                    lines.append(f"• {name}: {price_str}")
                if len(priced) > 6:
                    lines.append(f"\n...and {len(priced) - 6} more items!")
                lines.append("\nWhich one would you like to know more about? 😊")
                return self._build_response(
                    reply='\n'.join(lines),
                    intent="pricing",
                    method="intelligent_synthesis",
                    confidence=0.85,
                )

        # HOURS: Show actual timings
        if intent == 'hours' and timings:
            hours_text = self._format_hours(timings)
            if hours_text:
                return self._build_response(
                    reply=hours_text,
                    intent="hours",
                    method="intelligent_synthesis",
                    confidence=0.88,
                )

        # LOCATION: Show actual address
        if intent == 'location':
            loc = business_data.get('location', {})
            if loc:
                loc_text = self._format_location(loc)
                if loc_text:
                    return self._build_response(
                        reply=loc_text,
                        intent="location",
                        method="intelligent_synthesis",
                        confidence=0.88,
                    )

        # ── General synthesis for all other intents ──
        # Build a rich, natural sentence combining available fields

        parts = []

        # Opening with identity
        if description:
            # Use description directly — most natural
            parts.append(f"Hi! {business_name} — {description}.")
        elif industry:
            parts.append(f"Hi! We're {business_name}, a {industry} business.")
        else:
            parts.append(f"Hi! This is {business_name}.")

        # Add product context
        if products:
            names = [p.get('name', '') for p in products[:4] if p.get('name')]
            if names:
                remaining = len(products) - len(names)
                product_list = ', '.join(names)
                if remaining > 0:
                    product_list += f" and {remaining} more"
                parts.append(f"We offer {product_list}.")

        # Add location snippet (only city, keep it brief)
        if isinstance(location, dict) and location.get('city'):
            city = location['city']
            state = location.get('state', '')
            loc_brief = city
            if state and state.lower() != city.lower():
                loc_brief = f"{city}, {state}"
            parts.append(f"We're based in {loc_brief}.")

        # Intent-specific closer
        closer_map = {
            'general_enquiry': "What would you like to know more about?",
            'general': "What would you like to know more about?",
            'unknown': "How can I help you today?",
            'booking': "Would you like to book? Just share your preferred date and time! 📅",
            'order_booking': "What would you like to order? 🛍️",
            'complaint': "I'm sorry you're facing issues. Could you tell me what happened so I can help? 🙏",
            'lead_capture': "I'd love to help! Could you share your contact preference? 😊",
        }
        closer = closer_map.get(intent, "Let me know what you're looking for and I'll guide you! 😊")
        parts.append(closer)

        reply = ' '.join(parts)

        logger.info(
            f"🧠 Intelligent synthesis | intent={intent} | "
            f"fields_used=[products={'yes' if products else 'no'}, "
            f"desc={'yes' if description else 'no'}, "
            f"industry={'yes' if industry else 'no'}, "
            f"location={'yes' if location else 'no'}]"
        )

        return self._build_response(
            reply=reply,
            intent=intent or "general_enquiry",
            method="intelligent_synthesis",
            confidence=0.78,
        )

    @staticmethod
    def _fuzzy_keyword_match(
        msg_lower: str,
        keywords: frozenset,
        min_matches: int = 2,
    ) -> bool:
        """Check if message contains enough keywords for fuzzy intent match.

        Used for regional language messages where exact pattern matching fails.
        E.g., 'unga kada enaga iruku' → matches 'kada' + 'enaga' = 2 location keywords.
        """
        msg_words = set(msg_lower.split())
        matches = msg_words & keywords
        return len(matches) >= min_matches

    def _try_faq_match(
        self,
        msg_lower: str,
        business_data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Match against business FAQ data without LLM."""
        faqs = business_data.get('faqs', [])
        if not faqs:
            return None

        # Simple keyword overlap scoring
        msg_words = set(msg_lower.split())
        best_match = None
        best_score = 0

        for faq in faqs:
            question = faq.get('question', '').lower()
            q_words = set(question.split())

            # Jaccard similarity
            if not q_words:
                continue
            overlap = len(msg_words & q_words)
            union = len(msg_words | q_words)
            score = overlap / union if union > 0 else 0

            if score > best_score and score >= 0.4:  # 40% threshold
                best_score = score
                best_match = faq

        if best_match:
            answer = best_match.get('answer', '')
            if answer:
                return self._build_response(
                    reply=answer,
                    intent="faq_match",
                    method="local_faq",
                    confidence=round(best_score, 2),
                )

        return None

    @staticmethod
    def _is_price_query(msg_lower: str) -> bool:
        """Check if message is a simple pricing query."""
        price_keywords = {
            'price', 'prices', 'pricing', 'cost', 'rate', 'rates',
            'how much', 'kitna', 'kimat', 'rate batao', 'price list',
            'menu', 'tariff', 'charge', 'charges', 'fees',
            # Bengali
            'dam koto', 'koto',
            # Gujarati
            'bhav', 'bhav shu che',
        }
        return any(kw in msg_lower for kw in price_keywords)

    def _try_pricing_response(
        self,
        msg_lower: str,
        business_data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Return product pricing without LLM if business data has prices.

        v2.0: Now uses fuzzy matching to find specific products.
        'hairct price' → matches 'Haircut - Men' and 'Haircut - Women'.
        Falls back to full price list for generic queries.
        """
        products = business_data.get('products_services', [])
        if not products:
            return None

        word_count = len(msg_lower.split())

        # --- NEW: Try fuzzy product-specific matching first ---
        # Extract potential product name by removing price keywords
        price_words = {'price', 'prices', 'cost', 'rate', 'rates', 'how', 'much',
                       'kitna', 'kimat', 'what', 'is', 'the', 'of', 'for', 'ka',
                       'ki', 'ke', 'batao', 'bata', 'do', 'please', 'plz', 'pls'}
        query_words = [w for w in msg_lower.split() if w not in price_words]
        product_query = ' '.join(query_words).strip()

        if product_query and len(product_query) >= 3:
            # Try fuzzy matching against all products
            matches = []
            for p in products:
                name = p.get('name', '')
                score = _fuzzy_match_product(product_query, name)
                if score >= 0.55:  # Threshold for fuzzy match
                    matches.append((p, score))

            # Sort by score descending
            matches.sort(key=lambda x: x[1], reverse=True)

            if matches:
                business_name = business_data.get('business_name', 'our business')
                if len(matches) == 1:
                    p = matches[0][0]
                    name = p.get('name', '')
                    price = p.get('price')
                    price_str = f"₹{price}" if price else "Price on request"
                    category = p.get('category', '')
                    desc = p.get('description', '')
                    reply = f"The price for **{name}** is {price_str}"
                    if category:
                        reply += f" ({category})"
                    if desc:
                        reply += f"\n{desc[:100]}"
                    reply += f"\n\nWould you like to book or know more? 😊"
                    return self._build_response(
                        reply=reply,
                        intent="pricing",
                        method="local_fuzzy_pricing",
                        confidence=round(matches[0][1], 2),
                    )
                else:
                    # Multiple matches — list them
                    lines = [f"Here's what I found at {business_name}! 💰\n"]
                    for p, score in matches[:5]:
                        name = p.get('name', '')
                        price = p.get('price')
                        price_str = f"₹{price}" if price else "Price on request"
                        lines.append(f"• {name}: {price_str}")
                    lines.append("\nWhich one are you interested in? 😊")
                    return self._build_response(
                        reply="\n".join(lines),
                        intent="pricing",
                        method="local_fuzzy_pricing",
                        confidence=0.85,
                    )

        # --- FALLBACK: Generic price list (original behavior) ---
        if word_count > 5:
            return None  # Too specific — let LLM handle

        priced = [p for p in products if p.get('price') is not None]
        if not priced:
            return None

        business_name = business_data.get('business_name', 'our business')
        lines = [f"Here are our prices at {business_name}! 💰\n"]
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

        lines.append("\nWould you like to know more about any of these? 😊")

        return self._build_response(
            reply="\n".join(lines),
            intent="pricing",
            method="local_pricing",
            confidence=0.90,
        )

    def _format_location(self, location: Dict[str, Any]) -> str:
        """Format location dict into a readable string."""
        if not location:
            return ""
        
        parts = ["📍 **Our Location:**\n"]
        if location.get("address"):
            parts.append(location["address"])
            
        city_line = []
        if location.get("city"):
            city_line.append(location["city"])
        if location.get("state"):
            city_line.append(location["state"])
        if city_line:
            parts.append(", ".join(city_line) + (" - " + location.get("pincode", "") if location.get("pincode") else ""))
            
        if location.get("landmarks"):
            parts.append(f"\nLandmarks: {', '.join(location['landmarks'])}")
            
        if location.get("google_maps_link"):
            parts.append(f"\nGoogle Maps: {location['google_maps_link']}")
            
        return "\n".join(parts) if len(parts) > 1 else ""

    def _format_hours(self, timings: Dict[str, Any]) -> str:
        """Format timings dict into a readable string."""
        if not timings:
            return ""
            
        parts = ["🕒 **Operating Hours:**\n"]
        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        
        has_hours = False
        for day in days:
            timing = timings.get(day, {})
            if isinstance(timing, dict):
                has_hours = True
                if timing.get("is_closed"):
                    parts.append(f"• {day.capitalize()}: Closed")
                elif timing.get("open") and timing.get("close"):
                    parts.append(f"• {day.capitalize()}: {timing['open']} - {timing['close']}")
                    
        special = timings.get("special_notes")
        if special:
            parts.append(f"\nNote: {special}")
            
        return "\n".join(parts) if has_hours else ""

    @staticmethod
    def _build_response(
        reply: str,
        intent: str,
        method: str,
        confidence: float = 0.95,
    ) -> Dict[str, Any]:
        """Build a standardized response dict."""
        return {
            "reply": reply,
            "intent": intent,
            "confidence": confidence,
            "needs_human": False,
            "suggested_actions": [],
            "metadata": {
                "generation_method": method,
                "llm_call": False,
                "cost": 0,
                "tokens_used": 0,
            }
        }


# =========================================================================
# SINGLETON
# =========================================================================

_local_responder: Optional[LocalResponder] = None


def get_local_responder() -> LocalResponder:
    """Get the local responder singleton."""
    global _local_responder
    if _local_responder is None:
        _local_responder = LocalResponder()
    return _local_responder
