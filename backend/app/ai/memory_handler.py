from sqlalchemy.orm import Session
from app.models.customer import Customer
from typing import Optional
import re
import json


class MemoryHandler:
    """Manage conversation memory and customer attributes"""
    
    def __init__(self, db: Session):
        self.db = db
    
    async def update_memory(
        self,
        customer: Customer,
        message_text: str,
        detected_intent: Optional[str] = None
    ):
        """Update customer conversation memory"""
        
        if customer.conversation_memory is None:
            customer.conversation_memory = {
                "attributes": {},
                "preferences": {},
                "history_summary": ""
            }
        
        memory = customer.conversation_memory
        attributes = memory.get("attributes", {})
        
        # Extract entities from message
        extracted = self._extract_entities(message_text)
        
        # Update attributes
        if extracted.get("email"):
            attributes["email"] = extracted["email"]
            if not customer.email:
                customer.email = extracted["email"]
        
        if extracted.get("name"):
            attributes["name"] = extracted["name"]
            if not customer.name:
                customer.name = extracted["name"]
        
        if extracted.get("phone"):
            attributes["phone"] = extracted["phone"]
        
        # Intent-based attribute extraction
        if detected_intent == "appointment":
            if "time" in extracted:
                attributes["appointment_preference"] = extracted["time"]
        
        if detected_intent == "pricing":
            attributes["pricing_inquiry"] = True
        
        # Update conversation summary
        if detected_intent:
            history = memory.get("history_summary", "")
            if detected_intent not in history:
                memory["history_summary"] = f"{history}; Interested in {detected_intent}".strip("; ")
        
        # Save updated memory
        memory["attributes"] = attributes
        customer.conversation_memory = memory
        
        # Mark for update
        self.db.add(customer)
        self.db.commit()
    
    def _extract_entities(self, text: str) -> dict:
        """Extract structured entities from text"""
        
        entities = {}
        
        # Extract email
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        email_match = re.search(email_pattern, text)
        if email_match:
            entities["email"] = email_match.group(0)
        
        # Extract phone (basic pattern)
        phone_pattern = r'\b\d{10,12}\b'
        phone_match = re.search(phone_pattern, text)
        if phone_match:
            entities["phone"] = phone_match.group(0)
        
        # Extract name (if "my name is" or "I'm" pattern)
        name_patterns = [
            r"my name is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)",
            r"I'?m ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)",
            r"this is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)"
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                entities["name"] = match.group(1)
                break
        
        # Extract time references
        time_keywords = ["morning", "afternoon", "evening", "tonight", "tomorrow", "today"]
        for keyword in time_keywords:
            if keyword in text.lower():
                entities["time"] = keyword
                break
        
        return entities
    
    async def get_customer_context(self, customer: Customer) -> str:
        """Get customer context as text for AI"""
        
        if not customer.conversation_memory:
            return "New customer, no history"
        
        memory = customer.conversation_memory
        attributes = memory.get("attributes", {})
        
        context_parts = []
        
        if customer.name:
            context_parts.append(f"Name: {customer.name}")
        
        if attributes:
            for key, value in attributes.items():
                context_parts.append(f"{key}: {value}")
        
        if customer.lead_score:
            context_parts.append(f"Lead score: {customer.lead_score.value}")
        
        if customer.tags:
            context_parts.append(f"Tags: {', '.join(customer.tags)}")
        
        return "; ".join(context_parts) if context_parts else "No additional context"
