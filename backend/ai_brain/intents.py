"""
Intent detection engine for WhatsApp messages.
Combines keyword matching with LLM-based classification for accurate intent detection.
"""

from enum import Enum
from typing import Dict, List, Tuple, Optional
import re


class IntentType(str, Enum):
    """Supported customer intent types."""
    GREETING = "greeting"
    GENERAL_ENQUIRY = "general_enquiry"
    PRICING = "pricing"
    BOOKING = "booking"
    HOURS = "hours"
    LOCATION = "location"
    ORDER_STATUS = "order_status"
    COMPLAINT = "complaint"
    LEAD_CAPTURE = "lead_capture"
    THANK_YOU = "thank_you"
    GOODBYE = "goodbye"
    UNKNOWN = "unknown"


# Keyword patterns for each intent (supports English + Hinglish)
INTENT_KEYWORDS: Dict[IntentType, List[str]] = {
    IntentType.GREETING: [
        r"\b(hi|hello|hey|namaste|namaskar|hola|good morning|good afternoon|good evening)\b",
        r"^(hi|hello|hey)$",
    ],
    IntentType.GENERAL_ENQUIRY: [
        r"\b(what do you|tell me about|information|details|kya hai|about your)\b",
        r"\b(services|products|offer|provide)\b",
        r"\b(what.*have|what.*offer|do you have|kya milta)\b",
        r"\b(courses|classes|packages|plans|options|items|treatments|menu)\b",
        r"\b(show me|available|can i get|looking for)\b",
    ],
    IntentType.PRICING: [
        r"\b(price|cost|rate|charge|fee|kitna|kya rate|kitne|paisa|rupees|rs|₹)\b",
        r"\b(how much|total cost|charges|rate batao|batao)\b",
    ],
    IntentType.BOOKING: [
        r"\b(book|appointment|schedule|reserve|slot|booking|appoint)\b",
        r"\b(available|availability|free slot|next available)\b",
    ],
    IntentType.HOURS: [
        r"\b(timing|timings|time|hours|open|close|kab|kitne baje|working hours)\b",
        r"\b(when do you|what time|opening|closing)\b",
    ],
    IntentType.LOCATION: [
        r"\b(address|location|where|directions|kahan|kidhar|map|route)\b",
        r"\b(how to reach|find you|located)\b",
    ],
    IntentType.ORDER_STATUS: [
        r"\b(order|status|tracking|delivery|shipped|where is my|dispatch)\b",
        r"\b(order number|order id|track)\b",
    ],
    IntentType.COMPLAINT: [
        r"\b(problem|issue|complaint|not working|bad|worst|angry|refund)\b",
        r"\b(disappointed|unhappy|frustrated|terrible|horrible)\b",
    ],
    IntentType.LEAD_CAPTURE: [
        r"\b(interested|want to know more|contact me|call me|callback)\b",
        r"\b(send details|more info|brochure|quote)\b",
    ],
    IntentType.THANK_YOU: [
        r"\b(thank|thanks|thankyou|dhanyawad|shukriya)\b",
    ],
    IntentType.GOODBYE: [
        r"\b(bye|goodbye|see you|alvida|tata|ok bye)\b",
    ],
}


# Intent descriptions for LLM classification
INTENT_DESCRIPTIONS = {
    IntentType.GREETING: "Customer is greeting or saying hello",
    IntentType.GENERAL_ENQUIRY: "Customer wants general information about the business or services",
    IntentType.PRICING: "Customer is asking about prices, costs, or rates",
    IntentType.BOOKING: "Customer wants to book an appointment or make a reservation",
    IntentType.HOURS: "Customer is asking about operating hours or timings",
    IntentType.LOCATION: "Customer is asking about address, location, or directions",
    IntentType.ORDER_STATUS: "Customer is asking about an order status or delivery tracking",
    IntentType.COMPLAINT: "Customer has a complaint, issue, or is expressing dissatisfaction",
    IntentType.LEAD_CAPTURE: "Customer is expressing interest and wants to be contacted",
    IntentType.THANK_YOU: "Customer is expressing gratitude or thanks",
    IntentType.GOODBYE: "Customer is saying goodbye or ending the conversation",
    IntentType.UNKNOWN: "Intent cannot be determined from the message",
}


class IntentDetector:
    """
    Detects customer intent from WhatsApp messages.
    Uses keyword matching as first pass, with optional LLM fallback for ambiguous cases.
    """
    
    def __init__(self):
        # Compile regex patterns for efficiency
        self._compiled_patterns: Dict[IntentType, List[re.Pattern]] = {}
        for intent, patterns in INTENT_KEYWORDS.items():
            self._compiled_patterns[intent] = [
                re.compile(p, re.IGNORECASE) for p in patterns
            ]
    
    def detect(self, message: str, history: List[dict] = None) -> Tuple[IntentType, float]:
        """
        Detect intent from a message.
        
        Args:
            message: The user's message text
            history: Optional conversation history for context
            
        Returns:
            Tuple of (intent, confidence_score)
        """
        message = message.strip()
        
        # Empty or very short messages
        if not message or len(message) < 2:
            return IntentType.UNKNOWN, 0.0
        
        # First pass: keyword matching
        intent, confidence = self._keyword_match(message)
        
        # If confidence is high enough, return
        if confidence >= 0.7:
            return intent, confidence
        
        # Check conversation context for better intent
        if history:
            context_intent = self._context_based_detection(message, history)
            if context_intent != IntentType.UNKNOWN:
                return context_intent, 0.65
        
        return intent, confidence
    
    def _keyword_match(self, message: str) -> Tuple[IntentType, float]:
        """Match message against keyword patterns."""
        scores: Dict[IntentType, int] = {}
        
        for intent, patterns in self._compiled_patterns.items():
            score = 0
            for pattern in patterns:
                matches = pattern.findall(message)
                score += len(matches)
            if score > 0:
                scores[intent] = score
        
        if not scores:
            return IntentType.UNKNOWN, 0.3
        
        # Get intent with highest score
        best_intent = max(scores, key=scores.get)
        max_score = scores[best_intent]
        
        # Calculate confidence based on score and message length
        word_count = len(message.split())
        confidence = min(0.9, 0.5 + (max_score * 0.2) - (word_count * 0.02))
        confidence = max(0.4, confidence)
        
        return best_intent, confidence
    
    def _context_based_detection(self, message: str, history: List[dict]) -> IntentType:
        """Use conversation history to improve intent detection."""
        if not history:
            return IntentType.UNKNOWN
        
        # Get last assistant message to understand context
        last_assistant_msg = None
        for msg in reversed(history):
            if msg.get("role") == "assistant":
                last_assistant_msg = msg.get("content", "").lower()
                break
        
        if not last_assistant_msg:
            return IntentType.UNKNOWN
        
        # If we asked about booking and user responds with time/date
        if "book" in last_assistant_msg or "appointment" in last_assistant_msg:
            if re.search(r"\d{1,2}[:/]\d{2}|\d{1,2}\s*(am|pm)|tomorrow|today|\d{1,2}\/\d{1,2}", message.lower()):
                return IntentType.BOOKING
        
        # If we asked about products and user responds with a name
        if "which" in last_assistant_msg or "service" in last_assistant_msg:
            return IntentType.PRICING
        
        return IntentType.UNKNOWN
    
    def get_intent_description(self, intent: IntentType) -> str:
        """Get human-readable description of an intent."""
        return INTENT_DESCRIPTIONS.get(intent, "Unknown intent")
    
    def get_llm_classification_prompt(self, message: str, history: List[dict] = None) -> str:
        """
        Generate a prompt for LLM-based intent classification.
        Used when keyword matching is not confident enough.
        """
        intent_list = "\n".join([
            f"- {intent.value}: {desc}"
            for intent, desc in INTENT_DESCRIPTIONS.items()
        ])
        
        history_context = ""
        if history:
            recent = history[-3:]  # Last 3 messages
            history_context = "\n".join([
                f"{msg['role'].upper()}: {msg['content']}"
                for msg in recent
            ])
            history_context = f"\nConversation context:\n{history_context}\n"
        
        return f"""Classify the customer's intent from this WhatsApp message.

Possible intents:
{intent_list}

{history_context}
Customer message: "{message}"

Respond with ONLY the intent name (e.g., "pricing", "booking", etc.) and nothing else."""
