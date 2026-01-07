"""
Conversation Manager for AI Brain.
Handles session state, message history, and context management.
Now includes structured conversation state for deterministic flow handling.

IMPORTANT: Conversation state is now persisted to Redis to survive server restarts.
This is critical for order/appointment booking flows that span multiple messages.
"""

import time
import os
import json
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict
from collections import defaultdict
from threading import Lock
from enum import Enum

logger = logging.getLogger('reviseit.conversation')

# Try to import Redis
try:
    import redis
    from redis.exceptions import RedisError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None
    RedisError = Exception


class FlowStatus(str, Enum):
    """Status of a conversation flow."""
    IDLE = "idle"
    IN_PROGRESS = "in_progress"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    COMPLETE = "complete"
    CANCELLED = "cancelled"


@dataclass
class ConversationState:
    """
    Structured state for deterministic conversation flows.
    
    This is the core fix for context loss - instead of relying on LLM memory,
    we maintain an explicit state object that tracks exactly what has been
    collected and what is still needed.
    """
    # Current active flow (e.g., "appointment_booking", "lead_capture", None)
    active_flow: Optional[str] = None
    
    # Flow status
    flow_status: FlowStatus = FlowStatus.IDLE
    
    # Fields already collected (e.g., {"name": "John", "phone": "9876543210"})
    collected_fields: Dict[str, Any] = field(default_factory=dict)
    
    # Fields still needed (e.g., ["date", "time"])
    missing_fields: List[str] = field(default_factory=list)
    
    # Current field being asked
    current_field: Optional[str] = None
    
    # Last question asked (to avoid repeating)
    last_question: Optional[str] = None
    
    # Flow-specific configuration (e.g., appointment settings)
    flow_config: Dict[str, Any] = field(default_factory=dict)
    
    # Timestamp when flow was started
    flow_started_at: Optional[float] = None
    
    def start_flow(self, flow_name: str, required_fields: List[str], config: Dict = None):
        """Start a new conversation flow."""
        self.active_flow = flow_name
        self.flow_status = FlowStatus.IN_PROGRESS
        self.collected_fields = {}
        self.missing_fields = required_fields.copy()
        self.current_field = required_fields[0] if required_fields else None
        self.flow_config = config or {}
        self.flow_started_at = time.time()
    
    def collect_field(self, field_name: str, value: Any) -> Optional[str]:
        """
        Collect a field value and return the next field to ask.
        Returns None if all fields are collected.
        """
        self.collected_fields[field_name] = value
        if field_name in self.missing_fields:
            self.missing_fields.remove(field_name)
        
        if self.missing_fields:
            self.current_field = self.missing_fields[0]
            return self.current_field
        else:
            self.current_field = None
            self.flow_status = FlowStatus.AWAITING_CONFIRMATION
            return None
    
    def cancel_flow(self):
        """Cancel the current flow."""
        self.active_flow = None
        self.flow_status = FlowStatus.CANCELLED
        self.collected_fields = {}
        self.missing_fields = []
        self.current_field = None
        self.flow_config = {}
    
    def complete_flow(self):
        """Mark flow as complete."""
        self.flow_status = FlowStatus.COMPLETE
        # Keep collected_fields for reference, clear flow state
        self.active_flow = None
        self.missing_fields = []
        self.current_field = None
    
    def is_active(self) -> bool:
        """Check if a flow is currently active (including awaiting confirmation)."""
        return self.active_flow is not None and self.flow_status in (
            FlowStatus.IN_PROGRESS, 
            FlowStatus.AWAITING_CONFIRMATION
        )
    
    def has_field(self, field_name: str) -> bool:
        """Check if a field has already been collected."""
        return field_name in self.collected_fields and self.collected_fields[field_name]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "active_flow": self.active_flow,
            "flow_status": self.flow_status.value if self.flow_status else None,
            "collected_fields": self.collected_fields.copy(),
            "missing_fields": self.missing_fields.copy(),
            "current_field": self.current_field
        }




@dataclass
class ConversationSession:
    """A single user's conversation session with structured state tracking."""
    user_id: str
    messages: List[Dict[str, str]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Context from detected entities
    context: Dict[str, Any] = field(default_factory=dict)
    
    # Last detected intent for continuity
    last_intent: Optional[str] = None
    
    # ADDED: Structured conversation state for flows like appointment booking
    conversation_state: ConversationState = field(default_factory=ConversationState)
    
    def add_message(self, role: str, content: str):
        """Add a message to the session."""
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": time.time()
        })
        self.last_activity = time.time()
    
    def get_history(self, max_messages: int = 10) -> List[Dict[str, str]]:
        """Get recent message history."""
        return self.messages[-max_messages:]
    
    def update_context(self, entities: Dict[str, Any]):
        """Update session context with detected entities."""
        for key, value in entities.items():
            if value:  # Only update if not None/empty
                self.context[key] = value
    
    def is_expired(self, ttl_seconds: int = 3600) -> bool:
        """Check if session has expired."""
        return (time.time() - self.last_activity) > ttl_seconds


class ConversationManager:
    """
    Manages conversation sessions for all users.
    
    Features:
    - Per-user session management
    - Message history with sliding window
    - Context persistence across messages
    - Session expiration and cleanup
    - Thread-safe operations
    - Redis persistence for flow state survival across restarts
    
    CRITICAL: Flow states (order_booking, appointment_booking) are now
    persisted to Redis to prevent loss during server restarts.
    """
    
    # Redis key prefix for conversation states
    REDIS_KEY_PREFIX = "conversation_state"
    REDIS_STATE_TTL = 7200  # 2 hours - longer than session TTL for safety
    
    def __init__(
        self,
        max_history: int = 10,
        session_ttl: int = 3600,  # 1 hour
        cleanup_interval: int = 300,  # 5 minutes
        redis_url: str = None
    ):
        self.max_history = max_history
        self.session_ttl = session_ttl
        self.cleanup_interval = cleanup_interval
        
        self._sessions: Dict[str, ConversationSession] = {}
        self._lock = Lock()
        self._last_cleanup = time.time()
        
        # Redis connection for persistent state storage
        self._redis: Optional[redis.Redis] = None
        self._redis_available = False
        self._redis_url = redis_url or os.getenv("REDIS_URL")
        self._connect_redis()
    
    def _connect_redis(self):
        """Connect to Redis for persistent state storage."""
        if not REDIS_AVAILABLE or not self._redis_url:
            logger.warning("Redis not available for conversation state - using memory only (state will be lost on restart)")
            return
        
        try:
            self._redis = redis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                retry_on_timeout=True,
            )
            self._redis.ping()
            self._redis_available = True
            logger.info(f"✅ Conversation state persistence enabled (Redis)")
        except Exception as e:
            logger.error(f"❌ Redis connection failed for conversation state: {e}")
            self._redis_available = False
    
    def _get_redis_key(self, user_id: str) -> str:
        """Generate Redis key for user's conversation state."""
        return f"{self.REDIS_KEY_PREFIX}:{user_id}"
    
    def _persist_state_to_redis(self, user_id: str, session: ConversationSession) -> bool:
        """
        Persist conversation state to Redis.
        
        CRITICAL: Called after every state change during active flows
        to ensure state survives server restarts.
        """
        if not self._redis_available:
            return False
        
        try:
            state = session.conversation_state
            
            # Only persist if there's an active flow worth saving
            if not state.active_flow and not state.collected_fields:
                return True  # Nothing to persist
            
            state_data = {
                "user_id": user_id,
                "active_flow": state.active_flow,
                "flow_status": state.flow_status.value if state.flow_status else "idle",
                "collected_fields": state.collected_fields,
                "missing_fields": state.missing_fields,
                "current_field": state.current_field,
                "last_question": state.last_question,
                "flow_config": state.flow_config,
                "flow_started_at": state.flow_started_at,
                "last_activity": session.last_activity,
                "last_intent": session.last_intent,
                "context": session.context,
                # Store recent messages for context recovery
                "recent_messages": session.messages[-10:] if session.messages else [],
            }
            
            key = self._get_redis_key(user_id)
            self._redis.setex(key, self.REDIS_STATE_TTL, json.dumps(state_data))
            logger.debug(f"💾 Persisted conversation state for {user_id[:12]}... (flow: {state.active_flow})")
            return True
            
        except Exception as e:
            logger.error(f"Failed to persist conversation state: {e}")
            return False
    
    def _load_state_from_redis(self, user_id: str) -> Optional[ConversationSession]:
        """
        Load conversation state from Redis.
        
        Called when getting a session that doesn't exist in memory,
        allowing recovery after server restart.
        """
        if not self._redis_available:
            return None
        
        try:
            key = self._get_redis_key(user_id)
            data = self._redis.get(key)
            
            if not data:
                return None
            
            state_data = json.loads(data)
            
            # Reconstruct session
            session = ConversationSession(user_id=user_id)
            session.last_activity = state_data.get("last_activity", time.time())
            session.last_intent = state_data.get("last_intent")
            session.context = state_data.get("context", {})
            
            # Restore messages
            for msg in state_data.get("recent_messages", []):
                session.messages.append(msg)
            
            # Reconstruct conversation state
            state = session.conversation_state
            state.active_flow = state_data.get("active_flow")
            state.flow_status = FlowStatus(state_data.get("flow_status", "idle"))
            state.collected_fields = state_data.get("collected_fields", {})
            state.missing_fields = state_data.get("missing_fields", [])
            state.current_field = state_data.get("current_field")
            state.last_question = state_data.get("last_question")
            state.flow_config = state_data.get("flow_config", {})
            state.flow_started_at = state_data.get("flow_started_at")
            
            logger.info(f"🔄 Recovered conversation state for {user_id[:12]}... (flow: {state.active_flow}, collected: {list(state.collected_fields.keys())})")
            return session
            
        except Exception as e:
            logger.error(f"Failed to load conversation state from Redis: {e}")
            return None
    
    def _delete_state_from_redis(self, user_id: str):
        """Delete conversation state from Redis when flow completes."""
        if not self._redis_available:
            return
        
        try:
            key = self._get_redis_key(user_id)
            self._redis.delete(key)
            logger.debug(f"🗑️ Deleted conversation state for {user_id[:12]}...")
        except Exception as e:
            logger.error(f"Failed to delete conversation state from Redis: {e}")
    
    def get_or_create_session(self, user_id: str) -> ConversationSession:
        """Get existing session or create new one. Recovers from Redis if needed."""
        with self._lock:
            # Periodic cleanup
            self._maybe_cleanup()
            
            if user_id not in self._sessions:
                # Try to recover from Redis first (critical for flow recovery after restart)
                recovered_session = self._load_state_from_redis(user_id)
                if recovered_session:
                    self._sessions[user_id] = recovered_session
                    return recovered_session
                
                # Create new session
                self._sessions[user_id] = ConversationSession(user_id=user_id)
            
            return self._sessions[user_id]
    
    def get_session(self, user_id: str) -> Optional[ConversationSession]:
        """Get session if exists, otherwise None. Recovers from Redis if needed."""
        with self._lock:
            session = self._sessions.get(user_id)
            if session and not session.is_expired(self.session_ttl):
                return session
            
            # Session not in memory or expired - try Redis recovery
            if not session:
                recovered_session = self._load_state_from_redis(user_id)
                if recovered_session and not recovered_session.is_expired(self.session_ttl):
                    self._sessions[user_id] = recovered_session
                    return recovered_session
            
            return None
    
    def add_message(
        self,
        user_id: str,
        role: str,
        content: str,
        entities: Dict[str, Any] = None
    ):
        """
        Add a message to user's conversation.
        
        Args:
            user_id: User identifier
            role: 'user' or 'assistant'
            content: Message content
            entities: Detected entities to add to context
        """
        session = self.get_or_create_session(user_id)
        session.add_message(role, content)
        
        if entities:
            session.update_context(entities)
        
        # If there's an active flow, persist state (captures message history)
        if session.conversation_state.is_active():
            self._persist_state_to_redis(user_id, session)
    
    def get_history(
        self,
        user_id: str,
        max_messages: int = None
    ) -> List[Dict[str, str]]:
        """
        Get conversation history for a user.
        
        Args:
            user_id: User identifier
            max_messages: Maximum messages to return (default: self.max_history)
            
        Returns:
            List of messages with role and content
        """
        session = self.get_session(user_id)
        if not session:
            return []
        
        max_msgs = max_messages or self.max_history
        return session.get_history(max_msgs)
    
    def get_context(self, user_id: str) -> Dict[str, Any]:
        """
        Get accumulated context for a user.
        
        This includes entities extracted from previous messages.
        """
        session = self.get_session(user_id)
        if not session:
            return {}
        return session.context.copy()
    
    def set_last_intent(self, user_id: str, intent: str):
        """Store the last detected intent for the user."""
        session = self.get_or_create_session(user_id)
        session.last_intent = intent
    
    def get_last_intent(self, user_id: str) -> Optional[str]:
        """Get the last detected intent for context."""
        session = self.get_session(user_id)
        return session.last_intent if session else None
    
    def clear_session(self, user_id: str):
        """Clear a user's session."""
        with self._lock:
            if user_id in self._sessions:
                del self._sessions[user_id]
    
    def clear_all_sessions(self):
        """Clear all sessions."""
        with self._lock:
            self._sessions.clear()
    
    def get_session_count(self) -> int:
        """Get number of active sessions."""
        with self._lock:
            return len(self._sessions)
    
    def _maybe_cleanup(self):
        """Run cleanup if enough time has passed."""
        now = time.time()
        if now - self._last_cleanup > self.cleanup_interval:
            self._cleanup_expired()
            self._last_cleanup = now
    
    def _cleanup_expired(self):
        """Remove expired sessions."""
        expired = [
            uid for uid, session in self._sessions.items()
            if session.is_expired(self.session_ttl)
        ]
        for uid in expired:
            del self._sessions[uid]
    
    # =========================================================================
    # CONTEXT HELPERS
    # =========================================================================
    
    def get_context_window(
        self,
        user_id: str,
        max_messages: int = None
    ) -> List[Dict[str, str]]:
        """
        Get formatted context window for LLM prompt.
        
        Returns messages formatted for ChatGPT conversation.
        """
        history = self.get_history(user_id, max_messages)
        
        # Format for ChatGPT
        return [
            {"role": msg["role"], "content": msg["content"]}
            for msg in history
        ]
    
    def build_context_summary(self, user_id: str) -> str:
        """
        Build a text summary of the conversation context.
        
        Useful for injecting into system prompts.
        """
        session = self.get_session(user_id)
        if not session:
            return ""
        
        parts = []
        
        # Add detected entities
        if session.context:
            parts.append("Known information about this customer:")
            for key, value in session.context.items():
                if value:
                    parts.append(f"- {key}: {value}")
        
        # Add last intent
        if session.last_intent:
            parts.append(f"\nLast topic discussed: {session.last_intent}")
        
        return "\n".join(parts) if parts else ""
    
    # =========================================================================
    # CONVERSATION STATE MANAGEMENT (for flows like appointment booking)
    # =========================================================================
    
    def get_state(self, user_id: str) -> Optional[ConversationState]:
        """Get the structured conversation state for a user."""
        session = self.get_session(user_id)
        if session:
            return session.conversation_state
        return None
    
    def start_flow(
        self,
        user_id: str,
        flow_name: str,
        required_fields: List[str],
        config: Dict = None
    ) -> ConversationState:
        """
        Start a structured conversation flow for a user.
        
        Args:
            user_id: User identifier
            flow_name: Name of the flow (e.g., "appointment_booking")
            required_fields: List of field names to collect
            config: Flow-specific configuration
            
        Returns:
            The conversation state object
        """
        session = self.get_or_create_session(user_id)
        session.conversation_state.start_flow(flow_name, required_fields, config)
        
        # CRITICAL: Persist to Redis immediately after starting flow
        self._persist_state_to_redis(user_id, session)
        logger.info(f"📋 Started flow '{flow_name}' for user {user_id[:12]}... (persisted to Redis)")
        
        return session.conversation_state
    
    def update_flow_field(
        self,
        user_id: str,
        field_name: str,
        value: Any
    ) -> Optional[str]:
        """
        Collect a field value in the current flow.
        
        Args:
            user_id: User identifier
            field_name: Name of the field being collected
            value: Validated value for the field
            
        Returns:
            Next field to ask for, or None if all fields collected
        """
        session = self.get_session(user_id)
        if session and session.conversation_state.is_active():
            result = session.conversation_state.collect_field(field_name, value)
            
            # CRITICAL: Persist after each field collection to survive restarts
            self._persist_state_to_redis(user_id, session)
            
            return result
        return None
    
    def cancel_flow(self, user_id: str) -> bool:
        """
        Cancel the current conversation flow.
        
        Returns:
            True if there was an active flow that was cancelled
        """
        session = self.get_session(user_id)
        if session and session.conversation_state.is_active():
            session.conversation_state.cancel_flow()
            
            # Delete from Redis since flow is cancelled
            self._delete_state_from_redis(user_id)
            logger.info(f"📋 Cancelled flow for user {user_id[:12]}... (removed from Redis)")
            
            return True
        return False
    
    def complete_flow(self, user_id: str) -> Dict[str, Any]:
        """
        Complete the current flow and return collected data.
        
        Returns:
            Dictionary of collected fields
        """
        session = self.get_session(user_id)
        if session:
            collected = session.conversation_state.collected_fields.copy()
            session.conversation_state.complete_flow()
            
            # Delete from Redis since flow is complete
            self._delete_state_from_redis(user_id)
            logger.info(f"📋 Completed flow for user {user_id[:12]}... (removed from Redis)")
            
            return collected
        return {}
    
    def is_flow_active(self, user_id: str) -> bool:
        """Check if user has an active conversation flow."""
        session = self.get_session(user_id)
        return session is not None and session.conversation_state.is_active()
    
    def persist_state(self, user_id: str) -> bool:
        """
        Force persist current state to Redis.
        
        Call this after modifying collected_fields directly in order flow.
        This ensures state changes are saved immediately.
        """
        session = self.get_session(user_id)
        if session:
            return self._persist_state_to_redis(user_id, session)
        return False
    
    def get_active_flow(self, user_id: str) -> Optional[str]:
        """Get the name of the currently active flow, if any."""
        session = self.get_session(user_id)
        if session and session.conversation_state.is_active():
            return session.conversation_state.active_flow
        return None
    
    def build_state_context(self, user_id: str) -> str:
        """
        Build a state-aware context string for LLM prompts.
        
        This is CRITICAL for preventing re-asking - the LLM needs to know
        exactly what has been collected and what is still missing.
        """
        session = self.get_session(user_id)
        if not session:
            return ""
        
        parts = []
        state = session.conversation_state
        
        # Add conversation state information
        if state.is_active():
            parts.append(f"\n=== ACTIVE FLOW: {state.active_flow} ===")
            parts.append("STATUS: Collecting information from user")
            
            # CRITICAL: Show what's already collected
            if state.collected_fields:
                parts.append("\nALREADY COLLECTED (DO NOT ASK AGAIN):")
                for field, value in state.collected_fields.items():
                    parts.append(f"  ✓ {field}: {value}")
            
            # Show what's still needed
            if state.missing_fields:
                parts.append("\nSTILL NEEDED (ask for these one at a time):")
                for field in state.missing_fields:
                    parts.append(f"  ○ {field}")
            
            # Show what to ask next
            if state.current_field:
                parts.append(f"\nNEXT QUESTION: Ask for '{state.current_field}'")
            
            parts.append("\n=== END FLOW STATE ===")
        
        elif state.flow_status == FlowStatus.AWAITING_CONFIRMATION:
            parts.append("\n=== AWAITING CONFIRMATION ===")
            parts.append("All fields collected. Ask user to confirm booking.")
            if state.collected_fields:
                parts.append("\nSummary:")
                for field, value in state.collected_fields.items():
                    parts.append(f"  • {field}: {value}")
            parts.append("=== END FLOW STATE ===")
        
        # Add general context
        if session.context:
            parts.append("\nKnown customer information:")
            for key, value in session.context.items():
                if value:
                    parts.append(f"  - {key}: {value}")
        
        return "\n".join(parts)


# =============================================================================
# DATABASE-BACKED CONVERSATION MANAGER (Optional)
# =============================================================================

class DatabaseConversationManager(ConversationManager):
    """
    Conversation manager with database persistence.
    
    Extends the in-memory manager to store conversations in a database
    for durability and analytics.
    
    Note: This is a template - implement the database methods based on your DB choice.
    """
    
    def __init__(
        self,
        db_client=None,  # Your database client (Supabase, etc.)
        table_name: str = "conversations",
        **kwargs
    ):
        super().__init__(**kwargs)
        self.db = db_client
        self.table_name = table_name
    
    def _persist_message(
        self,
        user_id: str,
        role: str,
        content: str,
        metadata: Dict[str, Any] = None
    ):
        """Persist a message to database."""
        if not self.db:
            return
        
        # Example for Supabase:
        # self.db.table(self.table_name).insert({
        #     "user_id": user_id,
        #     "role": role,
        #     "content": content,
        #     "metadata": metadata,
        #     "created_at": "now()"
        # }).execute()
        pass
    
    def _load_session_from_db(self, user_id: str) -> Optional[ConversationSession]:
        """Load a session from database."""
        if not self.db:
            return None
        
        # Example for Supabase:
        # result = self.db.table(self.table_name) \
        #     .select("*") \
        #     .eq("user_id", user_id) \
        #     .order("created_at", desc=True) \
        #     .limit(self.max_history) \
        #     .execute()
        # 
        # if result.data:
        #     session = ConversationSession(user_id=user_id)
        #     for row in reversed(result.data):
        #         session.add_message(row["role"], row["content"])
        #     return session
        return None
    
    def add_message(
        self,
        user_id: str,
        role: str,
        content: str,
        entities: Dict[str, Any] = None
    ):
        """Add message to both memory and database."""
        super().add_message(user_id, role, content, entities)
        
        # Also persist to database
        self._persist_message(user_id, role, content, {
            "entities": entities
        })


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

# Global conversation manager instance
_conversation_manager: Optional[ConversationManager] = None


def get_conversation_manager(
    max_history: int = 10,
    session_ttl: int = 3600,
    redis_url: str = None
) -> ConversationManager:
    """Get or create the global conversation manager with Redis persistence."""
    global _conversation_manager
    if _conversation_manager is None:
        _conversation_manager = ConversationManager(
            max_history=max_history,
            session_ttl=session_ttl,
            redis_url=redis_url
        )
    return _conversation_manager


def reset_conversation_manager():
    """Reset the global conversation manager (for testing)."""
    global _conversation_manager
    _conversation_manager = None
