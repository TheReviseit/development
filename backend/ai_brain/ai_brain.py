"""
Main AI Brain orchestrator class.
Coordinates intent detection, response generation, and business data handling.
"""

from typing import Dict, List, Any, Optional, Union
from .schemas import BusinessData, ConversationMessage, GenerateReplyResponse
from .intents import IntentType, IntentDetector
from .response_generator import ResponseGenerator
from .data_loader import BusinessDataLoader, DictDataLoader
from .config import AIBrainConfig, default_config


class AIBrain:
    """
    Main AI Brain class for WhatsApp business chatbots.
    
    This is the primary interface for generating intelligent responses.
    It coordinates intent detection, business data loading, and response generation.
    
    Example usage:
        ```python
        brain = AIBrain()
        
        result = brain.generate_reply(
            business_data={
                "business_id": "biz_123",
                "business_name": "Style Studio",
                "industry": "salon",
                "products_services": [{"name": "Haircut", "price": 300}]
            },
            user_message="What is the price for haircut?",
            history=[]
        )
        
        print(result["reply"])  # WhatsApp-ready response
        ```
    """
    
    def __init__(
        self,
        config: AIBrainConfig = None,
        data_loader: BusinessDataLoader = None
    ):
        """
        Initialize AI Brain.
        
        Args:
            config: Configuration object. Uses default if not provided.
            data_loader: Business data loader. Uses DictDataLoader if not provided.
        """
        self.config = config or default_config
        self.data_loader = data_loader or DictDataLoader()
        self.intent_detector = IntentDetector()
        self.response_generator = ResponseGenerator(self.config)
    
    def generate_reply(
        self,
        business_data: Union[Dict[str, Any], BusinessData] = None,
        user_message: str = "",
        history: List[Dict[str, str]] = None,
        business_id: str = None
    ) -> Dict[str, Any]:
        """
        Generate a reply to customer message.
        
        This is the main entry point for the AI brain.
        
        Args:
            business_data: Business profile data (dict or BusinessData object).
                          If not provided, will attempt to load using business_id.
            user_message: Customer's WhatsApp message
            history: Conversation history as list of {"role": str, "content": str}
            business_id: Business ID for loading data (used if business_data not provided)
            
        Returns:
            Dictionary containing:
            - reply: str - WhatsApp-ready message
            - intent: str - Detected intent type
            - confidence: float - Intent detection confidence
            - needs_human: bool - Whether to escalate to human
            - suggested_actions: list - Quick reply suggestions
            - metadata: dict - Additional info (generation method, etc.)
        """
        # Validate input
        if not user_message or not user_message.strip():
            return self._error_response("Empty message received")
        
        user_message = user_message.strip()
        
        # Load/validate business data
        try:
            business = self._get_business_data(business_data, business_id)
        except Exception as e:
            return self._error_response(f"Failed to load business data: {str(e)}")
        
        if not business:
            return self._error_response("Business data not found")
        
        # Convert history to ConversationMessage objects
        conversation_history = self._parse_history(history)
        
        # Detect intent
        intent, confidence = self.intent_detector.detect(
            user_message, 
            history or []
        )
        
        # Check if we need human handoff
        needs_human = self._should_handoff(intent, confidence)
        
        # Generate response
        if needs_human and self.config.fallback_to_human:
            reply = self.response_generator.generate_handoff_message(
                business,
                query_summary=user_message[:100]
            )
            metadata = {"generation_method": "handoff", "reason": "low_confidence"}
        else:
            reply, metadata = self.response_generator.generate(
                business,
                user_message,
                intent,
                confidence,
                conversation_history
            )
        
        # Get suggested quick replies
        suggested_actions = self._get_suggested_actions(intent, business)
        
        return {
            "reply": reply,
            "intent": intent.value,
            "confidence": round(confidence, 2),
            "needs_human": needs_human,
            "suggested_actions": suggested_actions,
            "metadata": metadata
        }
    
    def _get_business_data(
        self,
        data: Union[Dict[str, Any], BusinessData, None],
        business_id: str = None
    ) -> Optional[BusinessData]:
        """Get and validate business data."""
        
        # If already a BusinessData object, return it
        if isinstance(data, BusinessData):
            return data
        
        # If dict provided, convert to BusinessData
        if isinstance(data, dict) and data:
            return BusinessData(**data)
        
        # Try to load using data_loader
        if business_id:
            loaded = self.data_loader.load(business_id)
            if loaded:
                return BusinessData(**loaded)
        
        return None
    
    def _parse_history(self, history: List[Dict[str, str]] = None) -> List[ConversationMessage]:
        """Parse history dicts to ConversationMessage objects."""
        if not history:
            return []
        
        return [
            ConversationMessage(
                role=msg.get("role", "user"),
                content=msg.get("content", ""),
                timestamp=msg.get("timestamp")
            )
            for msg in history
            if msg.get("content")
        ]
    
    def _should_handoff(self, intent: IntentType, confidence: float) -> bool:
        """Determine if query should be handed off to human."""
        
        # Always handoff complaints
        if intent == IntentType.COMPLAINT:
            return True
        
        # Handoff unknown intents with low confidence
        if intent == IntentType.UNKNOWN and confidence < self.config.confidence_human_approval:
            return True
        
        # Handoff any low confidence intent
        if confidence < self.config.confidence_human_approval:
            return True
        
        return False
    
    def _get_suggested_actions(
        self,
        intent: IntentType,
        data: BusinessData
    ) -> List[str]:
        """Get contextual quick reply suggestions."""
        
        base_actions = {
            IntentType.GREETING: ["View services", "Check prices", "Book appointment"],
            IntentType.PRICING: ["Book now", "View all services", "Our location"],
            IntentType.BOOKING: ["Available slots", "Our services", "Contact us"],
            IntentType.HOURS: ["Book appointment", "Our location", "Services"],
            IntentType.LOCATION: ["Get directions", "Book visit", "Contact us"],
            IntentType.GENERAL_ENQUIRY: ["Prices", "Timing", "Location"],
            IntentType.UNKNOWN: ["Services", "Prices", "Talk to human"],
        }
        
        return base_actions.get(intent, ["Services", "Prices", "Contact us"])
    
    def _error_response(self, error: str) -> Dict[str, Any]:
        """Generate error response."""
        return {
            "reply": "I'm having trouble right now. Please try again or contact us directly. 🙏",
            "intent": IntentType.UNKNOWN.value,
            "confidence": 0.0,
            "needs_human": True,
            "suggested_actions": ["Try again", "Contact us"],
            "metadata": {"error": error, "generation_method": "error"}
        }
    
    def detect_intent(self, message: str, history: List[Dict] = None) -> Dict[str, Any]:
        """
        Standalone intent detection (useful for analytics).
        
        Args:
            message: User message
            history: Optional conversation history
            
        Returns:
            Dict with intent, confidence, and description
        """
        intent, confidence = self.intent_detector.detect(message, history or [])
        return {
            "intent": intent.value,
            "confidence": round(confidence, 2),
            "description": self.intent_detector.get_intent_description(intent)
        }
    
    def refresh_business_data(self, business_id: str) -> bool:
        """
        Force refresh of cached business data.
        
        Args:
            business_id: Business ID to refresh
            
        Returns:
            True if refresh succeeded
        """
        try:
            self.data_loader.refresh(business_id)
            return True
        except Exception:
            return False


# Convenience function for simple usage
def generate_reply(
    business_data: Dict[str, Any],
    user_message: str,
    history: List[Dict[str, str]] = None,
    config: AIBrainConfig = None
) -> Dict[str, Any]:
    """
    Convenience function for generating replies without instantiating AIBrain.
    
    Args:
        business_data: Business profile data
        user_message: Customer's message
        history: Conversation history
        config: Optional configuration
        
    Returns:
        Response dictionary with reply, intent, confidence, etc.
    """
    brain = AIBrain(config=config)
    return brain.generate_reply(
        business_data=business_data,
        user_message=user_message,
        history=history
    )
