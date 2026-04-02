"""
Context Builder Stage — FAANG-Grade Context Assembly
=====================================================

Builds AI context from conversation history and message data.

FIXED: Previously history=None was always passed, making every AI call 
stateless. Now we fetch the last N messages from the DB.

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger('flowauxi.messaging.pipeline.context_builder')


@dataclass
class AIContext:
    """
    All context needed for an AI response — single responsibility.
    
    Attributes:
        message_text: The user's message text
        sender_id: Platform-specific sender ID
        tenant: TenantContext from resolver
        conversation_id: Conversation UUID
        business_data: Business profile for AI Brain
        conversation_history: Previous messages for context
        channel: Channel name
        channel_account_id: Platform account ID
        access_token: API access token
        trace_id: Distributed tracing ID
        trigger_source: Source of AI trigger ('fallback' | 'rule_ai_response')
    """
    message_text: str
    sender_id: str
    tenant: Any  # TenantContext
    conversation_id: str
    business_data: Dict[str, Any]
    conversation_history: List[Dict[str, str]]
    channel: str
    channel_account_id: str
    access_token: str
    trace_id: str
    trigger_source: str = 'fallback'


class ContextBuilderStage:
    """
    Builds AI context from conversation history and message data.
    
    Usage:
        builder = ContextBuilderStage()
        
        ai_context = builder.build(
            message=normalized_message,
            tenant=tenant_ctx,
            business_context=business_ctx,
            trace_id="abc123",
        )
        
        print(f"History length: {len(ai_context.conversation_history)}")
    """
    
    def __init__(self, supabase_client=None):
        """
        Args:
            supabase_client: Optional Supabase client for testing.
        """
        self._db = supabase_client
    
    def _get_db(self):
        """Lazy-load Supabase client."""
        if self._db is None:
            from supabase_client import get_supabase_client
            self._db = get_supabase_client()
        return self._db
    
    def build(
        self,
        message,  # NormalizedMessage
        tenant,   # TenantContext
        business_context,  # BusinessContext
        trace_id: str = '',
    ) -> AIContext:
        """
        Build complete AI context for response generation.
        
        Args:
            message: NormalizedMessage from webhook
            tenant: TenantContext from TenantResolverStage
            business_context: BusinessContext from BusinessLoaderStage
            trace_id: Distributed tracing ID
            
        Returns:
            AIContext ready for AI Brain
        """
        # Generate deterministic conversation ID
        conversation_id = self._get_or_create_conversation_id(
            message, tenant, trace_id
        )
        
        # Build message text
        message_text = message.text or ""
        if not message_text and message.message_type.value != "text":
            message_text = f"[{message.message_type.value} received from User]"
        
        # Fetch conversation history
        history = self._fetch_conversation_history(
            conversation_id,
            limit=10,
            trace_id=trace_id,
        )
        
        return AIContext(
            message_text=message_text,
            sender_id=message.sender_id,
            tenant=tenant,
            conversation_id=conversation_id,
            business_data=business_context.business_data,
            conversation_history=history,
            channel=message.channel.value,
            channel_account_id=message.channel_account_id,
            access_token=business_context.access_token or '',
            trace_id=trace_id,
            trigger_source='fallback',
        )
    
    def _get_or_create_conversation_id(
        self,
        message,  # NormalizedMessage
        tenant,   # TenantContext
        trace_id: str,
    ) -> str:
        """
        Get or create deterministic conversation ID.
        
        Returns existing conversation_id if message has one,
        otherwise generates deterministic UUID.
        """
        if hasattr(message, 'conversation_id') and message.conversation_id:
            return message.conversation_id
        
        # Deterministic UUID based on tenant + channel + sender
        return str(uuid.uuid5(
            uuid.NAMESPACE_DNS,
            f"{tenant.firebase_uid}:{message.channel.value}:{message.sender_id}"
        ))
    
    def _fetch_conversation_history(
        self,
        conversation_id: str,
        limit: int = 10,
        trace_id: str = '',
    ) -> List[Dict[str, str]]:
        """
        Fetch recent conversation history from unified_messages.
        
        FIXED (Root Cause #2 + #6): Previously history=None was always passed,
        making every AI call stateless. Now we fetch the last N messages from
        the DB and format them for the AI Brain.
        
        Returns:
            List of {"role": "user"|"assistant", "content": "..."} dicts
            compatible with AIBrain.generate_reply(history=...) parameter.
        """
        db = self._get_db()
        if not db:
            logger.warning(f"history_fetch_no_db trace={trace_id}")
            return []
        
        try:
            result = db.table('unified_messages').select(
                'direction, message_body, sender_id, created_at'
            ).eq(
                'conversation_id', conversation_id
            ).order(
                'created_at', desc=True
            ).limit(limit).execute()
            
            if not result.data:
                return []
            
            # Reverse to chronological order (oldest first)
            rows = list(reversed(result.data))
            
            history = []
            for row in rows:
                direction = row.get('direction', '')
                content = row.get('message_body', '') or ''
                if not content:
                    continue
                
                role = 'user' if direction == 'inbound' else 'assistant'
                history.append({'role': role, 'content': content})
            
            logger.debug(
                f"history_fetched trace={trace_id} "
                f"conv={conversation_id[:15]} messages={len(history)}"
            )
            return history
            
        except Exception as e:
            logger.warning(f"history_fetch_error trace={trace_id}: {e}")
            return []


# =============================================================================
# Singleton
# =============================================================================

_instance: Optional[ContextBuilderStage] = None


def get_context_builder_stage() -> ContextBuilderStage:
    """Get singleton ContextBuilderStage instance."""
    global _instance
    if _instance is None:
        _instance = ContextBuilderStage()
    return _instance
