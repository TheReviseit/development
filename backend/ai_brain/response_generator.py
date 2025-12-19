"""
Response generator for WhatsApp messages.
Generates natural, context-aware replies using LLM and business data.
"""

from typing import Dict, List, Any, Optional, Tuple
from .schemas import BusinessData, ConversationMessage
from .intents import IntentType
from .templates import get_industry_template, get_intent_template, format_template
from .config import AIBrainConfig, default_config


class ResponseGenerator:
    """
    Generates WhatsApp-ready responses using business data and detected intent.
    Combines template-based and LLM-generated responses.
    """
    
    def __init__(self, config: AIBrainConfig = None):
        self.config = config or default_config
        self._llm_client = None
    
    @property
    def llm_client(self):
        """Lazy initialization of LLM client."""
        if self._llm_client is None:
            self._llm_client = self._create_llm_client()
        return self._llm_client
    
    def _create_llm_client(self):
        """Create LLM client based on config."""
        if self.config.llm.provider == "openai":
            try:
                from openai import OpenAI
                return OpenAI(api_key=self.config.llm.api_key)
            except ImportError:
                raise ImportError("openai package required. Install with: pip install openai")
        else:
            raise ValueError(f"Unsupported LLM provider: {self.config.llm.provider}")
    
    def generate(
        self,
        business_data: BusinessData,
        user_message: str,
        intent: IntentType,
        confidence: float,
        history: List[ConversationMessage] = None
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Generate a response for the user message.
        
        Args:
            business_data: Business profile data
            user_message: Customer's message
            intent: Detected intent
            confidence: Intent confidence score
            history: Conversation history
            
        Returns:
            Tuple of (response_text, metadata)
        """
        industry_template = get_industry_template(business_data.industry)
        
        # High confidence: use template-based response if available
        if confidence >= 0.7 and self._can_use_template(intent, business_data):
            response = self._generate_template_response(
                intent, business_data, user_message, industry_template
            )
            return response, {"generation_method": "template", "confidence": confidence}
        
        # Medium confidence or complex query: use LLM
        response = self._generate_llm_response(
            business_data, user_message, intent, history, industry_template
        )
        return response, {"generation_method": "llm", "confidence": confidence}
    
    def _can_use_template(self, intent: IntentType, data: BusinessData) -> bool:
        """Check if we can use template for this intent."""
        if intent == IntentType.GREETING:
            return True
        if intent == IntentType.THANK_YOU:
            return True
        if intent == IntentType.GOODBYE:
            return True
        if intent == IntentType.HOURS and data.timings:
            return True
        if intent == IntentType.LOCATION and data.location.address:
            return True
        return False
    
    def _generate_template_response(
        self,
        intent: IntentType,
        data: BusinessData,
        message: str,
        industry: Dict[str, Any]
    ) -> str:
        """Generate response using templates."""
        
        if intent == IntentType.GREETING:
            template = industry.get("greeting", get_intent_template("greeting"))
            return format_template(template, name=data.business_name)
        
        if intent == IntentType.THANK_YOU:
            return get_intent_template("thank_you")
        
        if intent == IntentType.GOODBYE:
            template = get_intent_template("goodbye")
            closing = industry.get("closing", "Thank you!")
            return format_template(template, closing=format_template(closing, name=data.business_name))
        
        if intent == IntentType.HOURS:
            return self._format_timing_response(data, industry)
        
        if intent == IntentType.LOCATION:
            return self._format_location_response(data)
        
        # Fallback to LLM
        return None
    
    def _format_timing_response(self, data: BusinessData, industry: Dict[str, Any]) -> str:
        """Format timing/hours response."""
        lines = ["🕐 Our operating hours:\n"]
        
        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for day in days:
            timing = data.get_timing_for_day(day)
            if timing:
                if timing.is_closed:
                    lines.append(f"• {day.capitalize()}: Closed")
                elif timing.open and timing.close:
                    lines.append(f"• {day.capitalize()}: {timing.open} - {timing.close}")
        
        if data.timings.special_notes:
            lines.append(f"\n📝 Note: {data.timings.special_notes}")
        
        lines.append(f"\n{industry.get('booking_cta', 'Would you like to book an appointment?')}")
        
        return "\n".join(lines)
    
    def _format_location_response(self, data: BusinessData) -> str:
        """Format location/address response."""
        lines = ["📍 Here's how to find us:\n"]
        
        if data.location.address:
            lines.append(data.location.address)
        if data.location.city:
            lines.append(f"{data.location.city}, {data.location.state or ''} {data.location.pincode or ''}")
        
        if data.location.landmarks:
            lines.append(f"\n🏢 Landmarks: {', '.join(data.location.landmarks)}")
        
        if data.location.google_maps_link:
            lines.append(f"\n🗺️ Google Maps: {data.location.google_maps_link}")
        
        return "\n".join(lines)
    
    def _generate_llm_response(
        self,
        data: BusinessData,
        message: str,
        intent: IntentType,
        history: List[ConversationMessage],
        industry: Dict[str, Any]
    ) -> str:
        """Generate response using LLM."""
        
        system_prompt = self._build_system_prompt(data, industry)
        user_prompt = self._build_user_prompt(data, message, intent, history)
        
        try:
            response = self.llm_client.chat.completions.create(
                model=self.config.llm.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=self.config.llm.temperature,
                max_tokens=self.config.tokens.max_output_tokens,
            )
            
            reply = response.choices[0].message.content.strip()
            return self._enforce_response_limits(reply)
            
        except Exception as e:
            # Fallback response on error
            return self._get_fallback_response(intent, data, str(e))
    
    def _build_system_prompt(self, data: BusinessData, industry: Dict[str, Any]) -> str:
        """Build system prompt for LLM."""
        tone = data.brand_voice.tone if data.brand_voice else "friendly"
        emoji = industry.get("emoji", "👋")
        
        return f"""You are a helpful WhatsApp assistant for {data.business_name}, a {data.industry} business.

PERSONALITY:
- Tone: {tone}, warm, and professional
- Use occasional emojis like {emoji} to be friendly
- Keep responses SHORT (under 200 words, ideal for WhatsApp)
- Use simple language suitable for Indian customers

STRICT RULES:
1. ONLY use information from the provided business data
2. If information is NOT available, say "I don't have that information, let me connect you with our team"
3. NEVER make up prices, products, services, or policies
4. NEVER hallucinate or invent details not in the data
5. Ask clarifying questions when the query is ambiguous
6. For complex issues, offer to connect with a human

RESPONSE FORMAT:
- Be concise and direct
- Use bullet points for lists
- Include relevant emojis sparingly
- End with a helpful follow-up question or CTA when appropriate"""
    
    def _build_user_prompt(
        self,
        data: BusinessData,
        message: str,
        intent: IntentType,
        history: List[ConversationMessage]
    ) -> str:
        """Build user prompt with context."""
        
        # Business context
        business_context = data.to_context_string(self.config.tokens.business_data_budget)
        
        # Conversation history
        history_text = ""
        if history:
            recent = history[-5:]  # Last 5 messages
            history_lines = [f"{m.role.upper()}: {m.content}" for m in recent]
            history_text = f"\nConversation history:\n" + "\n".join(history_lines)
        
        return f"""BUSINESS DATA:
{business_context}
{history_text}

DETECTED INTENT: {intent.value}

CUSTOMER MESSAGE: {message}

Generate a helpful, accurate response using ONLY the business data provided. If you cannot answer from the data, acknowledge this politely and offer to connect with the team."""
    
    def _enforce_response_limits(self, text: str) -> str:
        """Ensure response stays within WhatsApp-friendly limits."""
        limits = self.config.response
        
        # Character limit
        if len(text) > limits.max_chars:
            # Try to cut at sentence boundary
            sentences = text.split(". ")
            result = ""
            for s in sentences:
                if len(result) + len(s) + 2 <= limits.max_chars:
                    result += s + ". "
                else:
                    break
            text = result.strip() or text[:limits.max_chars-3] + "..."
        
        return text
    
    def _get_fallback_response(self, intent: IntentType, data: BusinessData, error: str = None) -> str:
        """Get fallback response when LLM fails."""
        industry = get_industry_template(data.industry)
        
        if intent == IntentType.GREETING:
            return format_template(industry.get("greeting", "Hello! How can I help you?"), name=data.business_name)
        
        if intent == IntentType.PRICING:
            if data.products_services:
                items = data.products_services[:3]
                lines = [f"Here are some of our services:\n"]
                for p in items:
                    price = f"₹{p.price}" if p.price else "Contact for price"
                    lines.append(f"• {p.name}: {price}")
                lines.append("\nWould you like more details on any of these?")
                return "\n".join(lines)
        
        # Default fallback
        return "I'm having trouble processing your request right now. Let me connect you with our team who can help better. 🙏"
    
    def generate_handoff_message(self, data: BusinessData, query_summary: str = None) -> str:
        """Generate message for human handoff."""
        response = "I'll connect you with our team who can help better with this. 🙏\n\n"
        
        if data.contact.phone or data.contact.whatsapp:
            contact = data.contact.whatsapp or data.contact.phone
            response += f"You can also reach us directly at: {contact}\n"
        
        response += "\nSomeone will respond to you shortly!"
        return response
