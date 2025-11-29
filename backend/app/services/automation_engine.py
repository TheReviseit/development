from sqlalchemy.orm import Session
from app.models.automation_rule import AutomationRule
from app.models.customer import Customer
from app.tasks.whatsapp_tasks import send_whatsapp_message
from typing import Optional
import re


class AutomationEngine:
    """Process and execute automation rules"""
    
    def __init__(self, db: Session, business):
        self.db = db
        self.business = business
    
    async def process_message(self, message_text: str, customer: Customer) -> bool:
        """
        Check if message matches any automation rule and execute it
        Returns True if a rule was matched and executed
        """
        
        # Get active automation rules for this business, ordered by priority
        rules = self.db.query(AutomationRule).filter(
            AutomationRule.business_id == self.business.id,
            AutomationRule.is_active == True
        ).order_by(AutomationRule.priority.desc()).all()
        
        message_lower = message_text.lower().strip()
        
        for rule in rules:
            if self._matches_rule(message_lower, rule):
                # Execute the rule
                await self._execute_rule(rule, customer)
                return True
        
        return False
    
    def _matches_rule(self, message_text: str, rule: AutomationRule) -> bool:
        """Check if message matches the rule trigger"""
        
        trigger_type = rule.trigger_type
        keywords = rule.trigger_keywords or []
        
        if trigger_type == "exact_match":
            # Exact match on any keyword
            return message_text in [kw.lower() for kw in keywords]
        
        elif trigger_type == "contains":
            # Message contains any keyword
            return any(kw.lower() in message_text for kw in keywords)
        
        elif trigger_type == "keyword":
            # Match whole words using regex
            for keyword in keywords:
                pattern = r'\b' + re.escape(keyword.lower()) + r'\b'
                if re.search(pattern, message_text):
                    return True
            return False
        
        return False
    
    async def _execute_rule(self, rule: AutomationRule, customer: Customer):
        """Execute the automation rule action"""
        
        response_template = rule.response_template
        delay = rule.response_delay_seconds or 0
        
        # Replace placeholders in template
        response_text = response_template.replace("{name}", customer.name or "there")
        
        # Send response via Celery task
        send_whatsapp_message.apply_async(
            args=[
                self.business.id,
                customer.phone_number,
                response_text
            ],
            countdown=delay  # Delay in seconds
        )
