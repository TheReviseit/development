from sqlalchemy.orm import Session
from typing import Optional
from app.models.customer import Customer, LeadScore
from app.config import settings
import openai


class LeadScorer:
    """AI-powered lead qualification and scoring"""
    
    def __init__(self, db: Session):
        self.db = db
        self.openai_enabled = bool(settings.OPENAI_API_KEY)
        
        if self.openai_enabled:
            openai.api_key = settings.OPENAI_API_KEY
    
    async def score_lead(self, customer: Customer, recent_messages: list) -> tuple[LeadScore, float]:
        """
        Score lead based on conversation
        Returns (lead_category, score_value 0-100)
        """
        
        if not self.openai_enabled:
            return await self._keyword_based_scoring(recent_messages)
        
        # Build conversation summary
        conversation_text = "\n".join([
            f"{msg['direction']}: {msg['content']}" 
            for msg in recent_messages[-10:]
        ])
        
        memory_info = ""
        if customer.conversation_memory:
            attrs = customer.conversation_memory.get("attributes", {})
            if attrs:
                memory_info = f"Customer attributes: {attrs}"
        
        prompt = f"""Analyze this customer conversation and score their buying intent:

{conversation_text}

{memory_info}

Score the lead from 0-100 based on:
- Explicit buying signals (asking prices, scheduling, ordering)
- Engagement level
- Specificity of questions
- Response frequency

Provide:
1. Category: cold (0-33), warm (34-66), or hot (67-100)
2. Score: numerical value 0-100

Format: category|score
Example: hot|85
"""
        
        try:
            response = openai.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a lead scoring assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=50,
                temperature=0.3
            )
            
            result = response.choices[0].message.content.strip()
            parts = result.split("|")
            
            if len(parts) == 2:
                category_str = parts[0].strip().lower()
                score_value = float(parts[1].strip())
                
                # Map to enum
                if category_str == "hot":
                    category = LeadScore.HOT
                elif category_str == "warm":
                    category = LeadScore.WARM
                else:
                    category = LeadScore.COLD
                
                return category, score_value
        
        except Exception as e:
            print(f"Lead scoring error: {str(e)}")
        
        return LeadScore.COLD, 0.0
    
    async def _keyword_based_scoring(self, recent_messages: list) -> tuple[LeadScore, float]:
        """Fallback keyword-based scoring"""
        
        hot_keywords = ["buy", "purchase", "order", "book", "schedule", "yes", "when can", "how soon"]
        warm_keywords = ["interested", "price", "cost", "more info", "tell me", "available"]
        
        all_text = " ".join([msg['content'].lower() for msg in recent_messages]).lower()
        
        hot_count = sum(1 for kw in hot_keywords if kw in all_text)
        warm_count = sum(1 for kw in warm_keywords if kw in all_text)
        
        if hot_count >= 2:
            return LeadScore.HOT, 75.0
        elif warm_count >= 2 or hot_count >= 1:
            return LeadScore.WARM, 50.0
        else:
            return LeadScore.COLD, 25.0
