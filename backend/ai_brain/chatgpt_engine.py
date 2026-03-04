"""
Core ChatGPT Engine for AI Brain — v3.0.

Enterprise features:
- Dual-model architecture (gpt-4o-mini classification, gpt-4o generation)
- Response Style Engine (SHORT/MEDIUM/LONG dynamic adjustment)
- Smart Clarification Layer (ask instead of guess)
- Response Self-Check Layer (quality validation)
- Confidence-based model escalation
- Single-call optimization for simple queries
"""

import json
import re
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from .config import AIBrainConfig, default_config
from .intents import IntentType
from .prompts import (
    SYSTEM_PROMPT_INTENT_CLASSIFIER,
    build_dynamic_prompt,
    build_full_prompt,
    get_confidence_action,
    SAFETY_FILTER_PROMPT,
)
from .tools import TOOL_SCHEMAS, ToolExecutor, ToolResult

logger = logging.getLogger('reviseit.engine')


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class IntentResult:
    """Result from intent classification."""
    intent: IntentType
    confidence: float
    language: str
    entities: Dict[str, Any]
    needs_clarification: bool
    clarification_question: Optional[str]
    raw_response: Dict[str, Any]


@dataclass
class GenerationResult:
    """Result from response generation."""
    reply: str
    intent: IntentType
    confidence: float
    tool_called: Optional[str]
    tool_result: Optional[Dict[str, Any]]
    needs_human: bool
    language: str
    metadata: Dict[str, Any]


class MessageComplexity(str, Enum):
    """Message complexity for response style engine."""
    SHORT = "short"
    MEDIUM = "medium"
    LONG = "long"


# =============================================================================
# SMART CLARIFICATION — Intent-specific missing info detection
# =============================================================================

CLARIFICATION_RULES = {
    "pricing": {
        "check": lambda entities, msg: not entities.get("product") and len(msg.split()) < 5,
        "question": "Which service or product would you like to know the price for?",
    },
    "booking": {
        "check": lambda entities, msg: not entities.get("date") and not entities.get("time") and "book" in msg.lower() and len(msg.split()) < 6,
        "question": "Sure! What service would you like to book?",
    },
    "order_status": {
        "check": lambda entities, msg: not any(re.search(r'[A-Z0-9]{6,}', msg)),
        "question": "Could you share your order ID or the phone number you used to place the order?",
    },
}


class ChatGPTEngine:
    """
    Core ChatGPT engine — v3.0 with enterprise intelligence layers.
    """

    def __init__(self, config: AIBrainConfig = None):
        self.config = config or default_config
        self._client = None

    @property
    def client(self):
        """Lazy initialization of OpenAI client."""
        if self._client is None:
            self._client = self._create_client()
        return self._client

    def _create_client(self):
        """Create OpenAI client."""
        if self.config.llm.provider == "openai":
            try:
                from openai import OpenAI
                return OpenAI(api_key=self.config.llm.api_key)
            except ImportError:
                raise ImportError("openai package required. Install with: pip install openai")
        else:
            raise ValueError(f"Unsupported LLM provider: {self.config.llm.provider}")

    # =========================================================================
    # RESPONSE STYLE ENGINE — Detect complexity, adjust tokens/style
    # =========================================================================

    def detect_message_complexity(self, message: str, intent: str = None) -> MessageComplexity:
        """
        Detect how complex the user's message is to calibrate response depth.

        SHORT: "price?" "hi" "hours" → 1-2 sentences, direct
        MEDIUM: "Tell me about your services" → structured, moderate detail
        LONG: "I need help choosing between X and Y for my wedding" → detailed
        """
        msg_lower = message.strip().lower()
        word_count = len(msg_lower.split())

        # SHORT indicators
        if word_count <= 3:
            return MessageComplexity.SHORT
        if msg_lower.endswith("?") and word_count <= 5:
            return MessageComplexity.SHORT
        if intent in ("greeting", "casual_conversation", "thank_you", "goodbye"):
            return MessageComplexity.SHORT

        # LONG indicators
        if word_count >= 15:
            return MessageComplexity.LONG
        if intent == "complaint":
            return MessageComplexity.LONG
        if msg_lower.count("and") >= 2 or msg_lower.count(",") >= 2:
            return MessageComplexity.LONG
        if any(w in msg_lower for w in ["compare", "difference", "between", "versus", "vs", "which one", "help me choose", "explain"]):
            return MessageComplexity.LONG

        return MessageComplexity.MEDIUM

    def _get_max_tokens_for_complexity(self, complexity: MessageComplexity, confidence: float) -> int:
        """Get the right token budget based on message complexity and confidence."""
        style = self.config.style

        base = {
            MessageComplexity.SHORT: style.short_max_tokens,
            MessageComplexity.MEDIUM: style.medium_max_tokens,
            MessageComplexity.LONG: style.long_max_tokens,
        }[complexity]

        # Low confidence → more tokens for better reasoning
        if confidence < self.config.llm.low_confidence_threshold:
            base = max(base, self.config.llm.low_confidence_max_tokens)

        return base

    # =========================================================================
    # SMART CLARIFICATION LAYER — Ask instead of guess
    # =========================================================================

    def detect_missing_info(
        self,
        message: str,
        intent: str,
        entities: Dict[str, Any],
        business_data: Dict[str, Any],
    ) -> Optional[str]:
        """
        Check if critical info is missing for the detected intent.
        Returns a clarification question if needed, None otherwise.

        This prevents hallucination by asking instead of guessing.
        """
        if not self.config.enable_smart_clarification:
            return None

        rule = CLARIFICATION_RULES.get(intent)
        if rule and rule["check"](entities, message):
            # For pricing, customize the question with available products
            if intent == "pricing":
                products = business_data.get("products_services", [])
                if products and len(products) <= 8:
                    names = [p.get("name", "") for p in products[:6] if p.get("name")]
                    if names:
                        return f"Which one are you interested in? We have: {', '.join(names)}"
            return rule["question"]

        return None

    # =========================================================================
    # INTENT CLASSIFICATION — Uses classification_model (gpt-4o-mini)
    # =========================================================================

    def classify_intent(
        self,
        message: str,
        conversation_history: List[Dict[str, str]] = None
    ) -> IntentResult:
        """Classify user intent. Uses gpt-4o-mini for speed and cost."""

        # QUICK PRE-CHECK: Obvious intents without LLM call (saves ~300ms + tokens)
        msg_clean = message.strip().lower()

        if msg_clean in ['hi', 'hello', 'hey', 'hii', 'hiii', 'namaste', 'namaskar', 'hola', 'yo', 'sup']:
            return IntentResult(
                intent=IntentType.GREETING, confidence=0.95, language="en",
                entities={}, needs_clarification=False, clarification_question=None,
                raw_response={"quick_match": "greeting"}
            )

        casual_patterns = ['how are you', "how're you", 'how r u', 'kaise ho', 'kya haal', 'whats up', "what's up", 'wassup']
        if any(p in msg_clean for p in casual_patterns):
            return IntentResult(
                intent=IntentType.CASUAL_CONVERSATION, confidence=0.95, language="en",
                entities={}, needs_clarification=False, clarification_question=None,
                raw_response={"quick_match": "casual_conversation"}
            )

        # Thank you quick match
        if msg_clean in ['thanks', 'thank you', 'thank u', 'thx', 'ty', 'dhanyavaad', 'shukriya']:
            return IntentResult(
                intent=IntentType.THANK_YOU, confidence=0.95, language="en",
                entities={}, needs_clarification=False, clarification_question=None,
                raw_response={"quick_match": "thank_you"}
            )

        # Goodbye quick match
        if msg_clean in ['bye', 'goodbye', 'good bye', 'see you', 'alvida', 'tata', 'bye bye']:
            return IntentResult(
                intent=IntentType.GOODBYE, confidence=0.95, language="en",
                entities={}, needs_clarification=False, clarification_question=None,
                raw_response={"quick_match": "goodbye"}
            )

        # LLM classification using classification_model (gpt-4o-mini)
        messages = [{"role": "system", "content": SYSTEM_PROMPT_INTENT_CLASSIFIER}]

        if conversation_history:
            context_text = "\n".join([
                f"{m['role'].upper()}: {m['content']}"
                for m in conversation_history[-3:]
            ])
            messages.append({
                "role": "user",
                "content": f"Conversation context:\n{context_text}\n\nClassify this message: \"{message}\""
            })
        else:
            messages.append({
                "role": "user",
                "content": f"Classify this message: \"{message}\""
            })

        try:
            response = self.client.chat.completions.create(
                model=self.config.llm.classification_model,  # gpt-4o-mini
                messages=messages,
                temperature=self.config.llm.classification_temperature,
                max_tokens=200,
                response_format={"type": "json_object"}
            )

            usage = getattr(response, "usage", None) or type('obj', (object,), {'prompt_tokens': 0, 'completion_tokens': 0})()
            intent_prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
            intent_completion_tokens = getattr(usage, "completion_tokens", 0) or 0

            result = json.loads(response.choices[0].message.content)

            intent_str = result.get("intent", "unknown").lower()
            try:
                intent = IntentType(intent_str)
            except ValueError:
                intent = IntentType.UNKNOWN

            result["_intent_prompt_tokens"] = intent_prompt_tokens
            result["_intent_completion_tokens"] = intent_completion_tokens

            return IntentResult(
                intent=intent,
                confidence=float(result.get("confidence", 0.5)),
                language=result.get("language", "en"),
                entities=result.get("entities", {}),
                needs_clarification=result.get("needs_clarification", False),
                clarification_question=result.get("clarification_question"),
                raw_response=result
            )

        except Exception as e:
            return IntentResult(
                intent=IntentType.UNKNOWN, confidence=0.0, language="en",
                entities={}, needs_clarification=True,
                clarification_question="Could you please rephrase that?",
                raw_response={"error": str(e)}
            )

    # =========================================================================
    # RESPONSE GENERATION — Uses generation_model (gpt-4o)
    # =========================================================================

    def generate_response(
        self,
        message: str,
        intent_result: IntentResult,
        business_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]] = None,
        use_tools: bool = True,
        conversation_state_summary: str = "",
        user_id: str = None,
        user_profile: Dict[str, Any] = None,
        conversation_summary: str = None,
        is_mixed_language: bool = False,
    ) -> GenerationResult:
        """Generate response using gpt-4o with enterprise intelligence layers."""

        confidence_action = get_confidence_action(intent_result.confidence)

        # Layer 1: Smart Clarification — ask instead of guess
        clarification = self.detect_missing_info(
            message, intent_result.intent.value, intent_result.entities, business_data
        )
        if clarification:
            return GenerationResult(
                reply=clarification,
                intent=intent_result.intent,
                confidence=intent_result.confidence,
                tool_called=None, tool_result=None, needs_human=False,
                language=intent_result.language,
                metadata={
                    "generation_method": "smart_clarification",
                    "confidence_action": confidence_action["action"]
                }
            )

        # If intent classifier already asked for clarification
        if intent_result.needs_clarification and intent_result.clarification_question:
            return GenerationResult(
                reply=intent_result.clarification_question,
                intent=intent_result.intent,
                confidence=intent_result.confidence,
                tool_called=None, tool_result=None, needs_human=False,
                language=intent_result.language,
                metadata={
                    "generation_method": "clarification",
                    "confidence_action": confidence_action["action"]
                }
            )

        # Layer 2: Response Style Engine — adjust tokens based on complexity
        complexity = self.detect_message_complexity(message, intent_result.intent.value)
        max_tokens = self._get_max_tokens_for_complexity(complexity, intent_result.confidence)

        # Layer 3: Build dynamic prompt (6-layer architecture)
        full_prompt = build_dynamic_prompt(
            business_data=business_data,
            intent=intent_result.intent.value,
            user_message=message,
            language=intent_result.language,
            is_mixed_language=is_mixed_language,
            conversation_history=conversation_history,
            conversation_state_summary=conversation_state_summary,
            user_profile=user_profile,
            conversation_summary=conversation_summary,
        )

        # Split into proper system + user roles for stronger instruction following
        messages = [
            {"role": "system", "content": full_prompt},
            {"role": "user", "content": message},
        ]

        # Prepare tools if enabled
        tools = TOOL_SCHEMAS if use_tools and self.config.enable_function_calling else None

        # Layer 4: Model selection — confidence-based escalation
        generation_model = self.config.llm.generation_model
        if intent_result.confidence < self.config.llm.low_confidence_threshold:
            # Low confidence → use generation model with more tokens for better reasoning
            max_tokens = max(max_tokens, self.config.llm.low_confidence_max_tokens)
            logger.info(f"🧠 Low confidence ({intent_result.confidence:.2f}) → boosted tokens to {max_tokens}")

        try:
            response = self.client.chat.completions.create(
                model=generation_model,
                messages=messages,
                temperature=self.config.llm.temperature,
                max_tokens=max_tokens,
                tools=tools,
                tool_choice="auto" if tools else None
            )

            choice = response.choices[0]

            usage = getattr(response, "usage", None) or type('obj', (object,), {'prompt_tokens': 0, 'completion_tokens': 0})()
            gen_prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
            gen_completion_tokens = getattr(usage, "completion_tokens", 0) or 0

            # Handle tool calls
            tool_called = None
            tool_result = None

            if choice.message.tool_calls:
                tool_call = choice.message.tool_calls[0]
                tool_called = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)

                business_owner_id = business_data.get("business_id") or business_data.get("user_id")
                executor = ToolExecutor(business_data, user_id=user_id, business_owner_id=business_owner_id)
                result = executor.execute(tool_called, tool_args)
                tool_result = {
                    "success": result.success,
                    "data": result.data,
                    "message": result.message
                }

                reply = self._generate_tool_response(
                    tool_called, result, business_data, intent_result.language
                )
            else:
                reply = choice.message.content.strip()

            # Layer 5: Response Self-Check (quality validation)
            if self.config.enable_self_check and not tool_called:
                reply = self._self_check_response(
                    reply, message, intent_result.intent.value, business_data
                )

            # Layer 6: Response Validation (fact-check prices)
            if self.config.enable_response_validation and not tool_called:
                reply = self._validate_response(reply, business_data)

            needs_human = (
                intent_result.intent == IntentType.COMPLAINT or
                intent_result.confidence < self.config.confidence_human_approval or
                tool_called == "escalate_to_human"
            )

            return GenerationResult(
                reply=reply,
                intent=intent_result.intent,
                confidence=intent_result.confidence,
                tool_called=tool_called,
                tool_result=tool_result,
                needs_human=needs_human,
                language=intent_result.language,
                metadata={
                    "generation_method": "tool" if tool_called else "llm",
                    "confidence_action": confidence_action["action"],
                    "model": generation_model,
                    "complexity": complexity.value,
                    "prompt_tokens": gen_prompt_tokens,
                    "completion_tokens": gen_completion_tokens,
                    "generation_prompt_tokens": gen_prompt_tokens,
                    "generation_completion_tokens": gen_completion_tokens,
                }
            )

        except Exception as e:
            logger.error(f"Generation error: {e}")
            return GenerationResult(
                reply="I'm having trouble processing your request. Let me connect you with our team. 🙏",
                intent=intent_result.intent, confidence=0.0,
                tool_called=None, tool_result=None, needs_human=True,
                language=intent_result.language,
                metadata={"generation_method": "error", "error": str(e)}
            )

    # =========================================================================
    # RESPONSE SELF-CHECK — Did the AI actually answer the question?
    # =========================================================================

    def _self_check_response(
        self,
        response: str,
        user_message: str,
        intent: str,
        business_data: Dict[str, Any],
    ) -> str:
        """
        Post-generation quality check. Catches:
        - Did not answer the actual question
        - Response is too generic / robotic
        - Missing critical info the AI should have provided

        Uses gpt-4o-mini for speed (this is a quick check, not a full regen).
        Only regenerates if the check FAILS — cost-efficient.
        """
        try:
            check_prompt = f"""You are a quality checker for a WhatsApp business chatbot response.

User asked: "{user_message}"
Detected intent: {intent}
AI responded: "{response}"

Check:
1. Does the response actually answer what the user asked?
2. Is any critical information missing that should have been included?
3. Does the response sound robotic or template-like?

Return JSON:
{{"passes": true/false, "issue": "<brief description if fails>", "fix_hint": "<what to fix>"}}"""

            check_response = self.client.chat.completions.create(
                model=self.config.llm.classification_model,  # gpt-4o-mini for speed
                messages=[{"role": "user", "content": check_prompt}],
                temperature=0.2,
                max_tokens=100,
                response_format={"type": "json_object"}
            )

            result = json.loads(check_response.choices[0].message.content)

            if result.get("passes", True):
                return response

            # Self-check failed — regenerate with fix hint
            logger.info(f"🔄 Self-check failed: {result.get('issue', 'unknown')} → regenerating")

            fix_prompt = f"""The previous response to "{user_message}" was not good enough.
Issue: {result.get('issue', '')}
Fix: {result.get('fix_hint', '')}

Business: {business_data.get('business_name', '')}
Generate a better response. Be natural and directly answer the question."""

            fix_response = self.client.chat.completions.create(
                model=self.config.llm.generation_model,
                messages=[{"role": "user", "content": fix_prompt}],
                temperature=self.config.llm.temperature,
                max_tokens=300,
            )

            fixed = fix_response.choices[0].message.content.strip()
            return fixed if fixed else response

        except Exception as e:
            logger.warning(f"Self-check skipped: {e}")
            return response

    # =========================================================================
    # RESPONSE VALIDATION — Fact-check prices and claims
    # =========================================================================

    def _validate_response(self, response: str, business_data: Dict[str, Any]) -> str:
        """
        Post-generation fact validation. Catches hallucinated prices.
        No LLM call — pure regex + data comparison. Very fast.
        """
        # Extract all price claims from response
        price_claims = re.findall(r'₹\s*(\d+(?:,\d+)*(?:\.\d+)?)', response)
        if not price_claims:
            return response

        # Build set of actual prices from business data
        actual_prices = set()
        for p in business_data.get("products_services", []):
            price = p.get("price")
            if price is not None:
                actual_prices.add(str(int(float(price))))
                actual_prices.add(str(float(price)))

        # Check each claimed price
        for claimed in price_claims:
            clean = claimed.replace(",", "")
            # Allow approximate matches (within 10% or exact)
            try:
                claimed_val = float(clean)
                is_valid = any(
                    abs(claimed_val - float(actual)) / max(float(actual), 1) < 0.1
                    for actual in actual_prices
                    if actual.replace(".", "").isdigit()
                )
                if not is_valid and actual_prices:
                    logger.warning(f"⚠️ HALLUCINATION: Price ₹{claimed} not in business data")
                    response = response.replace(f"₹{claimed}", "price on request")
            except (ValueError, ZeroDivisionError):
                pass

        return response

    # =========================================================================
    # TOOL RESPONSE FORMATTING (unchanged from v2)
    # =========================================================================

    def _generate_tool_response(
        self,
        tool_name: str,
        result: ToolResult,
        business_data: Dict[str, Any],
        language: str
    ) -> str:
        """Generate a human-friendly response from tool result."""

        if not result.success:
            return result.message

        if tool_name == "get_pricing":
            products = result.data.get("products", [])
            if products:
                lines = ["Here are the prices you asked about: 💰\n"]
                for p in products[:5]:
                    name = p.get("name", "")
                    price = p.get("price")
                    price_str = f"₹{price}" if price else "Price on request"
                    lines.append(f"• {name}: {price_str}")
                lines.append("\nWould you like to book or know more about any of these?")
                return "\n".join(lines)
            return result.message

        elif tool_name == "search_products":
            products = result.data.get("products", [])
            if products:
                lines = ["Here's what we have: ✨\n"]
                for p in products[:5]:
                    name = p.get("name", "")
                    price = p.get("price")
                    price_str = f"₹{price}" if price else ""
                    line = f"• {name}"
                    if price_str:
                        line += f" - {price_str}"
                    lines.append(line)
                lines.append("\nWould you like more details on any of these?")
                return "\n".join(lines)
            return "I couldn't find matching products. Could you try a different search?"

        elif tool_name == "get_business_hours":
            timings = result.data.get("timings", {})
            if result.data.get("day"):
                day = result.data["day"]
                timing = result.data.get("timing", {})
                if timing.get("is_closed"):
                    return f"We're closed on {day.capitalize()}. Would you like to know our other hours?"
                elif timing.get("open") and timing.get("close"):
                    return f"On {day.capitalize()}, we're open from {timing['open']} to {timing['close']}.\n\nWould you like to book an appointment?"

            lines = ["Our operating hours:\n"]
            for day, timing in timings.items():
                if isinstance(timing, dict):
                    if timing.get("is_closed"):
                        lines.append(f"• {day.capitalize()}: Closed")
                    elif timing.get("open") and timing.get("close"):
                        lines.append(f"• {day.capitalize()}: {timing['open']} - {timing['close']}")

            special = result.data.get("special_notes")
            if special:
                lines.append(f"\nNote: {special}")

            lines.append("\nWould you like to book a visit?")
            return "\n".join(lines)

        elif tool_name == "get_location":
            addr = result.data.get("address", "")
            city = result.data.get("city", "")
            maps = result.data.get("maps_link", "")
            landmarks = result.data.get("landmarks", [])

            lines = ["Here's how to find us:\n"]
            lines.append(addr)
            if city:
                lines.append(city)
            if landmarks:
                lines.append(f"\nLandmarks: {', '.join(landmarks)}")
            if maps:
                lines.append(f"\nGoogle Maps: {maps}")
            lines.append("\nSee you soon! 😊")
            return "\n".join(lines)

        elif tool_name == "book_appointment":
            if result.success:
                booking = result.data.get("booking", {})

                date_str = booking.get('date', '')
                try:
                    from datetime import datetime
                    parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
                    date_display = parsed_date.strftime("%d-%m-%y")
                except Exception:
                    date_display = date_str

                time_str = booking.get('time', '')
                try:
                    time_parts = time_str.split(':')
                    hour, minute = int(time_parts[0]), int(time_parts[1])
                    period = 'PM' if hour >= 12 else 'AM'
                    display_hour = hour - 12 if hour > 12 else (12 if hour == 0 else hour)
                    time_display = f"{display_hour}:{minute:02d} {period}"
                except Exception:
                    time_display = time_str

                lines = ["Your appointment is confirmed! ✅\n"]
                lines.append(f"📅 Date: {date_display}")
                lines.append(f"⏰ Time: {time_display}")
                if booking.get('service'):
                    lines.append(f"Service: {booking.get('service')}")
                lines.append("\nWe look forward to seeing you!")
                return "\n".join(lines)
            else:
                return result.message

        elif tool_name == "escalate_to_human":
            contact = result.data.get("contact")
            msg = "I'll connect you with our team who can help better. 🙏\n"
            if contact:
                msg += f"\nYou can also reach us at: {contact}"
            msg += "\n\nSomeone will respond to you shortly!"
            return msg

        elif tool_name == "collect_lead":
            return "Thank you for your interest! Our team will contact you shortly. 🎉"

        else:
            return result.message

    # =========================================================================
    # SAFETY CHECK
    # =========================================================================

    def check_safety(self, message: str) -> Tuple[bool, str]:
        """Check if a message is safe to process."""
        try:
            response = self.client.chat.completions.create(
                model=self.config.llm.classification_model,  # Use mini for speed
                messages=[
                    {"role": "system", "content": SAFETY_FILTER_PROMPT},
                    {"role": "user", "content": f"Check this message: \"{message}\""}
                ],
                temperature=0.1,
                max_tokens=100,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            is_safe = result.get("is_safe", True)
            reason = result.get("reason", "")

            return is_safe, reason

        except Exception:
            return True, ""

    # =========================================================================
    # COMPLETE FLOW — Single-call optimization for simple queries
    # =========================================================================

    def process_message(
        self,
        message: str,
        business_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]] = None,
        user_id: str = None,
        conversation_state_summary: str = "",
        user_profile: Dict[str, Any] = None,
        conversation_summary: str = None,
        is_mixed_language: bool = False,
    ) -> GenerationResult:
        """
        Complete message processing flow.

        Optimization: For high-confidence quick-match intents (greeting, thank_you, etc.),
        skips the separate classification API call — goes straight to generation.
        Saves ~300-500ms and ~200 tokens per simple message.
        """
        # Step 1: Classify intent
        intent_result = self.classify_intent(message, conversation_history)

        intent_prompt_tokens = intent_result.raw_response.get("_intent_prompt_tokens", 0)
        intent_completion_tokens = intent_result.raw_response.get("_intent_completion_tokens", 0)

        # Step 2: Generate response with all enterprise layers
        generation_result = self.generate_response(
            message=message,
            intent_result=intent_result,
            business_data=business_data,
            conversation_history=conversation_history,
            use_tools=self.config.enable_function_calling,
            conversation_state_summary=conversation_state_summary,
            user_id=user_id,
            user_profile=user_profile,
            conversation_summary=conversation_summary,
            is_mixed_language=is_mixed_language,
        )

        # Aggregate token counts
        gen_prompt_tokens = generation_result.metadata.get("generation_prompt_tokens", 0)
        gen_completion_tokens = generation_result.metadata.get("generation_completion_tokens", 0)

        total_prompt_tokens = intent_prompt_tokens + gen_prompt_tokens
        total_completion_tokens = intent_completion_tokens + gen_completion_tokens

        generation_result.metadata.update({
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "intent_prompt_tokens": intent_prompt_tokens,
            "intent_completion_tokens": intent_completion_tokens,
            "generation_prompt_tokens": gen_prompt_tokens,
            "generation_completion_tokens": gen_completion_tokens,
        })

        return generation_result
