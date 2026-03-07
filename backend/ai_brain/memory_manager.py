"""
Advanced Memory Management for AI Brain — v3.0.

Implements intelligent context management with:
1. Sliding Window - Keep last N messages
2. Semantic Similarity Scoring - Rank by relevance
3. Decay Function - Older messages get lower priority
4. LLM-Powered Conversation Summarization (NEW v3.0)
5. Redis-Backed User Profiles with cross-session memory (NEW v3.0)
6. Key Fact Extraction from messages (NEW v3.0)
"""

import time
import math
import re
import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
from threading import Lock
from enum import Enum

logger = logging.getLogger('reviseit.memory')

# Try Redis for cross-session persistence
try:
    import redis as redis_lib
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis_lib = None


class MemoryType(str, Enum):
    """Types of memory storage."""
    SESSION = "session"
    USER_PROFILE = "profile"
    CONTEXT = "context"


@dataclass
class Message:
    """A single message in conversation history."""
    role: str
    content: str
    timestamp: float = field(default_factory=time.time)
    intent: Optional[str] = None
    entities: Dict[str, Any] = field(default_factory=dict)
    sentiment: Optional[float] = None
    relevance_score: float = 1.0

    def age_seconds(self) -> float:
        return time.time() - self.timestamp

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp,
            "intent": self.intent,
            "entities": self.entities,
            "sentiment": self.sentiment,
        }


@dataclass
class UserProfile:
    """Long-term user profile memory — persists across sessions via Redis."""
    user_id: str
    name: Optional[str] = None
    phone: Optional[str] = None
    language: str = "en"
    timezone: Optional[str] = None

    # Interaction patterns
    total_interactions: int = 0
    last_interaction: Optional[float] = None
    common_intents: Dict[str, int] = field(default_factory=dict)
    preferred_times: List[int] = field(default_factory=list)

    # Purchase/booking history
    past_bookings: List[Dict] = field(default_factory=list)
    past_purchases: List[Dict] = field(default_factory=list)

    # Preferences
    preferences: Dict[str, Any] = field(default_factory=dict)

    # FAQs this user frequently asks
    frequent_questions: List[str] = field(default_factory=list)

    def update_interaction(self, intent: str):
        """Update interaction statistics."""
        self.total_interactions += 1
        self.last_interaction = time.time()
        self.common_intents[intent] = self.common_intents.get(intent, 0) + 1

        hour = time.localtime().tm_hour
        if hour not in self.preferred_times:
            self.preferred_times.append(hour)
            self.preferred_times = self.preferred_times[-10:]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "name": self.name,
            "phone": self.phone,
            "language": self.language,
            "total_interactions": self.total_interactions,
            "last_interaction": self.last_interaction,
            "common_intents": self.common_intents,
            "preferences": self.preferences,
            "past_bookings": self.past_bookings[-5:],
            "past_purchases": self.past_purchases[-5:],
            "frequent_questions": self.frequent_questions[-5:],
        }

    def to_prompt_dict(self) -> Dict[str, Any]:
        """Convert to a dict suitable for prompt injection."""
        result = {}
        if self.name:
            result["name"] = self.name
        if self.language and self.language != "en":
            result["language"] = self.language
        if self.preferences:
            result["preferences"] = ", ".join(f"{k}: {v}" for k, v in list(self.preferences.items())[:5])
        if self.total_interactions > 3:
            result["past_interactions"] = f"{self.total_interactions} previous conversations"
        if self.past_bookings:
            result["past_interactions"] = f"{len(self.past_bookings)} past bookings"
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "UserProfile":
        """Reconstruct from dict (for Redis deserialization)."""
        return cls(
            user_id=data.get("user_id", ""),
            name=data.get("name"),
            phone=data.get("phone"),
            language=data.get("language", "en"),
            total_interactions=data.get("total_interactions", 0),
            last_interaction=data.get("last_interaction"),
            common_intents=data.get("common_intents", {}),
            preferences=data.get("preferences", {}),
            past_bookings=data.get("past_bookings", []),
            past_purchases=data.get("past_purchases", []),
            frequent_questions=data.get("frequent_questions", []),
        )


@dataclass
class ConversationContext:
    """Mid-term context for active conversation."""
    user_id: str
    business_id: str
    messages: List[Message] = field(default_factory=list)
    extracted_entities: Dict[str, Any] = field(default_factory=dict)
    conversation_topic: Optional[str] = None
    current_intent: Optional[str] = None
    active_flow: Optional[str] = None
    flow_data: Dict[str, Any] = field(default_factory=dict)
    session_start: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)

    # v3.0: LLM-generated conversation summary
    conversation_summary: Optional[str] = None

    def add_message(self, message: Message):
        self.messages.append(message)
        self.last_activity = time.time()
        if message.entities:
            self.extracted_entities.update(message.entities)
        if message.intent:
            self.current_intent = message.intent

    def is_expired(self, timeout_seconds: int = 1800) -> bool:
        return time.time() - self.last_activity > timeout_seconds


# =============================================================================
# KEY FACT EXTRACTION — No LLM, pure regex. Runs after every message.
# =============================================================================

# Name extraction patterns (English + Indian languages in Roman)
_NAME_PATTERNS = [
    re.compile(r"(?:my name is|i am|i'm|call me|this is|myself)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", re.IGNORECASE),
    re.compile(r"(?:mera naam|main|mai)\s+(\w+)\s+(?:hun|hoon|hai|hu)", re.IGNORECASE),
    re.compile(r"(?:en peyar|naa peru|nanna hesaru|ente peru)\s+(\w+)", re.IGNORECASE),
]

# Phone extraction
_PHONE_PATTERN = re.compile(r'\b(\+?91[\s-]?\d{10}|\d{10})\b')

# Email extraction
_EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')


def extract_facts_from_message(message: str) -> Dict[str, Any]:
    """
    Extract key facts from a message without an LLM call.
    Fast regex-based extraction. Updates user profile automatically.
    """
    facts = {}

    # Name
    for pattern in _NAME_PATTERNS:
        match = pattern.search(message)
        if match:
            name = match.group(1).strip()
            if len(name) > 1 and name.lower() not in ('hi', 'hello', 'hey', 'ok', 'yes', 'no'):
                facts["name"] = name
                break

    # Phone
    phone_match = _PHONE_PATTERN.search(message)
    if phone_match:
        phone = phone_match.group(1).replace(" ", "").replace("-", "")
        if len(phone) >= 10:
            facts["phone"] = phone

    # Email
    email_match = _EMAIL_PATTERN.search(message)
    if email_match:
        facts["email"] = email_match.group(0)

    return facts


# =============================================================================
# MEMORY ALGORITHMS
# =============================================================================

class MemoryAlgorithms:
    """Memory algorithms for context management."""

    @staticmethod
    def sliding_window(messages: List[Message], window_size: int = 10) -> List[Message]:
        return messages[-window_size:]

    @staticmethod
    def semantic_similarity_score(
        message: Message, current_query: str, current_intent: str = None
    ) -> float:
        score = 0.0

        query_words = set(current_query.lower().split())
        message_words = set(message.content.lower().split())

        if query_words and message_words:
            overlap = len(query_words & message_words)
            score += min(overlap / max(len(query_words), 1), 0.5)

        if current_intent and message.intent:
            if message.intent == current_intent:
                score += 0.3
            elif message.intent in ['greeting', 'goodbye']:
                score -= 0.1

        age_hours = message.age_seconds() / 3600
        if age_hours < 0.5:
            score += 0.2
        elif age_hours < 1:
            score += 0.1

        return min(max(score, 0.0), 1.0)

    @staticmethod
    def decay_function(
        messages: List[Message], half_life_hours: float = 24.0, min_score: float = 0.1
    ) -> List[Message]:
        for message in messages:
            age_hours = message.age_seconds() / 3600
            decay_factor = math.pow(0.5, age_hours / half_life_hours)
            message.relevance_score = max(
                message.relevance_score * decay_factor, min_score
            )
        return messages

    @staticmethod
    def context_compression(
        messages: List[Message], max_messages: int = 10, summarize: bool = True
    ) -> Tuple[List[Message], Optional[str]]:
        if len(messages) <= max_messages:
            return messages, None

        recent = messages[-max_messages:]
        older = messages[:-max_messages]

        if not summarize:
            return recent, None

        # Basic summary (LLM summary handled separately in AdvancedMemoryManager)
        summary_parts = []
        entities = {}
        for msg in older:
            entities.update(msg.entities)

        if entities:
            entity_str = ", ".join(f"{k}: {v}" for k, v in entities.items())
            summary_parts.append(f"Known info: {entity_str}")

        intents = list(set(msg.intent for msg in older if msg.intent))
        if intents:
            summary_parts.append(f"Topics discussed: {', '.join(intents)}")

        summary = ". ".join(summary_parts) if summary_parts else None
        return recent, summary

    @staticmethod
    def prune_irrelevant(
        messages: List[Message], relevance_threshold: float = 0.3,
        current_query: str = "", current_intent: str = None
    ) -> List[Message]:
        if not current_query:
            return messages

        for message in messages:
            message.relevance_score = MemoryAlgorithms.semantic_similarity_score(
                message, current_query, current_intent
            )

        relevant = [m for m in messages if m.relevance_score >= relevance_threshold]

        if len(relevant) < 3:
            relevant = messages[-3:]

        return relevant


# =============================================================================
# ADVANCED MEMORY MANAGER — v3.0
# =============================================================================

class AdvancedMemoryManager:
    """
    v3.0 Memory Manager with:
    - LLM-powered conversation summarization
    - Redis-backed user profiles (30-day TTL)
    - Key fact extraction after every message
    - Cross-session memory
    """

    USER_PROFILE_TTL = 86400 * 30  # 30 days

    def __init__(
        self,
        session_limit: int = 15,
        session_timeout: int = 1800,
        decay_half_life: float = 24.0,
        compression_threshold: int = 20,
        relevance_threshold: float = 0.3,
        redis_url: str = None,
        llm_client=None,
    ):
        self.session_limit = session_limit
        self.session_timeout = session_timeout
        self.decay_half_life = decay_half_life
        self.compression_threshold = compression_threshold
        self.relevance_threshold = relevance_threshold
        # Auto-create Gemini client if not provided (for LLM summarization)
        self.llm_client = llm_client
        if not self.llm_client:
            try:
                import os
                from .gemini_client import GeminiClient
                api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
                if api_key:
                    self.llm_client = GeminiClient(api_key=api_key)
            except ImportError:
                logger.warning("Memory Manager: google-genai package not available, summarization disabled")

        # Storage
        self._contexts: Dict[str, ConversationContext] = {}
        self._profiles: Dict[str, UserProfile] = {}
        self._lock = Lock()
        self.algorithms = MemoryAlgorithms()

        # Redis for cross-session profiles
        self._redis = None
        if redis_url and REDIS_AVAILABLE:
            try:
                self._redis = redis_lib.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                logger.info("Memory Manager: Redis connected for cross-session profiles")
            except Exception as e:
                logger.warning(f"Memory Manager: Redis unavailable ({e}), using in-memory only")
                self._redis = None

    # =========================================================================
    # USER PROFILES — Redis-backed with 30-day TTL
    # =========================================================================

    def get_or_create_profile(self, user_id: str) -> UserProfile:
        """Get user profile — checks Redis first, then in-memory."""
        with self._lock:
            # In-memory check
            if user_id in self._profiles:
                return self._profiles[user_id]

            # Redis check
            if self._redis:
                try:
                    cached = self._redis.get(f"user_profile:{user_id}")
                    if cached:
                        profile = UserProfile.from_dict(json.loads(cached))
                        self._profiles[user_id] = profile
                        return profile
                except Exception as e:
                    logger.debug(f"Redis profile read failed: {e}")

            # Create new
            profile = UserProfile(user_id=user_id)
            self._profiles[user_id] = profile
            return profile

    def save_profile(self, profile: UserProfile):
        """Persist profile to Redis (non-blocking, best-effort)."""
        if self._redis:
            try:
                self._redis.setex(
                    f"user_profile:{profile.user_id}",
                    self.USER_PROFILE_TTL,
                    json.dumps(profile.to_dict())
                )
            except Exception as e:
                logger.debug(f"Redis profile save failed: {e}")

    def update_profile_from_facts(self, user_id: str, facts: Dict[str, Any]):
        """Update profile with extracted facts and persist."""
        if not facts:
            return

        profile = self.get_or_create_profile(user_id)

        if facts.get("name"):
            profile.name = facts["name"]
        if facts.get("phone"):
            profile.phone = facts["phone"]
        if facts.get("email"):
            profile.preferences["email"] = facts["email"]

        self.save_profile(profile)

    # =========================================================================
    # LLM CONVERSATION SUMMARIZATION
    # =========================================================================

    def summarize_conversation(self, messages: List[Message]) -> Optional[str]:
        """
        Use Gemini 2.5 Flash to summarize older messages into key facts.
        Called when conversation exceeds threshold.
        Falls back to basic entity extraction if LLM unavailable.
        Cost: ~100-150 tokens per summarization (very cheap).
        """
        if not self.llm_client or len(messages) < 5:
            return self._basic_summary(messages)

        try:
            from .gemini_client import extract_text

            conversation_text = "\n".join([
                f"{'Customer' if m.role == 'user' else 'Business'}: {m.content}"
                for m in messages[-15:]  # Summarize last 15 messages max
            ])

            response = self.llm_client.generate(
                model="gemini-2.5-flash",
                system_prompt="Summarize this customer conversation into key facts. Include: customer name (if mentioned), products/services discussed, preferences, decisions made, unresolved questions. Bullet points, max 100 words.",
                messages=[{"role": "user", "content": conversation_text}],
                temperature=0.3,
                max_tokens=150,
            )
            return extract_text(response).strip()

        except Exception as e:
            logger.warning(f"LLM summarization failed: {e}")
            return self._basic_summary(messages)

    def _basic_summary(self, messages: List[Message]) -> Optional[str]:
        """Fallback summary using entity extraction (no LLM)."""
        if not messages:
            return None

        entities = {}
        intents = set()
        for msg in messages:
            entities.update(msg.entities)
            if msg.intent:
                intents.add(msg.intent)

        parts = []
        if entities:
            parts.append("Known info: " + ", ".join(f"{k}: {v}" for k, v in entities.items()))
        if intents:
            parts.append("Topics: " + ", ".join(intents))

        return ". ".join(parts) if parts else None

    # =========================================================================
    # CONTEXT MANAGEMENT
    # =========================================================================

    def get_or_create_context(self, user_id: str, business_id: str) -> ConversationContext:
        with self._lock:
            key = f"{user_id}:{business_id}"

            if key not in self._contexts:
                self._contexts[key] = ConversationContext(
                    user_id=user_id, business_id=business_id
                )

            context = self._contexts[key]

            if context.is_expired(self.session_timeout):
                self._archive_to_profile(context)
                context = ConversationContext(user_id=user_id, business_id=business_id)
                self._contexts[key] = context

            return context

    def add_message(
        self, user_id: str, business_id: str, role: str, content: str,
        intent: str = None, entities: Dict = None, sentiment: float = None
    ):
        context = self.get_or_create_context(user_id, business_id)

        message = Message(
            role=role, content=content, intent=intent,
            entities=entities or {}, sentiment=sentiment,
        )
        context.add_message(message)

        # Update profile
        if intent:
            profile = self.get_or_create_profile(user_id)
            profile.update_interaction(intent)

        # Extract and save facts from user messages
        if role == "user":
            facts = extract_facts_from_message(content)
            if facts:
                self.update_profile_from_facts(user_id, facts)
                logger.info(f"📝 Extracted facts from message: {facts}")

        # Trigger summarization if conversation is getting long
        if len(context.messages) > self.compression_threshold and len(context.messages) % 5 == 0:
            older_messages = context.messages[:-5]
            summary = self.summarize_conversation(older_messages)
            if summary:
                context.conversation_summary = summary
                logger.info(f"📋 Conversation summarized ({len(older_messages)} messages → summary)")

    def get_context_window(
        self, user_id: str, business_id: str,
        current_query: str = "", current_intent: str = None,
        max_messages: int = None
    ) -> List[Dict[str, str]]:
        """Get optimized context window for LLM prompt."""
        context = self.get_or_create_context(user_id, business_id)
        max_messages = max_messages or self.session_limit

        messages = context.messages.copy()
        if not messages:
            return []

        # Apply algorithms
        messages = self.algorithms.decay_function(messages, half_life_hours=self.decay_half_life)

        if current_query:
            messages = self.algorithms.prune_irrelevant(
                messages, relevance_threshold=self.relevance_threshold,
                current_query=current_query, current_intent=current_intent
            )

        messages = self.algorithms.sliding_window(messages, window_size=max_messages)

        if len(context.messages) > self.compression_threshold:
            messages, summary = self.algorithms.context_compression(
                messages, max_messages=max_messages, summarize=True
            )
            if summary:
                messages.insert(0, Message(role="system", content=f"Previous context: {summary}"))

        return [{"role": m.role, "content": m.content} for m in messages]

    def get_conversation_summary(self, user_id: str, business_id: str) -> Optional[str]:
        """Get the LLM-generated conversation summary if available."""
        context = self.get_or_create_context(user_id, business_id)
        return context.conversation_summary

    def update_profile(self, user_id: str, name: str = None, language: str = None, preferences: Dict = None):
        profile = self.get_or_create_profile(user_id)
        if name:
            profile.name = name
        if language:
            profile.language = language
        if preferences:
            profile.preferences.update(preferences)
        self.save_profile(profile)

    def _archive_to_profile(self, context: ConversationContext):
        if not context.messages:
            return

        profile = self.get_or_create_profile(context.user_id)

        for key, value in context.extracted_entities.items():
            if key in ['name', 'phone', 'email']:
                setattr(profile, key, value)
            else:
                profile.preferences[key] = value

        user_messages = [m.content for m in context.messages if m.role == 'user']
        for msg in user_messages[-3:]:
            if msg not in profile.frequent_questions:
                profile.frequent_questions.append(msg)
                profile.frequent_questions = profile.frequent_questions[-10:]

        self.save_profile(profile)

    def build_context_summary(self, user_id: str, business_id: str) -> str:
        context = self.get_or_create_context(user_id, business_id)
        profile = self.get_or_create_profile(user_id)

        parts = []
        if profile.name:
            parts.append(f"Customer name: {profile.name}")
        if profile.language != "en":
            parts.append(f"Preferred language: {profile.language}")

        if profile.common_intents:
            top_intents = sorted(profile.common_intents.items(), key=lambda x: x[1], reverse=True)[:3]
            parts.append(f"Common topics: {', '.join(i[0] for i in top_intents)}")

        if context.extracted_entities:
            entity_str = ", ".join(f"{k}: {v}" for k, v in context.extracted_entities.items())
            parts.append(f"Known info: {entity_str}")

        if context.current_intent:
            parts.append(f"Current topic: {context.current_intent}")

        if context.active_flow:
            parts.append(f"Active flow: {context.active_flow}")
            if context.flow_data:
                collected = context.flow_data.get('collected_fields', {})
                if collected:
                    parts.append(f"Collected: {collected}")

        return "\n".join(parts) if parts else ""

    def clear_context(self, user_id: str, business_id: str):
        with self._lock:
            key = f"{user_id}:{business_id}"
            if key in self._contexts:
                del self._contexts[key]

    def get_stats(self) -> Dict[str, Any]:
        return {
            "active_contexts": len(self._contexts),
            "user_profiles": len(self._profiles),
            "total_messages": sum(len(c.messages) for c in self._contexts.values()),
            "redis_connected": self._redis is not None,
        }


# =============================================================================
# Singleton
# =============================================================================

_memory_manager: Optional[AdvancedMemoryManager] = None


def get_memory_manager(**kwargs) -> AdvancedMemoryManager:
    """Get or create the global memory manager."""
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = AdvancedMemoryManager(**kwargs)
    return _memory_manager
