"""
Core ChatGPT Engine for AI Brain.
Unified interface for intent classification, response generation, and function calling.
"""

import json
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from .config import AIBrainConfig, default_config
from .intents import IntentType
from .prompts import (
    SYSTEM_PROMPT_INTENT_CLASSIFIER,
    get_response_generator_prompt,
    build_full_prompt,
    get_confidence_action,
    SAFETY_FILTER_PROMPT,
)
from .tools import TOOL_SCHEMAS, ToolExecutor, ToolResult


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


class ChatGPTEngine:
    """
    Core ChatGPT interface with function-calling support.
    
    This is the primary AI engine that handles:
    - Intent classification using structured output
    - Response generation with context awareness
    - Function/tool calling for actionable intents
    - Safety filtering and hallucination prevention
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
    # INTENT CLASSIFICATION
    # =========================================================================
    
    def classify_intent(
        self,
        message: str,
        conversation_history: List[Dict[str, str]] = None
    ) -> IntentResult:
        """
        Classify user intent using ChatGPT.
        
        Args:
            message: User's message
            conversation_history: Previous conversation messages
            
        Returns:
            IntentResult with intent, confidence, and entities
        """
        # Build context from history
        messages = [{"role": "system", "content": SYSTEM_PROMPT_INTENT_CLASSIFIER}]
        
        # Add conversation context if available
        if conversation_history:
            context_text = "\n".join([
                f"{m['role'].upper()}: {m['content']}" 
                for m in conversation_history[-3:]  # Last 3 messages
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
                model=self.config.llm.model,
                messages=messages,
                temperature=0.3,  # Lower temperature for classification
                max_tokens=200,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            
            # Parse intent
            intent_str = result.get("intent", "unknown").lower()
            try:
                intent = IntentType(intent_str)
            except ValueError:
                intent = IntentType.UNKNOWN
            
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
            # Fallback on error
            return IntentResult(
                intent=IntentType.UNKNOWN,
                confidence=0.0,
                language="en",
                entities={},
                needs_clarification=True,
                clarification_question="Could you please rephrase that?",
                raw_response={"error": str(e)}
            )
    
    # =========================================================================
    # RESPONSE GENERATION
    # =========================================================================
    
    def generate_response(
        self,
        message: str,
        intent_result: IntentResult,
        business_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]] = None,
        use_tools: bool = True
    ) -> GenerationResult:
        """
        Generate a response to the user message.
        
        Args:
            message: User's message
            intent_result: Result from intent classification
            business_data: Business profile data
            conversation_history: Previous conversation
            use_tools: Whether to enable function calling
            
        Returns:
            GenerationResult with reply and metadata
        """
        # Check confidence and decide routing
        confidence_action = get_confidence_action(intent_result.confidence)
        
        # If clarification needed, ask for it
        if intent_result.needs_clarification and intent_result.clarification_question:
            return GenerationResult(
                reply=intent_result.clarification_question,
                intent=intent_result.intent,
                confidence=intent_result.confidence,
                tool_called=None,
                tool_result=None,
                needs_human=False,
                language=intent_result.language,
                metadata={
                    "generation_method": "clarification",
                    "confidence_action": confidence_action["action"]
                }
            )
        
        # Build system and user prompts
        system_prompt, user_prompt = build_full_prompt(
            business_data=business_data,
            intent=intent_result.intent.value,
            user_message=message,
            conversation_history=conversation_history,
            language=intent_result.language
        )
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        # Prepare tools if enabled
        tools = TOOL_SCHEMAS if use_tools and self.config.enable_function_calling else None
        
        try:
            # Make API call
            response = self.client.chat.completions.create(
                model=self.config.llm.model,
                messages=messages,
                temperature=self.config.llm.temperature,
                max_tokens=self.config.tokens.max_output_tokens,
                tools=tools,
                tool_choice="auto" if tools else None
            )
            
            choice = response.choices[0]
            
            # Check if a tool was called
            tool_called = None
            tool_result = None
            
            if choice.message.tool_calls:
                # Execute the tool
                tool_call = choice.message.tool_calls[0]
                tool_called = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)
                
                # Execute tool
                executor = ToolExecutor(business_data)
                result = executor.execute(tool_called, tool_args)
                tool_result = {
                    "success": result.success,
                    "data": result.data,
                    "message": result.message
                }
                
                # Generate response incorporating tool result
                reply = self._generate_tool_response(
                    tool_called, result, business_data, intent_result.language
                )
            else:
                # Regular response
                reply = choice.message.content.strip()
            
            # Determine if human handoff needed
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
                    "model": self.config.llm.model
                }
            )
            
        except Exception as e:
            # Fallback response
            return GenerationResult(
                reply="I'm having trouble processing your request. Let me connect you with our team. 🙏",
                intent=intent_result.intent,
                confidence=0.0,
                tool_called=None,
                tool_result=None,
                needs_human=True,
                language=intent_result.language,
                metadata={
                    "generation_method": "error",
                    "error": str(e)
                }
            )
    
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
        
        # Format based on tool type
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
                    return f"🕐 On {day.capitalize()}, we're open from {timing['open']} to {timing['close']}.\n\nWould you like to book an appointment?"
            
            # All timings
            lines = ["🕐 Our operating hours:\n"]
            for day, timing in timings.items():
                if isinstance(timing, dict):
                    if timing.get("is_closed"):
                        lines.append(f"• {day.capitalize()}: Closed")
                    elif timing.get("open") and timing.get("close"):
                        lines.append(f"• {day.capitalize()}: {timing['open']} - {timing['close']}")
            
            special = result.data.get("special_notes")
            if special:
                lines.append(f"\n📝 Note: {special}")
            
            lines.append("\nWould you like to book a visit?")
            return "\n".join(lines)
        
        elif tool_name == "get_location":
            addr = result.data.get("address", "")
            city = result.data.get("city", "")
            maps = result.data.get("maps_link", "")
            landmarks = result.data.get("landmarks", [])
            
            lines = ["📍 Here's how to find us:\n"]
            lines.append(addr)
            if city:
                lines.append(city)
            if landmarks:
                lines.append(f"\n🏢 Landmarks: {', '.join(landmarks)}")
            if maps:
                lines.append(f"\n🗺️ Google Maps: {maps}")
            lines.append("\nSee you soon! 😊")
            return "\n".join(lines)
        
        elif tool_name == "book_appointment":
            booking = result.data.get("booking", {})
            lines = ["✅ Booking request received!\n"]
            lines.append(f"📅 Date: {booking.get('date', 'TBD')}")
            lines.append(f"⏰ Time: {booking.get('time', 'TBD')}")
            lines.append(f"💇 Service: {booking.get('service', 'TBD')}")
            lines.append("\nOur team will confirm your booking shortly!")
            return "\n".join(lines)
        
        elif tool_name == "escalate_to_human":
            contact = result.data.get("contact")
            msg = "I'll connect you with our team who can help better. 🙏\n"
            if contact:
                msg += f"\nYou can also reach us at: {contact}"
            msg += "\n\nSomeone will respond to you shortly!"
            return msg
        
        elif tool_name == "collect_lead":
            return "Thank you for your interest! 🎉 Our team will contact you shortly."
        
        else:
            return result.message
    
    # =========================================================================
    # SAFETY & VALIDATION
    # =========================================================================
    
    def check_safety(self, message: str) -> Tuple[bool, str]:
        """
        Check if a message is safe to process.
        
        Returns:
            Tuple of (is_safe, reason_if_unsafe)
        """
        try:
            response = self.client.chat.completions.create(
                model=self.config.llm.model,
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
            # Fail open - assume safe on error
            return True, ""
    
    # =========================================================================
    # COMPLETE FLOW
    # =========================================================================
    
    def process_message(
        self,
        message: str,
        business_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]] = None,
        user_id: str = None
    ) -> GenerationResult:
        """
        Complete message processing flow:
        1. Classify intent
        2. Generate response (with optional tool calling)
        
        Args:
            message: User's message
            business_data: Business profile data
            conversation_history: Previous conversation
            user_id: Optional user identifier
            
        Returns:
            GenerationResult with complete response
        """
        # Step 1: Classify intent
        intent_result = self.classify_intent(message, conversation_history)
        
        # Step 2: Generate response
        generation_result = self.generate_response(
            message=message,
            intent_result=intent_result,
            business_data=business_data,
            conversation_history=conversation_history,
            use_tools=self.config.enable_function_calling
        )
        
        return generation_result
