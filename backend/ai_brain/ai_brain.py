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
            logger.info(f"📋 Active flow: {flow_name}")
            
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
        # BOOKING INTENT DETECTION - Route to correct flow based on type
        # =====================================================
        # Classify whether this is an order request or appointment request
        booking_type = self._classify_booking_type(user_message, business)
        logger.info(f"📦 Booking type classification: {booking_type} for message: '{user_message[:50]}...'")
        
        if booking_type and user_id and not self.conversation_manager.is_flow_active(user_id):
            if booking_type == "order":
                # Check if order booking is enabled and start order flow
                if self._is_order_booking_enabled(biz_id):
                    flow_response = self._start_order_flow(user_id, biz_id, user_message, business)
                    if flow_response:
                        return flow_response
                else:
                    logger.info(f"📦 Order booking not enabled for business: {biz_id}")
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
    
    def _classify_booking_type(self, message: str, business_data: Dict[str, Any]) -> Optional[str]:
        """
        Classify whether a booking request is for an order or an appointment.
        
        Returns:
            "order" - Item/quantity based (t-shirt, pizza, etc.)
            "appointment" - Time/date based (haircut tomorrow, slot at 3pm)
            None - Not a booking request
        """
        msg_lower = message.lower()
        
        # Order indicators (item-based)
        order_keywords = ["order", "buy", "purchase", "want to order", "want to buy", "get me"]
        order_patterns = [
            r"\b\d+\s*(x|nos?|pieces?|items?|qty)\b",  # "2 pieces", "3x"
            r"\b(quantity|qty)\s*:?\s*\d+",
        ]
        
        # Check for product mentions from business catalog
        products = business_data.get("products_services", [])
        product_names = [p.get("name", "").lower() for p in products if isinstance(p, dict) and p.get("name")]
        has_product_mention = any(name in msg_lower for name in product_names if name and len(name) > 2)
        
        # Appointment indicators (time-based)
        appointment_keywords = ["appointment", "schedule", "slot", "time slot", "appoint"]
        time_patterns = [
            r"\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
            r"\b\d{1,2}[:/]\d{2}\b",  # Time patterns like 10:30
            r"\b\d{1,2}\s*(am|pm)\b",  # Time patterns like 10am
            r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b",  # Date patterns
        ]
        
        has_order_keyword = any(kw in msg_lower for kw in order_keywords)
        has_appointment_keyword = any(kw in msg_lower for kw in appointment_keywords)
        has_time_indicator = any(re.search(p, msg_lower) for p in time_patterns)
        has_order_quantity = any(re.search(p, msg_lower) for p in order_patterns)
        
        # Log classification factors
        logger.info(f"📦 Classification factors: order_kw={has_order_keyword}, appt_kw={has_appointment_keyword}, "
                   f"time={has_time_indicator}, qty={has_order_quantity}, product={has_product_mention}")
        
        # Decision logic (order takes precedence when clear signals)
        if has_order_keyword or has_order_quantity:
            return "order"
        if has_appointment_keyword:
            return "appointment"
        if has_time_indicator:
            return "appointment"
        if has_product_mention and not has_time_indicator:
            # Product mentioned without time = likely order
            return "order"
        if "book" in msg_lower:
            # Generic "book" - check context
            if has_product_mention:
                return "order"
            # Default "book" to appointment (traditional semantics)
            return "appointment"
        
        return None
    
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
            {"id": "notes", "label": "Order Notes", "type": "textarea", "required": False, "order": 4},
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
                
                # If minimal mode, only use name and phone
                if minimal_mode:
                    fields = [f for f in fields if f.get("id") in ["name", "phone"]]
                
                return {
                    "fields": sorted(fields, key=lambda x: x.get("order", 0)),
                    "minimal_mode": minimal_mode
                }
            
            return {"fields": default_fields, "minimal_mode": False}
            
        except Exception as e:
            logger.warning(f"📦 Failed to get order config: {e}")
            return {"fields": default_fields, "minimal_mode": False}
    
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
            # Product mentioned - check for variants
            product_name = mentioned_product.get("name", "item")
            product_id = mentioned_product.get("id") or mentioned_product.get("sku") or product_name
            product_price = mentioned_product.get("price", "")
            sizes = mentioned_product.get("sizes", [])
            colors = mentioned_product.get("colors", [])
            
            price_str = f" (₹{product_price})" if product_price else ""
            
            # Store full product info
            state.collect_field("pending_item", product_name)
            state.collect_field("pending_product_id", product_id)
            state.collect_field("pending_product_data", mentioned_product)
            
            # Check if we need variant selection
            if sizes:
                state.collect_field("_needs_size", True)
                state.collect_field("_available_sizes", sizes)
                size_list = ", ".join(sizes[:6])
                response_text = (
                    f"Great choice! 🎉 *{product_name}*{price_str}\n\n"
                    f"Available sizes: {size_list}\n\n"
                    f"Which size would you like?"
                )
                suggested_actions = sizes[:4] + ["Cancel"]
            elif colors:
                state.collect_field("_needs_color", True)
                state.collect_field("_available_colors", colors)
                color_list = ", ".join(colors[:6])
                response_text = (
                    f"Great choice! 🎉 *{product_name}*{price_str}\n\n"
                    f"Available colors: {color_list}\n\n"
                    f"Which color would you like?"
                )
                suggested_actions = colors[:4] + ["Cancel"]
            else:
                response_text = (
                    f"Great choice! 🎉 You want to order *{product_name}*{price_str}.\n\n"
                    f"How many would you like to order?"
                )
                suggested_actions = ["1", "2", "3", "Cancel"]
        
        elif len(categories) > 1:
            # Multiple categories - show category selection first
            state.collect_field("awaiting_category", True)
            state.collect_field("_available_categories", categories)
            header_text = "🛒 Place an Order"
            use_list = False
            list_sections = None
            
            if len(categories) > 3:
                # More than 3 categories - use WhatsApp List Message (menu picker)
                use_list = True
                response_text = "What would you like to order today?\n\nTap the button below to see all categories."
                suggested_actions = ["View Categories"]
                
                # Build list sections for WhatsApp List Message
                list_sections = [{
                    "title": "Categories",
                    "rows": [
                        {"id": f"cat_{i}_{cat.replace(' ', '_').lower()[:20]}", "title": cat[:24]}
                        for i, cat in enumerate(categories[:10])  # WhatsApp max 10 items
                    ]
                }]
            else:
                # 3 or fewer categories - show all as reply buttons
                suggested_actions = categories[:3]
                response_text = "What would you like to order today?\n\nSelect a category to browse our products."
        
        elif products:
            # Single or no category - show products directly
            response_text, suggested_actions, product_meta = self._format_product_list(products[:8], state)
        
        else:
            response_text = (
                f"📦 I'd be happy to help you place an order!\n\n"
                f"What would you like to order today?"
            )
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
            "header_text": header_text if 'header_text' in dir() else "🛒 Place an Order",
            "footer_text": "Tap to continue",
            **product_meta,  # Include product_cards if present
        }
        
        if 'use_list' in dir() and use_list and list_sections:
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
    
    def _format_product_list(self, products: List[Dict], state) -> tuple:
        """Format product list with detailed info and image metadata for WhatsApp rendering.
        
        Returns:
            tuple: (response_text, suggested_actions, metadata_with_product_cards)
        """
        product_lines = []
        product_map = {}
        product_cards = []  # For WhatsApp image rendering
        
        for i, p in enumerate(products):
            if not isinstance(p, dict):
                continue
            name = p.get('name', 'Item')
            price = p.get('price', 'N/A')
            product_id = p.get('id') or p.get('sku') or name
            # Handle both camelCase (imageUrl) and snake_case (image_url) for compatibility
            # with different data sources (Firestore uses camelCase, some API calls use snake_case)
            image_url = p.get('imageUrl') or p.get('image_url') or p.get('image', '')
            
            # Build product card for WhatsApp image messages
            product_cards.append({
                'index': i + 1,
                'name': name,
                'price': price,
                'product_id': product_id,
                'image_url': image_url if image_url and not image_url.startswith('data:') else '',
                'colors': p.get('colors', [])[:5],
                'sizes': p.get('sizes', [])[:6],
            })
            
            # Build text entry (WITHOUT raw URL - images sent separately)
            lines = []
            lines.append(f"*{i+1}. {name}* - ₹{price}")
            
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
            product_map[str(i+1)] = p
            product_map[name.lower()] = p
        
        state.collect_field("awaiting_selection", True)
        state.collect_field("_product_map", product_map)
        state.collect_field("_available_products", [p.get('name') for p in products if isinstance(p, dict)])
        
        product_list = "\n".join(product_lines)
        response_text = (
            f"📦 I'd be happy to help you place an order!\n\n"
            f"Here's what we have:\n{product_list}\n\n"
            f"Reply with a number or product name.\n"
        )
        suggested_actions = ["1", "2", "Cancel order"]
        
        # Log product cards with image info for debugging
        for card in product_cards:
            img_status = "✅ HAS IMAGE" if card.get('image_url') else "❌ NO IMAGE"
            logger.info(f"🖼️ Product card: {card.get('name')} - {img_status} - URL: {card.get('image_url', 'None')[:50] if card.get('image_url') else 'None'}...")
        
        # Return with product_cards for image rendering
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
        
        # Check for confirmation response
        if state.flow_status == FlowStatus.AWAITING_CONFIRMATION:
            if msg_lower in ["yes", "confirm", "ok", "okay", "sure", "y", "haan", "ha", "ji"]:
                # User confirmed - complete the order
                return self._complete_order(user_id, state, business_data)
            elif msg_lower in ["no", "cancel", "nahi", "nako", "na", "n"]:
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
        
        # =====================================================
        # STEP 0: Handle category selection
        # =====================================================
        if state.collected_fields.get("awaiting_category"):
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
            
            # Try direct match
            for size in sizes:
                if size.lower() == msg_lower or msg_lower in size.lower():
                    matched_size = size
                    break
            
            if matched_size:
                del state.collected_fields["_needs_size"]
                del state.collected_fields["_available_sizes"]
                state.collect_field("selected_size", matched_size)
                
                # Check if color selection needed
                product_data = state.collected_fields.get("pending_product_data", {})
                colors = product_data.get("colors", [])
                
                if colors:
                    state.collect_field("_needs_color", True)
                    state.collect_field("_available_colors", colors)
                    color_list = ", ".join(colors[:6])
                    response_text = f"Size *{matched_size}* selected. ✓\n\nAvailable colors: {color_list}\n\nWhich color would you like?"
                    suggested_actions = colors[:4] + ["Cancel"]
                else:
                    response_text = f"Size *{matched_size}* selected. ✓\n\nHow many would you like to order?"
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
                    "metadata": {"generation_method": "order_flow", "size": matched_size}
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
            
            for color in colors:
                if color.lower() == msg_lower or msg_lower in color.lower():
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
                    
                    # Check for variants
                    sizes = matched_product_data.get("sizes", [])
                    colors = matched_product_data.get("colors", [])
                    
                    if sizes:
                        state.collect_field("_needs_size", True)
                        state.collect_field("_available_sizes", sizes)
                        size_list = ", ".join(sizes[:6])
                        response_text = f"Great choice! 🎉 *{matched_product}*\n\nAvailable sizes: {size_list}\n\nWhich size would you like?"
                        suggested_actions = sizes[:4] + ["Cancel"]
                    elif colors:
                        state.collect_field("_needs_color", True)
                        state.collect_field("_available_colors", colors)
                        color_list = ", ".join(colors[:6])
                        response_text = f"Great choice! 🎉 *{matched_product}*\n\nAvailable colors: {color_list}\n\nWhich color would you like?"
                        suggested_actions = colors[:4] + ["Cancel"]
                    else:
                        response_text = f"Great choice! 🎉 You want to order *{matched_product}*.\n\nHow many would you like?"
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
        # =====================================================
        pending_item = state.collected_fields.get("pending_item")
        if pending_item and not state.collected_fields.get("quantity"):
            # Try to extract quantity
            qty_match = re.search(r'\b(\d+)\b', message)
            if qty_match:
                quantity = int(qty_match.group(1))
                if quantity > 0 and quantity <= 100:
                    state.collect_field("quantity", quantity)
                    
                    # Build complete item with stable product references
                    product_data = state.collected_fields.get("pending_product_data", {})
                    item = {
                        "name": pending_item,
                        "quantity": quantity,
                        "product_id": state.collected_fields.get("pending_product_id") or product_data.get("id") or product_data.get("sku"),
                        "variant_id": None,
                        "variant_display": state.collected_fields.get("variant_display"),
                        "price": product_data.get("price"),
                        "sku": product_data.get("sku"),
                    }
                    
                    # Build variant_id from size/color
                    size = state.collected_fields.get("selected_size")
                    color = state.collected_fields.get("selected_color")
                    if size and color:
                        item["variant_id"] = f"{size}_{color}"
                        if not item["variant_display"]:
                            item["variant_display"] = f"Size: {size}, Color: {color}"
                    elif size:
                        item["variant_id"] = size
                        if not item["variant_display"]:
                            item["variant_display"] = f"Size: {size}"
                    elif color:
                        item["variant_id"] = color
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
                        response_text = f"Great! {quantity}x {pending_item} added. ✓\n\n{question}"
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
    
    def _complete_order(
        self,
        user_id: str,
        state: ConversationState,
        business_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Complete the order after user confirmation.
        
        Production safeguards:
        - State lock to prevent mutation during persistence
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
        
        # Set lock
        state._persistence_locked = True
        
        try:
            items = state.collected_fields.get("items", [])
            customer_name = state.collected_fields.get("customer_name", "Customer")
            customer_phone = state.collected_fields.get("customer_phone", "")
            customer_address = state.collected_fields.get("customer_address", "")
            business_owner_id = state.flow_config.get("business_owner_id", "")
            
            # Log order details for debugging
            logger.info(f"📦 Order details - business_owner_id: {business_owner_id}, customer: {customer_name}, phone: {customer_phone}, items: {len(items)}")
            
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
            
            # Build notes from address and custom fields
            notes_parts = []
            if customer_address:
                notes_parts.append(f"Address: {customer_address}")
            for key, value in custom_fields.items():
                notes_parts.append(f"{key}: {value}")
            notes = " | ".join(notes_parts) if notes_parts else None
            
            # =================================================================
            # PERSIST ORDER VIA ORDER SERVICE
            # =================================================================
            try:
                from services.order_service import get_order_service
                from domain.schemas import OrderCreate, OrderItem, OrderSource
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
                    ))
                
                # Generate deterministic idempotency key
                # Based on: user_id + customer_phone + product fingerprint
                fingerprint_data = {
                    "user_id": user_id,
                    "business": business_owner_id,
                    "phone": customer_phone,
                    "items": sorted([{"n": i.get("name", "").lower(), "q": i.get("quantity", 1)} for i in items], key=lambda x: x["n"])
                }
                idempotency_key = f"ai_order_{hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True).encode()).hexdigest()[:24]}"
                
                # Create order via service
                order_data = OrderCreate(
                    user_id=business_owner_id,
                    customer_name=customer_name,
                    customer_phone=customer_phone if customer_phone else "0000000000",  # Fallback for validation
                    items=order_items,
                    source=OrderSource.AI,
                    notes=notes,
                    idempotency_key=idempotency_key,
                )
                
                order_service = get_order_service(self.supabase_client)
                created_order = order_service.create_order(order_data)
                
                # SUCCESS: Build response from PERSISTED record
                order_id = created_order.id[:8].upper()
                
                # Format items from persisted order
                items_text = "\n".join([
                    f"• {item.get('quantity', 1)}x {item.get('name', 'Item')}" + 
                    (f" ({item.get('variant_display')})" if item.get('variant_display') else "")
                    for item in created_order.items
                ])
                
                response_text = (
                    f"✅ *Order Confirmed!*\n\n"
                    f"📋 *Order #{order_id}*\n"
                    f"━━━━━━━━━━━━━━━━━\n\n"
                    f"*Items:*\n{items_text}\n\n"
                    f"*Customer:*\n"
                    f"👤 {created_order.customer_name}\n"
                    f"📱 {created_order.customer_phone}\n"
                    + (f"📍 {customer_address}\n" if customer_address else "") +
                    f"\n*Total Items: {created_order.total_quantity}*\n\n"
                    f"Your order has been received! We'll process it shortly. 🎉"
                )
                
                logger.info(f"📦 ORDER PERSISTED: id={created_order.id}, customer={customer_name}, items={len(items)}")
                
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
            "address": "Where should we deliver this order? (Please provide your full address)",
            "email": "What's your email address?",
            "notes": "Any special instructions or notes for your order? (Type 'skip' if none)",
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
        items_text = "\n".join([f"• {item['quantity']}x {item['name']}" for item in items])
        
        # Build details from collected fields
        order_fields = state.collected_fields.get("_order_fields", [])
        details_lines = []
        
        for field in order_fields:
            field_id = field.get("id")
            label = field.get("label", field_id.title())
            value = state.collected_fields.get(field_id, "")
            if value:
                details_lines.append(f"*{label}:* {value}")
        
        details_text = "\n".join(details_lines)
        
        state.flow_status = FlowStatus.AWAITING_CONFIRMATION
        
        # CRITICAL: Persist state before showing confirmation (prevents loss during button send)
        self.conversation_manager.persist_state(user_id)
        logger.info(f"📋 Order confirmation state persisted for {user_id[:12]}... (awaiting confirmation)")
        
        self.conversation_manager.add_message(user_id, "user", last_message)
        
        response_text = (
            f"📋 *Order Summary*\n\n"
            f"{items_text}\n\n"
            f"{details_text}\n\n"
            f"Would you like to confirm this order?"
        )
        self.conversation_manager.add_message(user_id, "assistant", response_text)
        
        return {
            "reply": response_text,
            "intent": "order_confirmation",
            "confidence": 1.0,
            "needs_human": False,
            "suggested_actions": ["Yes, confirm", "No, cancel"],
            "metadata": {
                "generation_method": "order_flow",
                "use_buttons": True,
                "buttons": [
                    {"id": "confirm_yes", "title": "✅ Yes, Confirm"},
                    {"id": "confirm_no", "title": "❌ No, Cancel"}
                ]
            }
        }
    
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
