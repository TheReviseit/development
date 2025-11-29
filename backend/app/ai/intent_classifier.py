from sqlalchemy.orm import Session
from typing import Optional, Tuple
from app.models.intent import IntentDefinition
from app.config import settings
import openai


class IntentClassifier:
    """AI-powered intent classification"""
    
    def __init__(self, db: Session, business):
        self.db = db
        self.business = business
        self.openai_enabled = bool(settings.OPENAI_API_KEY)
        
        if self.openai_enabled:
            openai.api_key = settings.OPENAI_API_KEY
    
    async def classify_intent(self, message_text: str) -> Tuple[Optional[str], float]:
        """
        Classify user intent from message
        Returns (intent_name, confidence_score)
        """
        
        if not self.openai_enabled:
            # Fallback to keyword matching if OpenAI not configured
            return await self._keyword_based_classification(message_text)
        
        # Get defined intents for this business
        intents = self.db.query(IntentDefinition).filter(
            IntentDefinition.business_id == self.business.id,
            IntentDefinition.is_active == True
        ).all()
        
        if not intents:
            return None, 0.0
        
        # Build prompt for OpenAI
        intent_descriptions = []
        for intent in intents:
            examples_str = ", ".join(intent.training_examples[:3]) if intent.training_examples else ""
            intent_descriptions.append(
                f"- {intent.intent_name}: {intent.description}. Examples: {examples_str}"
            )
        
        intent_list = "\n".join(intent_descriptions)
        
        prompt = f"""You are an AI assistant that classifies customer messages into intents.

Available intents:
{intent_list}

Customer message: "{message_text}"

Classify this message into one of the above intents. Respond with ONLY the intent name and confidence score (0-1).
Format: intent_name|confidence
If no intent matches, respond with: none|0.0
"""
        
        try:
            response = openai.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a classification assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=50,
                temperature=0.3
            )
            
            result = response.choices[0].message.content.strip()
            parts = result.split("|")
            
            if len(parts) == 2:
                intent_name = parts[0].strip()
                confidence = float(parts[1].strip())
                
                # Validate intent exists and meets threshold
                intent = next((i for i in intents if i.intent_name == intent_name), None)
                if intent and confidence >= intent.confidence_threshold:
                    return intent_name, confidence
            
        except Exception as e:
            print(f"Intent classification error: {str(e)}")
        
        return None, 0.0
    
    async def _keyword_based_classification(self, message_text: str) -> Tuple[Optional[str], float]:
        """Fallback keyword-based classification"""
        
        message_lower = message_text.lower()
        
        # Simple keyword matching for common intents
        intent_keywords = {
            "appointment": ["book", "appointment", "schedule", "reservation", "visit"],
            "pricing": ["price", "cost", "how much", "pricing", "rate", "fee"],
            "support": ["help", "support", "issue", "problem", "question"],
            "faq": ["what is", "how do", "can you", "tell me about"],
            "ordering": ["order", "buy", "purchase", "want to get"]
        }
        
        for intent, keywords in intent_keywords.items():
            if any(kw in message_lower for kw in keywords):
                return intent, 0.8
        
        return None, 0.0
