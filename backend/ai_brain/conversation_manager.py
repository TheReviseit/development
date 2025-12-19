"""
Conversation Manager for AI Brain.
Handles session state, message history, and context management.
"""

import time
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from collections import defaultdict
from threading import Lock


@dataclass
class ConversationSession:
    """A single user's conversation session."""
    user_id: str
    messages: List[Dict[str, str]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Context from detected entities
    context: Dict[str, Any] = field(default_factory=dict)
    
    # Last detected intent for continuity
    last_intent: Optional[str] = None
    
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
    """
    
    def __init__(
        self,
        max_history: int = 10,
        session_ttl: int = 3600,  # 1 hour
        cleanup_interval: int = 300  # 5 minutes
    ):
        self.max_history = max_history
        self.session_ttl = session_ttl
        self.cleanup_interval = cleanup_interval
        
        self._sessions: Dict[str, ConversationSession] = {}
        self._lock = Lock()
        self._last_cleanup = time.time()
    
    def get_or_create_session(self, user_id: str) -> ConversationSession:
        """Get existing session or create new one."""
        with self._lock:
            # Periodic cleanup
            self._maybe_cleanup()
            
            if user_id not in self._sessions:
                self._sessions[user_id] = ConversationSession(user_id=user_id)
            
            return self._sessions[user_id]
    
    def get_session(self, user_id: str) -> Optional[ConversationSession]:
        """Get session if exists, otherwise None."""
        with self._lock:
            session = self._sessions.get(user_id)
            if session and not session.is_expired(self.session_ttl):
                return session
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
    session_ttl: int = 3600
) -> ConversationManager:
    """Get or create the global conversation manager."""
    global _conversation_manager
    if _conversation_manager is None:
        _conversation_manager = ConversationManager(
            max_history=max_history,
            session_ttl=session_ttl
        )
    return _conversation_manager
