from celery import shared_task
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models.business import Business
from app.models.message import Message, MessageDirection, MessageStatus, MessageType
from app.services.whatsapp import WhatsAppService


@shared_task(name="app.tasks.whatsapp_tasks.send_whatsapp_message")
def send_whatsapp_message(business_id: int, customer_phone: str, message_text: str):
    """Send WhatsApp message via Celery task"""
    
    db = SessionLocal()
    try:
        # Get business
        business = db.query(Business).filter(Business.id == business_id).first()
        if not business or not business.whatsapp_connected:
            return {"error": "Business WhatsApp not configured"}
        
        # Initialize WhatsApp service
        wa_service = WhatsAppService(
            phone_number_id=business.whatsapp_phone_number_id,
            access_token=business.whatsapp_access_token
        )
        
        # Send message
        import asyncio
        response = asyncio.run(wa_service.send_text_message(customer_phone, message_text))
        
        # Get customer
        from app.models.customer import Customer
        customer = db.query(Customer).filter(
            Customer.business_id == business_id,
            Customer.phone_number == customer_phone
        ).first()
        
        if customer:
            # Save outbound message
            outbound_message = Message(
                business_id=business_id,
                customer_id=customer.id,
                whatsapp_message_id=response.get("messages", [{}])[0].get("id"),
                direction=MessageDirection.OUTBOUND,
                message_type=MessageType.TEXT,
                content=message_text,
                status=MessageStatus.SENT
            )
            db.add(outbound_message)
            db.commit()
        
        return {"status": "sent", "response": response}
    
    except Exception as e:
        print(f"Error sending WhatsApp message: {str(e)}")
        return {"error": str(e)}
    
    finally:
        db.close()


@shared_task(name="app.tasks.whatsapp_tasks.process_ai_response")
def process_ai_response(business_id: int, customer_id: int, message_id: int):
    """Process AI response generation for a message"""
    
    db = SessionLocal()
    try:
        from app.models.business import Business
        from app.models.customer import Customer
        from app.ai.intent_classifier import IntentClassifier
        from app.ai.response_generator import ResponseGenerator
        from app.ai.memory_handler import MemoryHandler
        
        business = db.query(Business).filter(Business.id == business_id).first()
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        message = db.query(Message).filter(Message.id == message_id).first()
        
        if not all([business, customer, message]):
            return {"error": "Data not found"}
        
        # Classify intent
        classifier = IntentClassifier(db, business)
        import asyncio
        intent, confidence = asyncio.run(classifier.classify_intent(message.content))
        
        # Update memory
        memory_handler = MemoryHandler(db)
        asyncio.run(memory_handler.update_memory(customer, message.content, intent))
        
        # Generate response
        response_gen = ResponseGenerator(db, business)
        ai_response = asyncio.run(response_gen.generate_response(
            customer=customer,
            message_text=message.content,
            detected_intent=intent
        ))
        
        if ai_response:
            # Send response
            send_whatsapp_message.delay(business_id, customer.phone_number, ai_response)
        
        return {"status": "processed"}
    
    finally:
        db.close()
