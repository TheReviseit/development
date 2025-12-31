"""
Messaging Tasks for Celery.
Handles async message sending, bulk campaigns, etc.
"""

import time
import logging
from typing import Dict, Any, List, Optional
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

logger = logging.getLogger('reviseit.tasks.messaging')


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    rate_limit="100/s",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def send_message(
    self,
    phone_number_id: str,
    access_token: str,
    to: str,
    message: str,
    message_type: str = "text"
) -> Dict[str, Any]:
    """
    Send a single WhatsApp message asynchronously.
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Facebook access token
        to: Recipient phone number
        message: Message content
        message_type: Type of message (text, template, etc.)
    
    Returns:
        Result dict with success status and message ID
    """
    try:
        from whatsapp_service import WhatsAppService
        
        service = WhatsAppService()
        result = service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=message
        )
        
        logger.info(f"Message sent to {to}: {result.get('success')}")
        return result
        
    except SoftTimeLimitExceeded:
        logger.error(f"Task timeout sending message to {to}")
        raise
    except Exception as e:
        logger.error(f"Error sending message to {to}: {e}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_reply(
    self,
    phone_number_id: str,
    access_token: str,
    to: str,
    reply_text: str,
    original_message_id: str = None
) -> Dict[str, Any]:
    """
    Send a reply to a message (high priority).
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Facebook access token
        to: Recipient phone number
        reply_text: Reply content
        original_message_id: ID of message being replied to
    
    Returns:
        Result dict with success status
    """
    try:
        from whatsapp_service import WhatsAppService
        
        service = WhatsAppService()
        result = service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=reply_text
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error sending reply to {to}: {e}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    max_retries=2,
    rate_limit="10/s",
    time_limit=3600,  # 1 hour max
)
def send_bulk_message(
    self,
    phone_number_id: str,
    access_token: str,
    recipients: List[str],
    message: str,
    template_name: str = None,
    template_params: Dict = None,
    campaign_id: str = None
) -> Dict[str, Any]:
    """
    Send bulk messages to multiple recipients.
    
    Implements rate limiting and progress tracking.
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Facebook access token
        recipients: List of phone numbers
        message: Message content (for text) or None (for template)
        template_name: Template name (optional)
        template_params: Template parameters (optional)
        campaign_id: Campaign ID for tracking
    
    Returns:
        Summary with success/failure counts
    """
    from whatsapp_service import WhatsAppService
    
    service = WhatsAppService()
    results = {
        "total": len(recipients),
        "sent": 0,
        "failed": 0,
        "errors": [],
        "campaign_id": campaign_id,
    }
    
    for i, recipient in enumerate(recipients):
        try:
            # Send message
            if template_name:
                result = service.send_template_message(
                    phone_number_id=phone_number_id,
                    access_token=access_token,
                    to=recipient,
                    template_name=template_name,
                    language_code="en",
                    components=template_params
                )
            else:
                result = service.send_message_with_credentials(
                    phone_number_id=phone_number_id,
                    access_token=access_token,
                    to=recipient,
                    message=message
                )
            
            if result.get("success"):
                results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append({
                    "recipient": recipient,
                    "error": result.get("error", "Unknown error")
                })
            
            # Rate limiting: 10 messages per second
            if i % 10 == 0:
                time.sleep(1)
            
            # Update progress
            self.update_state(
                state="PROGRESS",
                meta={"current": i + 1, "total": len(recipients)}
            )
            
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({
                "recipient": recipient,
                "error": str(e)
            })
            logger.error(f"Error sending to {recipient}: {e}")
    
    logger.info(
        f"Bulk campaign {campaign_id}: {results['sent']}/{results['total']} sent"
    )
    return results


@shared_task(bind=True)
def send_template_message(
    self,
    phone_number_id: str,
    access_token: str,
    to: str,
    template_name: str,
    language_code: str = "en",
    components: List[Dict] = None
) -> Dict[str, Any]:
    """
    Send a template message asynchronously.
    """
    try:
        from whatsapp_service import WhatsAppService
        
        service = WhatsAppService()
        result = service.send_template_message(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            template_name=template_name,
            language_code=language_code,
            components=components
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error sending template to {to}: {e}")
        raise self.retry(exc=e)


@shared_task
def split_and_send_long_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    message: str,
    max_length: int = 1500
) -> Dict[str, Any]:
    """
    Split long messages intelligently at sentence boundaries
    and send as multiple messages.
    
    WhatsApp has a 1600 character limit per message.
    We split at 1500 to leave room for formatting.
    """
    from whatsapp_service import WhatsAppService
    
    service = WhatsAppService()
    
    if len(message) <= max_length:
        return service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=message
        )
    
    # Split at sentence boundaries
    parts = []
    current_part = ""
    
    # Split by sentences (., !, ?, \n)
    import re
    sentences = re.split(r'(?<=[.!?\n])\s+', message)
    
    for sentence in sentences:
        if len(current_part) + len(sentence) + 1 <= max_length:
            current_part += (" " if current_part else "") + sentence
        else:
            if current_part:
                parts.append(current_part)
            current_part = sentence
    
    if current_part:
        parts.append(current_part)
    
    # Send each part with small delay
    results = []
    for i, part in enumerate(parts):
        # Add continuation indicator for multi-part messages
        if len(parts) > 1:
            part = f"({i+1}/{len(parts)}) {part}"
        
        result = service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=part
        )
        results.append(result)
        
        if i < len(parts) - 1:
            time.sleep(0.5)  # Small delay between parts
    
    return {
        "success": all(r.get("success") for r in results),
        "parts": len(parts),
        "results": results
    }

