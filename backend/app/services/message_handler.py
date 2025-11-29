from sqlalchemy.orm import Session
from app.models.message import Message, MessageDirection, MessageType
from app.models.customer import Customer
from app.models.business import Business
from app.services.whatsapp import WhatsAppService
from app.services.automation_engine import AutomationEngine
from app.ai.intent_classifier import IntentClassifier
from app.ai.response_generator import ResponseGenerator
from app.ai.memory_handler import MemoryHandler
from app.tasks.whatsapp_tasks import send_whatsapp_message
from datetime import datetime
from typing import Dict, Any


class MessageHandler:
    """Handle incoming WhatsApp messages with AI and automation"""
    
    def __init__(self, db: Session, business: Business):
        self.db = db
        self.business = business
        self.whatsapp_service = WhatsAppService(
            phone_number_id=business.whatsapp_phone_number_id,
            access_token=business.whatsapp_access_token
        )
    
    async def process_incoming_message(
        self,
        from_number: str,
        message_text: str,
        whatsapp_message_id: str,
        message_metadata: Dict[str, Any] = None
    ):
        """Process incoming WhatsApp message"""
        
        # 1. Get or create customer
        customer = self.db.query(Customer).filter(
            Customer.business_id == self.business.id,
            Customer.phone_number == from_number
        ).first()
        
        if not customer:
            customer = Customer(
                business_id=self.business.id,
                phone_number=from_number,
                conversation_memory={}
            )
            self.db.add(customer)
            self.db.commit()
            self.db.refresh(customer)
        
        # 2. Save incoming message
        incoming_message = Message(
            business_id=self.business.id,
            customer_id=customer.id,
            whatsapp_message_id=whatsapp_message_id,
            direction=MessageDirection.INBOUND,
            message_type=MessageType.TEXT,
            content=message_text,
            metadata=message_metadata
        )
        self.db.add(incoming_message)
        self.db.commit()
        
        # 3. Update customer last activity
        customer.last_activity_at = datetime.utcnow()
        self.db.commit()
        
        # 4. Check automation rules first (keyword-based)
        automation_engine = AutomationEngine(self.db, self.business)
        rule_matched = await automation_engine.process_message(message_text, customer)
        
        if rule_matched:
            # Automation rule handled the response
            return
        
        # 5. AI Intent Classification
        intent_classifier = IntentClassifier(self.db, self.business)
        detected_intent, confidence = await intent_classifier.classify_intent(message_text)
        
        if detected_intent:
            incoming_message.detected_intent = detected_intent
            incoming_message.intent_confidence = int(confidence * 100)
            self.db.commit()
        
        # 6. Update conversation memory
        memory_handler = MemoryHandler(self.db)
        await memory_handler.update_memory(customer, message_text, detected_intent)
        
        # 7. Generate AI response
        response_generator = ResponseGenerator(self.db, self.business)
        ai_response = await response_generator.generate_response(
            customer=customer,
            message_text=message_text,
            detected_intent=detected_intent,
            conversation_history=self._get_recent_messages(customer.id)
        )
        
        if ai_response:
            # Send response via Celery task (async)
            send_whatsapp_message.delay(
                business_id=self.business.id,
                customer_phone=from_number,
                message_text=ai_response
            )
    
    def _get_recent_messages(self, customer_id: int, limit: int = 10):
        """Get recent conversation history"""
        messages = self.db.query(Message).filter(
            Message.customer_id == customer_id
        ).order_by(Message.created_at.desc()).limit(limit).all()
        
        return [
            {
                "direction": msg.direction.value,
                "content": msg.content,
                "created_at": msg.created_at.isoformat()
            }
            for msg in reversed(messages)
        ]
