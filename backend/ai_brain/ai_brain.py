"""
Main AI Brain orchestrator class - v2.0 (Refactored).
Coordinates ChatGPT-powered intent detection, function calling, and response generation.
Now with LLM usage tracking for per-business budgets.
"""

import time
import re
import random
import logging
from typing import Dict, List, Any, Optional, Union
from dataclasses import asdict

logger = logging.getLogger('reviseit.brain')

from .schemas import BusinessData, ConversationMessage, GenerateReplyResponse
from .intents import IntentType, IntentDetector
from .config import AIBrainConfig, default_config
from .chatgpt_engine import ChatGPTEngine, IntentResult, GenerationResult
from .conversation_manager import ConversationManager, get_conversation_manager, FlowStatus
from .response_cache import ResponseCache, get_response_cache, get_cache_ttl
from .whatsapp_formatter import WhatsAppFormatter, get_formatter
from .language_detector import LanguageDetector, get_language_detector, Language
from .analytics import (
    AnalyticsTracker, 
    get_analytics_tracker, 
    ResolutionOutcome,
    RateLimiter,
    get_rate_limiter
)
from .cost_optimizer import CostOptimizer, get_cost_optimizer, CostDecision
from .business_retriever import BusinessRetriever, get_retriever
from .appointment_handler import AppointmentHandler

# LLM Usage tracking for per-business budgets
try:
    from llm_usage_tracker import get_usage_tracker, LLMUsageTracker
    USAGE_TRACKER_AVAILABLE = True
except ImportError:
    USAGE_TRACKER_AVAILABLE = False
    get_usage_tracker = None


class AIBrain:
    """
    Main AI Brain class for WhatsApp business chatbots - v2.0.
    
    This is the primary interface for generating intelligent responses.
    It coordinates:
    - ChatGPT-powered intent detection
    - Function calling for actionable intents
    - Conversation context management
    - Response caching for cost optimization
    - Multi-language support
    - Analytics tracking
    
    Example usage:
        ```python
        from ai_brain import AIBrain, AIBrainConfig
        
        brain = AIBrain(config=AIBrainConfig.from_env())
        
        result = brain.generate_reply(
            business_data={
                "business_id": "biz_123",
                "business_name": "Style Studio",
                "industry": "salon",
                "products_services": [{"name": "Haircut", "price": 300}]
            },
            user_message="What is the price for haircut?",
            user_id="user_123"
        )
        
        print(result["reply"])  # WhatsApp-ready response
        ```
    """
    
    def __init__(
        self,
        config: AIBrainConfig = None,
        use_legacy_intent: bool = True,  # Enable by default for template fallback
        supabase_client = None
    ):
        """
        Initialize AI Brain.
        
        Args:
            config: Configuration object. Uses default if not provided.
            use_legacy_intent: If True, use keyword-based intent detection as fallback
            supabase_client: Supabase client for usage tracking
        """
        self.config = config or default_config
        self.use_legacy_intent = use_legacy_intent
        
        # Core engine
        self.engine = ChatGPTEngine(self.config)
        
        # Context management
        self.conversation_manager = get_conversation_manager(
            max_history=self.config.conversation_history_limit,
            session_ttl=3600  # 1 hour session TTL
        )
        
        # Response caching
        self.cache = get_response_cache(default_ttl=300)
        
        # Formatting
        self.formatter = get_formatter()
        
        # Language detection
        self.language_detector = get_language_detector()
        
        # Analytics
        self.analytics = get_analytics_tracker()
        
        # Rate limiting
        self.rate_limiter = get_rate_limiter()
        
        # Cost optimization (50-80% savings)
        self.cost_optimizer = get_cost_optimizer()
        self.retriever = get_retriever(max_tokens=400)
        
        # LLM Usage tracking (for per-business budgets)
        self.usage_tracker = None
        self.supabase_client = supabase_client  # Store for appointment handler
        if USAGE_TRACKER_AVAILABLE and get_usage_tracker:
            self.usage_tracker = get_usage_tracker(supabase_client)
        
        # Legacy fallback (always enabled for template mode)
        self.legacy_intent_detector = IntentDetector()
        
        # Appointment handler for state-driven booking flow
        self.appointment_handler = None
        if supabase_client:
            self.appointment_handler = AppointmentHandler(supabase_client)
        
        # Cancellation keywords for detecting flow cancellation intent
        self.CANCELLATION_KEYWORDS = [
            'cancel', 'stop', 'nevermind', 'never mind', 'dont want', "don't want",
            'no thanks', 'forget it', 'quit', 'exit', 'nahi chahiye', 'rehne do',
            'mat karo', 'bandh karo', 'nako', 'beku illa', 'venda'
        ]
    
    def generate_reply(
        self,
        business_data: Union[Dict[str, Any], BusinessData] = None,
        user_message: str = "",
        history: List[Dict[str, str]] = None,
        business_id: str = None,
        user_id: str = None,
        use_cache: bool = True,
        format_response: bool = True
    ) -> Dict[str, Any]:
        """
        Generate a reply to customer message.
        
        This is the main entry point for the AI brain.
        
        Args:
            business_data: Business profile data (dict or BusinessData object).
            user_message: Customer's WhatsApp message
            history: Conversation history (optional, uses conversation manager if not provided)
            business_id: Business ID for caching and analytics
            user_id: User ID for conversation context (from WhatsApp)
            use_cache: Whether to use response caching
            format_response: Whether to format response for WhatsApp
            
        Returns:
            Dictionary containing:
            - reply: str - WhatsApp-ready message
            - intent: str - Detected intent type
            - confidence: float - Intent detection confidence
            - needs_human: bool - Whether to escalate to human
            - suggested_actions: list - Quick reply suggestions
            - metadata: dict - Additional info (generation method, etc.)
        """
        start_time = time.time()
        
        # Validate input
        if not user_message or not user_message.strip():
            return self._error_response("Empty message received")
        
        user_message = user_message.strip()
        
        # Get business data
        try:
            business = self._normalize_business_data(business_data)
        except Exception as e:
            return self._error_response(f"Failed to load business data: {str(e)}")
        
        if not business:
            return self._error_response("Business data not found")
        
        biz_id = business.get("business_id", business_id or "default")
        
        # Check rate limiting
        plan = business.get("plan", "starter")
        if not self.rate_limiter.check_limit(biz_id, plan):
            return self._rate_limited_response(biz_id, plan)
        
        # Record usage
        self.rate_limiter.record_usage(biz_id)
        
        # Detect language
        lang_result = self.language_detector.detect(user_message)
        detected_language = lang_result.language.value
        
        # =====================================================
        # OUT-OF-SCOPE CHECK - Reject irrelevant queries early
        # =====================================================
        if not self._is_in_scope(user_message, business):
            business_name = business.get('business_name', 'our business')
            return self._out_of_scope_response(business_name)
        
        # =====================================================
        # CANCELLATION CHECK - Handle "stop", "cancel", etc.
        # =====================================================
        # If user wants to cancel a flow, handle it immediately
        if user_id and any(word in user_message.lower() for word in self.CANCELLATION_KEYWORDS):
            if self.conversation_manager.is_flow_active(user_id):
                self.conversation_manager.cancel_flow(user_id)
                response = {
                    "reply": "No problem, I've cancelled that. How else can I help you? 😊",
                    "intent": "cancel_flow",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": ["Services", "Book Appointment"],
                    "metadata": {"generation_method": "flow_cancellation"}
                }
                # Add to history
                self.conversation_manager.add_message(user_id, "user", user_message)
                self.conversation_manager.add_message(user_id, "assistant", response["reply"])
                return response

        # =====================================================
        # STATE-DRIVEN FLOW CHECK - Deterministic Appointment Booking
        # =====================================================
        # If user is in an active appointment flow, let the handler process it
        if user_id and self.conversation_manager.is_flow_active(user_id):
            # Check if this is a question/interruption (optional heuristic)
            is_question = "?" in user_message or any(w in user_message.lower() for w in ["what", "how", "where", "price", "cost"])
            
            # Use LLM to check if it's an answer or a question if ambiguous
            if is_question:
                # Let LLM decide - handled in _handle_appointment_flow
                pass
                
            flow_response = self._handle_appointment_flow(user_id, user_message, business)
            if flow_response:
                return flow_response
        
        
        # Get conversation history
        if history is None and user_id:
            history = self.conversation_manager.get_context_window(user_id)
        
        # Add user message to conversation
        if user_id:
            self.conversation_manager.add_message(user_id, "user", user_message)
        
        # Get last intent for follow-up detection
        last_intent = self.conversation_manager.get_last_intent(user_id) if user_id else None
        last_messages = history[-1]["content"] if history else None
        
        # COST OPTIMIZATION: Analyze query for optimal routing
        cost_decision = self.cost_optimizer.analyze_query(
            message=user_message,
            business_id=biz_id,
            last_intent=last_intent,
            last_message=last_messages,
            plan=plan
        )
        
        # STRATEGY #8: Use hardcoded reply if applicable (20-40% savings)
        if cost_decision.skip_llm and cost_decision.hardcoded_reply:
            response = {
                "reply": cost_decision.hardcoded_reply,
                "intent": "hardcoded",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["Services", "Prices", "Contact us"],
                "metadata": {
                    "generation_method": "hardcoded",
                    "cost_savings": "100%",
                    "language": detected_language,
                    "response_time_ms": int((time.time() - start_time) * 1000)
                }
            }
            if user_id:
                self.conversation_manager.add_message(user_id, "assistant", response["reply"])
            self._track_interaction(biz_id, user_id, response, start_time, is_cached=False)
            return response
        
        # Try cache first (40-70% savings)
        if use_cache and self.config.enable_caching and cost_decision.use_cache:
            cached = self._try_cache(biz_id, user_message, history)
            if cached:
                # Track analytics for cached response
                self._track_interaction(
                    biz_id, user_id, cached, start_time, is_cached=True
                )
                return cached
        
        # STRATEGY #5: Trim history based on confidence/complexity
        optimized_history = history[-cost_decision.history_depth:] if history else None
        
        # STRATEGY #3: Use retrieval instead of full business data (25-45% savings)
        if cost_decision.use_retrieval:
            # Pre-detect intent for better retrieval (using legacy quick method)
            quick_intent = "general_enquiry"
            if hasattr(self, 'legacy_intent_detector'):
                intent_result, _ = self.legacy_intent_detector.detect(user_message, [])
                quick_intent = intent_result.value
            
            retrieval_result = self.retriever.retrieve(
                business_data=business,
                intent=quick_intent,
                message=user_message
            )
            # Replace full business data with retrieved context
            # (The engine will use this optimized context)
            business["_optimized_context"] = retrieval_result.context
            business["_token_savings"] = retrieval_result.savings_percent
        
        # =====================================================
        # LLM BUDGET CHECK - Use template fallback if exceeded
        # (Graceful fallback if usage tracker fails)
        # =====================================================
        try:
            if self.usage_tracker:
                usage_status = self.usage_tracker.can_use_llm(biz_id, plan)
                if not usage_status.can_use:
                    # FALLBACK TO TEMPLATE MODE (no LLM call)
                    return self._template_fallback_reply(
                        business_data=business,
                        user_message=user_message,
                        user_id=user_id,
                        detected_language=detected_language,
                        reason=usage_status.reason,
                        start_time=start_time
                    )
        except Exception as e:
            print(f"⚠️ Usage tracking failed, proceeding without: {e}")
        
        # Get state summary to include in prompt (PREVENTS RE-ASKING)
        state_summary = ""
        if user_id:
            state_summary = self.conversation_manager.build_state_context(user_id)
        
        # Process message with ChatGPT engine
        try:
            result = self.engine.process_message(
                message=user_message,
                business_data=business,
                conversation_history=optimized_history,
                user_id=user_id,
                conversation_state_summary=state_summary
            )
            
            # TRACK LLM USAGE after successful call (non-blocking)
            try:
                if self.usage_tracker:
                    input_tokens = result.metadata.get('prompt_tokens', 0)
                    output_tokens = result.metadata.get('completion_tokens', 0)
                    model_name = result.metadata.get('model', 'unknown')
                    
                    usage_result = self.usage_tracker.track_usage(biz_id, input_tokens, output_tokens)
                    
                    # Log for debugging (recommended by user)
                    logger.info(
                        f"Tracked LLM usage | biz={biz_id} | model={model_name} | "
                        f"in={input_tokens} | out={output_tokens} | "
                        f"intent_in={result.metadata.get('intent_prompt_tokens', 0)} | "
                        f"intent_out={result.metadata.get('intent_completion_tokens', 0)} | "
                        f"gen_in={result.metadata.get('generation_prompt_tokens', 0)} | "
                        f"gen_out={result.metadata.get('generation_completion_tokens', 0)}"
                    )
            except Exception as e:
                logger.warning(f"Usage tracking skipped: {e}")
            
            # Format response
            reply = result.reply
            if format_response:
                reply = self.formatter.format(reply)
            
            # Get suggested actions
            suggested_actions = self._get_suggested_actions(result.intent, business)
            
            # Determine outcome
            if result.needs_human:
                outcome = ResolutionOutcome.ESCALATED
            elif result.tool_called:
                outcome = ResolutionOutcome.RESOLVED
            else:
                outcome = ResolutionOutcome.RESOLVED
            
            # Build response
            response = {
                "reply": reply,
                "intent": result.intent.value,
                "confidence": round(result.confidence, 2),
                "needs_human": result.needs_human,
                "suggested_actions": suggested_actions,
                "metadata": {
                    **result.metadata,
                    "language": detected_language,
                    "tool_called": result.tool_called,
                    "response_time_ms": int((time.time() - start_time) * 1000)
                }
            }
            
            # Add assistant message to conversation
            if user_id:
                self.conversation_manager.add_message(user_id, "assistant", reply)
                self.conversation_manager.set_last_intent(user_id, result.intent.value)
            
            # Cache response if appropriate
            if use_cache and self.config.enable_caching:
                self._cache_response(biz_id, result.intent.value, user_message, response)
            
            # Track analytics
            self._track_interaction(
                biz_id, user_id, response, start_time, 
                is_cached=False, outcome=outcome
            )
            
            return response
            
        except Exception as e:
            return self._error_response(str(e))
    
    def detect_intent(self, message: str, history: List[Dict] = None) -> Dict[str, Any]:
        """
        Standalone intent detection (useful for analytics).
        
        Args:
            message: User message
            history: Optional conversation history
            
        Returns:
            Dict with intent, confidence, language, and entities
        """
        # Detect language
        lang_result = self.language_detector.detect(message)
        
        # Classify intent
        intent_result = self.engine.classify_intent(message, history)
        
        return {
            "intent": intent_result.intent.value,
            "confidence": round(intent_result.confidence, 2),
            "language": lang_result.language.value,
            "entities": intent_result.entities,
            "needs_clarification": intent_result.needs_clarification,
            "clarification_question": intent_result.clarification_question
        }
    
    def _handle_appointment_flow(
        self,
        user_id: str,
        message: str,
        business_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Handle deterministic appointment booking flow.
        
        This manages the state machine for collecting appointment details.
        If the user asks a question instead of answering, it uses the LLM 
        to answer, then re-prompts for the missing field.
        """
        if not self.appointment_handler:
            return None
            
        start_time = time.time()
        
        # 1. Process response with handler logic
        # Note: In real app, we need to pass the business owner ID, not customer ID
        # Here we assume business_id is the owner ID for simplicity
        business_owner_id = business_data.get("business_id")
        
        # Get current state to see what we're asking for
        state = self.conversation_manager.get_state(user_id)
        current_field = state.current_field
        
        # 2. Check if this is a question/interruption (Mid-flow Intelligence)
        # We use a quick prompt to check if the user answered the question or asked something else
        is_interruption = False
        
        # Simple heuristic first
        if "?" in message and len(message.split()) > 3:
            is_interruption = True
        
        # If ambiguous, could use LLM here to classify "Answer vs Question"
        
        if is_interruption:
            # Handle the interruption with normal LLM flow (but keep state active)
            # The normal generate_response will run, but we need to inject state context
            # so the LLM knows to append "Now, back to your appointment..."
            return None  # Return None to fall back to normal LLM processing
            
        # 3. Validate and process the answer
        result = self.appointment_handler.process_response(
            user_id=business_owner_id, 
            customer_phone=user_id, # Using user_id as phone for now
            response=message,
            conversation_state=state # Pass the state object!
        )
        
        # 4. Update state based on result
        if result.get("valid"):
            # Success - update state
            if result.get("complete"):
                # All done!
                return {
                    "reply": result["confirmation_message"],
                    "intent": "booking_confirmation",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": ["Confirm", "Cancel"],
                    "metadata": {"generation_method": "flow_complete"}
                }
            else:
                # Next question
                next_q = result["question"]
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", next_q)
                
                return {
                    "reply": next_q,
                    "intent": "booking_in_progress",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": ["Cancel"],
                    "metadata": {"generation_method": "flow_next_step"}
                }
        else:
            # Validation error
            error_msg = result.get("error", "I didn't understand that.")
            retry_msg = f"{error_msg} {result.get('retry_question', '')}"
            
            self.conversation_manager.add_message(user_id, "user", message)
            self.conversation_manager.add_message(user_id, "assistant", retry_msg)
            
            return {
                "reply": retry_msg,
                "intent": "booking_validation_error",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["Cancel"],
                "metadata": {
                    "generation_method": "flow_validation_error",
                    "error": error_msg
                }
            }

    
    def _normalize_business_data(
        self,
        data: Union[Dict[str, Any], BusinessData, None]
    ) -> Optional[Dict[str, Any]]:
        """Normalize business data to dictionary format."""
        if isinstance(data, BusinessData):
            return data.model_dump()
        if isinstance(data, dict) and data:
            return data
        return None
    
    def _try_cache(
        self,
        business_id: str,
        message: str,
        history: List[Dict] = None
    ) -> Optional[Dict[str, Any]]:
        """Try to get response from cache."""
        # Use legacy intent detector for quick cache key
        if self.use_legacy_intent and hasattr(self, 'legacy_intent_detector'):
            intent, confidence = self.legacy_intent_detector.detect(message, history or [])
            if confidence >= 0.7:
                cached = self.cache.get(
                    business_id=business_id,
                    intent=intent.value,
                    query=message
                )
                if cached:
                    cached["metadata"]["from_cache"] = True
                    return cached
        return None
    
    def _cache_response(
        self,
        business_id: str,
        intent: str,
        query: str,
        response: Dict[str, Any]
    ):
        """Cache a response for future use."""
        ttl = get_cache_ttl(intent)
        if ttl > 0:  # Only cache if TTL > 0
            self.cache.set(
                business_id=business_id,
                intent=intent,
                query=query,
                response=response,
                ttl=ttl
            )
    
    def _get_suggested_actions(
        self,
        intent: IntentType,
        data: Dict[str, Any]
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
    
    def _track_interaction(
        self,
        business_id: str,
        user_id: str,
        response: Dict[str, Any],
        start_time: float,
        is_cached: bool = False,
        outcome: ResolutionOutcome = ResolutionOutcome.RESOLVED
    ):
        """Track interaction for analytics."""
        try:
            response_time_ms = int((time.time() - start_time) * 1000)
            
            self.analytics.track_interaction(
                business_id=business_id,
                user_id=user_id or "anonymous",
                intent=response.get("intent", "unknown"),
                confidence=response.get("confidence", 0),
                user_message="",  # Don't store for privacy
                ai_response="",   # Don't store for privacy
                response_time_ms=response_time_ms,
                tokens_used=response.get("metadata", {}).get("tokens", 0),
                outcome=outcome,
                tool_called=response.get("metadata", {}).get("tool_called"),
                language=response.get("metadata", {}).get("language", "en"),
                is_cached=is_cached
            )
        except Exception:
            pass  # Don't fail on analytics errors
    
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
    
    def _rate_limited_response(self, business_id: str, plan: str) -> Dict[str, Any]:
        """Generate rate limited response."""
        remaining = self.rate_limiter.get_remaining(business_id, plan)
        return {
            "reply": "We're experiencing high volume. Please try again in a moment. 🙏",
            "intent": IntentType.UNKNOWN.value,
            "confidence": 0.0,
            "needs_human": False,
            "suggested_actions": ["Try again"],
            "metadata": {
                "rate_limited": True,
                "remaining": remaining,
                "generation_method": "rate_limit"
            }
        }
    
    def _template_fallback_reply(
        self,
        business_data: Dict[str, Any],
        user_message: str,
        user_id: str,
        detected_language: str,
        reason: str,
        start_time: float
    ) -> Dict[str, Any]:
        """
        Generate reply using templates only (no LLM) when budget exceeded.
        Fast O(1) keyword-based intent detection + static templates.
        """
        # Quick intent detection using keywords
        intent, confidence = self.legacy_intent_detector.detect(user_message, [])
        
        # Get template response based on intent
        business_name = business_data.get('business_name', 'our team')
        
        # Fast template lookup (O(1) hash map)
        TEMPLATES = {
            IntentType.GREETING: f"Hello! 👋 Welcome to {business_name}. How can I help you today?",
            IntentType.CASUAL_CONVERSATION: "I'm doing great, thanks for asking! 😊 How can I help you today?",
            IntentType.PRICING: f"For pricing details, please message us directly or check our website. Our team at {business_name} will help you! 💰",
            IntentType.HOURS: "Our business hours are available on our website. Feel free to reach out! 🕐",
            IntentType.LOCATION: f"You can find us on Google Maps. Contact {business_name} for directions! 📍",
            IntentType.BOOKING: f"To book an appointment with {business_name}, please share your preferred date and time. We'll confirm shortly! 📅",
            IntentType.THANK_YOU: "You're welcome! Happy to help. 😊",
            IntentType.GOODBYE: "Goodbye! Have a great day! 👋",
            IntentType.GENERAL_ENQUIRY: f"Thanks for reaching out to {business_name}! Our team will assist you shortly. 🙏",
        }
        
        # Get template or default
        reply = TEMPLATES.get(intent, f"Thanks for your message! Someone from {business_name} will respond shortly. 🙏")
        
        # For unknown/low confidence, offer human handoff
        if confidence < 0.5 or intent == IntentType.UNKNOWN:
            reply = f"I'll connect you with someone from {business_name}. They'll respond shortly! 🙏"
        
        response = {
            "reply": reply,
            "intent": intent.value,
            "confidence": round(confidence, 2),
            "needs_human": confidence < 0.5,
            "suggested_actions": ["Services", "Prices", "Contact"],
            "metadata": {
                "generation_method": "template_fallback",
                "fallback_reason": reason,
                "llm_budget_exceeded": True,
                "language": detected_language,
                "response_time_ms": int((time.time() - start_time) * 1000)
            }
        }
        
        # Add to conversation
        if user_id:
            self.conversation_manager.add_message(user_id, "assistant", reply)
        
        # Track analytics
        self._track_interaction(
            business_data.get('business_id', 'default'),
            user_id, response, start_time, is_cached=False
        )
        
        return response
    
    def _is_in_scope(self, message: str, business: Dict[str, Any]) -> bool:
        """
        Check if query is relevant to the business.
        Returns False for weather, news, politics, sports, stocks, etc.
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
        for pattern in OUT_OF_SCOPE_PATTERNS:
            if re.search(pattern, msg_lower):
                return False
        return True
    
    def _out_of_scope_response(self, business_name: str) -> Dict[str, Any]:
        """Response for queries outside business scope."""
        return {
            "reply": f"I can only help with queries about {business_name}. How can I assist you with our services today? 😊",
            "intent": "out_of_scope",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": ["Services", "Prices", "Book Appointment"],
            "metadata": {"generation_method": "out_of_scope_filter"}
        }
    
    def _human_escalation_response(
        self, 
        business: Dict[str, Any], 
        reason: str = "low_confidence"
    ) -> Dict[str, Any]:
        """Generate a smooth human escalation response with contact options."""
        business_name = business.get('business_name', 'our team')
        contact = business.get('contact', {})
        
        # Build contact options
        contact_options = []
        if contact.get('phone'):
            contact_options.append(f"📞 Call: {contact['phone']}")
        if contact.get('whatsapp') and contact['whatsapp'] != contact.get('phone'):
            contact_options.append(f"💬 WhatsApp: {contact['whatsapp']}")
        
        contact_str = "\n".join(contact_options) if contact_options else ""
        
        # Build response with wait time estimate
        reply = f"I'll connect you with someone from {business_name}. 🙏\n\n"
        reply += "⏱️ Typical response time: 5-10 minutes\n\n"
        if contact_str:
            reply += f"Or reach us directly:\n{contact_str}"
        
        return {
            "reply": reply,
            "intent": "human_escalation",
            "confidence": 1.0,
            "needs_human": True,
            "suggested_actions": ["Wait for response", "Call now"],
            "metadata": {
                "generation_method": "human_escalation",
                "escalation_reason": reason
            }
        }
    
    # =========================================================================
    # UTILITY METHODS
    # =========================================================================
    
    def get_conversation_context(self, user_id: str) -> Dict[str, Any]:
        """Get stored context for a user."""
        return {
            "history": self.conversation_manager.get_history(user_id),
            "context": self.conversation_manager.get_context(user_id),
            "last_intent": self.conversation_manager.get_last_intent(user_id)
        }
    
    def clear_conversation(self, user_id: str):
        """Clear conversation history for a user."""
        self.conversation_manager.clear_session(user_id)
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self.cache.get_stats()
    
    def get_analytics(self, business_id: str, hours: int = 24) -> Dict[str, Any]:
        """Get analytics for a business."""
        analytics = self.analytics.get_business_analytics(business_id, hours)
        return asdict(analytics)
    
    def invalidate_cache(self, business_id: str, intent: str = None):
        """Invalidate cache entries for a business."""
        self.cache.invalidate(business_id, intent)


# =============================================================================
# CONVENIENCE FUNCTION
# =============================================================================

def generate_reply(
    business_data: Dict[str, Any],
    user_message: str,
    history: List[Dict[str, str]] = None,
    config: AIBrainConfig = None,
    user_id: str = None
) -> Dict[str, Any]:
    """
    Convenience function for generating replies without instantiating AIBrain.
    
    Args:
        business_data: Business profile data
        user_message: Customer's message
        history: Conversation history
        config: Optional configuration
        user_id: Optional user identifier
        
    Returns:
        Response dictionary with reply, intent, confidence, etc.
    """
    brain = AIBrain(config=config)
    return brain.generate_reply(
        business_data=business_data,
        user_message=user_message,
        history=history,
        user_id=user_id
    )
