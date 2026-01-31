"""
Main AI Brain orchestrator class - v2.0 (Refactored).
Coordinates ChatGPT-powered intent detection, function calling, and response generation.
Now with LLM usage tracking for per-business budgets.
"""

import time
import re
import random
import logging
import os
from typing import Dict, List, Any, Optional, Union
from dataclasses import asdict

logger = logging.getLogger('reviseit.brain')

from .schemas import BusinessData, ConversationMessage, GenerateReplyResponse
from .intents import IntentType, IntentDetector
from .config import AIBrainConfig, default_config
from .chatgpt_engine import ChatGPTEngine, IntentResult, GenerationResult
from .conversation_manager import ConversationManager, get_conversation_manager, FlowStatus, ConversationState
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
        
        # Context management with Redis persistence for flow state
        import os
        redis_url = os.getenv("REDIS_URL")
        self.conversation_manager = get_conversation_manager(
            max_history=self.config.conversation_history_limit,
            session_ttl=3600,  # 1 hour session TTL
            redis_url=redis_url
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
        # STATE-DRIVEN FLOW CHECK - Handle active booking flows
        # =====================================================
        # If user is in an active flow (appointment or order), let the handler process it
        is_flow_active = user_id and self.conversation_manager.is_flow_active(user_id)
        logger.info(f"📋 Flow check - user_id: {user_id}, is_flow_active: {is_flow_active}")
        
        if is_flow_active:
            # Get the current flow type
            state = self.conversation_manager.get_state(user_id)
            flow_name = state.active_flow if state else None
            flow_status = state.flow_status if state else None
            logger.info(f"📋 Active flow: {flow_name}, flow_status: {flow_status}")
            
            # Check if this is a question/interruption (optional heuristic)
            is_question = "?" in user_message or any(w in user_message.lower() for w in ["what", "how", "where", "price", "cost"])
            
            if flow_name == "order_booking":
                # Handle order flow
                flow_response = self._handle_order_flow(user_id, user_message, business)
                if flow_response:
                    return flow_response
            elif flow_name == "appointment_booking":
                # Handle appointment flow
                flow_response = self._handle_appointment_flow(user_id, user_message, business)
                logger.info(f"📋 Flow response: {flow_response is not None}")
                if flow_response:
                    return flow_response
        
        # =====================================================
        # EARLY STATE CHECK: Order ID Awaiting
        # This MUST run BEFORE intent classification to catch Order ID responses
        # =====================================================
        if user_id:
            state = self.conversation_manager.get_state(user_id)
            if state and state.collected_fields.get("_awaiting_order_id"):
                logger.info(f"📦 User is awaiting Order ID - processing as order tracking")
                context_facts = self._gather_context_facts(user_id, business)
                tracking_response = self._handle_order_tracking(user_id, context_facts, business, user_message)
                
                # Add to conversation history
                self.conversation_manager.add_message(user_id, "user", user_message)
                self.conversation_manager.add_message(user_id, "assistant", tracking_response["reply"])
                
                return tracking_response
        
        # =====================================================
        # ENTERPRISE INTENT DETECTION - Route to correct flow based on type
        # Uses 3-layer architecture: Context Facts → Raw Intent → Smart Router
        # =====================================================
        # Classify booking type with context awareness (passes user_id for order history check)
        booking_type = self._classify_booking_type(user_message, business, user_id)
        logger.info(f"📦 Enterprise booking classification: {booking_type} for message: '{user_message[:50]}...'")
        
        if booking_type and user_id and not self.conversation_manager.is_flow_active(user_id):
            # =====================================================
            # PRIORITY 1: Order Tracking (post-purchase query)
            # =====================================================
            if booking_type == "order_tracking":
                # Gather context facts for the tracking handler
                context_facts = self._gather_context_facts(user_id, business)
                tracking_response = self._handle_order_tracking(user_id, context_facts, business, user_message)
                
                # Add to conversation history
                self.conversation_manager.add_message(user_id, "user", user_message)
                self.conversation_manager.add_message(user_id, "assistant", tracking_response["reply"])
                
                return tracking_response
            
            # =====================================================
            # PRIORITY 2: Order Cancellation
            # =====================================================
            if booking_type == "order_cancellation":
                context_facts = self._gather_context_facts(user_id, business)
                cancel_response = self._handle_order_cancellation(user_id, context_facts, business)
                
                # Add to conversation history
                self.conversation_manager.add_message(user_id, "user", user_message)
                self.conversation_manager.add_message(user_id, "assistant", cancel_response["reply"])
                
                return cancel_response
            
            # =====================================================
            # PRIORITY 3: New Order (pre-purchase)
            # =====================================================
            if booking_type == "order":
                # Check if order booking is enabled and start order flow
                if self._is_order_booking_enabled(biz_id):
                    flow_response = self._start_order_flow(user_id, biz_id, user_message, business)
                    if flow_response:
                        return flow_response
                else:
                    logger.info(f"📦 Order booking not enabled for business: {biz_id}")
            
            # =====================================================
            # PRIORITY 4: Appointment Booking
            # =====================================================
            elif booking_type == "appointment":
                # Check if appointment booking is enabled for this business
                if self.appointment_handler:
                    config = self.appointment_handler.get_config(biz_id)
                    if config.get("enabled", False):
                        # Start the structured appointment booking flow
                        flow_response = self._start_appointment_flow(user_id, biz_id, config, user_message)
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
    
    def _classify_booking_type(self, message: str, business_data: Dict[str, Any], user_id: str = None) -> Optional[str]:
        """
        ENTERPRISE-GRADE 3-LAYER INTENT CLASSIFICATION SYSTEM
        
        Layer 1: Context Facts (NO intent yet) - recent orders, conversation state
        Layer 2: Raw Intent Classification (text-only) - keyword & pattern analysis
        Layer 3: Final Decision (rules + facts) - smart routing with priority
        
        Returns:
            "order" - New order request
            "order_tracking" - Order status/tracking query
            "order_cancellation" - Cancel order request
            "appointment" - Appointment booking
            None - Not a booking/order related request
        """
        msg_lower = message.lower()
        
        # =====================================================
        # LAYER 1: CONTEXT FACTS (No intent yet)
        # Gather facts about user's current state
        # =====================================================
        context_facts = self._gather_context_facts(user_id, business_data)
        logger.info(f"🧠 L1 Context Facts: has_recent_order={context_facts['has_recent_order']}, "
                   f"order_age_minutes={context_facts['order_age_minutes']}, "
                   f"has_active_flow={context_facts['has_active_flow']}")
        
        # =====================================================
        # LAYER 2: RAW INTENT CLASSIFICATION (Text-only)
        # Analyze message without context influence
        # =====================================================
        raw_intent = self._classify_raw_intent(msg_lower, business_data)
        logger.info(f"🎯 L2 Raw Intent: {raw_intent['intent']} (confidence={raw_intent['confidence']:.2f})")
        
        # =====================================================
        # LAYER 3: FINAL DECISION (Rules + Facts)
        # Apply priority rules and context to make final routing decision
        # =====================================================
        final_decision = self._smart_intent_router(raw_intent, context_facts, msg_lower)
        logger.info(f"🚀 L3 Final Decision: {final_decision} (from raw={raw_intent['intent']})")
        
        return final_decision
    
    def _gather_context_facts(self, user_id: str, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        LAYER 1: Gather context facts about the user's current state.
        
        Returns facts dictionary WITHOUT making any intent decisions.
        This separation is critical for enterprise-grade routing.
        """
        facts = {
            "has_recent_order": False,
            "order_age_minutes": None,
            "order_status": None,
            "order_id": None,
            "order_items": [],
            "has_active_flow": False,
            "active_flow_name": None,
            "last_order_created_at": None,
        }
        
        if not user_id:
            return facts
        
        # Check for active flow
        if self.conversation_manager.is_flow_active(user_id):
            state = self.conversation_manager.get_state(user_id)
            facts["has_active_flow"] = True
            facts["active_flow_name"] = state.active_flow if state else None
        
        # Check for recent orders in conversation state
        state = self.conversation_manager.get_state(user_id)
        if state and state.collected_fields:
            # Check if user has completed an order recently
            last_order_time = state.collected_fields.get("_last_order_completed_at")
            last_order_id = state.collected_fields.get("_last_order_id")
            last_order_status = state.collected_fields.get("_last_order_status", "created")
            last_order_items = state.collected_fields.get("_last_order_items", [])
            
            if last_order_time:
                try:
                    from datetime import datetime, timezone
                    if isinstance(last_order_time, str):
                        order_time = datetime.fromisoformat(last_order_time.replace('Z', '+00:00'))
                    else:
                        order_time = last_order_time
                    
                    now = datetime.now(timezone.utc)
                    age_minutes = (now - order_time).total_seconds() / 60
                    
                    # Consider order "recent" if within 30 days (enterprise standard)
                    if age_minutes <= 30 * 24 * 60:  # 30 days in minutes
                        facts["has_recent_order"] = True
                        facts["order_age_minutes"] = int(age_minutes)
                        facts["order_id"] = last_order_id
                        facts["order_status"] = last_order_status
                        facts["order_items"] = last_order_items
                        facts["last_order_created_at"] = last_order_time
                except Exception as e:
                    logger.warning(f"⚠️ Failed to parse order time: {e}")
        
        # Also check Supabase for persistent order history (optional enhancement)
        if not facts["has_recent_order"] and self.supabase_client:
            try:
                business_id = business_data.get("business_id")
                if business_id:
                    # Query recent orders for this user/phone
                    from datetime import datetime, timedelta
                    thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
                    result = self.supabase_client.table("orders").select(
                        "id, status, created_at, items"
                    ).eq("customer_phone", user_id).gte(
                        "created_at", thirty_days_ago
                    ).order("created_at", desc=True).limit(1).execute()
                    
                    if result.data and len(result.data) > 0:
                        order = result.data[0]
                        facts["has_recent_order"] = True
                        facts["order_id"] = order.get("id")
                        facts["order_status"] = order.get("status", "created")
                        facts["order_items"] = order.get("items", [])
                        facts["last_order_created_at"] = order.get("created_at")
            except Exception as e:
                logger.debug(f"⚠️ Could not check order history: {e}")
        
        return facts
    
    def _classify_raw_intent(self, msg_lower: str, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        LAYER 2: Raw Intent Classification (text-only analysis).
        
        Returns raw intent classification WITHOUT considering context.
        Uses keyword matching, patterns, and ownership tokens.
        """
        # =====================================================
        # INTENT PRIORITY ORDER (CRITICAL for correct routing)
        # Higher priority intents are checked first
        # =====================================================
        # 1. order_cancellation - "cancel my order"
        # 2. order_tracking - "where is my order"
        # 3. delivery_query - "delivery time"
        # 4. new_order - "I want to order"
        # 5. appointment - "book appointment"
        # 6. general - everything else
        
        # Ownership tokens (required for tracking/cancel intents)
        # Includes English, Hindi, Tamil, Kannada, Telugu, Malayalam
        ownership_tokens = [
            # English
            "my", "mine", "i ordered", "i placed", "my order",
            "i bought", "i purchased", "my purchase", "the order",
            # Hindi
            "mera", "meri", "maine", "mera order",
            # Tamil
            "en", "ennoda", "naan", "en order", "enathu",
            # Kannada
            "nanna", "naanu", "nanna order",
            # Telugu
            "naa", "naaku", "nenu", "na order",
            # Malayalam
            "ente", "enikku", "ente order",
        ]
        has_ownership = any(token in msg_lower for token in ownership_tokens)
        
        # =====================================================
        # PRIORITY 1: Order Cancellation
        # =====================================================
        cancel_keywords = [
            # English
            "cancel order", "cancel my order", "cancel the order",
            "want to cancel", "i want to cancel", "please cancel",
            "order cancel", "cancellation", "refund",
            # Hindi
            "mera order cancel", "cancel krdo", "cancel karo",
            # Tamil
            "order cancel pannu", "cancel pannunga", "venda order",
            # Kannada
            "order cancel maadi", "beda order",
            # Telugu
            "order cancel cheyandi", "vaddu order",
        ]
        if any(kw in msg_lower for kw in cancel_keywords):
            return {"intent": "order_cancellation", "confidence": 0.95}
        
        # =====================================================
        # PRIORITY 2: Order Tracking / Status
        # =====================================================
        tracking_keywords = [
            # English
            "when will", "where is", "order status", "track order", "tracking",
            "delivery status", "shipping status", "my order", "the order",
            "order come", "order arrive", "order reach", "dispatch", "dispatched",
            "status of my order", "update on my order", "did you ship",
            "has my order", "is my order", "order update",
            # Hindi
            "kab aayega", "kab milega", "order kaha", "kab pahunchega",
            "mera order kab", "order ka status", "kitna time",
            # Tamil
            "epo varum", "epdi irukku", "order eppo", "enna achu",
            "varum", "vanthuduma", "dispatch achu", "ship achu",
            # Kannada
            "yavaga baruthe", "order yavaga", "yelli ide",
            # Telugu
            "eppudu vasthadi", "ekkada undi", "order eppudu",
            # Malayalam
            "eppol varum", "evide aanu", "order eppol",
        ]
        # Tracking requires ownership OR very explicit tracking phrases
        tracking_explicit = [
            "track order", "order status", "tracking", "where is my order",
            "epo varum", "kab aayega", "when will my order", "order varum",
        ]
        
        if any(kw in msg_lower for kw in tracking_keywords):
            # Must have ownership token OR be very explicit
            if has_ownership or any(kw in msg_lower for kw in tracking_explicit):
                return {"intent": "order_tracking", "confidence": 0.90}
        
        # =====================================================
        # PRIORITY 3: Delivery Query (pre-purchase)
        # =====================================================
        delivery_query_keywords = [
            "delivery time", "delivery charges", "shipping cost", "how long to deliver",
            "delivery available", "delivery area", "delivery fee", "free delivery",
            "do you deliver", "can you deliver", "delivery options",
        ]
        # Delivery query WITHOUT ownership = pre-purchase question
        if any(kw in msg_lower for kw in delivery_query_keywords) and not has_ownership:
            return {"intent": "delivery_query", "confidence": 0.85}
        
        # =====================================================
        # PRIORITY 4: New Order Intent
        # =====================================================
        order_keywords = ["order", "buy", "purchase", "want to order", "want to buy", "get me"]
        order_patterns = [
            r"\b\d+\s*(x|nos?|pieces?|items?|qty)\b",  # "2 pieces", "3x"
            r"\b(quantity|qty)\s*:?\s*\d+",
        ]
        
        # Check for product mentions from business catalog
        products = business_data.get("products_services", [])
        product_names = [p.get("name", "").lower() for p in products if isinstance(p, dict) and p.get("name")]
        has_product_mention = any(name in msg_lower for name in product_names if name and len(name) > 2)
        
        has_order_keyword = any(kw in msg_lower for kw in order_keywords)
        has_order_quantity = any(re.search(p, msg_lower) for p in order_patterns)
        
        # CRITICAL: Don't trigger new order if this looks like tracking
        # "my order" should NOT trigger new order
        if has_ownership and "order" in msg_lower and not has_order_quantity:
            # This is likely tracking, not new order
            pass
        elif has_order_keyword or has_order_quantity:
            return {"intent": "new_order", "confidence": 0.85}
        
        # Product mention without ownership = likely new order
        if has_product_mention and not has_ownership:
            return {"intent": "new_order", "confidence": 0.75}
        
        # =====================================================
        # PRIORITY 5: Appointment Booking
        # =====================================================
        appointment_keywords = ["appointment", "schedule", "slot", "time slot", "appoint"]
        time_patterns = [
            r"\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
            r"\b\d{1,2}[:/]\d{2}\b",  # Time patterns like 10:30
            r"\b\d{1,2}\s*(am|pm)\b",  # Time patterns like 10am
            r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b",  # Date patterns
        ]
        
        has_appointment_keyword = any(kw in msg_lower for kw in appointment_keywords)
        has_time_indicator = any(re.search(p, msg_lower) for p in time_patterns)
        
        if has_appointment_keyword:
            return {"intent": "appointment", "confidence": 0.90}
        if has_time_indicator and not has_order_keyword:
            return {"intent": "appointment", "confidence": 0.75}
        
        # Generic "book" handling
        if "book" in msg_lower:
            if has_product_mention:
                return {"intent": "new_order", "confidence": 0.70}
            return {"intent": "appointment", "confidence": 0.70}
        
        # =====================================================
        # DEFAULT: General query (not booking related)
        # =====================================================
        return {"intent": "general", "confidence": 0.50}
    
    def _smart_intent_router(
        self, 
        raw_intent: Dict[str, Any], 
        context_facts: Dict[str, Any],
        msg_lower: str
    ) -> Optional[str]:
        """
        LAYER 3: Smart Intent Router (Rules + Facts).
        
        Apply context-aware rules to make final routing decision.
        This is where enterprise-grade intelligence happens.
        """
        intent = raw_intent["intent"]
        confidence = raw_intent["confidence"]
        has_recent_order = context_facts["has_recent_order"]
        has_active_flow = context_facts["has_active_flow"]
        
        # =====================================================
        # RULE 1: Order cancellation always takes priority
        # =====================================================
        if intent == "order_cancellation":
            if has_recent_order:
                return "order_cancellation"
            # No order to cancel - might be confusion, route to general
            logger.info("⚠️ Cancel intent but no recent order found")
            return None
        
        # =====================================================
        # RULE 2: Order tracking with recent order
        # =====================================================
        if intent == "order_tracking":
            if has_recent_order:
                return "order_tracking"
            # No order found - could be confusion
            logger.info("⚠️ Tracking intent but no recent order found")
            # Don't return "order" here - let it fall through to general
            return "order_tracking"  # Still handle gracefully with "no order found"
        
        # =====================================================
        # RULE 3: Delivery query - pre-purchase question
        # =====================================================
        if intent == "delivery_query":
            return None  # Let general AI handle this
        
        # =====================================================
        # RULE 4: New order - but check for false positives
        # =====================================================
        if intent == "new_order":
            # CRITICAL CHECK: If user just completed an order and says "order",
            # they might be asking about THAT order, not placing a new one
            order_age = context_facts.get("order_age_minutes")
            
            # If order was placed < 30 minutes ago and message is ambiguous,
            # check for tracking indicators
            if has_recent_order and order_age and order_age < 30:
                ambiguous_phrases = ["my order", "the order", "order status", "order come"]
                if any(phrase in msg_lower for phrase in ambiguous_phrases):
                    logger.info(f"🔄 Recent order ({order_age}m ago) + ambiguous phrase → routing to tracking")
                    return "order_tracking"
            
            return "order"
        
        # =====================================================
        # RULE 5: Appointment booking
        # =====================================================
        if intent == "appointment":
            return "appointment"
        
        # =====================================================
        # DEFAULT: Not a booking/order request
        # =====================================================
        return None
    
    def _handle_order_tracking(
        self, 
        user_id: str, 
        context_facts: Dict[str, Any],
        business_data: Dict[str, Any],
        user_message: str = ""
    ) -> Dict[str, Any]:
        """
        ENTERPRISE-GRADE ORDER TRACKING SYSTEM
        
        Flow:
        1. Check if user provided Order ID in message → Look up by ID
        2. Check if user is in "awaiting_order_id" state → Parse ID from message
        3. No ID provided → Query recent orders by phone number
        4. Found orders → Show status with professional formatting
        5. No orders → Ask for Order ID or offer to place new order
        
        Inspired by Amazon, Swiggy, Flipkart tracking systems.
        """
        # Status mapping for human-friendly messages with timeline
        STATUS_MAP = {
            "created": ("Order Placed", "is being processed ⏳", 1),
            "confirmed": ("Confirmed", "has been confirmed ✅", 2),
            "paid": ("Payment Received", "payment received, preparing your order 📦", 3),
            "processing": ("Preparing", "is being prepared 🔄", 4),
            "shipped": ("Shipped", "is on the way 🚚", 5),
            "out_for_delivery": ("Out for Delivery", "is out for delivery 🏃", 6),
            "delivered": ("Delivered", "was delivered 🎉", 7),
            "cancelled": ("Cancelled", "was cancelled ❌", 0),
        }
        
        state = self.conversation_manager.get_state(user_id)
        msg_lower = user_message.lower().strip() if user_message else ""
        
        # =====================================================
        # STEP 1: Check if user is providing Order ID (awaiting state)
        # =====================================================
        if state and state.collected_fields.get("_awaiting_order_id"):
            # User should be providing order ID now
            order_id_input = msg_lower.replace("#", "").strip()
            
            # Clear the waiting state
            if "_awaiting_order_id" in state.collected_fields:
                del state.collected_fields["_awaiting_order_id"]
            
            # Look up order by ID
            order_data = self._lookup_order_by_id(order_id_input, user_id, business_data)
            
            if order_data:
                return self._format_order_status_response(order_data, STATUS_MAP)
            else:
                # ID not found - try phone lookup
                orders = self._lookup_orders_by_phone(user_id, business_data)
                if orders:
                    return self._format_multi_order_response(orders, STATUS_MAP, order_id_input)
                
                return {
                    "reply": (
                        f"❌ *Order Not Found*\n\n"
                        f"I couldn't find order *{order_id_input.upper()}*.\n\n"
                        f"Please check:\n"
                        f"• The Order ID is correct (check your confirmation message)\n"
                        f"• You're messaging from the registered phone number\n\n"
                        f"Need help? Contact our support team."
                    ),
                    "intent": "order_tracking",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": ["Contact Support", "Place New Order"],
                    "metadata": {"generation_method": "order_tracking_id_not_found"}
                }
        
        # =====================================================
        # STEP 2: Try to extract Order ID from current message
        # =====================================================
        extracted_order_id = self._extract_order_id_from_message(msg_lower)
        
        if extracted_order_id:
            logger.info(f"🔍 Extracted order ID from message: {extracted_order_id}")
            order_data = self._lookup_order_by_id(extracted_order_id, user_id, business_data)
            
            if order_data:
                return self._format_order_status_response(order_data, STATUS_MAP)
        
        # =====================================================
        # STEP 3: Check for recent orders by phone number
        # =====================================================
        orders = self._lookup_orders_by_phone(user_id, business_data)
        
        if orders and len(orders) == 1:
            # Single order found - show status directly
            return self._format_order_status_response(orders[0], STATUS_MAP)
        
        elif orders and len(orders) > 1:
            # Multiple orders found - show list and ask which one
            return self._format_multi_order_response(orders, STATUS_MAP)
        
        # =====================================================
        # STEP 4: No orders found - Ask for Order ID
        # =====================================================
        if state:
            state.collect_field("_awaiting_order_id", True)
        
        return {
            "reply": (
                f"🔍 *Track Your Order*\n\n"
                f"To check your order status, please share your *Order ID*.\n\n"
                f"You can find it in your order confirmation message.\n"
                f"Example: *ABC123* or *#ABC123*\n\n"
                f"💡 If you don't have your Order ID, reply with your *phone number* "
                f"and I'll look up your recent orders."
            ),
            "intent": "order_tracking",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": ["I don't have Order ID", "Contact Support"],
            "metadata": {"generation_method": "order_tracking_ask_id", "awaiting_order_id": True}
        }
    
    def _extract_order_id_from_message(self, message: str) -> Optional[str]:
        """
        Extract Order ID from user message using multiple patterns.
        
        Patterns recognized:
        - #ABC123 or #C3B68564
        - order id ABC123
        - STANDALONE alphanumeric like C3B68564 (must contain digit)
        
        Does NOT extract common words like 'come', 'order', etc.
        """
        import re
        
        # Common words to ignore (these are NOT order IDs)
        ignore_words = {
            'come', 'order', 'track', 'when', 'will', 'what', 'where', 
            'status', 'cancel', 'help', 'hello', 'please', 'thank', 'thanks',
            'varum', 'enna', 'eppo', 'achu'
        }
        
        # Pattern 1: #ORDER_ID (e.g., #C3B68564)
        match = re.search(r'#([A-Za-z0-9]{4,12})', message)
        if match:
            candidate = match.group(1).upper()
            if candidate.lower() not in ignore_words:
                return candidate
        
        # Pattern 2: "order id XYZ" - only if followed by alphanumeric with digits
        match = re.search(r'order\s*id\s*[:\s]*([A-Za-z0-9]{4,12})', message, re.IGNORECASE)
        if match:
            candidate = match.group(1).upper()
            if candidate.lower() not in ignore_words and any(c.isdigit() for c in candidate):
                return candidate
        
        # Pattern 3: Standalone alphanumeric that MUST contain at least one digit
        # (Real order IDs like C3B68564 always have digits)
        # Only if message is short (user is likely just providing the ID)
        if len(message) <= 20:
            match = re.search(r'\b([A-Za-z0-9]{6,12})\b', message)
            if match:
                candidate = match.group(1).upper()
                # Must contain at least one digit and not be a common word
                if (candidate.lower() not in ignore_words and 
                    any(c.isdigit() for c in candidate)):
                    return candidate
        
        return None
    
    def _lookup_order_by_id(
        self, 
        order_id: str, 
        user_id: str, 
        business_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Look up order by Order ID from Supabase.
        Searches both 'id' (UUID) and 'order_id' (short human-readable ID) columns.
        """
        if not self.supabase_client or not order_id:
            logger.warning(f"⚠️ Cannot lookup order: supabase={bool(self.supabase_client)}, order_id={order_id}")
            return None
        
        try:
            # Normalize order ID (remove # prefix, uppercase for consistency)
            search_id = order_id.replace("#", "").strip().upper()
            logger.info(f"🔍 Searching for order ID: '{search_id}' in Supabase orders table")
            
            # Priority 1: Try exact match on 'order_id' column (human-readable short ID like C3B68564)
            try:
                result = self.supabase_client.table("orders").select(
                    "id, order_id, status, created_at, items, customer_name, customer_phone"
                ).eq("order_id", search_id).limit(1).execute()
                
                logger.info(f"🔍 Query 1 (order_id exact): found {len(result.data) if result.data else 0} results")
                
                if result.data and len(result.data) > 0:
                    order = result.data[0]
                    logger.info(f"✅ Found order by order_id column: {order.get('order_id')}")
                    return order
            except Exception as e1:
                logger.warning(f"⚠️ Query 1 failed: {e1}")
            
            # Priority 2: Try case-insensitive match on 'order_id'
            try:
                result = self.supabase_client.table("orders").select(
                    "id, order_id, status, created_at, items, customer_name, customer_phone"
                ).ilike("order_id", search_id).limit(1).execute()
                
                logger.info(f"🔍 Query 2 (order_id ilike): found {len(result.data) if result.data else 0} results")
                
                if result.data and len(result.data) > 0:
                    order = result.data[0]
                    logger.info(f"✅ Found order by order_id (ilike): {order.get('order_id')}")
                    return order
            except Exception as e2:
                logger.warning(f"⚠️ Query 2 failed: {e2}")
            
            # Priority 3: Try partial match on 'id' column (UUID contains this string)
            try:
                result = self.supabase_client.table("orders").select(
                    "id, order_id, status, created_at, items, customer_name, customer_phone"
                ).ilike("id", f"%{search_id.lower()}%").limit(1).execute()
                
                logger.info(f"🔍 Query 3 (id ilike): found {len(result.data) if result.data else 0} results")
                
                if result.data and len(result.data) > 0:
                    order = result.data[0]
                    logger.info(f"✅ Found order by UUID partial match: {order.get('id')}")
                    return order
            except Exception as e3:
                logger.warning(f"⚠️ Query 3 failed: {e3}")
            
            logger.info(f"❌ Order not found for ID: {search_id}")
                
        except Exception as e:
            logger.error(f"❌ Failed to lookup order by ID: {e}", exc_info=True)
        
        return None
    
    def _lookup_orders_by_phone(
        self, 
        phone: str, 
        business_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Look up recent orders by phone number from Supabase.
        Returns up to 5 most recent orders from last 30 days.
        """
        if not self.supabase_client or not phone:
            return []
        
        try:
            from datetime import datetime, timedelta
            thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
            
            # Normalize phone number (remove + and spaces)
            normalized_phone = phone.replace("+", "").replace(" ", "").replace("-", "")
            
            # Try multiple phone formats - use the last 10 digits for matching
            phone_last10 = normalized_phone[-10:] if len(normalized_phone) >= 10 else normalized_phone
            
            result = self.supabase_client.table("orders").select(
                "id, order_id, status, created_at, items, customer_name, customer_phone"
            ).ilike(
                "customer_phone", f"%{phone_last10}%"
            ).gte(
                "created_at", thirty_days_ago
            ).order("created_at", desc=True).limit(5).execute()
            
            if result.data:
                logger.info(f"✅ Found {len(result.data)} orders by phone: {normalized_phone[-4:]}")
                return result.data
                
        except Exception as e:
            logger.warning(f"⚠️ Failed to lookup orders by phone: {e}")
        
        return []
    
    def _format_order_status_response(
        self, 
        order: Dict[str, Any], 
        status_map: Dict[str, tuple]
    ) -> Dict[str, Any]:
        """
        Format a single order's status with professional styling.
        Amazon/Google-level presentation.
        """
        # Get order ID - prefer 'order_id' (human-readable) over 'id' (UUID)
        order_id = order.get("order_id") or order.get("id", "")
        order_status = order.get("status", "created")
        items = order.get("items", [])
        created_at = order.get("created_at", "")
        total_amount = order.get("total_amount")
        
        # Format order ID for display
        # If it's a short order_id (e.g., C3B68564), use as-is
        # If it's a UUID, show last 8 chars
        if len(order_id) <= 12:
            order_id_display = order_id.upper()
        else:
            order_id_display = order_id[-8:].upper()
        
        # Get status info
        status_info = status_map.get(order_status, ("Processing", "is being processed ⏳", 1))
        status_label, status_message, status_level = status_info
        
        # Format items
        if items and isinstance(items, list):
            items_lines = []
            for item in items[:4]:
                if isinstance(item, dict):
                    qty = item.get("quantity", 1)
                    name = item.get("name", "Item")
                    variant = item.get("variant_display", "")
                    if variant:
                        items_lines.append(f"  • {qty}x {name} ({variant})")
                    else:
                        items_lines.append(f"  • {qty}x {name}")
                else:
                    items_lines.append(f"  • {item}")
            items_text = "\n".join(items_lines)
            if len(items) > 4:
                items_text += f"\n  (+{len(items) - 4} more items)"
        else:
            items_text = "  • Your items"
        
        # Format date
        try:
            from datetime import datetime
            if isinstance(created_at, str):
                order_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                date_display = order_date.strftime("%d %b %Y, %I:%M %p")
            else:
                date_display = "Recently"
        except:
            date_display = "Recently"
        
        # Build status timeline visual
        timeline = self._build_status_timeline(status_level)
        
        # Build professional response
        response_text = (
            f"📦 *Order Status*\n"
            f"━━━━━━━━━━━━━━━━━\n\n"
            f"🆔 Order ID: *#{order_id_display}*\n"
            f"📅 Placed: {date_display}\n"
        )
        
        if total_amount:
            response_text += f"💰 Total: ₹{int(float(total_amount))}\n"
        
        response_text += (
            f"\n*Items:*\n{items_text}\n\n"
            f"━━━━━━━━━━━━━━━━━\n"
            f"*Status: {status_label}*\n\n"
            f"{timeline}\n\n"
            f"Your order {status_message}\n\n"
            f"📱 You'll receive updates on WhatsApp."
        )
        
        suggested_actions = ["Track Another Order", "Place New Order"]
        if order_status not in ["delivered", "cancelled", "shipped"]:
            suggested_actions = ["Cancel Order", "Contact Support", "Place Another Order"]
        
        return {
            "reply": response_text,
            "intent": "order_tracking",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": suggested_actions,
            "metadata": {
                "generation_method": "order_tracking_status",
                "order_id": order_id,
                "order_status": order_status,
            }
        }
    
    def _format_multi_order_response(
        self, 
        orders: List[Dict[str, Any]], 
        status_map: Dict[str, tuple],
        searched_id: str = None
    ) -> Dict[str, Any]:
        """
        Format multiple orders list for user to select.
        """
        state = self.conversation_manager.get_state(orders[0].get("customer_phone", ""))
        
        response_lines = [
            f"📋 *Your Recent Orders*\n",
            f"━━━━━━━━━━━━━━━━━\n",
        ]
        
        if searched_id:
            response_lines.insert(1, f"⚠️ Order *{searched_id}* not found, but I found these:\n\n")
        
        for i, order in enumerate(orders[:5], 1):
            # Prefer order_id (human-readable) over UUID
            order_id_raw = order.get("order_id") or order.get("id", "")
            if len(order_id_raw) <= 12:
                order_id = order_id_raw.upper()
            else:
                order_id = order_id_raw[-8:].upper()
            status = order.get("status", "created")
            items = order.get("items", [])
            
            status_info = status_map.get(status, ("Processing", "", 1))
            status_label = status_info[0]
            
            # Get first item name
            first_item = "Items"
            if items and isinstance(items, list) and len(items) > 0:
                first = items[0]
                if isinstance(first, dict):
                    first_item = first.get("name", "Items")[:20]
            
            response_lines.append(
                f"{i}️⃣ *#{order_id}*\n"
                f"   {first_item}{'...' if len(items) > 1 else ''}\n"
                f"   Status: {status_label}\n"
            )
        
        # Get example order ID for instructions
        example_order_id_raw = orders[0].get("order_id") or orders[0].get("id", "")
        if len(example_order_id_raw) <= 12:
            example_order_id = example_order_id_raw.upper()
        else:
            example_order_id = example_order_id_raw[-8:].upper()
        
        response_lines.append(
            f"\n━━━━━━━━━━━━━━━━━\n"
            f"Reply with the *Order ID* (e.g., #{example_order_id}) "
            f"for detailed status."
        )
        
        return {
            "reply": "\n".join(response_lines),
            "intent": "order_tracking",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": [
                f"#{(orders[i].get('order_id') or orders[i].get('id', ''))[:12].upper() if len(orders[i].get('order_id') or orders[i].get('id', '')) <= 12 else (orders[i].get('order_id') or orders[i].get('id', ''))[-8:].upper()}"
                for i in range(min(3, len(orders)))
            ],
            "metadata": {"generation_method": "order_tracking_multi", "order_count": len(orders)}
        }
    
    def _build_status_timeline(self, current_level: int) -> str:
        """
        Build a visual status timeline like Amazon/Flipkart.
        """
        stages = [
            ("Placed", 1),
            ("Confirmed", 2),
            ("Preparing", 4),
            ("Shipped", 5),
            ("Delivered", 7),
        ]
        
        timeline_parts = []
        for stage_name, stage_level in stages:
            if current_level >= stage_level:
                timeline_parts.append(f"✅ {stage_name}")
            elif current_level == 0:  # Cancelled
                if stage_level == 1:
                    timeline_parts.append(f"❌ Cancelled")
                break
            else:
                timeline_parts.append(f"⬜ {stage_name}")
        
        return " → ".join(timeline_parts)
    
    def _handle_order_cancellation(
        self,
        user_id: str,
        context_facts: Dict[str, Any],
        business_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle order cancellation requests.
        """
        order_id = context_facts.get("order_id", "")
        order_status = context_facts.get("order_status", "created")
        
        # Check if order can be cancelled
        non_cancellable_statuses = ["shipped", "out_for_delivery", "delivered", "cancelled"]
        
        if order_status in non_cancellable_statuses:
            if order_status == "cancelled":
                response_text = (
                    f"This order has already been cancelled.\n\n"
                    f"Would you like to place a new order? 🛒"
                )
            elif order_status == "delivered":
                response_text = (
                    f"This order has already been delivered.\n\n"
                    f"If you have any issues with your order, please contact our support team."
                )
            else:
                response_text = (
                    f"Your order has already been shipped and cannot be cancelled automatically.\n\n"
                    f"Please contact our support team for assistance with returns."
                )
            
            return {
                "reply": response_text,
                "intent": "order_cancellation",
                "confidence": 1.0,
                "needs_human": order_status in ["shipped", "out_for_delivery"],
                "suggested_actions": ["Contact Support", "Place New Order"],
                "metadata": {"generation_method": "order_cancellation_handler", "cancellable": False}
            }
        
        # Order can be cancelled - confirm with user
        order_id_display = f"#{order_id[-6:]}" if order_id and len(order_id) >= 6 else "your order"
        response_text = (
            f"I can help you cancel {order_id_display}.\n\n"
            f"Are you sure you want to cancel this order?\n\n"
            f"Reply *Yes* to confirm cancellation, or *No* to keep your order."
        )
        
        # Store cancellation pending state
        state = self.conversation_manager.get_state(user_id)
        if state:
            state.collect_field("_pending_cancellation", True)
            state.collect_field("_cancel_order_id", order_id)
        
        return {
            "reply": response_text,
            "intent": "order_cancellation",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": ["Yes, Cancel", "No, Keep Order"],
            "metadata": {"generation_method": "order_cancellation_handler", "cancellable": True}
        }
    
    def _is_order_booking_enabled(self, user_id: str) -> bool:
        """Check if order booking is enabled for this business."""
        if not self.supabase_client:
            return False
        try:
            result = self.supabase_client.table("ai_capabilities").select(
                "order_booking_enabled"
            ).eq("user_id", user_id).single().execute()
            enabled = result.data.get("order_booking_enabled", False) if result.data else False
            logger.info(f"📦 Order booking enabled for {user_id}: {enabled}")
            return enabled
        except Exception as e:
            logger.warning(f"📦 Failed to check order_booking_enabled: {e}")
            return False
    
    def _get_order_config(self, user_id: str) -> Dict:
        """
        Get order field configuration for a business.
        
        Returns:
            Dict with order fields configuration or defaults
        """
        # Default fields
        default_fields = [
            {"id": "name", "label": "Full Name", "type": "text", "required": True, "order": 1},
            {"id": "phone", "label": "Phone Number", "type": "phone", "required": True, "order": 2},
            {"id": "address", "label": "Delivery Address", "type": "textarea", "required": True, "order": 3},
        ]
        
        if not self.supabase_client:
            return {"fields": default_fields, "minimal_mode": False}
        
        try:
            result = self.supabase_client.table("ai_capabilities").select(
                "order_fields, order_minimal_mode"
            ).eq("user_id", user_id).single().execute()
            
            if result.data:
                fields = result.data.get("order_fields", default_fields)
                minimal_mode = result.data.get("order_minimal_mode", False)
                
                # Filter out notes field - not needed
                fields = [f for f in fields if f.get("id") != "notes"]
                
                # If minimal mode, only use name and phone
                if minimal_mode:
                    fields = [f for f in fields if f.get("id") in ["name", "phone"]]
                
                return {
                    "fields": sorted(fields, key=lambda x: x.get("order", 0)),
                    "minimal_mode": minimal_mode
                }
            
            # Filter out notes field from default fields as well
            filtered_defaults = [f for f in default_fields if f.get("id") != "notes"]
            return {"fields": filtered_defaults, "minimal_mode": False}
            
        except Exception as e:
            logger.warning(f"📦 Failed to get order config: {e}")
            # Filter out notes field from default fields as well
            filtered_defaults = [f for f in default_fields if f.get("id") != "notes"]
            return {"fields": filtered_defaults, "minimal_mode": False}
    
    def _get_available_colors_for_product(
        self, product: Dict[str, Any], selected_size: Optional[str] = None
    ) -> List[str]:
        """
        Derive available colors from product, preferring variant-level colors over base.
        When product has variants, use unique colors from variants (optionally filtered by
        selected_size). Otherwise fall back to base product 'colors'.
        """
        if not product or not isinstance(product, dict):
            return []
        variants = product.get("variants", []) or []
        if variants:
            def collect(by_size: Optional[str]) -> List[str]:
                seen: set = set()
                out: List[str] = []
                for v in variants:
                    if not isinstance(v, dict):
                        continue
                    if by_size is not None:
                        v_size = (v.get("size") or "").strip()
                        if v_size and v_size != by_size:
                            continue
                    c = (v.get("color") or "").strip()
                    if c and c not in seen:
                        seen.add(c)
                        out.append(c)
                return out

            colors_from_variants = collect(selected_size)
            if not colors_from_variants and selected_size is not None:
                colors_from_variants = collect(None)
            if colors_from_variants:
                logger.info(
                    f"🎨 Using variant-derived colors (size={selected_size!r}): {colors_from_variants}"
                )
                return colors_from_variants[:10]
        base = product.get("colors", []) or []
        if isinstance(base, list):
            return [str(x).strip() for x in base if str(x).strip()][:10]
        return []
    
    def _resolve_variant_for_product(
        self,
        product: Dict[str, Any],
        selected_size: Optional[str] = None,
        selected_color: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Find a variant matching the given size and/or color.
        Returns the variant dict or None. Use for variant-level pricing.
        """
        if not product or not isinstance(product, dict):
            return None
        variants = product.get("variants", []) or []
        for v in variants:
            if not isinstance(v, dict):
                continue
            if selected_size is not None:
                v_size = (v.get("size") or "").strip()
                if v_size and v_size != selected_size:
                    continue
            if selected_color is not None:
                v_color = (v.get("color") or "").strip()
                if v_color and v_color != selected_color:
                    continue
            return v
        return None
    
    def _start_order_flow(
        self,
        user_id: str,
        business_owner_id: str,
        initial_message: str,
        business_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Start AI-driven order booking flow with category navigation and variant support.
        
        Enhanced flow:
        1. If multiple categories exist, show category selection first
        2. Show products with variant indicators (sizes/colors available)
        3. Store product_id for stable references
        """
        logger.info(f"📦 Starting order flow for user: {user_id}, business: {business_owner_id}")
        
        # Validate business_owner_id before starting flow
        # Must be a valid ID (not empty, not "default", not too short)
        if not business_owner_id or business_owner_id == "default" or len(business_owner_id) < 10:
            logger.error(f"📦 Invalid business_owner_id: '{business_owner_id}' - cannot start order flow without valid business ID")
            return {
                "reply": "I'm sorry, but I cannot process orders at the moment. Please contact the business directly.",
                "intent": "order_error",
                "confidence": 1.0,
                "needs_human": True,
                "suggested_actions": ["Contact us"],
                "metadata": {"generation_method": "order_flow_invalid_business", "error": "invalid_business_id"}
            }
        
        # Get order field configuration
        order_config = self._get_order_config(business_owner_id)
        order_fields = order_config.get("fields", [])
        
        # Build required fields list from config
        required_field_ids = ["items"] + [f["id"] for f in order_fields if f.get("required", False)]
        
        # Start the order flow in conversation manager
        state = self.conversation_manager.start_flow(
            user_id=user_id,
            flow_name="order_booking",
            required_fields=required_field_ids,
            config={
                "business_owner_id": business_owner_id,
                "order_fields": order_fields,
            }
        )
        
        products = business_data.get("products_services", [])
        msg_lower = initial_message.lower()
        
        # Extract unique categories from products
        product_categories = list(set([
            p.get("category", "").strip() 
            for p in products 
            if isinstance(p, dict) and p.get("category", "").strip()
        ]))
        
        # Also check for separately defined categories in AI Settings
        separate_categories = business_data.get("categories", [])
        if isinstance(separate_categories, list):
            # Categories might be strings or dicts with 'name' field
            for cat in separate_categories:
                if isinstance(cat, str) and cat.strip():
                    if cat.strip() not in product_categories:
                        product_categories.append(cat.strip())
                elif isinstance(cat, dict) and cat.get('name', '').strip():
                    cat_name = cat.get('name', '').strip()
                    if cat_name not in product_categories:
                        product_categories.append(cat_name)
        
        categories = [c for c in product_categories if c]  # Remove empty
        logger.info(f"📂 Categories found: {len(categories)} - {categories[:5]}... (from products + AI Settings)")
        
        # Get store link using business_id (Firebase UID) as the slug
        business_id = business_data.get("business_id")
        store_link = None
        if business_id and business_id != "default" and len(business_id) > 10:
            store_link = f"https://flowauxi.com/store/{business_id}"
            logger.info(f"🔗 Store link: {store_link}")
        
        # Try to extract category mention from initial message
        # Handles: "i want to order saree", "order saree", etc.
        mentioned_category = None
        for cat in categories:
            if cat.lower() in msg_lower:
                mentioned_category = cat
                logger.info(f"📂 Category mentioned in message: {mentioned_category}")
                break
        
        # Try to extract product mention from initial message
        # Handles: "order bubble tshirt", "order_bubble_tshirt", direct product names
        mentioned_product = None
        
        # Check if this is from "Order This" button click (format: "order {product_id}")
        order_prefix_match = msg_lower.startswith("order ")
        search_term = msg_lower.replace("order ", "").replace("_", " ").strip() if order_prefix_match else msg_lower
        
        for product in products:
            if isinstance(product, dict):
                name = product.get("name", "").lower()
                product_id = str(product.get("id", "")).lower()
                sku = str(product.get("sku", "")).lower()
                
                # Match by name, id, or sku
                if name and (name in search_term or search_term in name):
                    mentioned_product = product
                    break
                if product_id and (product_id in search_term or search_term in product_id):
                    mentioned_product = product
                    break
                if sku and (sku in search_term or search_term in sku):
                    mentioned_product = product
                    break
        
        logger.info(f"📦 Product match search: '{search_term}' → {mentioned_product.get('name') if mentioned_product else 'No match'}")
        
        # Generate appropriate response based on context
        # Initialize product metadata (may be filled by _format_product_list)
        product_meta = {}
        
        if mentioned_product:
            # Product mentioned in initial message - check for variants
            product_name = mentioned_product.get("name", "item")
            product_id = mentioned_product.get("id") or mentioned_product.get("sku") or product_name
            product_price = mentioned_product.get("price", "")
            sizes = mentioned_product.get("sizes", [])
            # For initial message, use BASE product colors (not variant-derived)
            # since there's no card selection yet. This is the correct behavior.
            colors = mentioned_product.get("colors", [])
            if isinstance(colors, list):
                colors = [str(c).strip() for c in colors if str(c).strip()][:10]
            else:
                colors = []
            
            price_str = f" (₹{product_price})" if product_price else ""
            
            # Store full product info
            state.collect_field("pending_item", product_name)
            state.collect_field("pending_product_id", product_id)
            state.collect_field("pending_product_data", mentioned_product)
            
            # Check if we need variant selection
            # AMAZON-GRADE: Use get_sellable_sizes to filter OOS sizes
            try:
                from utils.availability import get_sellable_sizes, get_stock_for_selection
                sizes = get_sellable_sizes(mentioned_product)
            except ImportError:
                sizes = mentioned_product.get("sizes", [])
            
            if sizes:
                state.collect_field("_needs_size", True)
                state.collect_field("_available_sizes", sizes)
                size_list = ", ".join(sizes[:6])
                response_text = (
                    f"Great choice! 🎉\n*{product_name}*\n\n"
                    f"Available sizes: {size_list}\n\n"
                    f"Which size would you like?"
                )
                suggested_actions = sizes[:4] + ["Cancel"]
            elif colors:
                # If only one color, automatically select it
                if len(colors) == 1:
                    # Auto-select the single color
                    state.collect_field("selected_color", colors[0])
                    # Get max available stock for quantity prompt
                    try:
                        from utils.availability import get_stock_for_selection
                        max_qty = get_stock_for_selection(mentioned_product)
                        state.collect_field("_stock_snapshot", max_qty)
                        qty_text = ""  # Don't show max to user, validation happens server-side
                    except ImportError:
                        qty_text = ""
                    response_text = (
                        f"Great choice! 🎉\n*{product_name}*\n\n"
                        f"Color: *{colors[0]}*\n\n"
                        f"How many would you like to order?{qty_text}"
                    )
                    suggested_actions = ["1", "2", "3", "Cancel"]
                else:
                    # Multiple colors - ask user to select
                    state.collect_field("_needs_color", True)
                    state.collect_field("_available_colors", colors)
                    color_list = ", ".join(colors[:6])
                    response_text = (
                        f"Great choice! 🎉\n*{product_name}*\n\n"
                        f"Available colors: {color_list}\n\n"
                        f"Which color would you like?"
                    )
                    suggested_actions = colors[:4] + ["Cancel"]
            else:
                # No size/color selection needed - get max stock for quantity prompt
                try:
                    from utils.availability import get_stock_for_selection
                    max_qty = get_stock_for_selection(mentioned_product)
                    state.collect_field("_stock_snapshot", max_qty)
                    qty_text = ""  # Don't show max to user, validation happens server-side
                except ImportError:
                    qty_text = ""
                response_text = (
                    f"Great choice! 🎉\n*{product_name}*\n\n"
                    f"How many would you like to order?{qty_text}"
                )
                suggested_actions = ["1", "2", "3", "Cancel"]
        
        elif mentioned_category:
            # User mentioned a category in their message - show products from that category
            state.collect_field("awaiting_selection", True)
            filtered_products = [
                p for p in products 
                if isinstance(p, dict) and p.get("category", "").strip().lower() == mentioned_category.lower()
            ]
            
            if filtered_products:
                response_text, suggested_actions, product_meta = self._format_product_list(filtered_products[:8], state)
                response_text = f"*{mentioned_category}*\n\n" + response_text.split("\n\n", 1)[1] if "\n\n" in response_text else response_text
                # Add store link if available
                if store_link:
                    response_text += f"\n\nOr visit our Web store: {store_link}"
            else:
                # Category mentioned but no products found
                response_text = f"I couldn't find any products in the {mentioned_category} category. Let me show you all our categories."
                mentioned_category = None  # Fall through to category selection
        
        if not mentioned_product and not mentioned_category and categories:
            # Show category selection: URL button for "Visit Website" + Category list menu
            state.collect_field("awaiting_category", True)
            state.collect_field("_available_categories", categories)
            header_text = "Start Shopping ❤️"
            
            # Build list sections for categories
            list_sections = [{
                "title": "Categories",
                "rows": [
                    {"id": f"cat_{i}_{cat.replace(' ', '_').lower()[:20]}", "title": cat[:24]}
                    for i, cat in enumerate(categories[:10])  # WhatsApp max 10 items
                ]
            }]
            
            # If store link exists, send URL button first, then category list menu as second message
            if store_link:
                response_text = "our perfect picks are just a tap away. visit our online store now."
                use_url_button = True
                use_list = True  # Send category list menu as second message
                list_body_text = "View categories to continue shopping on WhatsApp."
                suggested_actions = ["View Categories"]
            else:
                response_text = "Tap below to explore our product categories."
                use_url_button = False
                use_list = True
                suggested_actions = ["View Categories"]
        
        elif not mentioned_product and not mentioned_category and products:
            # No categories - show products directly
            response_text, suggested_actions, product_meta = self._format_product_list(products[:8], state)
            # Add store link if available
            if store_link:
                response_text += f"\n\nOr visit our Web store: {store_link}"
        
        elif not mentioned_product and not mentioned_category:
            # No products or categories
            response_text = (
                f"I'd be happy to help you place an order!\n\n"
                f"What would you like to order today?"
            )
            if store_link:
                response_text += f"\n\nOr visit our Web store: {store_link}"
            suggested_actions = ["Cancel order"]
        
        # Add to conversation history
        self.conversation_manager.add_message(user_id, "user", initial_message)
        self.conversation_manager.add_message(user_id, "assistant", response_text)
        
        # Build metadata based on message type
        metadata = {
            "generation_method": "order_flow_started",
            "flow": "order_booking",
            "mentioned_product": mentioned_product.get("name") if mentioned_product else None,
            "categories_available": len(categories) if categories else 0,
            "header_text": header_text if 'header_text' in dir() else "Start Shopping",
            "footer_text": "Start Shopping",
            **product_meta,  # Include product_cards if present
        }
        
        # Add URL button for "Visit Website" if store link exists (sent first)
        if store_link and not mentioned_product and not mentioned_category and categories and 'use_url_button' in dir() and use_url_button:
            metadata["use_url_button"] = True
            metadata["url_button_text"] = "Visit Website"
            metadata["url_button_url"] = store_link
            metadata["url_button_body"] = response_text  # Use the updated response_text
            metadata["url_button_header"] = "Start Shopping ❤️"
            metadata["url_button_footer"] = ""
            # Send category list menu as second message
            if 'use_list' in dir() and use_list and list_sections:
                metadata["use_list"] = True
                metadata["list_button"] = "View Categories"
                metadata["list_sections"] = list_sections
                metadata["list_body_text"] = list_body_text if 'list_body_text' in dir() else "View categories to continue shopping on WhatsApp."
                metadata["list_header_text"] = ""
                metadata["list_footer_text"] = ""
        elif 'use_list' in dir() and use_list and list_sections:
            # Use WhatsApp List Message
            metadata["use_list"] = True
            metadata["list_button"] = "View Categories"
            metadata["list_sections"] = list_sections
        else:
            # Use WhatsApp Reply Buttons
            buttons = []
            for i, action in enumerate(suggested_actions[:3]):
                buttons.append({
                    "id": f"cat_{i}_{action.replace(' ', '_').lower()[:15]}",
                    "title": action[:20]
                })
            metadata["use_buttons"] = True
            metadata["buttons"] = buttons
        
        return {
            "reply": response_text,
            "intent": "order_started",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": suggested_actions,
            "metadata": metadata
        }
    
    def _format_product_list(self, products: List[Dict], state, page: int = 0, page_size: int = 5) -> tuple:
        """Format product list with detailed info, image metadata, and pagination support.
        
        Args:
            products: Full list of products
            state: Conversation state
            page: Current page number (0-indexed)
            page_size: Number of products per page
        
        Returns:
            tuple: (response_text, suggested_actions, metadata_with_product_cards)
        """
        # =====================================================================
        # AMAZON-GRADE: Filter products to only those with sellable options
        # ⚠️ DO NOT implement stock logic here - use centralized availability
        # =====================================================================
        try:
            from utils.availability import filter_sellable_products, is_product_sellable
            # Filter to sellable products BEFORE pagination
            sellable_products = filter_sellable_products(products, max_count=50)  # Pre-filter large list
            logger.info(f"📦 Stock filter: {len(products)} → {len(sellable_products)} sellable")
        except ImportError:
            logger.warning("⚠️ Availability module not found, showing all products")
            sellable_products = products
        
        total_products = len(sellable_products)
        total_pages = (total_products + page_size - 1) // page_size  # Ceiling division
        
        # Ensure page is within bounds
        page = max(0, min(page, total_pages - 1)) if total_pages > 0 else 0
        
        # Get products for current page
        start_idx = page * page_size
        end_idx = min(start_idx + page_size, total_products)
        page_products = sellable_products[start_idx:end_idx]
        
        # Store pagination state
        state.collect_field("_pagination_page", page)
        state.collect_field("_pagination_total_pages", total_pages)
        state.collect_field("_pagination_total_products", total_products)
        state.collect_field("_pagination_page_size", page_size)
        state.collect_field("_all_products", sellable_products)  # Store filtered list
        
        product_lines = []
        product_map = {}
        product_cards = []  # For WhatsApp image rendering
        
        # CRITICAL FIX: Load existing maps and MERGE new entries to preserve mappings from previous pages
        # This prevents the bug where clicking a page 1 button after viewing page 2 maps to wrong product
        existing_card_index_map = state.collected_fields.get("_card_index_map", {}) or {}
        existing_card_colors_map = state.collected_fields.get("_card_colors_map", {}) or {}
        existing_card_sizes_map = state.collected_fields.get("_card_sizes_map", {}) or {}
        
        # Start with copies of existing maps to merge into
        card_index_map = dict(existing_card_index_map)
        card_colors_map = dict(existing_card_colors_map)
        card_sizes_map = dict(existing_card_sizes_map)
        
        # Calculate global offset: start new card indices after highest existing key
        # This ensures unique indices across all pages
        existing_keys = [int(k) for k in existing_card_index_map.keys() if str(k).isdigit()] if existing_card_index_map else []
        card_index_offset = (max(existing_keys) + 1) if existing_keys else 0
        
        # If this is page 0 (first page), reset maps to start fresh
        if page == 0:
            card_index_map = {}
            card_colors_map = {}
            card_sizes_map = {}
            card_index_offset = 0
        
        card_index_counter = card_index_offset  # Global counter for all cards (base + variants)
        
        # AMAZON-GRADE: Maximum 5 product cards total (base + variants combined)
        MAX_PRODUCT_CARDS = 5
        
        # Import availability functions for OOS filtering
        try:
            from utils.availability import get_sellable_sizes, is_product_sellable, compute_sellable_options
            has_availability_module = True
        except ImportError:
            has_availability_module = False
            logger.warning("⚠️ Availability module not available for size filtering")
        
        # Track how many BASE products are actually displayed (not just cards)
        products_actually_displayed = 0
        
        for i, p in enumerate(page_products):
            if not isinstance(p, dict):
                continue
            
            # Use global index for numbering
            global_index = start_idx + i + 1
            
            # Track product index for pagination recalculation
            last_product_index = i
            
            name = p.get('name', 'Item')
            base_price = p.get('price', 0)
            original_price = p.get('compare_at_price')  # Original price (if on sale)
            product_id = p.get('id') or p.get('sku') or name
            # Handle both camelCase (imageUrl) and snake_case (image_url) for compatibility
            image_url = p.get('imageUrl') or p.get('image_url') or p.get('image', '')
            
            # Debug logging for product pricing
            logger.info(f"📦 Formatting product: {name}")
            logger.info(f"   base_price: {base_price} (type: {type(base_price)})")
            logger.info(f"   original_price (compare_at_price): {original_price} (type: {type(original_price)})")
            
            # Size-based pricing support
            has_size_pricing = p.get('has_size_pricing', False)
            size_prices = p.get('size_prices', {}) or {}
            
            # Calculate price display based on size pricing
            display_price = base_price  # Default to base price
            min_size_price = None
            max_size_price = None
            price_range_str = None
            
            if has_size_pricing and size_prices:
                try:
                    # Get all size prices as floats
                    price_values = [float(v) for v in size_prices.values() if v is not None]
                    if price_values:
                        min_size_price = min(price_values)
                        max_size_price = max(price_values)
                        # If there's a range, show it
                        if min_size_price != max_size_price:
                            price_range_str = f"₹{int(min_size_price)}-₹{int(max_size_price)}"
                        else:
                            display_price = min_size_price
                except (ValueError, TypeError):
                    pass
            
            logger.info(f"   display_price: {display_price} (has_size_pricing: {has_size_pricing})")
            
            # Calculate discount percentage if offer price exists
            discount_percent = 0
            has_offer = False
            
            # Check for offer: compare_at_price > price means there's an offer
            # IMPORTANT: Always preserve original_price in the card, even if comparison fails
            # The comparison logic in app.py will handle the display
            if original_price:
                try:
                    # Ensure both are numbers
                    current_num = float(display_price) if display_price else 0
                    original_num = float(original_price) if original_price else 0
                    
                    logger.info(f"   Comparing prices: original={original_num} > current={current_num}?")
                    
                    if original_num > current_num and current_num > 0:
                        discount_percent = int(((original_num - current_num) / original_num) * 100)
                        has_offer = True
                        logger.info(f"   ✅ Offer detected: {discount_percent}% off")
                    else:
                        logger.info(f"   ⚠️ No valid offer (original not greater than current)")
                except (ValueError, TypeError, ZeroDivisionError) as e:
                    discount_percent = 0
                    has_offer = False
                    logger.warning(f"   ❌ Error calculating offer: {e}")
            else:
                logger.info(f"   ℹ️ No original_price (compare_at_price) found")
            
            # Check if product has variants
            variants = p.get('variants', []) or []
            has_variants = len(variants) > 0
            
            # CRITICAL FIX: Always create base product card if it has valid displayable attributes
            # The base product represents one color/size combination, variants are OTHER combinations
            # Users should be able to order BOTH the base product AND any variants
            # Example: Base = Blue/Free Size/XL, Variant 1 = Yellow/Free Size/M
            # Both should be shown as separate orderable items
            
            # Only skip base product card if it has NO colors/sizes (pure template with only variants)
            base_colors = p.get('colors', []) or []
            base_sizes = p.get('sizes', []) or []
            
            # AMAZON-GRADE: Filter sizes to only those with BASE PRODUCT stock
            if has_availability_module and base_sizes:
                try:
                    sellable_sizes = get_sellable_sizes(p, base_only=True)  # CRITICAL: base_only=True
                    if sellable_sizes:
                        base_sizes = sellable_sizes
                        logger.info(f"   📏 Filtered BASE sizes for {name}: {len(p.get('sizes', []))} → {len(sellable_sizes)} sellable")
                    else:
                        # No sellable sizes - skip this base product card
                        logger.info(f"   ⏭️ Skipping {name} - no sellable sizes")
                        base_sizes = []
                except Exception as e:
                    logger.warning(f"   ⚠️ Error filtering sizes for {name}: {e}")
            
            has_base_attributes = len(base_colors) > 0 or len(base_sizes) > 0
            
            # AMAZON-GRADE: Enforce 5-card limit
            if len(product_cards) >= MAX_PRODUCT_CARDS:
                logger.info(f"   🛑 MAX_PRODUCT_CARDS ({MAX_PRODUCT_CARDS}) reached, stopping card generation")
                # Don't increment products_actually_displayed for products not shown
                break
            
            # This product will be displayed - increment counter
            products_actually_displayed += 1
            
            # Create base product card if it has displayable attributes
            if has_base_attributes:
                # ENTERPRISE-GRADE: Register opaque button ID with product snapshot
                # This replaces fragile card_index-based mapping
                from utils.button_registry import register_button
                
                # Get stock for base product (for revalidation on click)
                base_stock = p.get('stock', 0) or 0
                
                btn_id = register_button(
                    product_id=str(product_id),
                    variant_id=None,
                    size=None,  # User will select
                    color=None,  # User will select
                    product_name=name,
                    available_sizes=base_sizes[:6],
                    available_colors=base_colors[:5],
                    stock=base_stock
                )
                
                # Build product card for WhatsApp image messages (BASE PRODUCT)
                # CRITICAL: Always include compare_at_price if it exists, even if has_offer is False
                # The display logic in app.py will handle the comparison
                product_cards.append({
                    'index': global_index,
                    'name': name,
                    'price': display_price,
                    'compare_at_price': original_price,  # Always include if exists, let app.py decide display
                    'discount_percent': discount_percent,
                    'product_id': product_id,
                    'card_index': card_index_counter,  # Keep for backwards compatibility
                    'btn_id': btn_id,  # ENTERPRISE-GRADE: Opaque button ID
                    'image_url': image_url if image_url and not image_url.startswith('data:') else '',
                    'colors': base_colors[:5],
                    'sizes': base_sizes[:6],  # Now filtered to only sellable sizes
                    # Size-based pricing info for product card
                    'has_size_pricing': has_size_pricing,
                    'size_prices': size_prices,
                    'price_range': price_range_str,
                    'is_variant': False,  # Mark as base product
                })
                
                # Store mappings: card_index → product_id, colors, sizes (KEEP for backwards compatibility)
                card_index_map[card_index_counter] = product_id
                card_colors_map[card_index_counter] = base_colors  # Store BASE product colors for this card
                card_sizes_map[card_index_counter] = base_sizes  # Store BASE product sizes for this card
                
                logger.info(f"   📋 Base product card created: {name} (btn_id={btn_id}, colors={base_colors}, sizes={base_sizes}, has_variants={has_variants})")
                card_index_counter += 1
            else:
                logger.info(f"   ⏭️ Skipping base product card (no colors/sizes, only variants): {name}")
            
            # Now create separate product cards for each variant (if any)
            variant_counter = 0
            for variant in variants:
                if not isinstance(variant, dict):
                    continue
                
                # AMAZON-GRADE: Enforce 5-card limit (count includes both base + variants)
                if len(product_cards) >= MAX_PRODUCT_CARDS:
                    logger.info(f"   🛑 MAX_PRODUCT_CARDS ({MAX_PRODUCT_CARDS}) reached, stopping variant generation")
                    break
                
                # Skip unavailable variants
                if not variant.get('is_available', True):
                    continue
                
                # AMAZON-GRADE: Check if variant has stock
                if has_availability_module:
                    try:
                        variant_stock = variant.get('stock', 0)
                        if variant_stock <= 0:
                            # Also check size_stocks for variants with multiple sizes
                            variant_size_stocks = variant.get('size_stocks', {})
                            if not variant_size_stocks or all(s <= 0 for s in variant_size_stocks.values()):
                                logger.info(f"   ⏭️ Skipping OOS variant: {name} - {variant.get('color', 'N/A')}")
                                continue
                    except Exception as e:
                        logger.warning(f"   ⚠️ Error checking variant stock: {e}")
                
                variant_counter += 1
                # Use base product name for variants (color/size shown separately in card body)
                variant_name = name
                variant_color = variant.get('color', '')
                variant_size = variant.get('size', '')
                
                # Get variant pricing
                variant_price = variant.get('price')
                if variant_price is None:
                    variant_price = display_price  # Fallback to base product price
                else:
                    try:
                        variant_price = float(variant_price)
                    except (ValueError, TypeError):
                        variant_price = display_price
                
                variant_compare_at_price = variant.get('compare_at_price')
                variant_discount_percent = 0
                variant_has_offer = False
                
                if variant_compare_at_price:
                    try:
                        variant_compare_num = float(variant_compare_at_price)
                        variant_price_num = float(variant_price) if variant_price else 0
                        if variant_compare_num > variant_price_num and variant_price_num > 0:
                            variant_discount_percent = int(((variant_compare_num - variant_price_num) / variant_compare_num) * 100)
                            variant_has_offer = True
                    except (ValueError, TypeError, ZeroDivisionError):
                        pass
                
                # Variant size-based pricing
                variant_has_size_pricing = variant.get('has_size_pricing', False)
                variant_size_prices = variant.get('size_prices', {}) or {}
                variant_price_range_str = None
                
                if variant_has_size_pricing and variant_size_prices:
                    try:
                        variant_price_values = [float(v) for v in variant_size_prices.values() if v is not None]
                        if variant_price_values:
                            variant_min_price = min(variant_price_values)
                            variant_max_price = max(variant_price_values)
                            if variant_min_price != variant_max_price:
                                variant_price_range_str = f"₹{int(variant_min_price)}-₹{int(variant_max_price)}"
                            else:
                                variant_price = variant_min_price
                    except (ValueError, TypeError):
                        pass
                
                # Use variant image if available, otherwise use base product image
                variant_image_url = variant.get('imageUrl') or variant.get('image_url', '')
                if not variant_image_url or variant_image_url.startswith('data:'):
                    variant_image_url = image_url if image_url and not image_url.startswith('data:') else ''
                
                # CRITICAL FIX: Parse variant size properly - it can be comma-separated string
                # e.g., "Free Size, M" from database should become ["Free Size", "M"]
                variant_sizes_parsed = []
                if variant_size:
                    if isinstance(variant_size, str) and ',' in variant_size:
                        # Split comma-separated sizes
                        variant_sizes_parsed = [s.strip() for s in variant_size.split(',') if s.strip()]
                    elif isinstance(variant_size, str):
                        # Single size string
                        variant_sizes_parsed = [variant_size.strip()]
                    elif isinstance(variant_size, list):
                        # Already a list
                        variant_sizes_parsed = variant_size
                
                logger.info(f"   📏 Variant {variant_counter}: color={variant_color}, sizes={variant_sizes_parsed}")
                
                # Create variant product card
                variant_product_id = f"{product_id}_variant_{variant.get('id', variant_counter)}"
                
                # ENTERPRISE-GRADE: Register opaque button ID for variant with snapshot
                from utils.button_registry import register_button
                
                variant_card_colors = [variant_color] if variant_color else []
                variant_card_sizes = variant_sizes_parsed
                variant_stock = variant.get('stock', 0) or 0
                
                variant_btn_id = register_button(
                    product_id=str(product_id),
                    variant_id=str(variant.get('id', variant_counter)),
                    size=None,  # User will select if multiple sizes
                    color=variant_color,  # Pre-selected for variant
                    product_name=variant_name,
                    available_sizes=variant_card_sizes,
                    available_colors=variant_card_colors,
                    stock=variant_stock
                )
                
                product_cards.append({
                    'index': f"{global_index}.{variant_counter}",  # e.g., "1.1", "1.2" for variants
                    'name': variant_name,
                    'price': variant_price_range_str if variant_price_range_str else variant_price,
                    'compare_at_price': variant_compare_at_price if variant_has_offer else None,
                    'discount_percent': variant_discount_percent,
                    'product_id': variant_product_id,
                    'card_index': card_index_counter,  # Keep for backwards compatibility
                    'btn_id': variant_btn_id,  # ENTERPRISE-GRADE: Opaque button ID
                    'image_url': variant_image_url,
                    'colors': variant_card_colors,
                    'sizes': variant_sizes_parsed,  # FIXED: Use properly parsed sizes
                    'has_size_pricing': variant_has_size_pricing,
                    'size_prices': variant_size_prices,
                    'price_range': variant_price_range_str,
                    'is_variant': True,  # Mark as variant
                    'base_product_id': product_id,  # Reference to base product
                })
                
                # Store mappings: card_index → variant product_id, colors, sizes (KEEP for backwards compatibility)
                card_index_map[card_index_counter] = variant_product_id
                card_colors_map[card_index_counter] = variant_card_colors
                card_sizes_map[card_index_counter] = variant_card_sizes
                
                logger.info(f"   📏 Variant card created: btn_id={variant_btn_id}, color={variant_color}, sizes={variant_card_sizes}")
                card_index_counter += 1
            
            # Build text entry with comprehensive price formatting
            lines = []
            
            # Format price display based on available pricing info
            if has_size_pricing and price_range_str:
                # Has size-based pricing with a range
                lines.append(f"*{global_index}. {name}*")
                if has_offer and original_price:
                    # Show original price crossed out, then size range
                    lines.append(f"~~₹{int(float(original_price))}~~ → {price_range_str}")
                else:
                    lines.append(f"Price: {price_range_str}")
            elif has_offer and original_price:
                # Has offer (original > current)
                lines.append(f"*{global_index}. {name}*")
                lines.append(f"~~₹{int(float(original_price))}~~ → ₹{int(float(display_price))}")
            else:
                # Regular price
                lines.append(f"*{global_index}. {name}* - ₹{int(float(display_price))}")
            
            # Add colors if available
            colors = p.get('colors', [])
            if colors and isinstance(colors, list):
                color_str = ', '.join(colors[:5])
                lines.append(f"Colors: {color_str}")
            
            # Add sizes if available
            sizes = p.get('sizes', [])
            if sizes and isinstance(sizes, list):
                size_str = ', '.join(sizes[:6])
                lines.append(f"Sizes: {size_str}")
            
            product_lines.append('\n'.join(lines))
            product_map[str(global_index)] = p
            product_map[name.lower()] = p
        
        state.collect_field("awaiting_selection", True)
        state.collect_field("_product_map", product_map)
        state.collect_field("_available_products", [p.get('name') for p in page_products if isinstance(p, dict)])
        
        product_list = "\n".join(product_lines)
        
        # CRITICAL FIX: Recalculate pagination based on ACTUAL products displayed
        # If MAX_PRODUCT_CARDS was hit before all page_products were shown, we need more pages
        actual_products_on_page = products_actually_displayed
        actual_end_idx = start_idx + actual_products_on_page
        
        # Recalculate total pages based on how many products we can actually show per page
        if actual_products_on_page > 0 and actual_products_on_page < len(page_products):
            # We didn't show all products - need to adjust pagination
            effective_page_size = actual_products_on_page  # How many we actually fit
            recalculated_total_pages = (total_products + effective_page_size - 1) // effective_page_size
            if recalculated_total_pages > total_pages:
                total_pages = recalculated_total_pages
                # Update pagination state with correct values
                state.collect_field("_pagination_total_pages", total_pages)
                state.collect_field("_pagination_products_per_page", effective_page_size)
                logger.info(f"📄 PAGINATION RECALC: adjusted to {total_pages} pages (showing {actual_products_on_page} of {len(page_products)} products)")
        
        # Build pagination footer with accurate counts
        shown_end = min(actual_end_idx, total_products) if actual_products_on_page > 0 else end_idx
        pagination_info = f"\n\n📄 Page {page + 1} of {total_pages} ({start_idx + 1}-{shown_end} of {total_products} products)"
        
        response_text = (
            f"📦 I'd be happy to help you place an order!\n\n"
            f"Here's what we have:\n{product_list}{pagination_info}\n\n"
            f"Reply with a number or product name.\n"
        )
        
        # Build suggested actions with pagination
        suggested_actions = ["1", "2"]
        if page < total_pages - 1:
            suggested_actions.append("Next ▶")
        if page > 0:
            suggested_actions.insert(0, "◀ Previous")
        suggested_actions.append("Cancel")
        
        # Log product cards with pricing info for debugging
        base_product_count = len([c for c in product_cards if not c.get('is_variant', False)])
        variant_count = len([c for c in product_cards if c.get('is_variant', False)])
        logger.info(f"📄 Pagination: Page {page + 1}/{total_pages}, showing {len(page_products)} base products with {variant_count} variants (total {len(product_cards)} cards)")
        for card in product_cards:
            card_type = "VARIANT" if card.get('is_variant') else "BASE"
            img_status = "✅ HAS IMAGE" if card.get('image_url') else "❌ NO IMAGE"
            price_info = card.get('price_range') or f"₹{card.get('price', 0)}"
            if card.get('compare_at_price'):
                price_info = f"Offer: {price_info} (was ₹{card.get('compare_at_price')})"
            logger.info(f"🖼️ [{card_type}] Product: {card.get('name')} - {img_status} - Price: {price_info}")
        
        # Return with product_cards for image rendering
        # CRITICAL: Store all card maps for enterprise-grade selection
        state.collect_field("_card_index_map", card_index_map)
        state.collect_field("_card_colors_map", card_colors_map)  # Enterprise fix: per-card colors
        state.collect_field("_card_sizes_map", card_sizes_map)  # Enterprise fix: per-card sizes
        logger.info(f"🗺️ Stored card_index_map with {len(card_index_map)} entries")
        logger.info(f"🎨 Stored card_colors_map with {len(card_colors_map)} entries")
        logger.info(f"📏 Stored card_sizes_map with {len(card_sizes_map)} entries")
        
        return response_text, suggested_actions, {'product_cards': product_cards}
    
    def _handle_order_flow(
        self,
        user_id: str,
        message: str,
        business_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Handle an active order booking flow.
        
        Enhanced flow handling:
        - Category selection (when multiple categories)
        - Product selection (with product_id tracking)
        - Size selection (when product has sizes)
        - Color selection (when product has colors)
        - Quantity collection
        - Customer details
        - Confirmation
        """
        logger.info(f"📦 _handle_order_flow called for user: {user_id}, message: '{message}'")
        
        state = self.conversation_manager.get_state(user_id)
        if not state:
            logger.warning(f"📦 No state found for user: {user_id}")
            return None
        
        msg_lower = message.lower().strip()
        
        # Check for payment confirmation
        if state.flow_status == FlowStatus.AWAITING_PAYMENT:
            # Check if user wants a new payment link
            msg_lower = message.lower().strip()
            if any(x in msg_lower for x in ["new link", "new payment", "regenerate", "new"]):
                logger.info(f"📦 User requested new payment link while awaiting payment for user: {user_id}")
                # Clear existing link to force regeneration
                state.collect_field("payment_link_id", None)
                state.collect_field("payment_link_url", None)
                # Regenerate payment link
                return self._complete_order(user_id, state, business_data)
            
            return self._handle_payment_verification(user_id, state, message, business_data)

        # Check for confirmation response
        if state.flow_status == FlowStatus.AWAITING_CONFIRMATION:
            if msg_lower in ["yes", "confirm", "ok", "okay", "sure", "y", "haan", "ha", "ji"]:
                # User confirmed - complete the order
                return self._complete_order(user_id, state, business_data)
            elif msg_lower in ["edit", "edit details", "edit_details"]:
                # User wants to edit details - show editable fields menu
                return self._show_edit_details_menu(user_id, state, message)
            elif msg_lower in ["no", "cancel", "cancel order", "nahi", "nako", "na", "n"]:
                # User cancelled
                self.conversation_manager.cancel_flow(user_id)
                self.conversation_manager.add_message(user_id, "user", message)
                cancel_msg = "No problem! I've cancelled the order. Is there anything else I can help you with? 😊"
                self.conversation_manager.add_message(user_id, "assistant", cancel_msg)
                return {
                    "reply": cancel_msg,
                    "intent": "order_cancelled",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": ["Browse products", "Place order", "Contact"],
                    "metadata": {"generation_method": "order_flow_cancelled"}
                }
            else:
                # Check if user selected a field to edit directly from the list
                # WhatsApp sends: "Field Label\nCurrent Value" (title + description on separate lines)
                # FIX: Extract only the label (first line) for matching, ignore the value part
                order_fields = state.flow_config.get("order_fields", [])
                
                # Get first line of message (the field label from list)
                # Split by newline and take only the first line to get the label
                message_lines = message.split('\n')
                first_line = message_lines[0].strip()
                first_line_lower = first_line.lower()
                
                for field in order_fields:
                    field_id = field.get("id")
                    label = field.get("label", field_id.title())
                    label_lower = label.lower()
                    
                    # Match patterns:
                    # 1. First line exactly matches label: "Delivery Address"
                    # 2. First line contains "edit" + label: "Edit Delivery Address"
                    # 3. Message contains "edit_address" (button ID format)
                    
                    if (first_line_lower == label_lower or
                        f"edit {label_lower}" in first_line_lower or
                        f"edit_{field_id}" in msg_lower or
                        (label_lower in first_line_lower and len(first_line_lower) <= len(label_lower) + 10)):
                        
                        # Start editing this field directly
                        current_value = state.collected_fields.get(field_id, "Not provided")
                        
                        # Set editing mode
                        state.collect_field("_editing_field", field_id)
                        state.collect_field("_editing_field_label", label)
                        
                        self.conversation_manager.persist_state(user_id)
                        
                        # FIX: Store only the label part for logging, not the full message with value
                        # This prevents the label from being included when user sends new value
                        self.conversation_manager.add_message(user_id, "user", first_line)
                        
                        response_text = (
                            f"✏️ *Edit {label}*\n\n"
                            f"Current value: *{current_value}*\n\n"
                            f"Please enter the new value:"
                        )
                        
                        self.conversation_manager.add_message(user_id, "assistant", response_text)
                        
                        return {
                            "reply": response_text,
                            "intent": "order_field_editing",
                            "confidence": 1.0,
                            "needs_human": False,
                            "suggested_actions": ["Cancel"],
                            "metadata": {
                                "generation_method": "order_edit_flow",
                                "editing_field": field_id
                            }
                        }
        
        # Handle field editing (when user is in edit mode)
        if state.collected_fields.get("_editing_field"):
            return self._handle_field_edit(user_id, state, message, business_data)
        
        # Handle field selection from edit menu
        if state.collected_fields.get("_awaiting_field_selection"):
            return self._handle_field_selection(user_id, state, message)
        
        
        
        # =====================================================
        # PRIORITY: Handle "Order This" button clicks FIRST
        # Pattern: "order {product_id}" from WhatsApp button
        # This takes precedence over category selection
        # =====================================================
        if msg_lower.startswith("order "):
            products = business_data.get("products_services", [])
            # Search term comes from button ID: sanitized (underscores) or spaces
            raw_term = msg_lower.replace("order ", "").strip()
            
            # ENTERPRISE FIX: Track selected card info
            selected_card_index = None
            selected_card_colors = None  # Colors specific to this card
            selected_card_sizes = None   # Sizes specific to this card
            selected_variant_id = None   # Variant ID from opaque button
            
            # ========================================================
            # AMAZON-GRADE: Check for opaque button ID format FIRST
            # Format: "btn_xxxxxxxx" - resolves via button_registry
            # This is resilient to pagination, retries, and state changes
            # ========================================================
            from utils.validators import is_opaque_button_id
            from utils.button_registry import resolve_button
            
            if is_opaque_button_id(raw_term):
                logger.info(f"🔐 Opaque button detected: {raw_term}")
                
                snapshot = resolve_button(raw_term)
                
                if not snapshot:
                    # Button expired or not found - show friendly message
                    logger.warning(f"⚠️ Button not found or expired: {raw_term}")
                    self.conversation_manager.add_message(user_id, "user", message)
                    expired_msg = "This product selection has expired. Please browse products again to see current availability. 🔄"
                    self.conversation_manager.add_message(user_id, "assistant", expired_msg)
                    return {
                        "reply": expired_msg,
                        "intent": "product_expired",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": ["Browse Products", "View Categories"],
                        "metadata": {"generation_method": "opaque_button_expired"}
                    }
                
                # Successfully resolved opaque button
                product_id_from_snapshot = snapshot.get('product_id')
                selected_variant_id = snapshot.get('variant_id')
                selected_card_colors = snapshot.get('colors', [])
                selected_card_sizes = snapshot.get('sizes', [])
                product_name = snapshot.get('product_name', '')
                
                logger.info(f"✅ Resolved opaque button: product_id={product_id_from_snapshot}, variant_id={selected_variant_id}")
                logger.info(f"   Snapshot colors: {selected_card_colors}, sizes: {selected_card_sizes}")
                
                # ================================================================
                # AMAZON-GRADE: Store CANONICAL resolved_sku IMMEDIATELY
                # This is IMMUTABLE once set - all downstream logic MUST use this
                # ================================================================
                resolved_sku = {
                    "product_id": product_id_from_snapshot,
                    "variant_id": selected_variant_id,
                    "scope": snapshot.get('scope') or ("VARIANT" if selected_variant_id else "BASE"),
                }
                state.collect_field("_resolved_sku", resolved_sku)
                logger.info(f"🔐 Stored CANONICAL resolved_sku: {resolved_sku}")
                
                # Override raw_term to use the product ID for matching
                raw_term = str(product_id_from_snapshot).lower()
                
                # Store snapshot info in state for selection flow
                state.collect_field("_selected_card_colors", selected_card_colors)
                state.collect_field("_selected_card_sizes", selected_card_sizes)
                if selected_variant_id:
                    state.collect_field("_selected_variant_id", selected_variant_id)
            
            # ========================================================
            # LEGACY: Check for card_index format (backwards compatible)
            # Format: "card_0", "card_1", etc.
            # ========================================================
            elif raw_term.startswith("card_"):
                try:
                    # Extract card index from "card_0", "card_1", etc.
                    card_index = int(raw_term.replace("card_", ""))
                    selected_card_index = card_index  # Store for later use
                    
                    card_index_map = state.collected_fields.get("_card_index_map", {})
                    card_colors_map = state.collected_fields.get("_card_colors_map", {})
                    card_sizes_map = state.collected_fields.get("_card_sizes_map", {})
                    
                    logger.info(f"🗺️ [LEGACY] Card-based button detected: {raw_term}, card_index={card_index}")
                    logger.info(f"🗺️ Card index map has {len(card_index_map)} entries")
                    
                    # Look up the full product_id using the card_index
                    # Convert string keys to int if needed
                    card_index_map_int = {int(k) if isinstance(k, str) else k: v for k, v in card_index_map.items()}
                    card_colors_map_int = {int(k) if isinstance(k, str) else k: v for k, v in card_colors_map.items()}
                    card_sizes_map_int = {int(k) if isinstance(k, str) else k: v for k, v in card_sizes_map.items()}
                    
                    if card_index in card_index_map_int:
                        full_product_id = card_index_map_int[card_index]
                        logger.info(f"✅ Mapped card_index {card_index} → product_id: {full_product_id}")
                        
                        # Get card-specific colors and sizes
                        selected_card_colors = card_colors_map_int.get(card_index, [])
                        selected_card_sizes = card_sizes_map_int.get(card_index, [])
                        logger.info(f"🎨 Card {card_index} colors: {selected_card_colors}")
                        logger.info(f"📏 Card {card_index} sizes: {selected_card_sizes}")
                        
                        # Override raw_term to use the full product ID
                        raw_term = full_product_id.lower()
                        logger.info(f"🔄 Using mapped product_id for matching: raw='{raw_term}'")
                    else:
                        logger.warning(f"⚠️ Card index {card_index} not found in map! Available: {list(card_index_map_int.keys())}")
                except (ValueError, TypeError) as e:
                    logger.error(f"❌ Failed to parse card index from '{raw_term}': {e}")
            
            # Store selected card info in state for color/size selection steps
            if selected_card_index is not None:
                state.collect_field("_selected_card_index", selected_card_index)
            if selected_card_colors is not None:
                state.collect_field("_selected_card_colors", selected_card_colors)
            if selected_card_sizes is not None:
                state.collect_field("_selected_card_sizes", selected_card_sizes)
            
            # Create a "clean" search term for robust matching (no spaces, dashes, underscores)
            clean_search_term = re.sub(r'[\s\-_]', '', raw_term)
            
            # Keep original search term variants for flexible matching
            search_term_spaces = raw_term.replace("_", " ").replace("-", " ")
            
            logger.info(f"📦 'Order This' button detected. Raw: '{raw_term}', Clean: '{clean_search_term}'")
            
            mentioned_product = None
            mentioned_variant = None
            best_match_score = 0
            
            # First, check if this is a variant product ID (contains "_variant_" OR matches a variant ID directly)
            is_variant_id = "_variant_" in raw_term or "_variant_" in clean_search_term
            logger.info(f"🔍 Variant detection: is_variant_id={is_variant_id}, raw_term='{raw_term}', clean_search_term='{clean_search_term}'")

            # ========== SEV-1 FIX: DIRECT VARIANT LOOKUP FROM AUTHORITATIVE resolved_sku ==========
            # When we have resolved_sku with scope='VARIANT', use the variant_id DIRECTLY
            # This bypasses the buggy string-matching that was incorrectly matching base products
            resolved_sku = state.collected_fields.get("_resolved_sku", {})
            auth_scope = resolved_sku.get("scope")
            auth_variant_id = resolved_sku.get("variant_id")
            auth_product_id = resolved_sku.get("product_id")
            
            if auth_scope == "VARIANT" and auth_variant_id and auth_product_id:
                logger.info(f"🔐 AUTHORITATIVE variant lookup: product_id={auth_product_id}, variant_id={auth_variant_id}")
                # Find product by authoritative product_id
                for product in products:
                    if isinstance(product, dict) and str(product.get("id", "")).lower() == auth_product_id.lower():
                        mentioned_product = product
                        # Find variant by authoritative variant_id
                        variants = product.get("variants", []) or []
                        for variant in variants:
                            if isinstance(variant, dict) and str(variant.get("id", "")).lower() == auth_variant_id.lower():
                                mentioned_variant = variant
                                logger.info(f"📦 ✅ AUTHORITATIVE variant match: {product.get('name')} - variant_id={auth_variant_id}, color={variant.get('color')}")
                                break
                        break
                
                if mentioned_variant:
                    logger.info(f"🔐 Using AUTHORITATIVE variant (SEV-1 FIX) - bypassed string matching")
                else:
                    logger.warning(f"⚠️ AUTHORITATIVE variant lookup failed! product_id={auth_product_id}, variant_id={auth_variant_id}")
            # ========== END SEV-1 FIX ==========
            
            # Fallback to string matching only if authoritative lookup didn't find anything
            if not mentioned_product:
                for product in products:
                    if isinstance(product, dict):
                        name = product.get("name", "").lower()
                        product_id = str(product.get("id", "")).lower()
                        sku = str(product.get("sku", "")).lower()
                        
                        # Create clean versions of product fields
                        clean_name = re.sub(r'[\s\-_]', '', name)
                        clean_id = re.sub(r'[\s\-_]', '', product_id)
                        clean_sku = re.sub(r'[\s\-_]', '', sku)
                        
                        # CRITICAL: Always check variants FIRST (button IDs are truncated, so _variant_ might be missing)
                        # Check variants for ALL products, not just when is_variant_id=True
                        variants = product.get('variants', []) or []
                        if variants:
                            logger.info(f"🔍 Checking variants for product: {name}, search_term: {clean_search_term}")
                            for variant in variants:
                                if not isinstance(variant, dict):
                                    continue
                                
                                variant_id = str(variant.get('id', '')).lower()
                                variant_product_id = f"{product_id}_variant_{variant_id}".lower()
                                clean_variant_id = re.sub(r'[\s\-_]', '', variant_product_id)
                                
                                # Also check variant ID directly (for truncated button IDs)
                                clean_variant_id_only = re.sub(r'[\s\-_]', '', variant_id)
                                
                                logger.info(f"   Comparing: clean_variant_id={clean_variant_id[:30]}..., clean_variant_id_only={clean_variant_id_only}, vs clean_search_term={clean_search_term}")
                                
                                # Match variant ID - handle truncated button IDs (WhatsApp buttons are limited to 20 chars)
                                # Check multiple matching strategies:
                                # 1. Exact match with full variant_product_id
                                # 2. clean_variant_id starts with clean_search_term (search_term is prefix) - BUT NOT if search_term is exactly the base product ID
                                # 3. clean_search_term starts with first 20 chars of clean_variant_id (truncated button ID)
                                # 4. Both start with same prefix (for very long IDs)
                                # 5. NEW: Match variant ID directly (for truncated IDs that lost _variant_ part)
                                
                                # CRITICAL FIX: Don't match variant if search_term is exactly the base product ID
                                # (variant IDs are "base_id_variant_variant_id", so they start with base_id)
                                is_base_product_id = (clean_search_term == clean_id)
                                
                                # CRITICAL FIX: Apply is_base_product_id check to ALL prefix-based matching conditions
                                # If search_term is exactly the base product ID, we should NOT match any variant
                                matches = (
                                    clean_variant_id == clean_search_term or 
                                    # Only match prefix if search_term is NOT the base product ID
                                    (not is_base_product_id and clean_variant_id.startswith(clean_search_term)) or
                                    (not is_base_product_id and len(clean_search_term) >= 15 and clean_variant_id.startswith(clean_search_term[:20])) or
                                    (not is_base_product_id and len(clean_variant_id) >= 20 and clean_search_term.startswith(clean_variant_id[:20])) or
                                    # NEW: Match variant ID directly (button ID might be just the variant ID)
                                    clean_variant_id_only == clean_search_term or
                                    (not is_base_product_id and clean_variant_id_only.startswith(clean_search_term)) or
                                    (not is_base_product_id and clean_search_term.startswith(clean_variant_id_only[:20]))
                                )
                                
                                if matches:
                                    mentioned_product = product
                                    mentioned_variant = variant
                                    variant_color = variant.get("color", "")
                                    logger.info(f"📦 ✅ Variant match found: {name} - Variant ID: {variant_id}, Color: {variant_color}")
                                    logger.info(f"   Match type: variant_id_match={clean_variant_id_only == clean_search_term or clean_variant_id_only.startswith(clean_search_term)}")
                                    break
                            
                            if mentioned_variant:
                                break
                        
                        # Only check base product if no variant was matched
                        if not mentioned_variant:
                            # CRITICAL: Don't match base product if search_term could be a truncated variant ID
                            # If search_term starts with base product ID prefix, it might be a variant (skip base match)
                            skip_base_match = False
                            if clean_id and len(clean_search_term) >= 10:
                                # Check if search_term starts with base product ID (could be truncated variant)
                                if clean_search_term.startswith(clean_id[:15]) and clean_search_term != clean_id:
                                    # Search term starts with base ID but isn't exact match - likely truncated variant
                                    logger.info(f"   ⚠️ Search term '{clean_search_term}' starts with base product ID '{clean_id[:15]}...' - likely truncated variant, skipping base match")
                                    skip_base_match = True
                            
                            if not skip_base_match:
                                # 1. Exact Name/ID/SKU match (Highest Priority)
                                if clean_name == clean_search_term or clean_id == clean_search_term or clean_sku == clean_search_term:
                                    mentioned_product = product
                                    logger.info(f"📦 Exact match found: {name}")
                                    break
                                    
                                # 2. Prefix match (for truncated IDs in buttons)
                                # If the button ID was truncated, clean_search_term will be a prefix of clean_id/name
                                if len(clean_search_term) >= 5:  # Only for reasonable length terms
                                    if clean_name.startswith(clean_search_term) or clean_id.startswith(clean_search_term) or clean_sku.startswith(clean_search_term):
                                        mentioned_product = product
                                        logger.info(f"📦 Prefix match found: {name}")
                                        break
                                        
                                # 3. Flexible substring match (original logic fallback)
                                if name and (name in search_term_spaces or search_term_spaces in name):
                                    mentioned_product = product
                                    logger.info(f"📦 Substring match found (name): {name}")
                                    break
                                
                                # 4. ID match with flexible separators
                                if product_id and product_id != "none":
                                    # Compare normalizing separators
                                    norm_id = product_id.replace("-", " ").replace("_", " ")
                                    if norm_id == search_term_spaces or norm_id in search_term_spaces or search_term_spaces in norm_id:
                                        mentioned_product = product
                                        logger.info(f"📦 ID match found: {product_id}")
                                        break
            
            if mentioned_product:
                # Clear any category selection state - we're directly ordering a product
                for key in ["awaiting_category", "_available_categories", "awaiting_selection", "_product_map", "_available_products"]:
                    if key in state.collected_fields:
                        del state.collected_fields[key]
                
                # If a variant was selected, use variant details; otherwise use base product
                if mentioned_variant:
                    # Use base product name (color/size shown separately in card body)
                    product_name = mentioned_product.get("name", "item")
                    product_id = f"{mentioned_product.get('id')}_variant_{mentioned_variant.get('id')}"
                    
                    # Use variant pricing
                    base_price = mentioned_variant.get("price")
                    if base_price is None:
                        base_price = mentioned_product.get("price", 0)
                    else:
                        base_price = float(base_price)
                    
                    original_price = mentioned_variant.get("compare_at_price")
                    has_size_pricing = mentioned_variant.get("has_size_pricing", False)
                    size_prices = mentioned_variant.get("size_prices", {}) or {}
                    
                    # CRITICAL: Extract and set variant's color immediately
                    variant_color = mentioned_variant.get("color", "")
                    variant_id = mentioned_variant.get("id", "")
                    if variant_color:
                        # Auto-select the variant's color
                        state.collect_field("selected_color", variant_color)
                        logger.info(f"🎨 ✅ Variant selected - stored color: {variant_color} (variant_id: {variant_id})")
                    else:
                        logger.warning(f"🎨 ⚠️ Variant selected but has no color! variant_id: {variant_id}")
                    
                    # Store variant info
                    state.collect_field("selected_variant", mentioned_variant)
                    state.collect_field("selected_variant_id", mentioned_variant.get('id'))
                    
                    # Store variant price early (will be used if variant goes straight to quantity)
                    variant_price_early = mentioned_variant.get("price")
                    logger.info(f"💰 DEBUG: Variant price check - variant_id={mentioned_variant.get('id')}, price={variant_price_early}, type={type(variant_price_early)}")
                    
                    # Only treat as "no price" if it's explicitly None, not if it's 0 (0 is a valid price)
                    if variant_price_early is None:
                        variant_size_prices_early = mentioned_variant.get("size_prices", {}) or {}
                        logger.info(f"💰 DEBUG: Variant has no direct price, checking size_prices: {variant_size_prices_early}")
                        if variant_size_prices_early and len(variant_size_prices_early) == 1:
                            single_size_early = list(variant_size_prices_early.keys())[0]
                            variant_price_early = variant_size_prices_early[single_size_early]
                            logger.info(f"💰 DEBUG: Using single size price: {single_size_early} = ₹{variant_price_early}")
                        else:
                            # Variant should have price - log warning but don't fallback to base
                            logger.warning(f"💰 ⚠️ Variant has no price field! variant_id={mentioned_variant.get('id')}, variant={mentioned_variant}")
                            # Still try to use variant's price field (might be 0 or missing)
                            variant_price_early = mentioned_variant.get("price", 0)
                    
                    # Always store the price (even if 0) - convert to float
                    try:
                        variant_price_early = float(variant_price_early) if variant_price_early is not None else 0.0
                        state.collect_field("selected_variant_price", variant_price_early)
                        logger.info(f"💰 ✅ Stored variant price early: ₹{variant_price_early} (variant_id={mentioned_variant.get('id')})")
                    except (ValueError, TypeError) as e:
                        logger.error(f"💰 ❌ Failed to convert variant price to float: {variant_price_early}, error: {e}")
                        # Store 0 as fallback
                        state.collect_field("selected_variant_price", 0.0)
                else:
                    product_name = mentioned_product.get("name", "item")
                    product_id = mentioned_product.get("id") or mentioned_product.get("sku") or product_name
                    
                    # Get pricing info with size-based pricing support
                    base_price = mentioned_product.get("price", 0)
                    original_price = mentioned_product.get("compare_at_price")
                    has_size_pricing = mentioned_product.get("has_size_pricing", False)
                    size_prices = mentioned_product.get("size_prices", {}) or {}
                
                # Calculate price display
                price_str = ""
                if has_size_pricing and size_prices:
                    try:
                        price_values = [float(v) for v in size_prices.values() if v is not None]
                        if price_values:
                            min_price = min(price_values)
                            max_price = max(price_values)
                            if min_price != max_price:
                                if original_price and float(original_price) > min_price:
                                    price_str = f" (~~₹{int(float(original_price))}~~ ₹{int(min_price)}-₹{int(max_price)})"
                                else:
                                    price_str = f" (₹{int(min_price)}-₹{int(max_price)})"
                            else:
                                if original_price and float(original_price) > min_price:
                                    price_str = f" (~~₹{int(float(original_price))}~~ ₹{int(min_price)})"
                                else:
                                    price_str = f" (₹{int(min_price)})"
                    except (ValueError, TypeError):
                        if original_price and float(original_price) > float(base_price):
                            price_str = f" (~~₹{int(float(original_price))}~~ ₹{int(float(base_price))})"
                        elif base_price:
                            price_str = f" (₹{int(float(base_price))})"
                elif original_price and float(original_price) > float(base_price):
                    price_str = f" (~~₹{int(float(original_price))}~~ ₹{int(float(base_price))})"
                elif base_price:
                    price_str = f" (₹{int(float(base_price))})"
                
                # Store product info (including size pricing data)
                state.collect_field("pending_item", product_name)
                state.collect_field("pending_product_id", product_id)
                state.collect_field("pending_product_data", mentioned_product)
                
                # If variant was selected, check if it needs additional size selection (for variant-level size pricing)
                if mentioned_variant:
                    # CRITICAL: Variant already selected - check if it has size-based pricing that needs selection
                    variant_size = mentioned_variant.get("size", "")
                    variant_color = mentioned_variant.get("color", "")
                    variant_has_size_pricing = mentioned_variant.get("has_size_pricing", False)
                    variant_size_prices = mentioned_variant.get("size_prices", {}) or {}
                    
                    # CRITICAL: Store variant info IMMEDIATELY when variant is selected
                    # Store the full variant object so we can access it later
                    state.collect_field("selected_variant", mentioned_variant)
                    state.collect_field("selected_variant_id", mentioned_variant.get('id'))
                    
                    # CRITICAL: Store variant color IMMEDIATELY when variant is selected
                    # This ensures the color is available even if size selection happens later
                    if variant_color:
                        state.collect_field("selected_color", variant_color)
                        logger.info(f"🎨 ✅ Variant selected - stored color: {variant_color} (variant_id: {mentioned_variant.get('id')})")
                    else:
                        logger.warning(f"🎨 ⚠️ Variant selected but has no color! variant_id: {mentioned_variant.get('id')}")
                    
                    # Parse variant size if it's a comma-separated string (e.g., "Free Size, XXL")
                    available_sizes = []
                    if variant_size:
                        if isinstance(variant_size, str) and ',' in variant_size:
                            # Split comma-separated sizes
                            available_sizes = [s.strip() for s in variant_size.split(',') if s.strip()]
                        elif isinstance(variant_size, str):
                            available_sizes = [variant_size.strip()]
                        elif isinstance(variant_size, list):
                            available_sizes = variant_size
                    
                    logger.info(f"📦 Variant selected: {product_name}, color={variant_color}, sizes={available_sizes}, has_size_pricing={variant_has_size_pricing}")
                    
                    # If variant has size_prices with multiple sizes, ask for size selection
                    # CRITICAL FIX: Use DATA-DRIVEN check (size_prices has data) not FLAG-DRIVEN (has_size_pricing)
                    # This ensures pricing works even if has_size_pricing flag is incorrectly False
                    if variant_size_prices and len(variant_size_prices) > 1:
                        # Use variant's size_prices for selection
                        available_sizes_from_pricing = list(variant_size_prices.keys())
                        state.collect_field("_needs_size", True)
                        state.collect_field("_available_sizes", available_sizes_from_pricing)
                        state.collect_field("_variant_size_prices", variant_size_prices)
                        
                        size_price_info = []
                        for s in available_sizes_from_pricing[:6]:
                            if s in variant_size_prices:
                                size_price_info.append(f"{s}: ₹{int(float(variant_size_prices[s]))}")
                            else:
                                size_price_info.append(s)
                        size_display = "\n".join(size_price_info)
                        
                        # Show variant color if available
                        color_display = f"\nColor: *{variant_color}*\n" if variant_color else "\n"
                        response_text = f"Great choice! 🎉\n*{product_name}*{color_display}\nAvailable sizes:\n{size_display}\n\nWhich size would you like?"
                        suggested_actions = available_sizes_from_pricing[:4] + ["Cancel"]
                    elif available_sizes and len(available_sizes) > 1:
                        # Variant has multiple sizes but no size pricing - ask for size selection
                        state.collect_field("_needs_size", True)
                        state.collect_field("_available_sizes", available_sizes)
                        
                        size_list = ", ".join(available_sizes[:6])
                        color_display = f"\nColor: *{variant_color}*\n" if variant_color else "\n"
                        response_text = f"Great choice! 🎉\n*{product_name}*{color_display}\nAvailable sizes: {size_list}\n\nWhich size would you like?"
                        suggested_actions = available_sizes[:4] + ["Cancel"]
                    else:
                        # Variant fully specified or only one size - go straight to quantity
                        # CRITICAL: Store variant price for order item building
                        variant_price = mentioned_variant.get("price")
                        logger.info(f"💰 DEBUG: Variant fully specified - variant_id={mentioned_variant.get('id')}, price={variant_price}, type={type(variant_price)}")
                        
                        # If variant has single size in size_prices, use that price
                        if variant_price is None and variant_size_prices and len(variant_size_prices) == 1:
                            single_size = list(variant_size_prices.keys())[0]
                            variant_price = variant_size_prices[single_size]
                            # Auto-select the single size
                            state.collect_field("selected_size", single_size)
                            logger.info(f"💰 Using variant single size pricing: {single_size} = ₹{variant_price}")
                        elif variant_price is None:
                            # Variant should have price - log warning
                            logger.warning(f"💰 ⚠️ Variant has no price field! variant_id={mentioned_variant.get('id')}, variant={mentioned_variant}")
                            # Still try to use variant's price field (might be 0)
                            variant_price = mentioned_variant.get("price", 0)
                        
                        # Auto-select single size if available
                        if available_sizes and len(available_sizes) == 1:
                            state.collect_field("selected_size", available_sizes[0])
                            logger.info(f"📏 Auto-selected single size: {available_sizes[0]}")
                        
                        # Always store the price (even if 0) - convert to float
                        try:
                            variant_price = float(variant_price) if variant_price is not None else 0.0
                            state.collect_field("selected_variant_price", variant_price)
                            logger.info(f"💰 ✅ Stored variant price for quantity flow: ₹{variant_price} (variant_id={mentioned_variant.get('id')})")
                        except (ValueError, TypeError) as e:
                            logger.error(f"💰 ❌ Failed to convert variant price: {variant_price}, error: {e}")
                            # Store 0 as fallback
                            state.collect_field("selected_variant_price", 0.0)
                        
                        color_display = f"\nColor: *{variant_color}*\n" if variant_color else "\n"
                        size_display = f"Size: *{available_sizes[0]}*\n" if available_sizes and len(available_sizes) == 1 else ""
                        response_text = f"Great choice! 🎉\n*{product_name}*{color_display}{size_display}\nHow many would you like?"
                        suggested_actions = ["1", "2", "3", "Cancel"]
                else:
                    # Base product selected - determine next step based on product attributes
                    # ENTERPRISE FIX: Use stored card-specific sizes and colors FIRST
                    # This ensures we use the exact colors/sizes from the card the user clicked,
                    # NOT colors derived from variants (which was causing the bug)
                    sizes = state.collected_fields.get("_selected_card_sizes") or mentioned_product.get("sizes", [])
                    colors = state.collected_fields.get("_selected_card_colors")
                    
                    # Only fallback to _get_available_colors_for_product if no card colors stored
                    if not colors:
                        colors = self._get_available_colors_for_product(mentioned_product)
                    
                    logger.info(f"🎨 Base product color selection - card_colors={state.collected_fields.get('_selected_card_colors')}, final_colors={colors}")
                    
                    if sizes:
                        # AUTO-SELECT: If only 1 size, skip to quantity prompt
                        if len(sizes) == 1:
                            single_size = sizes[0]
                            state.collect_field("selected_size", single_size)
                            logger.info(f"📏 AUTO-SELECTED single size: {single_size}")
                            
                            # Get price for the single size - CRITICAL: Use data-driven check
                            # and STORE the price in state for order item building
                            size_price = size_prices.get(single_size, base_price) if size_prices else base_price
                            # CRITICAL FIX: Store the size-specific price so order builder uses it
                            state.collect_field("selected_size_price", float(size_price) if size_price else None)
                            logger.info(f"💰 AUTO-SELECTED size price for {single_size}: ₹{size_price}")
                            price_display = f" (₹{int(float(size_price))})" if size_price else ""
                            
                            # Check if we also need color selection
                            if colors and len(colors) > 1:
                                state.collect_field("_needs_color", True)
                                state.collect_field("_available_colors", colors)
                                color_list = ", ".join(colors[:6])
                                response_text = f"Great choice! 🎉\n*{product_name}*\n\nSize: *{single_size}*{price_display}\n\nAvailable colors: {color_list}\n\nWhich color would you like?"
                                suggested_actions = colors[:4] + ["Cancel"]
                            elif colors and len(colors) == 1:
                                # Auto-select single color too
                                state.collect_field("selected_color", colors[0])
                                logger.info(f"🎨 AUTO-SELECTED single color: {colors[0]}")
                                response_text = f"Great choice! 🎉\n*{product_name}*\n\nSize: *{single_size}*{price_display}\nColor: *{colors[0]}*\n\nHow many would you like to order?"
                                suggested_actions = ["1", "2", "3", "Cancel"]
                            else:
                                response_text = f"Great choice! 🎉\n*{product_name}*\n\nSize: *{single_size}*{price_display}\n\nHow many would you like to order?"
                                suggested_actions = ["1", "2", "3", "Cancel"]
                        else:
                            # Multiple sizes - ask user to select
                            state.collect_field("_needs_size", True)
                            state.collect_field("_available_sizes", sizes)
                            size_list = ", ".join(sizes[:6])
                            # Show size-specific prices if available
                            if has_size_pricing and size_prices:
                                size_price_info = []
                                for s in sizes[:6]:
                                    if s in size_prices:
                                        size_price_info.append(f"{s}: ₹{int(float(size_prices[s]))}")
                                    else:
                                        size_price_info.append(s)
                                size_display = ", ".join(size_price_info)
                                response_text = f"Great choice! 🎉\n*{product_name}*\n\nAvailable sizes:\n{size_display}\n\nWhich size would you like?"
                            else:
                                response_text = f"Great choice! 🎉\n*{product_name}*\n\nAvailable sizes: {size_list}\n\nWhich size would you like?"
                            suggested_actions = sizes[:4] + ["Cancel"]
                    elif colors:
                        # If only one color, automatically select it
                        if len(colors) == 1:
                            # Auto-select the single color
                            state.collect_field("selected_color", colors[0])
                            response_text = f"Great choice! 🎉\n*{product_name}*\n\nColor: *{colors[0]}*\n\nHow many would you like to order?"
                            suggested_actions = ["1", "2", "3", "Cancel"]
                        else:
                            # Multiple colors - ask user to select
                            state.collect_field("_needs_color", True)
                            state.collect_field("_available_colors", colors)
                            color_list = ", ".join(colors[:6])
                            response_text = f"Great choice! 🎉\n*{product_name}*\n\nAvailable colors: {color_list}\n\nWhich color would you like?"
                            suggested_actions = colors[:4] + ["Cancel"]
                    else:
                        response_text = f"Great choice! 🎉\n*{product_name}*\n\nHow many would you like?"
                        suggested_actions = ["1", "2", "3", "Cancel"]
                
                # Persist state after product selection
                self.conversation_manager.persist_state(user_id)
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                
                return {
                    "reply": response_text,
                    "intent": "order_product_selected_direct",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": suggested_actions,
                    "metadata": {"generation_method": "order_flow_button", "product": product_name}
                }
            else:
                logger.warning(f"📦 'Order This' button product not found: '{raw_term}' in {len(products)} products")
        
        # =====================================================
        # STEP 0: Handle category selection
        # =====================================================
        if state.collected_fields.get("awaiting_category"):
            # Check for "Visit Website" button click - send URL button that opens website
            if msg_lower in ["visit website", "visit_website"]:
                store_link = state.collected_fields.get("store_link")
                if not store_link:
                    # Fallback: generate from business_id
                    business_id = business_data.get("business_id")
                    if business_id and business_id != "default" and len(business_id) > 10:
                        store_link = f"https://flowauxi.com/store/{business_id}"
                
                if store_link:
                    self.conversation_manager.add_message(user_id, "user", message)
                    response_text = "Start Shopping ❤️"
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    return {
                        "reply": response_text,
                        "intent": "visit_website",
                        "confidence": 1.0,
                        "needs_human": False,
                        "metadata": {
                            "use_url_button": True,
                            "url_button_text": "Visit Website",
                            "url_button_url": store_link,
                            "url_button_body": "Start Shopping ❤️",
                            "url_button_header": "",
                            "url_button_footer": ""
                        }
                    }
            
            # Check for "View Categories" button click - show categories list
            if msg_lower in ["view categories", "view_categories"]:
                categories = state.collected_fields.get("_available_categories", [])
                products = business_data.get("products_services", [])
                
                list_sections = [{
                    "title": "Categories",
                    "rows": [
                        {"id": f"cat_{i}_{cat.replace(' ', '_').lower()[:20]}", "title": cat[:24]}
                        for i, cat in enumerate(categories[:10])  # WhatsApp max 10 items
                    ]
                }]
                
                self.conversation_manager.add_message(user_id, "user", message)
                response_text = "Tap the button to view categories."
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "view_categories",
                    "confidence": 1.0,
                    "needs_human": False,
                    "metadata": {
                        "use_list": True,
                        "list_button": "View Categories",
                        "list_body_text": "Tap the button to view categories.",
                        "list_header_text": "",
                        "list_sections": list_sections
                    }
                }
            
            categories = state.collected_fields.get("_available_categories", [])
            products = business_data.get("products_services", [])
            matched_category = None
            
            # Check for "More ▼" button press - show ALL remaining categories
            if msg_lower in ["more ▼", "more", "more categories"]:
                extra_categories = state.collected_fields.get("_extra_categories", [])
                if extra_categories:
                    # Show ALL remaining categories as buttons (max 3 per message)
                    # For more than 3, we'll list them all in text and use buttons for top 3
                    if len(extra_categories) <= 3:
                        suggested_actions = extra_categories
                        category_list = "\n".join([f"• {cat}" for cat in extra_categories])
                        response_text = f"*All Categories:*\n{category_list}\n\nTap a button or type a category name."
                    else:
                        # Show all as text list, top 3 as buttons
                        suggested_actions = extra_categories[:3]
                        all_cats_list = "\n".join([f"• {cat}" for cat in extra_categories])
                        response_text = f"*All Categories:*\n{all_cats_list}\n\nTap a button or type a category name."
                    
                    # Clear extra categories since we're showing all now
                    if "_extra_categories" in state.collected_fields:
                        del state.collected_fields["_extra_categories"]
                    
                    # Persist state after modification
                    self.conversation_manager.persist_state(user_id)
                    
                    self.conversation_manager.add_message(user_id, "user", message)
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    
                    # Format buttons for WhatsApp
                    buttons = []
                    for i, action in enumerate(suggested_actions[:3]):
                        buttons.append({
                            "id": f"mcat_{i}_{action.replace(' ', '_').lower()[:15]}",
                            "title": action[:20]
                        })
                    
                    return {
                        "reply": response_text,
                        "intent": "order_category_more",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": suggested_actions,
                        "metadata": {
                            "generation_method": "order_flow",
                            "use_buttons": True,
                            "buttons": buttons,
                            "header_text": "📁 All Categories",
                            "footer_text": "Tap or type to select",
                        }
                    }
            
            # Check for "show all"
            if msg_lower in ["show all", "all", "all products", "see all"]:
                del state.collected_fields["awaiting_category"]
                del state.collected_fields["_available_categories"]
                self.conversation_manager.persist_state(user_id)  # Persist after state change
                
                response_text, suggested_actions, product_meta = self._format_product_list(products[:10], state)
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "order_category_all",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": suggested_actions,
                    "metadata": {"generation_method": "order_flow", **product_meta}
                }
            
            # Check for number selection
            number_match = re.search(r'^\s*(\d+)\s*$', message)
            if number_match:
                idx = int(number_match.group(1)) - 1
                if 0 <= idx < len(categories):
                    matched_category = categories[idx]
            
            # Check for category name match
            if not matched_category:
                for cat in categories:
                    if cat.lower() in msg_lower or msg_lower in cat.lower():
                        matched_category = cat
                        break
            
            if matched_category:
                del state.collected_fields["awaiting_category"]
                del state.collected_fields["_available_categories"]
                self.conversation_manager.persist_state(user_id)  # Persist after state change
                
                # Filter products by category
                filtered_products = [
                    p for p in products 
                    if isinstance(p, dict) and p.get("category", "").strip().lower() == matched_category.lower()
                ]
                
                response_text, suggested_actions, product_meta = self._format_product_list(filtered_products[:10], state)
                response_text = f"📁 *{matched_category}*\n\n" + response_text.split("\n\n", 1)[1]
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "order_category_selected",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": suggested_actions,
                    "metadata": {"generation_method": "order_flow", "category": matched_category, **product_meta}
                }
            else:
                self.conversation_manager.add_message(user_id, "user", message)
                response_text = "Please select a category by replying with a number or category name, or say 'show all'."
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "order_category_clarification",
                    "confidence": 0.8,
                    "needs_human": False,
                    "suggested_actions": ["1", "Show all"],
                    "metadata": {"generation_method": "order_flow"}
                }
        
        # =====================================================
        # STEP 0.5: Handle size selection
        # =====================================================
        if state.collected_fields.get("_needs_size"):
            sizes = state.collected_fields.get("_available_sizes", [])
            matched_size = None
            
            # Try exact match first (fixes bug where "L" was matching "XL")
            for size in sizes:
                if size.lower() == msg_lower:
                    matched_size = size
                    break
            
            # Fallback: try partial match only if no exact match found
            if not matched_size:
                for size in sizes:
                    # Only allow partial match if user typed most of the size name
                    if msg_lower in size.lower() and len(msg_lower) >= max(1, len(size) - 1):
                        matched_size = size
                        break
            
            if matched_size:
                variant_size_prices = state.collected_fields.get("_variant_size_prices")
                del state.collected_fields["_needs_size"]
                del state.collected_fields["_available_sizes"]
                if "_variant_size_prices" in state.collected_fields:
                    del state.collected_fields["_variant_size_prices"]
                state.collect_field("selected_size", matched_size)
                
                # Get product data and optionally variant for pricing
                product_data = state.collected_fields.get("pending_product_data", {})
                selected_variant = state.collected_fields.get("selected_variant")
                
                # Use variant-level pricing when variant was selected (e.g. variant card tap)
                if selected_variant and variant_size_prices and matched_size in variant_size_prices:
                    has_size_pricing = True
                    size_prices = variant_size_prices
                    base_price = selected_variant.get("price")
                    if base_price is None:
                        base_price = product_data.get("price", 0)
                    else:
                        base_price = float(base_price)
                    original_price = selected_variant.get("compare_at_price")
                    selected_price = float(size_prices[matched_size])
                    logger.info(f"💰 Using variant size price for {matched_size}: ₹{selected_price}")
                else:
                    has_size_pricing = product_data.get("has_size_pricing", False)
                    size_prices = product_data.get("size_prices", {}) or {}
                    base_price = product_data.get("price", 0)
                    original_price = product_data.get("compare_at_price")
                    # CRITICAL FIX: Use DATA-DRIVEN check (size_prices has data for this size)
                    # instead of requiring has_size_pricing flag to be True
                    if size_prices and matched_size in size_prices:
                        selected_price = float(size_prices[matched_size])
                    else:
                        selected_price = float(base_price) if base_price else 0
                
                # Store the selected size price in the state for order completion
                state.collect_field("selected_size_price", selected_price)
                
                # Build price display string
                price_display = ""
                if original_price:
                    try:
                        original_num = float(original_price)
                        if original_num > selected_price:
                            # Has offer - show original crossed out
                            price_display = f" (~~₹{int(original_num)}~~ → ₹{int(selected_price)})"
                        else:
                            price_display = f" (₹{int(selected_price)})"
                    except (ValueError, TypeError):
                        price_display = f" (₹{int(selected_price)})"
                else:
                    price_display = f" (₹{int(selected_price)})"
                
                # Check if color selection needed
                # CRITICAL: If a variant was already selected, use its color; else use variant-derived or base colors
                selected_variant = state.collected_fields.get("selected_variant")
                selected_color_already = state.collected_fields.get("selected_color")  # Check if color was already set
                variant_color = None
                
                # AMAZON-GRADE: Cache stock snapshot for consistent UX
                # CRITICAL FIX: Use authoritative resolved_sku scope, NOT locally derived variant_id
                try:
                    from utils.availability import get_stock_for_selection
                    
                    # SEV-1 FIX: Use resolved_sku for authoritative scope
                    resolved_sku = state.collected_fields.get("_resolved_sku", {})
                    scope = resolved_sku.get("scope", "BASE")
                    variant_id = resolved_sku.get("variant_id") if scope == "VARIANT" else None
                    
                    # CRITICAL: Never use base_only when scope is VARIANT
                    max_qty = get_stock_for_selection(product_data, variant_id=variant_id, size=matched_size, base_only=(scope == "BASE"))
                    state.collect_field("_stock_snapshot", max_qty)
                    qty_text = ""  # Don't show max to user, validation happens server-side
                    
                    logger.info(f"📦 SKU-AWARE stock check: scope={scope}, variant_id={variant_id}, size={matched_size}, stock={max_qty}")
                except (ImportError, Exception) as e:
                    logger.warning(f"⚠️ Stock lookup failed: {e}")
                    qty_text = ""
                    max_qty = 0
                
                logger.info(f"🎨 Size selection - checking for variant color")
                logger.info(f"   selected_variant exists: {selected_variant is not None}")
                logger.info(f"   selected_color_already: {selected_color_already}")
                logger.info(f"   max_qty for size {matched_size}: {max_qty}")
                
                if selected_variant:
                    variant_color = selected_variant.get("color", "")
                    logger.info(f"   variant_color from selected_variant: {variant_color}")
                
                # Priority 1: Use already selected color (from variant selection) - CHECK THIS FIRST
                if selected_color_already:
                    logger.info(f"🎨 ✅ Priority 1: Using already selected color: {selected_color_already}")
                    response_text = f"Size: {matched_size} selected\n\nColor: *{selected_color_already}*\n\nHow many would you like to order?{qty_text}"
                    suggested_actions = ["1", "2", "3", "Cancel"]
                # Priority 2: Use variant color if variant exists
                elif selected_variant and variant_color:
                    state.collect_field("selected_color", variant_color)
                    logger.info(f"🎨 ✅ Priority 2: Using variant color after size selection: {variant_color}")
                    response_text = f"Size: {matched_size} selected\n\nColor: *{variant_color}*\n\nHow many would you like to order?{qty_text}"
                    suggested_actions = ["1", "2", "3", "Cancel"]
                # Priority 3: Use stored card colors first, then variant-derived colors
                else:
                    # ENTERPRISE FIX: Check for stored card colors first
                    colors = state.collected_fields.get("_selected_card_colors")
                    if not colors:
                        colors = self._get_available_colors_for_product(
                            product_data, selected_size=matched_size
                        )
                    if colors:
                        if len(colors) == 1:
                            state.collect_field("selected_color", colors[0])
                            logger.info(f"🎨 Priority 3: Auto-selecting single color: {colors[0]}")
                            response_text = f"Size: {matched_size} selected\n\nColor: *{colors[0]}*\n\nHow many would you like to order?{qty_text}"
                            suggested_actions = ["1", "2", "3", "Cancel"]
                        else:
                            state.collect_field("_needs_color", True)
                            state.collect_field("_available_colors", colors)
                            color_list = ", ".join(colors[:6])
                            logger.info(f"🎨 Priority 3: Multiple colors, asking user to select")
                            response_text = f"Size: {matched_size} selected\n\nAvailable colors: {color_list}\n\nWhich color would you like?"
                            suggested_actions = colors[:4] + ["Cancel"]
                    else:
                        logger.info(f"🎨 No colors available")
                        response_text = f"Size: {matched_size} selected\n\nHow many would you like to order?{qty_text}"
                        suggested_actions = ["1", "2", "3", "Cancel"]
                
                # Persist state after size selection
                self.conversation_manager.persist_state(user_id)
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "order_size_selected",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": suggested_actions,
                    "metadata": {"generation_method": "order_flow", "size": matched_size, "price": selected_price}
                }
            else:
                size_list = ", ".join(sizes[:6])
                response_text = f"Please select a valid size: {size_list}"
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "order_size_invalid",
                    "confidence": 0.8,
                    "needs_human": False,
                    "suggested_actions": sizes[:4],
                    "metadata": {"generation_method": "order_flow"}
                }
        
        # =====================================================
        # STEP 0.6: Handle color selection
        # =====================================================
        if state.collected_fields.get("_needs_color"):
            colors = state.collected_fields.get("_available_colors", [])
            matched_color = None
            
            # Try exact match first
            for color in colors:
                if color.lower() == msg_lower:
                    matched_color = color
                    break
            
            # Fallback: try partial match only if no exact match
            if not matched_color:
                for color in colors:
                    if msg_lower in color.lower() and len(msg_lower) >= max(1, len(color) - 1):
                        matched_color = color
                        break
            
            if matched_color:
                del state.collected_fields["_needs_color"]
                del state.collected_fields["_available_colors"]
                state.collect_field("selected_color", matched_color)
                
                # Build variant display
                size = state.collected_fields.get("selected_size")
                if size:
                    variant_display = f"Size: {size}, Color: {matched_color}"
                else:
                    variant_display = f"Color: {matched_color}"
                state.collect_field("variant_display", variant_display)
                
                response_text = f"Color *{matched_color}* selected. ✓\n\nHow many would you like to order?"
                suggested_actions = ["1", "2", "3", "Cancel"]
                
                # Persist state after color selection
                self.conversation_manager.persist_state(user_id)
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "order_color_selected",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": suggested_actions,
                    "metadata": {"generation_method": "order_flow", "color": matched_color}
                }
            else:
                color_list = ", ".join(colors[:6])
                response_text = f"Please select a valid color: {color_list}"
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "order_color_invalid",
                    "confidence": 0.8,
                    "needs_human": False,
                    "suggested_actions": colors[:4],
                    "metadata": {"generation_method": "order_flow"}
                }
        
        # =====================================================
        # STEP 1: Handle product selection (when list was shown)
        # =====================================================
        if state.collected_fields.get("awaiting_selection") and not state.collected_fields.get("pending_item"):
            # Check for pagination commands first
            if msg_lower in ["next", "next ▶", "next page", "more"]:
                current_page = state.collected_fields.get("_pagination_page", 0)
                total_pages = state.collected_fields.get("_pagination_total_pages", 1)
                all_products = state.collected_fields.get("_all_products", business_data.get("products_services", []))
                
                if current_page < total_pages - 1:
                    # Show next page using effective page size (may differ from default if MAX_PRODUCT_CARDS limited display)
                    effective_page_size = state.collected_fields.get("_pagination_products_per_page") or state.collected_fields.get("_pagination_page_size", 5)
                    next_page = current_page + 1
                    response_text, suggested_actions, product_meta = self._format_product_list(
                        all_products, state, page=next_page, page_size=effective_page_size
                    )
                    
                    # Persist state after pagination
                    self.conversation_manager.persist_state(user_id)
                    
                    self.conversation_manager.add_message(user_id, "user", message)
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    
                    return {
                        "reply": response_text,
                        "intent": "order_pagination_next",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": suggested_actions,
                        "metadata": {"generation_method": "order_flow_pagination", "page": next_page + 1, **product_meta}
                    }
                else:
                    response_text = "You're already on the last page. Please select a product by number or name."
                    self.conversation_manager.add_message(user_id, "user", message)
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    return {
                        "reply": response_text,
                        "intent": "order_pagination_end",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": ["1", "2", "Cancel"],
                        "metadata": {"generation_method": "order_flow"}
                    }
            
            elif msg_lower in ["previous", "◀ previous", "prev", "back"]:
                current_page = state.collected_fields.get("_pagination_page", 0)
                all_products = state.collected_fields.get("_all_products", business_data.get("products_services", []))
                
                if current_page > 0:
                    # Show previous page
                    prev_page = current_page - 1
                    response_text, suggested_actions, product_meta = self._format_product_list(
                        all_products, state, page=prev_page
                    )
                    
                    # Persist state after pagination
                    self.conversation_manager.persist_state(user_id)
                    
                    self.conversation_manager.add_message(user_id, "user", message)
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    
                    return {
                        "reply": response_text,
                        "intent": "order_pagination_previous",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": suggested_actions,
                        "metadata": {"generation_method": "order_flow_pagination", "page": prev_page + 1, **product_meta}
                    }
                else:
                    response_text = "You're already on the first page. Please select a product by number or name."
                    self.conversation_manager.add_message(user_id, "user", message)
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    return {
                        "reply": response_text,
                        "intent": "order_pagination_start",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": ["1", "2", "Cancel"],
                        "metadata": {"generation_method": "order_flow"}
                    }
            
            # Regular product selection logic
            products = business_data.get("products_services", [])
            product_map = state.collected_fields.get("_product_map", {})
            available_products = state.collected_fields.get("_available_products", [])
            matched_product = None
            matched_product_data = None
            
            # Handle "Order This" button click pattern: "order {product_id}"
            # Button IDs use underscores, product names may use spaces
            # Normalize search term for proper matching
            is_order_button = msg_lower.startswith("order ")
            search_term = msg_lower.replace("order ", "").replace("_", " ").strip() if is_order_button else msg_lower
            
            # Try product_map first (includes index and name lookups)
            if msg_lower in product_map:
                matched_product_data = product_map[msg_lower]
                matched_product = matched_product_data.get("name")
            elif message.strip() in product_map:
                matched_product_data = product_map[message.strip()]
                matched_product = matched_product_data.get("name")
            elif search_term in product_map:
                # Try normalized search term (for button clicks)
                matched_product_data = product_map[search_term]
                matched_product = matched_product_data.get("name")
            
            # Fallback: number selection
            if not matched_product:
                number_match = re.search(r'^\s*(\d+)\s*$', message)
                if number_match:
                    idx = int(number_match.group(1)) - 1
                    if 0 <= idx < len(available_products):
                        matched_product = available_products[idx]
                        # Find full product data
                        for p in products:
                            if isinstance(p, dict) and p.get("name") == matched_product:
                                matched_product_data = p
                                break
            
            # Fallback: name match (use normalized search_term for button clicks)
            if not matched_product:
                for product in products:
                    if isinstance(product, dict):
                        name = product.get("name", "").lower()
                        product_id = str(product.get("id", "")).lower()
                        sku = str(product.get("sku", "")).lower()
                        
                        # Match by name, id, or sku against normalized search term
                        if name and (name in search_term or search_term in name):
                            matched_product = product.get("name")
                            matched_product_data = product
                            break
                        if product_id and (product_id in search_term or search_term in product_id):
                            matched_product = product.get("name")
                            matched_product_data = product
                            break
                        if sku and (sku in search_term or search_term in sku):
                            matched_product = product.get("name")
                            matched_product_data = product
                            break
            
            # Check for "yes" -> first product
            if not matched_product and msg_lower in ["yes", "ok", "okay", "first", "first one", "1st", "the first", "haan", "ha"]:
                if available_products:
                    matched_product = available_products[0]
                    for p in products:
                        if isinstance(p, dict) and p.get("name") == matched_product:
                            matched_product_data = p
                            break
            
            if matched_product:
                # Clear selection state
                for key in ["awaiting_selection", "_available_products", "_product_map"]:
                    if key in state.collected_fields:
                        del state.collected_fields[key]
                
                # Store product info including stable ID
                state.collect_field("pending_item", matched_product)
                if matched_product_data:
                    product_id = matched_product_data.get("id") or matched_product_data.get("sku") or matched_product
                    state.collect_field("pending_product_id", product_id)
                    state.collect_field("pending_product_data", matched_product_data)
                    
                    # Check for variants / sizes / colors
                    # ENTERPRISE FIX: Use stored card colors first, then variant-derived colors
                    sizes = state.collected_fields.get("_selected_card_sizes") or matched_product_data.get("sizes", [])
                    colors = state.collected_fields.get("_selected_card_colors")
                    if not colors:
                        colors = self._get_available_colors_for_product(matched_product_data)
                    
                    if sizes:
                        state.collect_field("_needs_size", True)
                        state.collect_field("_available_sizes", sizes)
                        size_list = ", ".join(sizes[:6])
                        response_text = f"Great choice! 🎉\n*{matched_product}*\n\nAvailable sizes: {size_list}\n\nWhich size would you like?"
                        suggested_actions = sizes[:4] + ["Cancel"]
                    elif colors:
                        # If only one color, automatically select it
                        if len(colors) == 1:
                            # Auto-select the single color
                            state.collect_field("selected_color", colors[0])
                            response_text = f"Great choice! 🎉\n*{matched_product}*\n\nColor: *{colors[0]}*\n\nHow many would you like to order?"
                            suggested_actions = ["1", "2", "3", "Cancel"]
                        else:
                            # Multiple colors - ask user to select
                            state.collect_field("_needs_color", True)
                            state.collect_field("_available_colors", colors)
                            color_list = ", ".join(colors[:6])
                            response_text = f"Great choice! 🎉\n*{matched_product}*\n\nAvailable colors: {color_list}\n\nWhich color would you like?"
                            suggested_actions = colors[:4] + ["Cancel"]
                    else:
                        response_text = f"Great choice! 🎉\n*{matched_product}*\n\nHow many would you like?"
                        suggested_actions = ["1", "2", "3", "Cancel"]
                else:
                    response_text = f"Great choice! 🎉 You want to order *{matched_product}*.\n\nHow many would you like?"
                    suggested_actions = ["1", "2", "3", "Cancel"]
                
                # Persist state after product selection
                self.conversation_manager.persist_state(user_id)
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                
                return {
                    "reply": response_text,
                    "intent": "order_product_selected",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": suggested_actions,
                    "metadata": {"generation_method": "order_flow", "product": matched_product}
                }
            else:
                # Ask user to specify which product
                self.conversation_manager.add_message(user_id, "user", message)
                response_text = "Please tell me which item you'd like by replying with the number (1, 2, 3...) or the product name."
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                
                return {
                    "reply": response_text,
                    "intent": "order_clarification",
                    "confidence": 0.8,
                    "needs_human": False,
                    "suggested_actions": ["1", "2", "Cancel"],
                    "metadata": {"generation_method": "order_flow_clarification"}
                }
        
        # =====================================================
        # STEP 2: Handle quantity response
        # AMAZON-GRADE: Validate quantity against cached stock snapshot
        # =====================================================
        pending_item = state.collected_fields.get("pending_item")
        if pending_item and not state.collected_fields.get("quantity"):
            # Try to extract quantity
            qty_match = re.search(r'\b(\d+)\b', message)
            if qty_match:
                quantity = int(qty_match.group(1))
                
                # AMAZON-GRADE: ALWAYS fetch LIVE stock from DB at quantity validation
                # Never trust cached value - stock can change between size selection and quantity entry
                # SEV-1 FIX: Use authoritative resolved_sku scope, NOT locally derived variant_id
                try:
                    from utils.availability import get_stock_for_selection
                    product_data = state.collected_fields.get("pending_product_data", {})
                    selected_size = state.collected_fields.get("selected_size")
                    
                    # SEV-1 FIX: Use resolved_sku for authoritative scope
                    resolved_sku = state.collected_fields.get("_resolved_sku", {})
                    scope = resolved_sku.get("scope", "BASE")
                    variant_id = resolved_sku.get("variant_id") if scope == "VARIANT" else None
                    
                    # CRITICAL: Never use base_only when scope is VARIANT
                    max_qty = get_stock_for_selection(product_data, variant_id=variant_id, size=selected_size, base_only=(scope == "BASE"))
                    logger.info(f"📦 REAL-TIME SKU-AWARE STOCK: scope={scope}, product={product_data.get('name')}, size={selected_size}, variant={variant_id}, available={max_qty}")
                    state.collect_field("_stock_snapshot", max_qty)  # Update cache with fresh value
                except (ImportError, Exception) as e:
                    logger.warning(f"⚠️ Live stock lookup failed: {e}, using cached value")
                    max_qty = state.collected_fields.get("_stock_snapshot", 100)  # Fallback to cache, then 100
                
                # BOUNDED VALIDATION: Reject invalid quantities BEFORE proceeding
                if quantity < 1:
                    self.conversation_manager.add_message(user_id, "user", message)
                    response_text = "Please enter a valid quantity (1 or more)."
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    return {
                        "reply": response_text,
                        "intent": "order_quantity_invalid",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": ["1", "2", "3", "Cancel"],
                        "metadata": {"generation_method": "order_flow", "error": "quantity_too_low"}
                    }
                
                if quantity > max_qty and max_qty > 0:
                    # Quantity exceeds available stock - reject BEFORE proceeding
                    # ENTERPRISE LOGGING: Structured invariant violation log
                    product_data = state.collected_fields.get("pending_product_data", {})
                    selected_variant = state.collected_fields.get("selected_variant")
                    selected_size = state.collected_fields.get("selected_size")
                    logger.warning(
                        "INVENTORY_INVARIANT_BLOCKED",
                        extra={
                            "product_id": product_data.get("id"),
                            "variant_id": selected_variant.get("id") if selected_variant else None,
                            "size": selected_size,
                            "requested": quantity,
                            "available": max_qty,
                            "channel": "whatsapp"
                        }
                    )
                    
                    self.conversation_manager.add_message(user_id, "user", message)
                    if max_qty == 1:
                        response_text = f"Sorry, only 1 unit is available. Would you like to order 1?"
                    else:
                        response_text = f"Sorry, only {max_qty} units are available.\n\nPlease enter a quantity up to {max_qty}."
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    return {
                        "reply": response_text,
                        "intent": "order_quantity_exceeds_stock",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": [str(max_qty), "1", "Cancel"],
                        "metadata": {"generation_method": "order_flow", "max_available": max_qty, "requested": quantity}
                    }
                
                # Per-product max order quantity (enables wholesale limits, per-SKU controls)
                product_data = state.collected_fields.get("pending_product_data", {})
                product_max_qty = product_data.get("max_order_qty", 100)
                
                if quantity > product_max_qty:
                    # Exceeds product-specific max - reject
                    self.conversation_manager.add_message(user_id, "user", message)
                    response_text = f"Maximum quantity for this item is {product_max_qty}. Please enter a smaller number."
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    return {
                        "reply": response_text,
                        "intent": "order_quantity_invalid",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": [str(min(product_max_qty, max_qty)), "1", "Cancel"],
                        "metadata": {"generation_method": "order_flow", "error": "quantity_exceeds_product_max", "max": product_max_qty}
                    }
                
                # Valid quantity - proceed
                if quantity > 0 and quantity <= min(max_qty if max_qty > 0 else product_max_qty, product_max_qty):
                    state.collect_field("quantity", quantity)
                    
                    # Build complete item with stable product references
                    product_data = state.collected_fields.get("pending_product_data", {})
                    selected_variant = state.collected_fields.get("selected_variant")
                    selected_size = state.collected_fields.get("selected_size")
                    selected_color = state.collected_fields.get("selected_color")
                    selected_size_price = state.collected_fields.get("selected_size_price")
                    base_price = product_data.get("price", 0)
                    original_price = product_data.get("compare_at_price")
                    
                    # Determine price: prefer variant-level over base/size-level
                    item_price = None
                    item_original_price = None
                    
                    logger.info(f"💰 DEBUG: Building order item - selected_variant={selected_variant is not None}, selected_size={selected_size}, selected_color={selected_color}")
                    logger.info(f"💰 DEBUG: selected_size_price={selected_size_price}, type={type(selected_size_price)}, base_price={base_price}")
                    if selected_variant:
                        logger.info(f"💰 DEBUG: Variant details - id={selected_variant.get('id')}, price={selected_variant.get('price')}, size_prices={selected_variant.get('size_prices')}")
                        logger.info(f"💰 DEBUG: State - selected_size_price={selected_size_price}, selected_variant_price={state.collected_fields.get('selected_variant_price')}")
                        
                        # Priority 1: Use size-specific price if size was selected
                        if selected_size_price is not None:
                            item_price = selected_size_price
                            item_original_price = selected_variant.get("compare_at_price") or original_price
                            logger.info(f"💰 ✅ Priority 1: Using variant size price for item: ₹{item_price} (variant_id={selected_variant.get('id')}, size={selected_size})")
                        # Priority 2: Use stored variant price (when variant selected without size selection)
                        elif state.collected_fields.get("selected_variant_price") is not None:
                            item_price = float(state.collected_fields.get("selected_variant_price"))
                            item_original_price = selected_variant.get("compare_at_price") or original_price
                            logger.info(f"💰 ✅ Priority 2: Using stored variant price for item: ₹{item_price} (variant_id={selected_variant.get('id')})")
                        # Priority 3: Try variant's direct price field
                        else:
                            vp = selected_variant.get("price")
                            logger.info(f"💰 DEBUG: Priority 3 - variant direct price: {vp}, type={type(vp)}")
                            if vp is not None:
                                # Use variant price even if it's 0 (0 is a valid price)
                                item_price = float(vp)
                                item_original_price = selected_variant.get("compare_at_price") or original_price
                                logger.info(f"💰 ✅ Priority 3: Using variant direct price for item: ₹{item_price} (variant_id={selected_variant.get('id')})")
                            else:
                                # Last resort: check if variant has single size pricing
                                variant_size_prices = selected_variant.get("size_prices", {}) or {}
                                logger.info(f"💰 DEBUG: Priority 4 - checking variant size_prices: {variant_size_prices}")
                                if variant_size_prices and len(variant_size_prices) == 1:
                                    single_size = list(variant_size_prices.keys())[0]
                                    item_price = float(variant_size_prices[single_size])
                                    item_original_price = selected_variant.get("compare_at_price") or original_price
                                    logger.info(f"💰 ✅ Priority 4: Using variant single-size price for item: ₹{item_price} (variant_id={selected_variant.get('id')}, size={single_size})")
                                else:
                                    # Fallback to base price (shouldn't happen if variant is properly configured)
                                    item_price = float(base_price) if base_price else 0
                                    item_original_price = original_price
                                    logger.error(f"💰 ❌ ERROR: Variant has no price! Falling back to base: ₹{item_price} (variant_id={selected_variant.get('id')}, variant={selected_variant})")
                    else:
                        resolved = self._resolve_variant_for_product(
                            product_data, selected_size=selected_size, selected_color=selected_color
                        )
                        if resolved:
                            sp = resolved.get("size_prices") or {}
                            if selected_size and sp.get(selected_size) is not None:
                                item_price = float(sp[selected_size])
                            else:
                                vp = resolved.get("price")
                                item_price = float(vp) if vp is not None else (float(base_price) if base_price else 0)
                            item_original_price = resolved.get("compare_at_price") or original_price
                            logger.info(f"💰 Using resolved variant price for item: ₹{item_price} (size={selected_size}, color={selected_color})")
                        elif selected_size_price is not None:
                            item_price = selected_size_price
                            item_original_price = original_price
                        else:
                            item_price = float(base_price) if base_price else 0
                            item_original_price = original_price
                    
                    item = {
                        "name": pending_item,
                        "quantity": quantity,
                        "product_id": state.collected_fields.get("pending_product_id") or product_data.get("id") or product_data.get("sku"),
                        "variant_id": None,
                        "variant_display": state.collected_fields.get("variant_display"),
                        "price": item_price,
                        "original_price": float(item_original_price) if item_original_price else None,
                        "sku": product_data.get("sku"),
                        "size": selected_size,
                        "color": selected_color,
                    }
                    
                    # Build variant_id from actual variant UUID (NOT semantic size_color!)
                    size = state.collected_fields.get("selected_size")
                    color = state.collected_fields.get("selected_color")
                    
                    # CRITICAL FIX: Use actual variant UUID, not semantic ID
                    if selected_variant and selected_variant.get("id"):
                        item["variant_id"] = selected_variant.get("id")
                        logger.info(f"📦 Using actual variant UUID: {item['variant_id']}")
                    else:
                        # Try to resolve variant from product data
                        resolved = self._resolve_variant_for_product(
                            product_data, selected_size=size, selected_color=color
                        )
                        if resolved and resolved.get("id"):
                            item["variant_id"] = resolved.get("id")
                            logger.info(f"📦 Using resolved variant UUID: {item['variant_id']}")
                        else:
                            # No variant UUID available - leave as None
                            item["variant_id"] = None
                            logger.warning(f"📦 No variant UUID found for size={size}, color={color}")
                    
                    # Build display string (separate from variant_id)
                    if size and color:
                        if not item["variant_display"]:
                            item["variant_display"] = f"Size: {size}, Color: {color}"
                    elif size:
                        if not item["variant_display"]:
                            item["variant_display"] = f"Size: {size}"
                    elif color:
                        if not item["variant_display"]:
                            item["variant_display"] = f"Color: {color}"
                    
                    state.collect_field("items", [item])
                    
                    # Get configured order fields
                    order_fields = state.flow_config.get("order_fields", [])
                    if order_fields:
                        # Mark that we need to collect fields, start with first one
                        state.collect_field("_order_fields", order_fields)
                        state.collect_field("_current_field_index", 0)
                        
                        # Persist state after quantity collection (critical for recovery)
                        self.conversation_manager.persist_state(user_id)
                        
                        first_field = order_fields[0]
                        question = self._generate_order_field_question(first_field)
                        
                        self.conversation_manager.add_message(user_id, "user", message)
                        response_text = f"Great\n{quantity}x {pending_item} added.\n\n{question}"
                        self.conversation_manager.add_message(user_id, "assistant", response_text)
                        
                        return {
                            "reply": response_text,
                            "intent": "order_quantity_collected",
                            "confidence": 1.0,
                            "needs_human": False,
                            "suggested_actions": [],
                            "metadata": {"generation_method": "order_flow", "quantity": quantity}
                        }
                    else:
                        # No fields configured, go straight to confirmation
                        state.collect_field("customer_name", "Customer")
                        self.conversation_manager.persist_state(user_id)
                        return self._show_order_confirmation(user_id, state, message)
        
        # =====================================================
        # STEP 3: Handle dynamic field collection
        # =====================================================
        order_fields = state.collected_fields.get("_order_fields", [])
        current_index = state.collected_fields.get("_current_field_index")
        
        if order_fields and current_index is not None and state.collected_fields.get("items"):
            current_field = order_fields[current_index] if current_index < len(order_fields) else None
            
            if current_field:
                field_id = current_field.get("id")
                field_value = message.strip()
                
                # Validate the response based on field type
                validation = self._validate_order_field(current_field, field_value)
                
                if validation.get("valid"):
                    # Store the field value
                    state.collect_field(field_id, validation.get("value", field_value))
                    
                    # Map common field names
                    if field_id == "name":
                        state.collect_field("customer_name", field_value)
                    elif field_id == "phone":
                        state.collect_field("customer_phone", field_value)
                    elif field_id == "address":
                        state.collect_field("customer_address", field_value)
                    
                    # Move to next field
                    next_index = current_index + 1
                    state.collect_field("_current_field_index", next_index)
                    
                    # CRITICAL: Persist after each field collection for recovery
                    self.conversation_manager.persist_state(user_id)
                    
                    if next_index < len(order_fields):
                        # Ask next question
                        next_field = order_fields[next_index]
                        question = self._generate_order_field_question(next_field)
                        
                        self.conversation_manager.add_message(user_id, "user", message)
                        self.conversation_manager.add_message(user_id, "assistant", question)
                        
                        return {
                            "reply": question,
                            "intent": "order_field_collected",
                            "confidence": 1.0,
                            "needs_human": False,
                            "suggested_actions": [],
                            "metadata": {"generation_method": "order_flow", "field": field_id}
                        }
                    else:
                        # All fields collected, show confirmation
                        return self._show_order_confirmation(user_id, state, message)
                else:
                    # Invalid response, ask again
                    error_msg = validation.get("error", "That doesn't look right. Please try again.")
                    question = self._generate_order_field_question(current_field)
                    
                    self.conversation_manager.add_message(user_id, "user", message)
                    response_text = f"{error_msg}\n\n{question}"
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    
                    return {
                        "reply": response_text,
                        "intent": "order_field_invalid",
                        "confidence": 0.8,
                        "needs_human": False,
                        "suggested_actions": [],
                        "metadata": {"generation_method": "order_flow_validation"}
                    }
        
        # If we get here, something unexpected - let the user know
        self.conversation_manager.add_message(user_id, "user", message)
        response_text = "I didn't quite understand that. Could you please try again?"
        self.conversation_manager.add_message(user_id, "assistant", response_text)
        
        return {
            "reply": response_text,
            "intent": "order_flow_error",
            "confidence": 0.5,
            "needs_human": False,
            "suggested_actions": ["Cancel order"],
            "metadata": {"generation_method": "order_flow_error"}
        }

    def _handle_payment_verification(self, user_id: str, state, message: str, business_data: Dict[str, Any]):
        """Handle messages when waiting for payment."""
        msg_lower = message.lower().strip()
        
        logger.info(f"📦 Payment verification handler called for user: {user_id}, message: '{message}'")
        
        # Check if user wants to cancel
        if msg_lower in ["no", "cancel", "cancel order", "nahi", "nako", "na", "n"]:
            self.conversation_manager.cancel_flow(user_id)
            self.conversation_manager.add_message(user_id, "user", message)
            cancel_msg = "Order cancelled. No payment was processed. Is there anything else I can help you with? 😊"
            self.conversation_manager.add_message(user_id, "assistant", cancel_msg)
            return {
                "reply": cancel_msg,
                "intent": "order_cancelled_payment",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["Browse products", "Start over"],
                "metadata": {"generation_method": "payment_cancelled"}
            }
            
        # Check payment status
        payment_link_id = state.collected_fields.get("payment_link_id")
        payment_settings = business_data.get("payment_settings", {})
        key_id = payment_settings.get("key_id")
        key_secret = payment_settings.get("key_secret")
        
        logger.info(f"📦 Payment link ID: {payment_link_id}, Has credentials: {bool(key_id and key_secret)}")
        
        if not payment_link_id or not key_id or not key_secret:
            # SECURITY: Do NOT skip payment if credentials are missing
            # This prevents orders without payment verification
            logger.error(f"📦 SECURITY: Payment link or credentials missing for user: {user_id}")
            response_text = (
                "I'm having trouble with the payment system right now. "
                "Please contact support or try again later. Your order cannot be processed without payment verification."
            )
            self.conversation_manager.add_message(user_id, "user", message)
            self.conversation_manager.add_message(user_id, "assistant", response_text)
            return {
                "reply": response_text,
                "intent": "payment_error",
                "confidence": 1.0,
                "needs_human": True,
                "suggested_actions": ["Contact Support", "Cancel"],
                "metadata": {"error": "payment_credentials_missing"}
            }
            
        try:
            import razorpay
            client = razorpay.Client(auth=(key_id, key_secret))
            
            # CRITICAL SECURITY FIX: ALWAYS verify payment status with Razorpay API
            # Never trust cached or previous payment_status - always check with Razorpay
            def verify_payment_with_retry(link_id, max_retries=3, retry_delay=2):
                """Verify payment status with retry logic and exponential backoff."""
                for attempt in range(max_retries):
                    try:
                        response = client.payment_link.fetch(link_id)
                        return response.get("status"), response
                    except Exception as e:
                        if attempt < max_retries - 1:
                            wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                            logger.warning(f"📦 Payment verification attempt {attempt + 1} failed, retrying in {wait_time}s: {e}")
                            time.sleep(wait_time)
                        else:
                            logger.error(f"📦 Payment verification failed after {max_retries} attempts: {e}")
                            raise
                return None, None
            
            # CRITICAL: If user says "paid", verify IMMEDIATELY without waiting
            # This prevents AI from generating a response before verification
            user_claims_paid = any(x in msg_lower for x in ["paid", "done", "complete", "screenshot", "payment done"])
            logger.info(f"📦 User claims paid: {user_claims_paid}, verifying with Razorpay API...")
            
            # Always fetch fresh status from Razorpay (never trust cached state)
            razorpay_status = None
            payment_response = None
            try:
                razorpay_status, payment_response = verify_payment_with_retry(payment_link_id)
                if razorpay_status is None:
                    raise Exception("Failed to fetch payment status from Razorpay after retries")
                logger.info(f"📦 Razorpay status: {razorpay_status} for link: {payment_link_id}")
            except Exception as verify_error:
                logger.error(f"📦 Failed to verify payment with Razorpay for user: {user_id}, link: {payment_link_id}: {verify_error}")
                raise  # Re-raise to be caught by outer exception handler
            
            if razorpay_status == "paid":
                # Payment verified by Razorpay - store complete payment details
                logger.info(f"📦 Payment CONFIRMED as paid by Razorpay, proceeding to complete order...")
                state.collect_field("payment_status", "paid")
                state.collect_field("payment_details", {
                    "method": "razorpay",
                    "link_id": payment_link_id,
                    "amount": payment_response.get("amount_paid", 0) if payment_response else 0,
                    "reference_id": payment_response.get("reference_id") if payment_response else None,
                    "verified_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
                })
                logger.info(f"📦 Payment verified successfully via Razorpay API for user: {user_id}, link: {payment_link_id}")
                # Proceed to complete order immediately
                order_result = self._complete_order(user_id, state, business_data)
                logger.info(f"📦 Order completion result: {order_result.get('intent') if order_result else 'None'}")
                return order_result
                
            elif razorpay_status == "expired":
                # Link expired - check if user wants new link
                msg_lower = message.lower().strip()
                if any(x in msg_lower for x in ["yes", "y", "ok", "okay", "sure", "new link", "generate"]):
                    # User wants new link - clear old one and regenerate
                    logger.info(f"📦 User requested new payment link after expiration for user: {user_id}")
                    state.collect_field("payment_link_id", None) # Clear to regenerate
                    state.collect_field("payment_link_url", None)
                    # Regenerate payment link by calling _complete_order
                    return self._complete_order(user_id, state, business_data)
                
                # Link expired - ask if they want new link
                response_text = (
                    "The payment link has expired. Would you like me to generate a new payment link?"
                )
                state.collect_field("payment_link_id", None) # Clear to regenerate
                state.collect_field("payment_link_url", None)
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "payment_expired",
                    "confidence": 1.0,
                    "suggested_actions": ["Yes, New Link", "Cancel Order"],
                    "metadata": {"status": "expired"}
                }
            elif razorpay_status in ["failed", "cancelled"]:
                # Payment failed or cancelled - offer to regenerate link
                msg_lower = message.lower().strip()
                
                # Check if user wants new link
                if any(x in msg_lower for x in ["yes", "y", "ok", "okay", "sure", "new link", "generate", "new"]):
                    # User wants new link - clear old one and regenerate
                    logger.info(f"📦 User requested new payment link after {razorpay_status} for user: {user_id}")
                    state.collect_field("payment_link_id", None)
                    state.collect_field("payment_link_url", None)
                    # Regenerate payment link by calling _complete_order
                    return self._complete_order(user_id, state, business_data)
                
                # Payment failed or cancelled - offer to regenerate link
                payment_link_url = state.collected_fields.get("payment_link_url")
                response_text = (
                    f"The payment status shows '{razorpay_status}'. "
                    "Would you like me to generate a new payment link so you can try again?\n\n"
                )
                
                if payment_link_url:
                    response_text += f"Or you can try using the same link: 👉 {payment_link_url}\n\n"
                
                response_text += "Reply 'Yes' or 'New Link' to get a fresh payment link."
                
                # Clear old link to force regeneration on next attempt
                state.collect_field("payment_link_id", None)
                state.collect_field("payment_link_url", None)
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "payment_failed",
                    "confidence": 1.0,
                    "suggested_actions": ["Yes, New Link", "Cancel Order"],
                    "metadata": {"status": razorpay_status, "can_retry": True}
                }
            elif razorpay_status in ["issued", "pending", "created"]:
                # Link is still active - user can retry with same link
                payment_link_url = state.collected_fields.get("payment_link_url")
                
                if user_claims_paid:
                    # User says paid but status is still pending/issued
                    response_text = (
                        f"The payment link is still active (status: '{razorpay_status}'). "
                        "You can use the same payment link to complete your payment.\n\n"
                        f"👉 {payment_link_url}\n\n"
                        "After completing the payment, reply with 'Paid' or 'Done' and I'll verify it immediately.\n\n"
                        "If you've already paid, please wait 1-2 minutes for the status to update, then reply 'Check' again."
                    )
                else:
                    response_text = (
                        f"Your payment link is still active. You can use it to complete your payment:\n\n"
                        f"👉 {payment_link_url}\n\n"
                        "After paying, reply with 'Paid' or 'Done' and I'll verify your payment!"
                    )
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "payment_pending_retry",
                    "confidence": 1.0,
                    "suggested_actions": ["Paid", "Check Status", "Cancel"],
                    "metadata": {"status": razorpay_status, "can_retry": True, "link_url": payment_link_url}
                }
            else:
                # Unknown or other status
                # Payment not confirmed by Razorpay
                # Check if user claims to have paid
                if user_claims_paid:
                    # User claims to have paid, but Razorpay says otherwise
                    # Provide clear feedback and ask them to check
                    payment_link_url = state.collected_fields.get("payment_link_url")
                    response_text = (
                        f"I checked with the payment gateway, but the payment status is '{razorpay_status}'. "
                        "Please ensure you have completed the payment using the link provided.\n\n"
                    )
                    
                    if payment_link_url:
                        response_text += f"You can use the same payment link: 👉 {payment_link_url}\n\n"
                    
                    response_text += (
                        "If you have already paid, it may take a few moments to update. Please wait 1-2 minutes and reply 'Check' or 'Paid' again.\n\n"
                        "If the payment failed, reply 'New Link' and I'll generate a fresh payment link for you."
                    )
                    self.conversation_manager.add_message(user_id, "user", message)
                    self.conversation_manager.add_message(user_id, "assistant", response_text)
                    return {
                        "reply": response_text,
                        "intent": "payment_check_failed",
                        "confidence": 1.0, 
                        "suggested_actions": ["Check Again", "New Link", "Pay Later (COD)"],
                        "metadata": {"status": razorpay_status, "verified": False}
                    }

                # User hasn't claimed to have paid yet - show payment link
                payment_link_url = state.collected_fields.get("payment_link_url")
                if payment_link_url:
                    response_text = (
                        "I haven't received the payment confirmation yet. "
                        f"Please complete the payment using this link:\n\n"
                        f"👉 {payment_link_url}\n\n"
                        "After paying, reply with 'Paid' or 'Done' and I'll verify your payment immediately!\n\n"
                        "If you face any issues, you can choose to 'Pay later' (COD) if available."
                    )
                else:
                    response_text = (
                        "I haven't received the payment confirmation yet. "
                        "Please complete the payment using the link provided earlier.\n\n"
                        "After paying, reply with 'Paid' or 'Done'.\n\n"
                        "If you face any issues, you can choose to 'Pay later' (COD) if available."
                    )
                
                # Allow switching to COD if user insists (simple heuristic)
                if any(x in msg_lower for x in ["cod", "pay later", "cash", "delivery"]):
                     state.collect_field("payment_status", "cod")
                     return self._complete_order(user_id, state, business_data)
                
                # Check if user wants a new link
                if any(x in msg_lower for x in ["new link", "new payment", "regenerate", "new"]):
                    # Clear existing link to force regeneration
                    state.collect_field("payment_link_id", None)
                    state.collect_field("payment_link_url", None)
                    logger.info(f"📦 User requested new payment link, clearing old link for user: {user_id}")
                    # Trigger payment link regeneration by calling _complete_order again
                    return self._complete_order(user_id, state, business_data)
                
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                return {
                    "reply": response_text,
                    "intent": "payment_pending",
                    "confidence": 1.0,
                    "suggested_actions": ["Paid", "Check Status", "New Link", "Cancel"],
                    "metadata": {"status": razorpay_status}
                }
                
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"📦 Payment verification exception for user: {user_id}: {e}\n{error_trace}")
            
            # Try to get more context about what went wrong
            error_details = str(e)
            if "razorpay" in error_details.lower():
                response_text = (
                    "I'm having trouble connecting to the payment gateway right now. "
                    "Please try again in a moment, or contact support if the issue persists."
                )
            elif "timeout" in error_details.lower() or "connection" in error_details.lower():
                response_text = (
                    "The payment verification is taking longer than expected. "
                    "Please wait a moment and reply 'Check' or 'Paid' again."
                )
            else:
                response_text = (
                    "I'm having trouble verifying the payment right now. "
                    "Please try again in a moment or contact support if the issue persists."
                )
            
            self.conversation_manager.add_message(user_id, "user", message)
            self.conversation_manager.add_message(user_id, "assistant", response_text)
            return {
                "reply": response_text,
                "intent": "payment_error",
                "confidence": 0.8,
                "needs_human": True,
                "suggested_actions": ["Check Status", "Cancel", "Contact Support"],
                "metadata": {"error": str(e), "error_type": type(e).__name__}
            }

    def _complete_order(
        self,
        user_id: str,
        state: ConversationState,
        business_data: Dict[str, Any],
        skip_payment: bool = False
    ) -> Dict[str, Any]:
        """
        Complete the order after user confirmation.
        
        Production safeguards:
        - Database-backed idempotency to prevent duplicate webhooks
        - Deterministic idempotency key to prevent duplicates
        - Real database persistence via OrderService
        - Summary rendered from persisted record
        """
        logger.info(f"📦 Completing order for user: {user_id}")
        
        # SAFETY: Lock state to prevent mutation during persistence
        if hasattr(state, '_persistence_locked') and state._persistence_locked:
            logger.warning(f"📦 Order already being processed for user: {user_id}")
            return {
                "reply": "Your order is already being processed. Please wait a moment.",
                "intent": "order_processing",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": [],
                "metadata": {"generation_method": "order_duplicate_attempt"}
            }
            
        # =================================================================
        # PAYMENT INTEGRATION
        # =================================================================
        payment_settings = business_data.get("payment_settings", {})
        try:
             # Check if payment is enabled and not already skipped/paid
            if (payment_settings.get("enabled") and 
                not skip_payment and 
                state.collected_fields.get("payment_status") != "paid" and
                state.collected_fields.get("payment_status") != "cod"):
                
                key_id = payment_settings.get("key_id")
                key_secret = payment_settings.get("key_secret")
                
                if key_id and key_secret:
                    # Calculate total amount
                    items = state.collected_fields.get("items", [])
                    total_amount = 0
                    for item in items:
                        price = item.get('price', 0)
                        quantity = item.get('quantity', 1)
                        total_amount += float(price) * quantity
                    
                    if total_amount > 0:
                        # =================================================================
                        # CRITICAL: RESERVE STOCK BEFORE PAYMENT LINK
                        # This is a HARD GATE - no payment link without reservation
                        # =================================================================
                        
                        # ═══════════════════════════════════════════════════════════════
                        # SEV-1 FIX: EARLY-EXIT GUARD (BEFORE any processing)
                        # Check FIRST before any expensive setup or logging
                        # ═══════════════════════════════════════════════════════════════
                        pre_payment_reservation_ids = state.collected_fields.get("pre_payment_reservation_ids")
                        
                        if pre_payment_reservation_ids and len(pre_payment_reservation_ids) > 0:
                            # ♻️ EARLY-EXIT: Skip entire reservation block
                            logger.info(
                                f"📦 ♻️ PRE-PAYMENT EARLY-EXIT: Reservation already exists ({len(pre_payment_reservation_ids)} items), skipping entire block",
                                extra={"reservation_ids": pre_payment_reservation_ids, "user_id": user_id}
                            )
                            # Jump directly to payment link generation below (stock already reserved)
                        else:
                            # 🟡 FIRST TIME: Proceed with reservation
                            try:
                                from services.inventory_service import get_inventory_service, StockItem
                                import uuid
                                import traceback
                                
                                inventory = get_inventory_service()
                                stock_items = []
                                
                                for item in items:
                                    product_id = item.get("product_id")
                                    if not product_id:
                                        continue
                                    
                                    # SEV-1 FIX: Extract base product_id if concatenated format is used
                                    # The format could be: "base_uuid_variant_variant_uuid" 
                                    # We need: product_id = "base_uuid", variant_id = "variant_uuid"
                                    if "_variant_" in str(product_id):
                                        parts = str(product_id).split("_variant_")
                                        product_id = parts[0]  # Base product UUID
                                        # Extract variant_id from concatenated format
                                        extracted_variant_id = parts[1] if len(parts) > 1 else None
                                        logger.info(f"📦 Extracted from concatenated ID: product_id={product_id}, variant_id={extracted_variant_id}")
                                    else:
                                        extracted_variant_id = None
                                    
                                    # Validate base product_id UUID
                                    try:
                                        uuid.UUID(str(product_id))
                                    except (ValueError, TypeError):
                                        logger.warning(f"📦 Invalid product_id UUID: {product_id}, skipping")
                                        continue
                                    
                                    # Determine variant_id: prefer item's variant_id, fallback to extracted
                                    raw_variant_id = item.get("variant_id") or extracted_variant_id
                                    sanitized_variant_id = None
                                    if raw_variant_id:
                                        try:
                                            uuid.UUID(str(raw_variant_id))
                                            sanitized_variant_id = raw_variant_id
                                        except (ValueError, TypeError):
                                            logger.warning(f"📦 Invalid variant_id UUID: {raw_variant_id}, ignoring")
                                            sanitized_variant_id = None
                                    
                                    stock_items.append(StockItem(
                                        product_id=product_id,
                                        name=item.get("name", "Item"),
                                        quantity=item.get("quantity", 1),
                                        variant_id=sanitized_variant_id,
                                        size=item.get("size"),
                                    ))
                                
                                if stock_items:
                                    # Get business owner ID - CRITICAL: Use flow_config FIRST for consistency
                                    # flow_config.business_owner_id = products.user_id (auth user ID)
                                    # businesses.user_id can be missing, businesses.id is business row ID (WRONG!)
                                    business_owner_id = (
                                        state.flow_config.get("business_owner_id") or
                                        business_data.get("user_id") or 
                                        state.collected_fields.get("business_manager_id")
                                    )
                                    
                                    # HARD FAIL if still no business_owner_id
                                    if not business_owner_id:
                                        logger.error(f"📦 PRE-PAYMENT: No business_owner_id found! flow_config={state.flow_config.get('business_owner_id')}, business_data.user_id={business_data.get('user_id')}")
                                        raise ValueError("Missing business_owner_id for stock reservation")
                                        
                                    logger.info(f"📦 PRE-PAYMENT: Using business_owner_id={business_owner_id} (flow_config={state.flow_config.get('business_owner_id')}, business_data.user_id={business_data.get('user_id')})")
                                    
                                    # DEBUG: Log the exact stock items being reserved
                                    for idx, si in enumerate(stock_items):
                                        logger.info(f"📦 PRE-PAYMENT DEBUG [{idx}]: product_id={si.product_id}, variant_id={si.variant_id}, size={si.size}, qty={si.quantity}, name={si.name}")
                                    
                                    # ═══════════════════════════════════════════════════════════════
                                    # SAFETY ASSERTION: Double-check guard wasn't bypassed
                                    # ═══════════════════════════════════════════════════════════════
                                    assert not state.collected_fields.get("pre_payment_reservation_ids"), \
                                        "BUG: Reached PRE-PAYMENT reservation code after pre_payment_reservation_ids already exists"
                                    
                                    # 🚨 CALL PATH DEBUG LOGGING (remove after bug is confirmed fixed)
                                    logger.info(
                                        "🚨 PRE-PAYMENT_RESERVATION_CALL_PATH",
                                        extra={
                                            "user_id": user_id,
                                            "flow_status": str(state.flow_status) if state else "no_state",
                                            "has_pre_payment": bool(state.collected_fields.get("pre_payment_reservation_ids")),
                                            "stack": "\n".join(traceback.format_stack()[-6:])
                                        }
                                    )
                                    
                                    # 🟡 FIRST & ONLY TIME we touch inventory
                                    logger.info(f"📦 🟡 PRE-PAYMENT: First-time reservation starting...")
                                    reservation_result = inventory.validate_and_reserve(
                                        user_id=business_owner_id,
                                        items=stock_items,
                                        source='whatsapp_ai_prepayment',
                                        session_id=f"ai_brain_{user_id}",
                                    )
                                    
                                    if not reservation_result.success:
                                        logger.error(
                                            f"📦 PRE-PAYMENT_RESERVATION_BLOCKED: Cannot generate payment link without stock reservation",
                                            extra={"user_id": user_id, "items": [i.name for i in stock_items]}
                                        )
                                        return {
                                            "reply": f"Sorry, {reservation_result.message or 'some items are no longer available'}.\n\nPlease restart your order to continue.",
                                            "intent": "stock_unavailable",
                                            "confidence": 1.0,
                                            "needs_human": False,
                                            "suggested_actions": ["Browse Products", "Cancel"],
                                            "metadata": {
                                                "generation_method": "pre_payment_reservation_blocked",
                                                "error": "stock_unavailable_before_payment"
                                            }
                                        }
                                    
                                    # Store reservation IDs for later use (IMMUTABLE)
                                    state.collect_field("pre_payment_reservation_ids", reservation_result.reservation_ids)
                                    logger.info(f"📦 🟡 PRE-PAYMENT: Stock reserved successfully: {len(reservation_result.reservation_ids)} items")
                            
                            except ImportError as e:
                                logger.warning(f"📦 Inventory service not available for pre-payment check: {e}")
                                # Allow flow to continue for backwards compatibility
                            except Exception as e:
                                logger.error(f"📦 PRE-PAYMENT_RESERVATION_ERROR: {e}", exc_info=True)
                                return {
                                    "reply": "Sorry, we could not verify stock availability. Please try again.",
                                    "intent": "stock_error",
                                    "confidence": 1.0,
                                    "needs_human": False,
                                    "suggested_actions": ["Try again", "Cancel"],
                                    "metadata": {"error": str(e)}
                                }
                        
                        # Generate Payment Link (only if stock is reserved)
                        import razorpay
                        import time
                        
                        client = razorpay.Client(auth=(key_id, key_secret))
                        
                        # Check if we already have an active link
                        existing_link_id = state.collected_fields.get("payment_link_id")
                        payment_link_url = state.collected_fields.get("payment_link_url")
                        
                        if not existing_link_id:
                            customer_name = state.collected_fields.get("customer_name", "Customer")
                            customer_phone = state.collected_fields.get("customer_phone", "")
                            
                            # Clean phone number
                            phone = re.sub(r'[^\d]', '', customer_phone)
                            if len(phone) == 10:
                                phone = f"+91{phone}"
                            elif not phone.startswith("+"):
                                phone = f"+{phone}"
                                
                            reference_id = f"ORDER_{user_id[-6:]}_{int(time.time())}"
                            
                            # Dynamic callback URL for local and production
                            frontend_url = os.getenv('FRONTEND_URL', 'https://flowauxi.com')
                            # Ensure URL doesn't end with slash
                            frontend_url = frontend_url.rstrip('/')
                            callback_url = f"{frontend_url}/payment-success"
                            
                            link_data = {
                                "amount": int(total_amount * 100), # Paise
                                "currency": "INR",
                                "description": f"Order for {len(items)} items from {business_data.get('business_name')}",
                                "customer": {
                                    "name": customer_name,
                                    "contact": phone
                                },
                                "reference_id": reference_id,
                                "callback_url": callback_url,
                                "callback_method": "get"
                            }
                            
                            logger.info(f"Generating payment link for amount: {total_amount}")
                            link = client.payment_link.create(link_data)
                            
                            existing_link_id = link.get('id')
                            payment_link_url = link.get('short_url')
                            
                            # Store link details in state
                            state.collect_field("payment_link_id", existing_link_id)
                            state.collect_field("payment_link_url", payment_link_url)
                            state.collect_field("order_reference_id", reference_id)
                            
                            # Update flow status
                            state.flow_status = FlowStatus.AWAITING_PAYMENT
                            self.conversation_manager.persist_state(user_id)
                        
                        # Send Link Response - Professional format with CTA URL button
                        body_text = (
                            f"Your total payable amount is ₹{int(total_amount)}.\n\n"
                            f"Click the Button Below to make payment\n\n"
                            f"Reply with paid to confirm"
                        )
                        
                        response_text = body_text  # For conversation history
                        self.conversation_manager.add_message(user_id, "assistant", response_text)
                        
                        # CRITICAL: Log flow status after setting AWAITING_PAYMENT
                        logger.info(f"📦 Payment link generated, flow_status set to AWAITING_PAYMENT for user: {user_id}")
                        logger.info(f"📦 Flow active check: {self.conversation_manager.is_flow_active(user_id)}")
                        
                        return {
                            "reply": response_text,
                            "intent": "order_payment_link",
                            "confidence": 1.0,
                            "needs_human": False,
                            "suggested_actions": ["Paid", "Check Status", "Cancel"],
                            "metadata": {
                                "generation_method": "payment_link",
                                "payment_link": payment_link_url,
                                "use_url_button": True,
                                "url_button_text": "Pay Now",
                                "url_button_url": payment_link_url,
                                "header_text": "Payment Details ❤️",
                                "footer_text": ""  # No footer text
                            }
                        }
        except Exception as e:
            logger.error(f"Failed to generate payment link: {e}")
            # Continue to COD flow on error
            pass
        
        # =================================================================
        # CRITICAL SECURITY CHECK: VERIFY PAYMENT BEFORE ORDER CREATION
        # =================================================================
        # This prevents orders from being created without verified payment
        # skip_payment should ONLY be used when payment is explicitly disabled in settings
        payment_settings = business_data.get("payment_settings", {})
        payment_status = state.collected_fields.get("payment_status")
        payment_link_id = state.collected_fields.get("payment_link_id")
        
        # SECURITY: Only allow skip_payment if payment is explicitly disabled in settings
        # This prevents abuse of the skip_payment parameter
        payment_enabled = payment_settings.get("enabled", False)
        if payment_enabled and skip_payment:
            logger.error(f"📦 SECURITY: Attempt to skip payment when payment is enabled for user: {user_id}")
            return {
                "reply": "Payment verification is required. Cannot skip payment when payment is enabled.",
                "intent": "payment_required",
                "confidence": 1.0,
                "needs_human": True,
                "suggested_actions": ["Complete Payment", "Cancel"],
                "metadata": {"error": "payment_skip_not_allowed"}
            }
        
        # If payment is enabled, MUST verify payment (skip_payment is not allowed)
        if payment_enabled:
            # Only allow "cod" or verified "paid" status
            if payment_status != "cod":
                # CRITICAL SECURITY: ALWAYS verify payment with Razorpay API before order creation
                # Never trust payment_status from state - always verify with Razorpay
                if not payment_link_id:
                    logger.error(f"📦 SECURITY: Payment required but no payment_link_id found for user: {user_id}")
                    return {
                        "reply": "Payment verification failed. Please complete the payment using the payment link.",
                        "intent": "payment_verification_failed",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": ["Check Payment", "Cancel"],
                        "metadata": {"error": "missing_payment_link_id"}
                    }
                
                # CRITICAL: Always verify payment status with Razorpay API (even if payment_status says "paid")
                try:
                    import razorpay
                    key_id = payment_settings.get("key_id")
                    key_secret = payment_settings.get("key_secret")
                    
                    if not key_id or not key_secret:
                        logger.error(f"📦 SECURITY: Payment credentials missing for user: {user_id}")
                        return {
                            "reply": "Payment verification failed. Please contact support.",
                            "intent": "payment_verification_failed",
                            "confidence": 1.0,
                            "needs_human": True,
                            "metadata": {"error": "missing_payment_credentials"}
                        }
                    
                    # Verify payment with retry logic
                    def verify_payment_final(link_id, max_retries=3, retry_delay=2):
                        """Final payment verification with retry logic."""
                        for attempt in range(max_retries):
                            try:
                                client = razorpay.Client(auth=(key_id, key_secret))
                                response = client.payment_link.fetch(link_id)
                                return response.get("status"), response
                            except Exception as e:
                                if attempt < max_retries - 1:
                                    wait_time = retry_delay * (2 ** attempt)
                                    logger.warning(f"📦 Final payment verification attempt {attempt + 1} failed, retrying in {wait_time}s: {e}")
                                    time.sleep(wait_time)
                                else:
                                    logger.error(f"📦 Final payment verification failed after {max_retries} attempts: {e}")
                                    raise
                        return None, None
                    
                    razorpay_status, payment_response = verify_payment_final(payment_link_id)
                    
                    # ONLY proceed if Razorpay confirms payment is "paid"
                    if razorpay_status != "paid":
                        logger.warning(f"📦 SECURITY: Final payment verification failed - status is '{razorpay_status}' not 'paid' for user: {user_id}, link: {payment_link_id}")
                        
                        # Provide helpful message based on status
                        if razorpay_status == "expired":
                            error_msg = "The payment link has expired. Please generate a new payment link."
                        elif razorpay_status == "cancelled":
                            error_msg = "The payment was cancelled. Please try again with a new payment link."
                        else:
                            error_msg = f"Payment verification failed. The payment status is '{razorpay_status}'. Please complete the payment using the payment link and try again."
                        
                        return {
                            "reply": error_msg,
                            "intent": "payment_verification_failed",
                            "confidence": 1.0,
                            "needs_human": False,
                            "suggested_actions": ["Check Payment", "Cancel"],
                            "metadata": {"error": "payment_not_verified", "razorpay_status": razorpay_status}
                        }
                    
                    # Payment verified by Razorpay - update payment details
                    from datetime import datetime as dt_module
                    state.collect_field("payment_status", "paid")  # Update state after verification
                    state.collect_field("payment_details", {
                        "method": "razorpay",
                        "link_id": payment_link_id,
                        "amount": payment_response.get("amount_paid", 0) if payment_response else 0,
                        "reference_id": payment_response.get("reference_id") if payment_response else None,
                        "verified_at": dt_module.utcnow().isoformat()
                    })
                    logger.info(f"📦 Final payment verification successful for user: {user_id}, link: {payment_link_id}")
                    
                except Exception as e:
                    logger.error(f"📦 SECURITY: Payment verification exception for user: {user_id}: {e}")
                    return {
                        "reply": "Payment verification failed. Please try again or contact support if the issue persists.",
                        "intent": "payment_verification_error",
                        "confidence": 1.0,
                        "needs_human": True,
                        "suggested_actions": ["Check Payment", "Cancel"],
                        "metadata": {"error": str(e)}
                    }
        
        # Set lock
        state._persistence_locked = True
        
        try:
            items = state.collected_fields.get("items", [])
            customer_name = state.collected_fields.get("customer_name", "Customer")
            customer_phone = state.collected_fields.get("customer_phone", "")
            customer_address = state.collected_fields.get("customer_address", "")
            business_owner_id = state.flow_config.get("business_owner_id", "")
            
            # Validate business_owner_id - must be a valid UUID, not empty or "default"
            if not business_owner_id or business_owner_id == "default" or len(business_owner_id) < 10:
                logger.error(f"📦 Invalid business_owner_id: '{business_owner_id}' - cannot persist order to database")
                raise ValueError(f"Invalid business_owner_id: {business_owner_id}")
            
            # Collect all custom fields
            order_fields = state.flow_config.get("order_fields", [])
            custom_fields = {}
            for field in order_fields:
                field_id = field.get("id")
                if field_id and field_id not in ["name", "phone", "address"]:
                    value = state.collected_fields.get(field_id)
                    if value:
                        custom_fields[field_id] = value
            
            # Build notes from custom fields and payment details
            notes_parts = []
            for key, value in custom_fields.items():
                notes_parts.append(f"{key}: {value}")
            
            # Add payment info (payment_status is now verified above)
            payment_status = state.collected_fields.get("payment_status")
            if payment_status == "paid":
                details = state.collected_fields.get("payment_details", {})
                amount = details.get("amount", 0)
                if amount:
                    notes_parts.append(f"PAID via Razorpay: ₹{amount/100}")
                else:
                    notes_parts.append("PAID via Razorpay")
                if details.get("reference_id"):
                    notes_parts.append(f"Ref: {details.get('reference_id')}")
            elif payment_status == "cod":
                 notes_parts.append("Payment: COD (Cash on Delivery)")
            
            notes = " | ".join(notes_parts) if notes_parts else None
            
            # =================================================================
            # AMAZON-GRADE: RESERVATION GATE (HARD GATE)
            # Order creation MUST be blocked if reservation fails
            # =================================================================
            
            # ═══════════════════════════════════════════════════════════════
            # SEV-1 FIX: EARLY-EXIT GUARD (BEFORE any processing)
            # Check FIRST before any expensive setup or try block
            # ═══════════════════════════════════════════════════════════════
            pre_payment_reservation_ids = state.collected_fields.get("pre_payment_reservation_ids")
            local_reservation_ids = []
            
            if pre_payment_reservation_ids and len(pre_payment_reservation_ids) > 0:
                # ♻️ EARLY-EXIT: Skip entire reservation try block
                logger.info(
                    f"📦 ♻️ ORDER_CONFIRM EARLY-EXIT: Reusing pre-payment reservations ({len(pre_payment_reservation_ids)} items), skipping reservation block",
                    extra={"reservation_ids": pre_payment_reservation_ids, "user_id": user_id}
                )
                local_reservation_ids = pre_payment_reservation_ids
                # Do NOT enter the try block below - go straight to order persistence
            else:
                # 🟡 COD/LEGACY FLOW: No pre-payment reservation exists, reserve now
                reservation_result = None
                
                try:
                    from services.inventory_service import get_inventory_service
                    from domain.inventory import StockItem
                    import traceback
                    
                    inventory = get_inventory_service()
                    
                    # Build stock items from collected items
                    stock_items = []
                    for item in items:
                        product_id = item.get("product_id")
                        if product_id:
                            import uuid
                            
                            # SEV-1 FIX: Extract base product_id if concatenated format is used
                            # The format could be: "base_uuid_variant_variant_uuid" 
                            # We need: product_id = "base_uuid", variant_id = "variant_uuid"
                            if "_variant_" in str(product_id):
                                parts = str(product_id).split("_variant_")
                                product_id = parts[0]  # Base product UUID
                                # Extract variant_id from concatenated format
                                extracted_variant_id = parts[1] if len(parts) > 1 else None
                                logger.info(f"📦 ORDER_CONFIRM: Extracted from concatenated ID: product_id={product_id}, variant_id={extracted_variant_id}")
                            else:
                                extracted_variant_id = None
                            
                            # Validate base product_id UUID
                            try:
                                uuid.UUID(str(product_id))
                            except (ValueError, TypeError):
                                logger.warning(f"📦 ORDER_CONFIRM: Invalid product_id UUID: {product_id}, skipping")
                                continue
                            
                            # CRITICAL: Sanitize variant_id - must be valid UUID or None
                            # Prefer item's variant_id, fallback to extracted
                            raw_variant_id = item.get("variant_id") or extracted_variant_id
                            sanitized_variant_id = None
                            if raw_variant_id:
                                # Check if it's a valid UUID (not semantic like "Free Size_Blue")
                                try:
                                    uuid.UUID(str(raw_variant_id))
                                    sanitized_variant_id = raw_variant_id
                                except (ValueError, TypeError):
                                    # Invalid UUID - likely semantic ID from legacy state
                                    logger.warning(f"📦 ORDER_CONFIRM: Invalid variant_id '{raw_variant_id}' - ignoring (not UUID)")
                                    sanitized_variant_id = None
                            
                            stock_items.append(StockItem(
                                product_id=product_id,
                                name=item.get("name", "Item"),
                                quantity=item.get("quantity", 1),
                                variant_id=sanitized_variant_id,
                                size=item.get("size"),
                            ))
                    
                    if stock_items:
                        # DEBUG: Log the business_owner_id and stock items for order confirmation
                        logger.info(f"📦 ORDER_CONFIRM: Using business_owner_id={business_owner_id}")
                        for idx, si in enumerate(stock_items):
                            logger.info(f"📦 ORDER_CONFIRM DEBUG [{idx}]: product_id={si.product_id}, variant_id={si.variant_id}, size={si.size}, qty={si.quantity}, name={si.name}")
                        
                        # ═══════════════════════════════════════════════════════════════
                        # SAFETY ASSERTION: Double-check guard wasn't bypassed
                        # ═══════════════════════════════════════════════════════════════
                        assert not state.collected_fields.get("pre_payment_reservation_ids"), \
                            "BUG: Reached ORDER_CONFIRM reservation code after pre_payment_reservation_ids already exists"
                        
                        # 🚨 CALL PATH DEBUG LOGGING (remove after bug is confirmed fixed)
                        logger.info(
                            "🚨 ORDER_CONFIRM_RESERVATION_CALL_PATH",
                            extra={
                                "user_id": user_id,
                                "flow_status": str(state.flow_status) if state else "no_state",
                                "has_pre_payment": bool(state.collected_fields.get("pre_payment_reservation_ids")),
                                "stack": "\n".join(traceback.format_stack()[-6:])
                            }
                        )
                        
                        # 🟡 COD/LEGACY: First and only time we touch inventory
                        logger.info(f"📦 🟡 ORDER_CONFIRM: COD/legacy flow - reserving now")
                        
                        reservation_result = inventory.validate_and_reserve(
                            user_id=business_owner_id,
                            items=stock_items,
                            source='whatsapp_ai',
                            session_id=f"ai_brain_{user_id}",
                        )
                        
                        # INVARIANT ASSERTION: Order MUST NOT be created without reservation
                        if not reservation_result.success:
                            logger.error(
                                f"📦 RESERVATION_GATE_BLOCKED: Cannot create order without reservation",
                                extra={"user_id": user_id, "items": [i.name for i in stock_items]}
                            )
                            return {
                                "reply": reservation_result.message or "Sorry, some items are out of stock.",
                                "intent": "stock_unavailable",
                                "confidence": 1.0,
                                "needs_human": False,
                                "suggested_actions": ["Browse products", "Contact us"],
                                "metadata": {
                                    "generation_method": "reservation_gate_blocked",
                                    "error": "stock_reservation_failed"
                                }
                            }
                        
                        local_reservation_ids = reservation_result.reservation_ids
                        logger.info(f"📦 🟡 RESERVED (new): {len(local_reservation_ids)} items reserved")
                    
                except ImportError as e:
                    logger.warning(f"📦 Inventory service not available: {e}")
                    # Continue without reservation for backwards compatibility
                    # TODO: Make this a hard gate once inventory service is always available
                except Exception as e:
                    logger.error(f"📦 RESERVATION_ERROR: {e}", exc_info=True)
                    return {
                        "reply": "Sorry, we could not verify stock availability. Please try again.",
                        "intent": "stock_error",
                        "confidence": 1.0,
                        "needs_human": False,
                        "suggested_actions": ["Try again", "Contact us"],
                        "metadata": {"error": str(e)}
                    }
            
            # =================================================================
            # PERSIST ORDER VIA ORDER SERVICE
            # =================================================================
            try:
                from services.order_service import get_order_service
                from domain.schemas import OrderCreate, OrderItem, OrderSource
                from domain.exceptions import DuplicateOrderError
                import hashlib
                import json
                
                # Build OrderItem objects with stable product references
                order_items = []
                for item in items:
                    order_items.append(OrderItem(
                        name=item.get("name", "Unknown"),
                        quantity=item.get("quantity", 1),
                        product_id=item.get("product_id"),
                        variant_id=item.get("variant_id"),
                        variant_display=item.get("variant_display"),
                        price=item.get("price"),
                        sku=item.get("sku"),
                        size=item.get("size"),
                        color=item.get("color"),
                    ))
                
                # =============================================================
                # BULLETPROOF IDEMPOTENCY KEY GENERATION
                # Includes: time window (5 min) + full payload hash (size, color, qty)
                # =============================================================
                from datetime import datetime as dt_module
                
                # 5-minute time window bucket (same order can be placed again after 5 min)
                now = dt_module.utcnow()
                window_bucket = now.replace(
                    minute=(now.minute // 5) * 5,
                    second=0,
                    microsecond=0
                )
                
                # Full payload for collision detection (includes variants: size, color)
                payload_for_hash = {
                    "user_id": user_id,
                    "business": business_owner_id,
                    "phone": customer_phone,
                    "items": sorted([{
                        "n": i.get("name", "").lower().strip(),
                        "q": i.get("quantity", 1),
                        "s": i.get("size"),      # Include size for collision detection
                        "c": i.get("color"),     # Include color for collision detection
                    } for i in items], key=lambda x: x["n"])
                }
                request_hash = hashlib.sha256(
                    json.dumps(payload_for_hash, sort_keys=True).encode()
                ).hexdigest()[:16]
                
                # Idempotency key = scope + time window + payload hash
                idempotency_key = f"order:create:{window_bucket.strftime('%Y%m%d%H%M')}_{request_hash}"
                
                # Create order via service
                order_data = OrderCreate(
                    user_id=business_owner_id,
                    customer_name=customer_name,
                    customer_phone=customer_phone if customer_phone else "0000000000",  # Fallback for validation
                    customer_address=customer_address,  # Now stored in dedicated column
                    items=order_items,
                    source=OrderSource.AI,
                    notes=notes,
                    idempotency_key=idempotency_key,
                )
                
                order_service = get_order_service(self.supabase_client)
                # Pass reservation IDs to confirm stock atomically with order
                created_order = order_service.create_order(
                    order_data,
                    reservation_ids=local_reservation_ids if local_reservation_ids else None
                )
                
                # SUCCESS: Build response from PERSISTED record
                order_id = created_order.id[:8].upper()
                
                # Format items from persisted order
                items_text = "\n".join([
                    f"• {item.get('quantity', 1)}x {item.get('name', 'Item')}" + 
                    (f" ({item.get('variant_display')})" if item.get('variant_display') else "")
                    for item in created_order.items
                ])
                
                response_text = (
                    f"*Order Confirmed 💚*\n"
                    f"Order ID: {order_id}\n"
                    f"━━━━━━━━━━━━━━━━━\n\n"
                    f"*Products:*\n{items_text}\n\n"
                    f"*Total Items: {created_order.total_quantity}*\n\n"
                    f"*Customer Details:*\n"
                    f"name: {created_order.customer_name}\n"
                    f"phone number: {created_order.customer_phone}\n"
                    + (f"address: {customer_address}\n" if customer_address else "") +
                    f"━━━━━━━━━━━━━━━━━\n\n"
                    f"Your order has been received! We'll process it shortly. 🎉"
                )
                
                # LOG SUCCESS with idempotency key for auditing
                logger.info(
                    f"📦 ORDER PERSISTED",
                    extra={
                        "order_id": created_order.id,
                        "idempotency_key": idempotency_key,
                        "customer": customer_name,
                        "items_count": len(items),
                        "request_hash": request_hash,
                    }
                )
                
                # =====================================================
                # ENTERPRISE: Store order info for context-aware tracking
                # This enables the 3-layer intent system to recognize
                # future "where is my order" queries
                # =====================================================
                from datetime import datetime, timezone
                state.collect_field("_last_order_completed_at", datetime.now(timezone.utc).isoformat())
                state.collect_field("_last_order_id", created_order.id)
                state.collect_field("_last_order_status", "created")
                state.collect_field("_last_order_items", [
                    {"name": item.get("name", "Item"), "quantity": item.get("quantity", 1)}
                    for item in created_order.items
                ])
                logger.info(f"🧠 Stored order context for tracking: order_id={created_order.id}")

                
            except DuplicateOrderError as dup_error:
                # =============================================================
                # DUPLICATE ORDER DETECTED - Clear feedback to user
                # =============================================================
                logger.warning(
                    f"📦 DUPLICATE ORDER REJECTED",
                    extra={
                        "idempotency_key": idempotency_key if 'idempotency_key' in dir() else "unknown",
                        "customer": customer_name,
                        "phone": customer_phone,
                        "reason": str(dup_error),
                    }
                )
                
                response_text = (
                    "⚠️ *Order Already Placed*\n\n"
                    "It looks like you already submitted this exact order recently.\n\n"
                    "If you want to order again, please:\n"
                    "• Change the quantity, OR\n"
                    "• Wait a few minutes and try again\n\n"
                    "If you believe this is an error, please contact the business directly."
                )
                order_id = "DUPLICATE"
                
            except Exception as e:
                logger.error(f"📦 Order persistence FAILED: {e}")
                # Store order attempt for recovery
                logger.error(f"📦 FAILED ORDER DATA: customer={customer_name}, phone={customer_phone}, items={items}, business={business_owner_id}")
                
                # Format items for display
                items_text = ", ".join([f"{item['quantity']}x {item['name']}" for item in items])
                
                response_text = (
                    f"⚠️ *Order Received*\n\n"
                    f"Thank you, {customer_name}! Your order for {items_text} has been received.\n\n"
                    f"We're processing it now but experienced a minor delay. "
                    f"The business owner has been notified and will confirm shortly.\n\n"
                    f"If you don't hear back within 30 minutes, please contact the business directly."
                )
                order_id = "PENDING"
            
            # Clean up flow
            self.conversation_manager.cancel_flow(user_id)
            
            self.conversation_manager.add_message(user_id, "user", "yes")
            self.conversation_manager.add_message(user_id, "assistant", response_text)
            
            return {
                "reply": response_text,
                "intent": "order_completed",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["Browse more", "Track order"],
                "metadata": {
                    "generation_method": "order_completed",
                    "order_id": order_id if order_id != "PENDING" else None,
                    "order_items": items,
                    "customer_name": customer_name,
                    "customer_phone": customer_phone,
                    "customer_address": customer_address,
                    "custom_fields": custom_fields,
                    "persisted": order_id != "PENDING"
                }
            }
            
        finally:
            # Release lock
            state._persistence_locked = False
    
    def _generate_order_field_question(self, field: Dict) -> str:
        """Generate a conversational question for an order field."""
        field_id = field.get("id", "")
        label = field.get("label", "information")
        field_type = field.get("type", "text")
        required = field.get("required", False)
        
        # Custom questions for common fields
        questions = {
            "name": "May I have your name for this order?",
            "phone": "What's your phone number?",
            "address": "Enter your delivery address with PIN code.",
            "email": "What's your email address?",
        }
        
        if field_id in questions:
            return questions[field_id]
        
        # Generate question based on type
        optional_text = " (optional)" if not required else ""
        if field_type == "phone":
            return f"What's your {label.lower()}?{optional_text}"
        elif field_type == "email":
            return f"What's your {label.lower()}?{optional_text}"
        elif field_type == "textarea":
            return f"Please provide your {label.lower()}{optional_text}:"
        else:
            return f"What is your {label.lower()}?{optional_text}"
    
    def _validate_order_field(self, field: Dict, value: str) -> Dict:
        """Validate an order field response."""
        field_id = field.get("id", "")
        field_type = field.get("type", "text")
        required = field.get("required", False)
        
        # Handle skip for optional fields
        if value.lower() in ["skip", "none", "na", "n/a", "-"]:
            if not required:
                return {"valid": True, "value": ""}
            else:
                return {"valid": False, "error": "This field is required. Please provide the information."}
        
        # Basic validation by type
        if field_type == "phone":
            # Accept various phone formats
            cleaned = re.sub(r'[^\d+]', '', value)
            if len(cleaned) >= 10:
                return {"valid": True, "value": value}
            return {"valid": False, "error": "Please provide a valid phone number (at least 10 digits)."}
        
        elif field_type == "email":
            if "@" in value and "." in value.split("@")[-1]:
                return {"valid": True, "value": value}
            return {"valid": False, "error": "Please provide a valid email address."}
        
        # Text and textarea - just check minimum length for required fields
        if required and len(value.strip()) < 2:
            return {"valid": False, "error": "Please provide a valid response."}
        
        return {"valid": True, "value": value}
    
    def _show_order_confirmation(
        self,
        user_id: str,
        state: ConversationState,
        last_message: str
    ) -> Dict[str, Any]:
        """Show order summary and ask for confirmation."""
        items = state.collected_fields.get("items", [])
        
        # Build items text with price display (including offer prices)
        items_lines = []
        total_amount = 0
        
        for item in items:
            item_name = item.get('name', 'Item')
            quantity = item.get('quantity', 1)
            price = item.get('price', 0)
            original_price = item.get('original_price')
            variant_display = item.get('variant_display', '')
            
            # Calculate line total
            line_total = float(price) * quantity if price else 0
            total_amount += line_total
            
            # Build the item line in new format: name, price, color, size
            item_lines = [f"name: {item_name}"]
            
            # Add price
            if price:
                item_lines.append(f"price: ₹{int(float(price))}")
            
            # Extract color and size from variant_display or item fields
            item_color = item.get('color', '')
            item_size = item.get('size', '')
            
            # If variant_display exists, try to parse it
            if variant_display and not item_color and not item_size:
                # variant_display format: "Size: M, Color: White" or "Color: White" or "Size: M"
                if "Color:" in variant_display:
                    try:
                        color_part = variant_display.split("Color:")[1].split(",")[0].strip()
                        item_color = color_part
                    except:
                        pass
                if "Size:" in variant_display:
                    try:
                        size_part = variant_display.split("Size:")[1].split(",")[0].strip()
                        item_size = size_part
                    except:
                        pass
            
            # Add color if available
            if item_color:
                item_lines.append(f"color: {item_color}")
            
            # Add size if available
            if item_size:
                item_lines.append(f"size: {item_size}")
            
            items_lines.append("\n".join(item_lines))
        
        items_text = "\n".join(items_lines)
        
        # Build details from collected fields
        # FIX: Use flow_config instead of collected_fields to prevent data loss after field edit
        # _order_fields gets deleted after first confirmation, but flow_config persists
        order_fields = state.flow_config.get("order_fields", [])
        if not order_fields:
            # Fallback to collected_fields if flow_config doesn't have it yet
            order_fields = state.collected_fields.get("_order_fields", [])
        
        details_lines = []
        
        for field in order_fields:
            field_id = field.get("id")
            label = field.get("label", field_id.title())
            value = state.collected_fields.get(field_id, "")
            if value:
                details_lines.append(f"{label}: {value}")
        
        details_text = "\n".join(details_lines)
        
        # CRITICAL FIX: Clear field collection state to prevent interference with confirmation
        # This fixes bug where "yes" was being processed as phone number input
        if "_current_field_index" in state.collected_fields:
            del state.collected_fields["_current_field_index"]
        # NOTE: Don't delete _order_fields here - it's needed for list display
        # Only delete it if we're sure we won't need it again
        
        state.flow_status = FlowStatus.AWAITING_CONFIRMATION
        
        # CRITICAL: Persist state before showing confirmation (prevents loss during button send)
        self.conversation_manager.persist_state(user_id)
        logger.info(f"📋 Order confirmation state persisted for {user_id[:12]}... (awaiting confirmation, field collection cleared)")
        
        self.conversation_manager.add_message(user_id, "user", last_message)
        
        # Build total line if we have amounts
        total_line = ""
        if total_amount > 0:
            total_line = f"\nTotal: ₹{int(total_amount)}"
        
        # Build customer details section with title and line separator
        customer_details_section = ""
        if details_text:
            customer_details_section = f"\n\nCustomer Details\n━━━━━━━━━━━━━━━━━\n{details_text}"
        
        response_text = (
            f"━━━━━━━━━━━━━━━━━\n\n"
            f"Products:\n\n{items_text}{total_line}{customer_details_section}\n\n"
            f"Would you like to confirm this order?"
        )
        self.conversation_manager.add_message(user_id, "assistant", response_text)
        
        # Build list sections with ONLY edit fields (no confirm/cancel)
        list_rows = []
        
        # Add editable fields to the list
        for field in order_fields:
            field_id = field.get("id")
            label = field.get("label", field_id.title())
            current_value = state.collected_fields.get(field_id, "Not provided")
            
            # Truncate long values for display
            display_value = current_value if len(str(current_value)) <= 50 else str(current_value)[:47] + "..."
            
            list_rows.append({
                "id": f"edit_{field_id}",
                "title": f"{label[:20]}",  # No emoji, cleaner
                "description": display_value[:72]  # WhatsApp limit
            })
        
        list_sections = [{
            "title": "Edit Details",
            "rows": list_rows
        }]
        
        return {
            "reply": response_text,
            "intent": "order_confirmation",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": ["Yes, Confirm", "Edit Details", "Cancel"],
            "metadata": {
                "generation_method": "order_flow",
                "header_text": "Order Summary 💛",  # Yellow heart for order summary card only
                "footer_text": "",  # No footer text
                # Use BOTH buttons and list
                "use_buttons": True,
                "buttons": [
                    {"id": "confirm_yes", "title": "Yes, Confirm"},
                    {"id": "confirm_no", "title": "Cancel"}
                ],
                "use_list": True,
                "list_button": "Edit Details",
                "list_body_text": "Edit Details",  # Body text for list message
                "list_header_text": "",  # No header for Edit Details list message
                "list_sections": list_sections
            }
        }
    
    def _show_edit_details_menu(
        self,
        user_id: str,
        state: ConversationState,
        last_message: str
    ) -> Dict[str, Any]:
        """Show menu of editable fields (name, phone, address) using WhatsApp list message."""
        logger.info(f"✏️ Showing edit details menu for user: {user_id}")
        
        # Get current field values
        order_fields = state.flow_config.get("order_fields", [])
        
        # Build list of editable fields with current values
        editable_fields = []
        for field in order_fields:
            field_id = field.get("id")
            label = field.get("label", field_id.title())
            current_value = state.collected_fields.get(field_id, "Not provided")
            
            editable_fields.append({
                "id": field_id,
                "label": label,
                "current_value": current_value
            })
        
        # Mark that we're awaiting field selection
        state.collect_field("_awaiting_field_selection", True)
        state.collect_field("_editable_fields", editable_fields)
        
        # Persist state
        self.conversation_manager.persist_state(user_id)
        
        self.conversation_manager.add_message(user_id, "user", last_message)
        
        # Build list sections for WhatsApp List Message
        list_rows = []
        for field in editable_fields:
            field_id = field["id"]
            label = field["label"]
            current_value = field["current_value"]
            
            # Truncate long values for display
            display_value = current_value if len(str(current_value)) <= 30 else str(current_value)[:27] + "..."
            
            list_rows.append({
                "id": f"edit_{field_id}",
                "title": label[:24],  # WhatsApp limit
                "description": display_value[:72]  # WhatsApp limit
            })
        
        list_sections = [{
            "title": "Customer Details",
            "rows": list_rows
        }]
        
        response_text = ""
        
        self.conversation_manager.add_message(user_id, "assistant", response_text)
        
        return {
            "reply": response_text,
            "intent": "order_edit_menu",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": ["View Fields", "Back to Summary"],
            "metadata": {
                "generation_method": "order_edit_flow",
                "use_list": True,
                "list_button": "View Fields",
                "list_sections": list_sections,
                "header_text": "",
                "footer_text": ""
            }
        }
    
    def _handle_field_selection(
        self,
        user_id: str,
        state: ConversationState,
        message: str
    ) -> Dict[str, Any]:
        """Handle user selecting a field to edit from the menu."""
        logger.info(f"✏️ Handling field selection for user: {user_id}, message: '{message}'")
        
        # FIX: Extract only the label part if message contains "Label\nValue" format
        # WhatsApp list might send both title and description
        message_lines = message.split('\n')
        label_part = message_lines[0].strip()  # Use only first line for matching
        msg_lower = label_part.lower()
        
        # Check for "back to summary"
        if msg_lower in ["back", "back to summary", "cancel"]:
            # Clear edit mode flags
            if "_awaiting_field_selection" in state.collected_fields:
                del state.collected_fields["_awaiting_field_selection"]
            if "_editable_fields" in state.collected_fields:
                del state.collected_fields["_editable_fields"]
            
            self.conversation_manager.persist_state(user_id)
            
            # Show order confirmation again
            return self._show_order_confirmation(user_id, state, label_part)
        
        # Get editable fields
        editable_fields = state.collected_fields.get("_editable_fields", [])
        
        # Try to match the selected field
        selected_field = None
        for field in editable_fields:
            field_id = field["id"]
            label = field["label"]
            
            # Match by field ID or label (using only the label part of the message)
            if field_id in msg_lower or label.lower() in msg_lower:
                selected_field = field
                break
        
        if not selected_field:
            # Try matching by number (if user types "1", "2", etc.)
            try:
                field_index = int(label_part.strip()) - 1
                if 0 <= field_index < len(editable_fields):
                    selected_field = editable_fields[field_index]
            except ValueError:
                pass
        
        if selected_field:
            # Clear awaiting selection flag
            del state.collected_fields["_awaiting_field_selection"]
            
            # Set editing mode
            state.collect_field("_editing_field", selected_field["id"])
            state.collect_field("_editing_field_label", selected_field["label"])
            
            self.conversation_manager.persist_state(user_id)
            
            # FIX: Store only the label part for logging, not the full message with value
            self.conversation_manager.add_message(user_id, "user", label_part)
            
            current_value = selected_field["current_value"]
            response_text = (
                f"✏️ *Edit {selected_field['label']}*\n\n"
                f"Current value: *{current_value}*\n\n"
                f"Please enter the new value:"
            )
            
            self.conversation_manager.add_message(user_id, "assistant", response_text)
            
            return {
                "reply": response_text,
                "intent": "order_field_editing",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["Cancel"],
                "metadata": {
                    "generation_method": "order_edit_flow",
                    "editing_field": selected_field["id"]
                }
            }
        else:
            # Invalid selection
            self.conversation_manager.add_message(user_id, "user", message)
            response_text = "Please select a valid field to edit, or type 'Back to Summary'."
            self.conversation_manager.add_message(user_id, "assistant", response_text)
            
            return {
                "reply": response_text,
                "intent": "order_edit_invalid_selection",
                "confidence": 0.8,
                "needs_human": False,
                "suggested_actions": ["Back to Summary"],
                "metadata": {"generation_method": "order_edit_flow"}
            }
    
    def _handle_field_edit(
        self,
        user_id: str,
        state: ConversationState,
        message: str,
        business_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle the actual editing of a field value."""
        logger.info(f"✏️ Handling field edit for user: {user_id}, message: '{message}'")
        
        msg_lower = message.lower().strip()
        
        # Check for cancel
        if msg_lower in ["cancel", "back"]:
            # Clear editing mode
            if "_editing_field" in state.collected_fields:
                del state.collected_fields["_editing_field"]
            if "_editing_field_label" in state.collected_fields:
                del state.collected_fields["_editing_field_label"]
            
            self.conversation_manager.persist_state(user_id)
            
            # Go back to edit menu
            return self._show_edit_details_menu(user_id, state, message)
        
        # Get the field being edited
        field_id = state.collected_fields.get("_editing_field")
        field_label = state.collected_fields.get("_editing_field_label", field_id)
        
        # Find the field config for validation
        order_fields = state.flow_config.get("order_fields", [])
        field_config = None
        for field in order_fields:
            if field.get("id") == field_id:
                field_config = field
                break
        
        # Validate the new value
        if field_config:
            validation = self._validate_order_field(field_config, message.strip())
            
            if not validation.get("valid"):
                # Invalid value
                error_msg = validation.get("error", "That doesn't look right. Please try again.")
                
                self.conversation_manager.add_message(user_id, "user", message)
                response_text = f"{error_msg}\n\nPlease enter a valid {field_label.lower()}:"
                self.conversation_manager.add_message(user_id, "assistant", response_text)
                
                return {
                    "reply": response_text,
                    "intent": "order_field_edit_invalid",
                    "confidence": 0.8,
                    "needs_human": False,
                    "suggested_actions": ["Cancel"],
                    "metadata": {"generation_method": "order_edit_flow"}
                }
        
        # Update the field value
        # FIX: Extract only the value part if message contains label (from list selection)
        # WhatsApp list sends "Label\nValue" format, we only want the value
        new_value = message.strip()
        
        # If message contains newlines, it might be "Label\nValue" format
        # Extract only the value part (everything after first line if first line matches the label)
        message_lines = new_value.split('\n')
        if len(message_lines) > 1:
            field_label = state.collected_fields.get("_editing_field_label", "")
            first_line = message_lines[0].strip()
            # If first line matches the field label, use the rest as the value
            if field_label and first_line.lower() == field_label.lower():
                new_value = '\n'.join(message_lines[1:]).strip()
            # If first line doesn't match label, user might have sent just the value
            # or the value might be on the first line, so use the whole message
        
        state.collect_field(field_id, new_value)
        
        # Also update mapped fields (for compatibility)
        if field_id == "name":
            state.collect_field("customer_name", new_value)
        elif field_id == "phone":
            state.collect_field("customer_phone", new_value)
        elif field_id == "address":
            state.collect_field("customer_address", new_value)
        
        # Clear editing mode
        del state.collected_fields["_editing_field"]
        del state.collected_fields["_editing_field_label"]
        if "_editable_fields" in state.collected_fields:
            del state.collected_fields["_editable_fields"]
        
        self.conversation_manager.persist_state(user_id)
        
        self.conversation_manager.add_message(user_id, "user", message)
        
        # Show updated order confirmation
        return self._show_order_confirmation(user_id, state, message)
    
    def _start_appointment_flow(
        self,
        user_id: str,
        business_owner_id: str,
        config: Dict[str, Any],
        initial_message: str = ""
    ) -> Optional[Dict[str, Any]]:
        """
        Start a new appointment booking flow.
        
        This initializes the state machine and asks the first question.
        If the initial_message contains booking details, extract them first.
        """
        if not self.appointment_handler:
            return None
        
        # Get fields to collect from config (or use defaults)
        # Order: service → date → time → name → phone (or custom fields)
        if config.get("minimal_mode"):
            required_fields = ["service", "date", "time", "name", "phone"]
        else:
            fields = sorted(config.get("fields", []), key=lambda x: x.get("order", 0))
            required_fields = [f["id"] for f in fields]
            
            # IMPORTANT: Always include service if not already present
            # Service is commonly mentioned in natural booking requests
            if "service" not in required_fields:
                required_fields.insert(0, "service")
            
            # Ensure we have service, date, time first if they exist
            priority_order = ["service", "date", "time"]
            for field in reversed(priority_order):
                if field in required_fields:
                    required_fields.remove(field)
                    required_fields.insert(0, field)
        
        # Start the conversation flow
        logger.info(f"📅 Starting flow with required_fields: {required_fields}")
        state = self.conversation_manager.start_flow(
            user_id=user_id,
            flow_name="appointment_booking",
            required_fields=required_fields,
            config={**config, "business_owner_id": business_owner_id}
        )
        
        # =====================================================
        # SMART EXTRACTION: Try to extract data from initial message
        # =====================================================
        if initial_message:
            logger.info(f"📅 Extracting data from initial message: '{initial_message}'")
            extracted = self._extract_booking_data_from_message(initial_message)
            logger.info(f"📅 Extracted data: {extracted}")
            logger.info(f"📅 Missing fields before extraction: {state.missing_fields}")
            
            # Pre-populate any extracted fields (process in order of missing_fields)
            for field_id in list(state.missing_fields):  # Use list() to avoid modification during iteration
                if field_id in extracted:
                    value = extracted[field_id]
                    # Validate the extracted value
                    field_def = self.appointment_handler._get_field_definition(field_id, config)
                    logger.info(f"📅 Validating {field_id}: '{value}' (type: {field_def.get('type', 'text')})")
                    validation = self.appointment_handler.validate_field(field_def["type"], value)
                    
                    if validation["valid"]:
                        state.collect_field(field_id, validation["value"])
                        logger.info(f"📅 ✓ Pre-filled {field_id}: {validation['value']}")
                    else:
                        logger.info(f"📅 ✗ Validation failed for {field_id}: {validation.get('error', 'unknown')}")
        
        # Check if we still need fields
        if not state.missing_fields:
            # All fields extracted from initial message! Show confirmation
            state.flow_status = FlowStatus.AWAITING_CONFIRMATION
            confirmation_msg = self.appointment_handler._generate_confirmation(state.collected_fields)
            self.conversation_manager.add_message(user_id, "user", initial_message)
            self.conversation_manager.add_message(user_id, "assistant", confirmation_msg)
            
            return {
                "reply": confirmation_msg,
                "intent": "booking_confirmation",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["Yes, confirm", "No, cancel"],
                "metadata": {
                    "generation_method": "flow_smart_extraction",
                    "flow": "appointment_booking",
                    "extracted_fields": list(state.collected_fields.keys()),
                    "use_buttons": True,
                    "buttons": [
                        {"id": "confirm_yes", "title": "✅ Yes, Confirm"},
                        {"id": "confirm_no", "title": "❌ No, Cancel"}
                    ]
                }
            }
        
        # Get first missing field and generate question
        first_field_id = state.current_field
        first_field_def = self.appointment_handler._get_field_definition(first_field_id, config)
        
        # Check for date - if extracted, get available slots for time question
        available_slots = None
        if first_field_id == "time" and state.has_field("date"):
            available_slots = self.appointment_handler.get_available_slots(
                business_owner_id, 
                state.collected_fields["date"]
            )
            state.flow_config["_available_slots"] = available_slots
        
        question = self.appointment_handler._generate_question(
            first_field_def, 
            is_first=True, 
            available_slots=available_slots
        )
        
        # If we extracted some data, acknowledge it
        if state.collected_fields:
            extracted_summary = ", ".join([f"{k}: {v}" for k, v in state.collected_fields.items()])
            question = f"Great! I got: {extracted_summary} ✓\n\n{question}"
        
        # Add to conversation history
        self.conversation_manager.add_message(user_id, "user", initial_message)
        self.conversation_manager.add_message(user_id, "assistant", question)
        
        return {
            "reply": question,
            "intent": "booking_started",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": ["Cancel booking"],
            "metadata": {
                "generation_method": "flow_started",
                "flow": "appointment_booking",
                "current_field": first_field_id,
                "pre_extracted": list(state.collected_fields.keys())
            }
        }
    
    def _extract_booking_data_from_message(self, message: str) -> Dict[str, str]:
        """
        Extract booking information from a natural language message.
        
        Handles messages like:
        - "book appointment for haircut on 05-01-26 at 9am"
        - "I want to schedule a consultation tomorrow at 2pm"
        - "Book me in for a massage on Monday 10am"
        """
        import re
        extracted = {}
        msg_lower = message.lower()
        
        # ==========================================
        # EXTRACT SERVICE
        # ==========================================
        service_keywords = [
            "haircut", "hair cut", "facial", "massage", "manicure", "pedicure",
            "waxing", "threading", "spa", "treatment", "consultation", "checkup",
            "check up", "cleaning", "trim", "shave", "color", "coloring", "styling",
            "blowout", "blow out", "highlights", "keratin", "rebonding", "straightening",
            "appointment", "meeting", "session"
        ]
        
        # First check for "for X" pattern - more specific
        for_patterns = [
            r'for\s+(?:a\s+)?(\w+(?:\s+\w+)?)\s+(?:on|at|tomorrow|today)',  # "for haircut on", "for a facial at"
            r'for\s+(?:a\s+)?(\w+(?:\s+\w+)?)\s*$',  # "for haircut" at end
            r'book\s+(?:a\s+)?(\w+(?:\s+\w+)?)\s+(?:on|at|for)',  # "book haircut on"
        ]
        
        for pattern in for_patterns:
            for_match = re.search(pattern, msg_lower)
            if for_match:
                potential_service = for_match.group(1).strip()
                # Filter out common non-service words
                skip_words = ["a", "an", "the", "my", "me", "appointment", "booking", "slot", "time"]
                if potential_service not in skip_words and len(potential_service) > 2:
                    extracted["service"] = potential_service.title()
                    break
            if "service" in extracted:
                break
        
        # Fallback: check for known service keywords
        if "service" not in extracted:
            for keyword in service_keywords:
                if keyword in msg_lower and keyword not in ["appointment", "meeting", "session"]:
                    extracted["service"] = keyword.title()
                    break
        
        # ==========================================
        # EXTRACT DATE
        # ==========================================
        # Pattern: DD-MM-YY or DD/MM/YY or DD-MM-YYYY
        date_pattern = r'(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})'
        date_match = re.search(date_pattern, message)
        if date_match:
            extracted["date"] = date_match.group(1)
        else:
            # Natural language dates
            if "today" in msg_lower:
                from datetime import date
                extracted["date"] = date.today().strftime("%Y-%m-%d")
            elif "tomorrow" in msg_lower:
                from datetime import date, timedelta
                extracted["date"] = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # ==========================================
        # EXTRACT TIME
        # ==========================================
        # Pattern: 9am, 10:30am, 2 pm, 14:00
        time_patterns = [
            r'(\d{1,2}:\d{2}\s*(?:am|pm))',  # 10:30 AM
            r'(\d{1,2}\s*(?:am|pm))',          # 9am, 2 pm
            r'at\s+(\d{1,2}:\d{2})',           # at 14:00
            r'at\s+(\d{1,2})\s*(?:o.?clock)?', # at 9, at 9 o'clock
        ]
        
        for pattern in time_patterns:
            time_match = re.search(pattern, msg_lower)
            if time_match:
                extracted["time"] = time_match.group(1).strip()
                break
        
        # ==========================================
        # EXTRACT PHONE (if present)
        # ==========================================
        phone_match = re.search(r'\b(\d{10,})\b', message)
        if phone_match:
            extracted["phone"] = phone_match.group(1)
        
        # ==========================================
        # EXTRACT NAME (if present) - usually not in initial message
        # ==========================================
        # Names are harder to extract, skip for now
        
        return extracted

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
        logger.info(f"📅 _handle_appointment_flow called for user: {user_id}, message: '{message}'")
        
        if not self.appointment_handler:
            logger.warning("📅 No appointment_handler available")
            return None
            
        start_time = time.time()
        
        # Get business owner ID from flow config or business_data
        business_owner_id = business_data.get("business_id") or business_data.get("user_id")
        logger.info(f"📅 business_owner_id from business_data: {business_owner_id}")
        
        # Get current state to see what we're asking for
        state = self.conversation_manager.get_state(user_id)
        if not state:
            logger.warning(f"📅 No state found for user: {user_id}")
            return None
        
        logger.info(f"📅 State: active_flow={state.active_flow}, flow_status={state.flow_status}")
            
        # Get business_owner_id from flow config if available
        if state.flow_config.get("business_owner_id"):
            business_owner_id = state.flow_config["business_owner_id"]
            
        current_field = state.current_field
        
        # Check if this is a confirmation response
        msg_lower = message.lower().strip()
        logger.info(f"📅 Appointment flow - Status: {state.flow_status}, Message: '{msg_lower}'")
        
        if state.flow_status == FlowStatus.AWAITING_CONFIRMATION:
            logger.info(f"📅 Awaiting confirmation - checking user response: '{msg_lower}'")
            if msg_lower in ["yes", "confirm", "ok", "okay", "sure", "book it", "book", "haan", "ha", "ji", "y"]:
                # User confirmed - book the appointment!
                logger.info(f"📅 User confirmed! Calling _complete_booking with business_owner_id: {business_owner_id}")
                return self._complete_booking(user_id, state, business_owner_id)
            elif msg_lower in ["no", "cancel", "nahi", "nako", "na", "n"]:
                # User cancelled
                self.conversation_manager.cancel_flow(user_id)
                self.conversation_manager.add_message(user_id, "user", message)
                cancel_msg = "No problem! I've cancelled the booking. Is there anything else I can help you with? 😊"
                self.conversation_manager.add_message(user_id, "assistant", cancel_msg)
                return {
                    "reply": cancel_msg,
                    "intent": "booking_cancelled",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": ["Book again", "Services", "Contact"],
                    "metadata": {"generation_method": "flow_cancelled"}
                }
        
        # 2. Check if this is a question/interruption (Mid-flow Intelligence)
        is_interruption = False
        
        # Simple heuristic first
        if "?" in message and len(message.split()) > 3:
            is_interruption = True
        
        if is_interruption:
            # Handle the interruption with normal LLM flow (but keep state active)
            return None  # Return None to fall back to normal LLM processing
            
        # 3. Validate and process the answer
        result = self.appointment_handler.process_response(
            user_id=business_owner_id, 
            customer_phone=user_id,
            response=message,
            conversation_state=state
        )
        
        # 4. Update state based on result
        if result.get("valid"):
            # Success - update state
            if result.get("complete"):
                # All fields collected - show confirmation
                confirmation_msg = result["confirmation_message"]
                self.conversation_manager.add_message(user_id, "user", message)
                self.conversation_manager.add_message(user_id, "assistant", confirmation_msg)
                
                return {
                    "reply": confirmation_msg,
                    "intent": "booking_confirmation",
                    "confidence": 1.0,
                    "needs_human": False,
                    "suggested_actions": ["Yes, confirm", "No, cancel"],
                    "metadata": {
                        "generation_method": "flow_awaiting_confirmation",
                        "use_buttons": result.get("use_buttons", True),
                        "buttons": result.get("buttons", [
                            {"id": "confirm_yes", "title": "✅ Yes, Confirm"},
                            {"id": "confirm_no", "title": "❌ No, Cancel"}
                        ])
                    }
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
                    "suggested_actions": ["Cancel booking"],
                    "metadata": {"generation_method": "flow_next_step"}
                }
        else:
            # Validation error or conflict
            error_msg = result.get("error", "I didn't understand that.")
            retry_question = result.get("retry_question", "")
            
            if result.get("conflict"):
                # Time slot conflict - just show the error with available slots
                full_msg = error_msg
            else:
                full_msg = f"{error_msg}\n\n{retry_question}" if retry_question else error_msg
            
            self.conversation_manager.add_message(user_id, "user", message)
            self.conversation_manager.add_message(user_id, "assistant", full_msg)
            
            return {
                "reply": full_msg,
                "intent": "booking_validation_error",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["Cancel booking"],
                "metadata": {
                    "generation_method": "flow_validation_error",
                    "error": error_msg
                }
            }
    
    def _complete_booking(
        self,
        user_id: str,
        state: ConversationState,
        business_owner_id: str
    ) -> Dict[str, Any]:
        """
        Complete the booking by calling the booking API.
        """
        logger.info(f"📅 _complete_booking called for user: {user_id}")
        logger.info(f"📅 Business owner ID: {business_owner_id}")
        logger.info(f"📅 Collected fields: {state.collected_fields}")
        
        collected = state.collected_fields
        
        # Prepare booking data
        booking_args = {
            "customer_name": collected.get("name", "Customer"),
            "phone": collected.get("phone", user_id),
            "date": collected.get("date"),
            "time": collected.get("time"),
            "service": collected.get("service", "General Appointment"),
            "notes": "",
        }
        
        logger.info(f"📅 Booking args: {booking_args}")
        
        # Add any custom fields to notes
        custom_notes = []
        for key, value in collected.items():
            if key not in ["name", "phone", "date", "time", "service"]:
                custom_notes.append(f"{key}: {value}")
        if custom_notes:
            booking_args["notes"] = "\n".join(custom_notes)
        
        # Call the booking tool
        from .tools import ToolExecutor
        executor = ToolExecutor(
            business_data={"business_id": business_owner_id},
            user_id=user_id,
            business_owner_id=business_owner_id
        )
        result = executor.execute("book_appointment", booking_args)
        
        # Complete the flow
        self.conversation_manager.complete_flow(user_id)
        
        if result.success:
            success_msg = result.message
            self.conversation_manager.add_message(user_id, "assistant", success_msg)
            
            return {
                "reply": success_msg,
                "intent": "booking_complete",
                "confidence": 1.0,
                "needs_human": False,
                "suggested_actions": ["View services", "Contact us"],
                "metadata": {
                    "generation_method": "booking_success",
                    "booking": result.data.get("booking", {})
                }
            }
        else:
            error_msg = f"😔 {result.message}\n\nWould you like to try again with a different time?"
            self.conversation_manager.add_message(user_id, "assistant", error_msg)
            
            return {
                "reply": error_msg,
                "intent": "booking_failed",
                "confidence": 1.0,
                "needs_human": True,
                "suggested_actions": ["Try again", "Contact us"],
                "metadata": {
                    "generation_method": "booking_failed",
                    "error": result.message
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
