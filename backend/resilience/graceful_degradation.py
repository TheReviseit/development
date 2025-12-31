"""
Graceful Degradation Handler.
Provides fallback responses when services are unavailable.
"""

import logging
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field
from functools import wraps

logger = logging.getLogger('reviseit.resilience')


@dataclass
class FallbackResponse:
    """A fallback response for graceful degradation."""
    reply: str
    intent: str = "fallback"
    confidence: float = 1.0
    needs_human: bool = True
    suggested_actions: List[str] = field(default_factory=lambda: ["Try again", "Contact us"])
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "reply": self.reply,
            "intent": self.intent,
            "confidence": self.confidence,
            "needs_human": self.needs_human,
            "suggested_actions": self.suggested_actions,
            "metadata": {
                **self.metadata,
                "is_fallback": True,
            },
        }


class FallbackHandler:
    """
    Handler for graceful degradation with contextual fallbacks.
    
    Provides appropriate fallback responses based on:
    - Intent type
    - Error type
    - Business context
    """
    
    # Default fallback messages by error type
    ERROR_FALLBACKS = {
        "ai_unavailable": (
            "I'm having a moment! 🙏 Please try again shortly, "
            "or I can connect you with our team."
        ),
        "database_error": (
            "I couldn't access that information right now. "
            "Our team will follow up shortly!"
        ),
        "rate_limited": (
            "We're experiencing high volume. "
            "Please try again in a moment. 🙏"
        ),
        "timeout": (
            "That's taking longer than expected. "
            "Let me connect you with someone who can help."
        ),
        "validation_error": (
            "I didn't quite understand that. "
            "Could you rephrase your question?"
        ),
        "default": (
            "I'm having trouble processing that. "
            "Our team will assist you shortly! 🙏"
        ),
    }
    
    # Contextual fallbacks by intent
    INTENT_FALLBACKS = {
        "pricing": (
            "I couldn't fetch the latest pricing. "
            "Please check our website or contact us for current rates."
        ),
        "booking": (
            "I couldn't check availability right now. "
            "Please call us to book your appointment."
        ),
        "hours": (
            "I couldn't confirm our hours. "
            "Please check our website or give us a call."
        ),
        "location": (
            "I couldn't access location info. "
            "Please check Google Maps or contact us for directions."
        ),
    }
    
    def __init__(self, business_name: str = "our team"):
        self.business_name = business_name
    
    def get_fallback(
        self,
        error_type: str = "default",
        intent: str = None,
        business_data: Dict[str, Any] = None,
        include_contact: bool = True
    ) -> FallbackResponse:
        """
        Get appropriate fallback response.
        
        Args:
            error_type: Type of error that occurred
            intent: Detected intent (for contextual fallback)
            business_data: Business data for personalization
            include_contact: Whether to include contact info
        
        Returns:
            FallbackResponse with appropriate message
        """
        business_name = self.business_name
        if business_data:
            business_name = business_data.get("business_name", business_name)
        
        # Try intent-specific fallback first
        if intent and intent in self.INTENT_FALLBACKS:
            message = self.INTENT_FALLBACKS[intent]
        else:
            # Use error-type fallback
            message = self.ERROR_FALLBACKS.get(
                error_type,
                self.ERROR_FALLBACKS["default"]
            )
        
        # Add contact info if available
        if include_contact and business_data:
            contact = business_data.get("contact", {})
            if contact.get("phone"):
                message += f"\n\n📞 Call us: {contact['phone']}"
            if contact.get("email"):
                message += f"\n📧 Email: {contact['email']}"
        
        # Determine suggested actions based on intent
        suggested_actions = ["Try again", "Contact us"]
        if intent == "booking":
            suggested_actions = ["Call to book", "Try again"]
        elif intent == "pricing":
            suggested_actions = ["View website", "Contact us"]
        
        return FallbackResponse(
            reply=message,
            intent=intent or "unknown",
            needs_human=error_type in ["timeout", "database_error"],
            suggested_actions=suggested_actions,
            metadata={
                "error_type": error_type,
                "original_intent": intent,
            },
        )
    
    def get_recovery_message(
        self,
        context: str = None,
        last_intent: str = None
    ) -> str:
        """
        Get a recovery message that maintains conversation context.
        
        Args:
            context: Context from previous conversation
            last_intent: Last detected intent
        
        Returns:
            Recovery message with context
        """
        base_message = "Let me help you with that."
        
        if context:
            base_message = f"I remember you were asking about {context}. "
        
        if last_intent:
            intent_prompts = {
                "pricing": "Would you like me to try fetching prices again?",
                "booking": "Shall I try to check availability again?",
                "hours": "Want me to check our hours again?",
            }
            if last_intent in intent_prompts:
                base_message += intent_prompts[last_intent]
        
        return base_message


# =============================================================================
# Singleton and Decorator
# =============================================================================

_fallback_handler: Optional[FallbackHandler] = None


def get_fallback_handler(business_name: str = "our team") -> FallbackHandler:
    """Get or create the global fallback handler."""
    global _fallback_handler
    if _fallback_handler is None:
        _fallback_handler = FallbackHandler(business_name)
    return _fallback_handler


def with_fallback(
    error_type: str = "default",
    fallback_response: Dict[str, Any] = None
):
    """
    Decorator to wrap function with fallback response on error.
    
    Usage:
        @with_fallback(error_type="ai_unavailable")
        def generate_ai_response():
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error in {func.__name__}: {e}")
                
                if fallback_response:
                    return fallback_response
                
                handler = get_fallback_handler()
                return handler.get_fallback(error_type=error_type).to_dict()
        
        return wrapper
    return decorator

