from sqlalchemy.orm import Session
from typing import Optional, List, Dict
from app.models.customer import Customer
from app.models.intent import IntentDefinition
from app.config import settings
import openai
import random


class ResponseGenerator:
    """AI-powered response generation"""
    
    def __init__(self, db: Session, business):
        self.db = db
        self.business = business
        self.openai_enabled = bool(settings.OPENAI_API_KEY)
        
        if self.openai_enabled:
            openai.api_key = settings.OPENAI_API_KEY
    
    async def generate_response(
        self,
        customer: Customer,
        message_text: str,
        detected_intent: Optional[str] = None,
        conversation_history: List[Dict] = None
    ) -> Optional[str]:
        """Generate AI response based on context"""
        
        if not self.openai_enabled:
            # Fallback to template responses
            return await self._template_based_response(detected_intent)
        
        # Build context for AI
        context_parts = []
        
        # Business profile
        if self.business.business_profile:
            profile = self.business.business_profile
            context_parts.append(f"Business: {self.business.name}")
            if profile.get("description"):
                context_parts.append(f"Description: {profile['description']}")
            if profile.get("services"):
                context_parts.append(f"Services: {', '.join(profile['services'])}")
        
        # Customer memory
        if customer.conversation_memory:
            memory = customer.conversation_memory
            if memory.get("attributes"):
                attrs = memory["attributes"]
                context_parts.append(f"Customer info: {attrs}")
        
        # Intent context
        if detected_intent:
            intent_def = self.db.query(IntentDefinition).filter(
                IntentDefinition.business_id == self.business.id,
                IntentDefinition.intent_name == detected_intent
            ).first()
            
            if intent_def and intent_def.response_templates:
                # Use intent-specific template as guidance
                template = random.choice(intent_def.response_templates)
                context_parts.append(f"Intent: {detected_intent}. Suggested response style: {template}")
        
        # Conversation history
        history_str = ""
        if conversation_history:
            history_lines = []
            for msg in conversation_history[-6:]:  # Last 6 messages
                direction = "Customer" if msg["direction"] == "inbound" else "Business"
                history_lines.append(f"{direction}: {msg['content']}")
            history_str = "\n".join(history_lines)
        
        context = "\n".join(context_parts)
        
        system_prompt = f"""You are a helpful customer service AI assistant for {self.business.name}.

Context:
{context}

Your role is to:
- Answer customer questions professionally
- Help with bookings, inquiries, and support
- Be friendly, concise, and helpful
- If you don't have information, offer to connect them with a human

Keep responses under 160 characters when possible (WhatsApp best practice).
"""
        
        try:
            messages = [{"role": "system", "content": system_prompt}]
            
            # Add conversation history
            if history_str:
                messages.append({"role": "user", "content": f"Previous conversation:\n{history_str}"})
            
            # Add current message
            messages.append({"role": "user", "content": message_text})
            
            response = openai.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=messages,
                max_tokens=150,
                temperature=0.7
            )
            
            return response.choices[0].message.content.strip()
        
        except Exception as e:
            print(f"Response generation error: {str(e)}")
            return await self._template_based_response(detected_intent)
    
    async def _template_based_response(self, intent: Optional[str]) -> str:
        """Fallback template-based responses"""
        
        if intent:
            # Get intent templates
            intent_def = self.db.query(IntentDefinition).filter(
                IntentDefinition.business_id == self.business.id,
                IntentDefinition.intent_name == intent
            ).first()
            
            if intent_def and intent_def.response_templates:
                return random.choice(intent_def.response_templates)
        
        # Generic fallback
        generic_responses = [
            "Thanks for your message! How can I help you today?",
            "Hello! I'm here to assist you. What would you like to know?",
            "Hi there! Let me know how I can help.",
        ]
        
        return random.choice(generic_responses)
