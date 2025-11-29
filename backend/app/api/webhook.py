from fastapi import APIRouter, Request, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.models.business import Business
from app.services.message_handler import MessageHandler
from app.config import settings
import hmac
import hashlib

router = APIRouter(prefix="/webhook", tags=["WhatsApp Webhook"])


@router.get("/whatsapp")
async def verify_webhook(request: Request):
    """Verify WhatsApp webhook (Meta webhook verification)"""
    
    # Parse query parameters
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    
    # Check required parameters
    if mode and token:
        # Check mode and token
        if mode == "subscribe" and token == settings.WHATSAPP_VERIFY_TOKEN:
            # Respond with challenge
            return int(challenge)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Verification failed"
            )
    
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Missing parameters"
    )


@router.post("/whatsapp")
async def handle_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle incoming WhatsApp messages"""
    
    try:
        body = await request.json()
        
        # Parse webhook payload
        if body.get("object") != "whatsapp_business_account":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid object type"
            )
        
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                if change.get("field") != "messages":
                    continue
                
                value = change.get("value", {})
                
                # Get business account ID to identify which business this is for
                business_account_id = value.get("metadata", {}).get("phone_number_id")
                
                # Find business by phone number ID
                business = db.query(Business).filter(
                    Business.whatsapp_phone_number_id == business_account_id
                ).first()
                
                if not business:
                    # Unknown business, skip
                    continue
                
                # Process messages
                messages = value.get("messages", [])
                for message in messages:
                    message_type = message.get("type")
                    from_number = message.get("from")
                    message_id = message.get("id")
                    
                    # Handle different message types
                    if message_type == "text":
                        text_body = message.get("text", {}).get("body", "")
                        
                        # Process message with handler
                        handler = MessageHandler(db, business)
                        await handler.process_incoming_message(
                            from_number=from_number,
                            message_text=text_body,
                            whatsapp_message_id=message_id,
                            message_metadata={"type": "text"}
                        )
                    
                    elif message_type == "button":
                        button_text = message.get("button", {}).get("text", "")
                        
                        handler = MessageHandler(db, business)
                        await handler.process_incoming_message(
                            from_number=from_number,
                            message_text=button_text,
                            whatsapp_message_id=message_id,
                            message_metadata={"type": "button"}
                        )
                    
                    elif message_type == "interactive":
                        interactive_type = message.get("interactive", {}).get("type")
                        
                        if interactive_type == "button_reply":
                            reply_text = message.get("interactive", {}).get("button_reply", {}).get("title", "")
                        elif interactive_type == "list_reply":
                            reply_text = message.get("interactive", {}).get("list_reply", {}).get("title", "")
                        else:
                            reply_text = ""
                        
                        handler = MessageHandler(db, business)
                        await handler.process_incoming_message(
                            from_number=from_number,
                            message_text=reply_text,
                            whatsapp_message_id=message_id,
                            message_metadata={"type": "interactive", "interactive_type": interactive_type}
                        )
                
                # Process status updates (delivered, read, etc.)
                statuses = value.get("statuses", [])
                for status_update in statuses:
                    # Update message status in database
                    msg_id = status_update.get("id")
                    msg_status = status_update.get("status")
                    
                    # TODO: Update message status in DB
                    pass
        
        return {"status": "ok"}
    
    except Exception as e:
        # Log error but return 200 to prevent Meta from retrying
        print(f"Webhook error: {str(e)}")
        return {"status": "ok"}
