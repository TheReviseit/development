"""
OTP Delivery Celery Tasks
Async OTP Delivery with Channel Escalation and Webhooks

Features:
- High-priority queue (user-facing)
- Retry with exponential backoff
- Channel escalation (WhatsApp -> SMS)
- Webhook notifications with retry
- Dead letter logging
"""

import os
import hmac
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

import requests
from celery import shared_task

logger = logging.getLogger('otp.delivery')

# Configuration
WEBHOOK_MAX_ATTEMPTS = 5
WEBHOOK_INITIAL_BACKOFF = 60  # seconds
WHATSAPP_OTP_TEMPLATE = os.getenv('WHATSAPP_OTP_TEMPLATE', 'otp_authentication')


# =============================================================================
# OTP DELIVERY TASK
# =============================================================================

@shared_task(
    bind=True,
    name='tasks.otp_delivery.deliver_otp',
    queue='high',
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300
)
def deliver_otp(
    self,
    request_id: str,
    business_id: str,
    phone: str,
    otp: str,
    channel: str = 'whatsapp'
):
    """
    Deliver OTP via specified channel.
    
    Args:
        request_id: OTP request ID
        business_id: Business UUID
        phone: Recipient phone number
        otp: The OTP code to send
        channel: Delivery channel (whatsapp, sms)
    """
    logger.info(f"Delivering OTP {request_id} to {phone} via {channel}")
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Update delivery status to 'sent'
        db.table("otp_requests").update({
            "delivery_status": "sent",
            "delivery_channel": channel,
            "delivery_attempts": self.request.retries + 1
        }).eq("request_id", request_id).execute()
        
        # Get business config for WhatsApp credentials
        business = _get_business_config(db, business_id)
        
        # Deliver based on channel
        if channel == 'whatsapp':
            result = _send_whatsapp_otp(business, phone, otp)
        elif channel == 'sms':
            result = _send_sms_otp(business, phone, otp)
        else:
            result = {"success": False, "error": f"Unknown channel: {channel}"}
        
        if result.get("success"):
            # Update delivery status to 'delivered'
            db.table("otp_requests").update({
                "delivery_status": "delivered"
            }).eq("request_id", request_id).execute()
            
            # Fire webhook
            _queue_webhook(
                business_id=business_id,
                request_id=request_id,
                event_type="otp.delivery.delivered",
                data={"channel": channel}
            )
            
            logger.info(f"OTP {request_id} delivered successfully via {channel}")
            return {"success": True, "channel": channel}
        else:
            raise Exception(result.get("error", "Delivery failed"))
            
    except Exception as e:
        logger.error(f"OTP delivery failed for {request_id}: {e}")
        
        # Update delivery status
        try:
            from supabase_client import get_supabase_client
            db = get_supabase_client()
            
            if self.request.retries >= self.max_retries:
                # Max retries reached, mark as failed
                db.table("otp_requests").update({
                    "delivery_status": "failed",
                    "last_delivery_error": str(e)
                }).eq("request_id", request_id).execute()
                
                # Fire failure webhook
                _queue_webhook(
                    business_id=business_id,
                    request_id=request_id,
                    event_type="otp.delivery.failed",
                    data={"channel": channel, "error": str(e)}
                )
            else:
                db.table("otp_requests").update({
                    "last_delivery_error": str(e)
                }).eq("request_id", request_id).execute()
        except Exception as db_error:
            logger.error(f"Failed to update delivery status: {db_error}")
        
        raise


# =============================================================================
# CHANNEL DELIVERY FUNCTIONS
# =============================================================================

def _get_business_config(db, business_id: str) -> Dict[str, Any]:
    """Get business configuration including WhatsApp credentials."""
    try:
        result = db.table("otp_businesses").select(
            "id, name, whatsapp_mode, phone_number_id, webhook_url, webhook_secret"
        ).eq("id", business_id).single().execute()
        
        business = result.data if result.data else {}
        
        if business.get("whatsapp_mode") == "customer" and business.get("phone_number_id"):
            # Customer mode: get their credentials
            from credential_manager import get_credentials_by_phone_number_id
            creds = get_credentials_by_phone_number_id(business["phone_number_id"])
            if creds:
                business["access_token"] = creds.get("access_token")
                business["phone_number_id"] = creds.get("phone_number_id")
        else:
            # Platform mode: use environment credentials
            business["phone_number_id"] = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
            business["access_token"] = os.getenv("WHATSAPP_ACCESS_TOKEN")
        
        return business
        
    except Exception as e:
        logger.error(f"Failed to get business config: {e}")
        return {
            "phone_number_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID"),
            "access_token": os.getenv("WHATSAPP_ACCESS_TOKEN")
        }


def _send_whatsapp_otp(business: Dict, phone: str, otp: str) -> Dict[str, Any]:
    """
    Send OTP via WhatsApp using Meta's authentication template.
    
    Uses the built-in 'authentication' category template which has
    special OTP handling with auto-fill on mobile.
    """
    phone_number_id = business.get("phone_number_id")
    access_token = business.get("access_token")
    
    if not phone_number_id or not access_token:
        return {"success": False, "error": "WhatsApp credentials not configured"}
    
    # Format phone (remove + for WhatsApp API)
    whatsapp_phone = phone.lstrip('+')
    
    # Use Meta's authentication template format
    # https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Authentication template with OTP button
    payload = {
        "messaging_product": "whatsapp",
        "to": whatsapp_phone,
        "type": "template",
        "template": {
            "name": WHATSAPP_OTP_TEMPLATE,
            "language": {"code": "en"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": otp}
                    ]
                },
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [
                        {"type": "text", "text": otp}
                    ]
                }
            ]
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"WhatsApp OTP sent: {data.get('messages', [{}])[0].get('id')}")
            return {"success": True, "message_id": data.get("messages", [{}])[0].get("id")}
        else:
            error = response.json().get("error", {}).get("message", response.text)
            logger.error(f"WhatsApp API error: {error}")
            return {"success": False, "error": error}
            
    except requests.Timeout:
        return {"success": False, "error": "WhatsApp API timeout"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _send_sms_otp(business: Dict, phone: str, otp: str) -> Dict[str, Any]:
    """
    Send OTP via SMS.
    
    Placeholder for SMS integration (Twilio, AWS SNS, etc.)
    """
    # TODO: Implement SMS provider integration
    logger.warning(f"SMS delivery not yet implemented for {phone}")
    return {
        "success": False,
        "error": "SMS delivery not yet configured"
    }


# =============================================================================
# WEBHOOK DELIVERY
# =============================================================================

def _queue_webhook(
    business_id: str,
    request_id: str,
    event_type: str,
    data: Dict[str, Any]
):
    """Queue webhook delivery task."""
    try:
        deliver_webhook.delay(
            business_id=business_id,
            request_id=request_id,
            event_type=event_type,
            data=data
        )
    except Exception as e:
        logger.error(f"Failed to queue webhook: {e}")


@shared_task(
    bind=True,
    name='tasks.otp_delivery.deliver_webhook',
    queue='default',
    max_retries=5,
    default_retry_delay=60
)
def deliver_webhook(
    self,
    business_id: str,
    request_id: str,
    event_type: str,
    data: Dict[str, Any]
):
    """
    Deliver webhook notification to business.
    
    Retry policy:
    - 5 attempts with exponential backoff
    - 1min, 2min, 4min, 8min, 16min
    - Dead letter logging after max retries
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Get business webhook config
        result = db.table("otp_businesses").select(
            "webhook_url, webhook_secret"
        ).eq("id", business_id).single().execute()
        
        business = result.data
        
        if not business or not business.get("webhook_url"):
            logger.debug(f"No webhook configured for business {business_id}")
            return {"success": True, "skipped": True}
        
        webhook_url = business["webhook_url"]
        webhook_secret = business.get("webhook_secret", "")
        
        # Build payload
        payload = {
            "event": event_type,
            "request_id": request_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "data": data
        }
        
        # Sign payload with HMAC-SHA256
        payload_json = json.dumps(payload, separators=(',', ':'), sort_keys=True)
        signature = hmac.new(
            webhook_secret.encode('utf-8'),
            payload_json.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        headers = {
            "Content-Type": "application/json",
            "X-OTP-Signature": f"sha256={signature}",
            "X-OTP-Event": event_type,
            "X-OTP-Request-ID": request_id
        }
        
        # Log webhook attempt
        webhook_log_id = _log_webhook_attempt(
            db, business_id, request_id, event_type, payload, self.request.retries
        )
        
        # Send webhook
        response = requests.post(
            webhook_url,
            headers=headers,
            data=payload_json,
            timeout=30
        )
        
        if response.status_code in (200, 201, 202, 204):
            # Success
            _update_webhook_log(
                db, webhook_log_id, "delivered",
                response.status_code, None
            )
            logger.info(f"Webhook delivered: {event_type} for {request_id}")
            return {"success": True, "status_code": response.status_code}
        else:
            raise Exception(f"Webhook returned {response.status_code}: {response.text[:200]}")
            
    except Exception as e:
        logger.error(f"Webhook delivery failed: {e}")
        
        # Update log
        try:
            from supabase_client import get_supabase_client
            db = get_supabase_client()
            
            if self.request.retries >= self.max_retries:
                # Max retries reached, dead letter
                _update_webhook_log(
                    db, None, "dead_letter",
                    None, str(e),
                    business_id=business_id,
                    request_id=request_id,
                    event_type=event_type
                )
                logger.warning(f"Webhook dead-lettered: {event_type} for {request_id}")
                return {"success": False, "dead_letter": True}
        except Exception:
            pass
        
        # Calculate backoff for retry
        backoff = WEBHOOK_INITIAL_BACKOFF * (2 ** self.request.retries)
        raise self.retry(countdown=backoff)


def _log_webhook_attempt(
    db,
    business_id: str,
    request_id: str,
    event_type: str,
    payload: Dict,
    attempt: int
) -> Optional[str]:
    """Log webhook delivery attempt."""
    try:
        result = db.table("otp_webhook_logs").insert({
            "business_id": business_id,
            "request_id": request_id,
            "event_type": event_type,
            "payload": payload,
            "attempt_count": attempt + 1,
            "status": "pending"
        }).execute()
        
        return result.data[0]["id"] if result.data else None
    except Exception as e:
        logger.warning(f"Failed to log webhook attempt: {e}")
        return None


def _update_webhook_log(
    db,
    log_id: Optional[str],
    status: str,
    status_code: Optional[int],
    error: Optional[str],
    **extra
):
    """Update webhook log entry."""
    try:
        if log_id:
            update = {
                "status": status,
                "last_status_code": status_code,
                "last_error": error
            }
            if status == "delivered":
                update["delivered_at"] = datetime.utcnow().isoformat()
            
            db.table("otp_webhook_logs").update(update).eq("id", log_id).execute()
        elif extra:
            # Create new log for dead letter
            db.table("otp_webhook_logs").insert({
                "business_id": extra.get("business_id"),
                "request_id": extra.get("request_id"),
                "event_type": extra.get("event_type"),
                "payload": {},
                "status": status,
                "last_error": error
            }).execute()
    except Exception as e:
        logger.warning(f"Failed to update webhook log: {e}")
