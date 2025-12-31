"""
Advanced Memory Management for AI Brain.
Implements intelligent context management with multiple algorithms:
1. Sliding Window - Keep last N messages
2. Semantic Similarity Scoring - Rank by relevance  
3. Decay Function - Older messages get lower priority
4. Context Compression - Summarize long conversations
"""

import time
import math
import hashlib
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
from threading import Lock
from enum import Enum

logger = logging.getLogger('reviseit.memory')


class MemoryType(str, Enum):
    """Types of memory storage."""
    SESSION = "session"        # Short-term: Current conversation
    USER_PROFILE = "profile"   # Long-term: User preferences, history
    CONTEXT = "context"        # Mid-term: Semantic context vectors


@dataclass
class Message:
    """A single message in conversation history."""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: float = field(default_factory=time.time)
    intent: Optional[str] = None
    entities: Dict[str, Any] = field(default_factory=dict)
    sentiment: Optional[float] = None  # -1 to 1
    relevance_score: float = 1.0
    
    def age_seconds(self) -> float:
        """Get age of message in seconds."""
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
    """Long-term user profile memory."""
    user_id: str
    name: Optional[str] = None
    phone: Optional[str] = None
    language: str = "en"
    timezone: Optional[str] = None
    
    # Interaction patterns
    total_interactions: int = 0
    last_interaction: Optional[float] = None
    common_intents: Dict[str, int] = field(default_factory=dict)
    preferred_times: List[int] = field(default_factory=list)  # Hours of day
    
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
        
        # Track preferred times
        hour = time.localtime().tm_hour
        if hour not in self.preferred_times:
            self.preferred_times.append(hour)
            # Keep only recent pattern (last 10 hours)
            self.preferred_times = self.preferred_times[-10:]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "name": self.name,
            "phone": self.phone,
            "language": self.language,
            "total_interactions": self.total_interactions,
            "common_intents": self.common_intents,
            "preferences": self.preferences,
        }


@dataclass
class ConversationContext:
    """Mid-term context for active conversation."""
    user_id: str
    business_id: str
    
    # Message history
    messages: List[Message] = field(default_factory=list)
    
    # Extracted context
    extracted_entities: Dict[str, Any] = field(default_factory=dict)
    conversation_topic: Optional[str] = None
    current_intent: Optional[str] = None
    
    # Flow state
    active_flow: Optional[str] = None
    flow_data: Dict[str, Any] = field(default_factory=dict)
    
    # Session metadata
    session_start: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    
    def add_message(self, message: Message):
        """Add message to history."""
        self.messages.append(message)
        self.last_activity = time.time()
        
        # Update extracted entities
        if message.entities:
            self.extracted_entities.update(message.entities)
        
        # Update intent
        if message.intent:
            self.current_intent = message.intent
    
    def is_expired(self, timeout_seconds: int = 1800) -> bool:
        """Check if context has expired (30 min default)."""
        return time.time() - self.last_activity > timeout_seconds


class MemoryAlgorithms:
    """
    Implementation of memory algorithms for context management.
    """
    
    @staticmethod
    def sliding_window(
        messages: List[Message],
        window_size: int = 10
    ) -> List[Message]:
        """
        ALGORITHM #1: Sliding Window
        Keep only the last N messages.
        Simple but effective for maintaining recent context.
        """
        return messages[-window_size:]
    
    @staticmethod
    def semantic_similarity_score(
        message: Message,
        current_query: str,
        current_intent: str = None
    ) -> float:
        """
        ALGORITHM #2: Semantic Similarity Scoring
        Score messages by relevance to current query.
        Uses simple keyword overlap + intent matching.
        
        For production, could integrate embeddings (OpenAI, sentence-transformers).
        """
        score = 0.0
        
        # Keyword overlap
        query_words = set(current_query.lower().split())
        message_words = set(message.content.lower().split())
        
        if query_words and message_words:
            overlap = len(query_words & message_words)
            score += min(overlap / len(query_words), 0.5)
        
        # Intent matching
        if current_intent and message.intent:
            if message.intent == current_intent:
                score += 0.3
            elif message.intent in ['greeting', 'goodbye']:
                score -= 0.1  # Reduce relevance of greetings
        
        # Recency bonus
        age_hours = message.age_seconds() / 3600
        if age_hours < 0.5:  # Last 30 minutes
            score += 0.2
        elif age_hours < 1:
            score += 0.1
        
        return min(max(score, 0.0), 1.0)
    
    @staticmethod
    def decay_function(
        messages: List[Message],
        half_life_hours: float = 24.0,
        min_score: float = 0.1
    ) -> List[Message]:
        """
        ALGORITHM #3: Decay Function
        Older messages get lower priority using exponential decay.
        
        score = base_score * (0.5 ^ (age / half_life))
        """
        for message in messages:
            age_hours = message.age_seconds() / 3600
            decay_factor = math.pow(0.5, age_hours / half_life_hours)
            message.relevance_score = max(
                message.relevance_score * decay_factor,
                min_score
            )
        
        return messages
    
    @staticmethod
    def context_compression(
        messages: List[Message],
        max_messages: int = 10,
        summarize: bool = True
    ) -> Tuple[List[Message], Optional[str]]:
        """
        ALGORITHM #4: Context Compression
        Summarize long conversations into key points.
        
        Returns:
            Tuple of (recent messages, summary of older messages)
        """
        if len(messages) <= max_messages:
            return messages, None
        
        # Split into recent and older
        recent = messages[-max_messages:]
        older = messages[:-max_messages]
        
        if not summarize:
            return recent, None
        
        # Generate summary of older messages
        # (In production, could use LLM for this)
        summary_parts = []
        
        # Extract key entities mentioned
        entities = {}
        for msg in older:
            entities.update(msg.entities)
        
        if entities:
            entity_str = ", ".join(f"{k}: {v}" for k, v in entities.items())
            summary_parts.append(f"Known info: {entity_str}")
        
        # Extract unique intents
        intents = list(set(msg.intent for msg in older if msg.intent))
        if intents:
            summary_parts.append(f"Topics discussed: {', '.join(intents)}")
        
        summary = ". ".join(summary_parts) if summary_parts else None
        
        return recent, summary
    
    @staticmethod
    def prune_irrelevant(
        messages: List[Message],
        relevance_threshold: float = 0.3,
        current_query: str = "",
        current_intent: str = None
    ) -> List[Message]:
        """
        ALGORITHM #5: Context Pruning
        Remove messages below relevance threshold.
        """
        if not current_query:
            return messages
        
        # Score all messages
        for message in messages:
            message.relevance_score = MemoryAlgorithms.semantic_similarity_score(
                message, current_query, current_intent
            )
        
        # Filter by threshold, but keep at least the last 3 messages
        relevant = [m for m in messages if m.relevance_score >= relevance_threshold]
        
        # Ensure we keep recent context
        if len(relevant) < 3:
            relevant = messages[-3:]
        
        return relevant


class AdvancedMemoryManager:
    """
    Advanced memory manager implementing multi-layer memory architecture.
    
    Layers:
    1. Session Memory (short-term) - Current conversation
    2. User Profile Memory (long-term) - User preferences & history
    3. Context Vectors (mid-term) - Semantic conversation essence
    """
    
    def __init__(
        self,
        session_limit: int = 15,
        session_timeout: int = 1800,
        decay_half_life: float = 24.0,
        compression_threshold: int = 20,
        relevance_threshold: float = 0.3,
    ):
        self.session_limit = session_limit
        self.session_timeout = session_timeout
        self.decay_half_life = decay_half_life
        self.compression_threshold = compression_threshold
        self.relevance_threshold = relevance_threshold
        
        # Storage
        self._contexts: Dict[str, ConversationContext] = {}
        self._profiles: Dict[str, UserProfile] = {}
        self._lock = Lock()
        
        # Algorithms
        self.algorithms = MemoryAlgorithms()
    
    def get_or_create_context(
        self,
        user_id: str,
        business_id: str
    ) -> ConversationContext:
        """Get or create conversation context for a user."""
        with self._lock:
            key = f"{user_id}:{business_id}"
            
            if key not in self._contexts:
                self._contexts[key] = ConversationContext(
                    user_id=user_id,
                    business_id=business_id
                )
            
            context = self._contexts[key]
            
            # Check expiration
            if context.is_expired(self.session_timeout):
                # Archive old context to profile
                self._archive_to_profile(context)
                context = ConversationContext(
                    user_id=user_id,
                    business_id=business_id
                )
                self._contexts[key] = context
            
            return context
    
    def add_message(
        self,
        user_id: str,
        business_id: str,
        role: str,
        content: str,
        intent: str = None,
        entities: Dict = None,
        sentiment: float = None
    ):
        """Add a message to the conversation context."""
        context = self.get_or_create_context(user_id, business_id)
        
        message = Message(
            role=role,
            content=content,
            intent=intent,
            entities=entities or {},
            sentiment=sentiment,
        )
        
        context.add_message(message)
        
        # Update user profile
        if intent:
            profile = self.get_or_create_profile(user_id)
            profile.update_interaction(intent)
    
    def get_context_window(
        self,
        user_id: str,
        business_id: str,
        current_query: str = "",
        current_intent: str = None,
        max_messages: int = None
    ) -> List[Dict[str, str]]:
        """
        Get optimized context window for LLM prompt.
        
        Applies all memory algorithms to produce the best context.
        """
        context = self.get_or_create_context(user_id, business_id)
        max_messages = max_messages or self.session_limit
        
        messages = context.messages.copy()
        
        if not messages:
            return []
        
        # Apply algorithms
        
        # 1. Decay function
        messages = self.algorithms.decay_function(
            messages,
            half_life_hours=self.decay_half_life
        )
        
        # 2. Prune irrelevant (if we have a current query)
        if current_query:
            messages = self.algorithms.prune_irrelevant(
                messages,
                relevance_threshold=self.relevance_threshold,
                current_query=current_query,
                current_intent=current_intent
            )
        
        # 3. Sliding window
        messages = self.algorithms.sliding_window(
            messages,
            window_size=max_messages
        )
        
        # 4. Compression (for very long conversations)
        if len(context.messages) > self.compression_threshold:
            messages, summary = self.algorithms.context_compression(
                messages,
                max_messages=max_messages,
                summarize=True
            )
            
            # Prepend summary as system context if available
            if summary:
                messages.insert(0, Message(
                    role="system",
                    content=f"Previous context: {summary}",
                ))
        
        # Convert to LLM format
        return [
            {"role": m.role, "content": m.content}
            for m in messages
        ]
    
    def get_or_create_profile(self, user_id: str) -> UserProfile:
        """Get or create user profile."""
        with self._lock:
            if user_id not in self._profiles:
                self._profiles[user_id] = UserProfile(user_id=user_id)
            return self._profiles[user_id]
    
    def update_profile(
        self,
        user_id: str,
        name: str = None,
        language: str = None,
        preferences: Dict = None
    ):
        """Update user profile with new information."""
        profile = self.get_or_create_profile(user_id)
        
        if name:
            profile.name = name
        if language:
            profile.language = language
        if preferences:
            profile.preferences.update(preferences)
    
    def _archive_to_profile(self, context: ConversationContext):
        """Archive conversation context to user profile."""
        if not context.messages:
            return
        
        profile = self.get_or_create_profile(context.user_id)
        
        # Update extracted entities as preferences
        for key, value in context.extracted_entities.items():
            if key in ['name', 'phone', 'email']:
                setattr(profile, key, value)
            else:
                profile.preferences[key] = value
        
        # Track frequent questions
        user_messages = [m.content for m in context.messages if m.role == 'user']
        for msg in user_messages[-3:]:  # Last 3 questions
            if msg not in profile.frequent_questions:
                profile.frequent_questions.append(msg)
                # Keep only last 10
                profile.frequent_questions = profile.frequent_questions[-10:]
    
    def build_context_summary(
        self,
        user_id: str,
        business_id: str
    ) -> str:
        """
        Build a text summary of conversation context.
        Useful for injecting into system prompts.
        """
        context = self.get_or_create_context(user_id, business_id)
        profile = self.get_or_create_profile(user_id)
        
        parts = []
        
        # User profile info
        if profile.name:
            parts.append(f"Customer name: {profile.name}")
        if profile.language != "en":
            parts.append(f"Preferred language: {profile.language}")
        
        # Common intents
        if profile.common_intents:
            top_intents = sorted(
                profile.common_intents.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]
            intent_str = ", ".join(i[0] for i in top_intents)
            parts.append(f"Common topics: {intent_str}")
        
        # Current context
        if context.extracted_entities:
            entity_str = ", ".join(
                f"{k}: {v}" for k, v in context.extracted_entities.items()
            )
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
        """Clear conversation context."""
        with self._lock:
            key = f"{user_id}:{business_id}"
            if key in self._contexts:
                del self._contexts[key]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get memory manager statistics."""
        return {
            "active_contexts": len(self._contexts),
            "user_profiles": len(self._profiles),
            "total_messages": sum(
                len(c.messages) for c in self._contexts.values()
            ),
        }


# =============================================================================
# Singleton Instance
# =============================================================================

_memory_manager: Optional[AdvancedMemoryManager] = None


def get_memory_manager() -> AdvancedMemoryManager:
    """Get or create the global memory manager."""
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = AdvancedMemoryManager()
    return _memory_manager

