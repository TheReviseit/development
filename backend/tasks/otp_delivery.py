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
WHATSAPP_OTP_LANGUAGE = os.getenv('WHATSAPP_OTP_LANGUAGE', 'en_US')  # Support en, en_US, etc.


# =============================================================================
# EXCEPTIONS & VALIDATION
# =============================================================================

class OTPDeliveryError(Exception):
    """Raised when OTP delivery fails irrecoverably."""
    def __init__(self, message: str, error_code: str = "OTP_DELIVERY_FAILED", retryable: bool = False):
        super().__init__(message)
        self.error_code = error_code
        self.retryable = retryable


def validate_auth_template(template_name: str, otp: str) -> None:
    """
    Validate authentication template contract before sending.
    
    WhatsApp authentication templates with copy_code button require the OTP code.
    This guard prevents silent failures from missing OTP.
    
    Args:
        template_name: The template name
        otp: The OTP code to send
        
    Raises:
        ValueError: If template contract is violated
    """
    if not template_name:
        raise ValueError("Template name missing - cannot send OTP without template")
    
    if not otp:
        raise ValueError("OTP parameter missing - authentication template requires the OTP code")
    
    if not otp.isdigit() or len(otp) < 4 or len(otp) > 8:
        raise ValueError(
            f"OTP must be a numeric string between 4-8 digits, got: '{otp}'"
        )


def validate_whatsapp_response(response_data: dict) -> str:
    """
    Validate WhatsApp API response contains a valid message ID (wamid).
    
    Meta sometimes returns 200 OK but still rejects the message internally.
    The presence of wamid confirms successful message acceptance.
    
    Args:
        response_data: The parsed JSON response from WhatsApp API
        
    Returns:
        The message ID (wamid)
        
    Raises:
        OTPDeliveryError: If response indicates rejection
    """
    messages = response_data.get("messages", [])
    
    if not messages:
        error_info = response_data.get("error", {})
        raise OTPDeliveryError(
            f"WhatsApp delivery rejected - no message ID returned. Response: {response_data}",
            error_code=str(error_info.get("code", "WHATSAPP_REJECTED")),
            retryable=False
        )
    
    message_id = messages[0].get("id")
    if not message_id:
        raise OTPDeliveryError(
            f"WhatsApp delivery rejected - empty message ID. Response: {response_data}",
            error_code="WHATSAPP_NO_WAMID",
            retryable=False
        )
    
    return message_id


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
    """Get project configuration including WhatsApp credentials."""
    try:
        # First try otp_projects table (new schema)
        result = db.table("otp_projects").select(
            "id, name, whatsapp_mode, whatsapp_phone_number_id, webhook_url, webhook_secret"
        ).eq("id", business_id).single().execute()
        
        project = result.data if result.data else {}
        
        if project.get("whatsapp_mode") == "customer" and project.get("whatsapp_phone_number_id"):
            # Customer mode: get their credentials
            try:
                from credential_manager import get_credentials_by_phone_number_id
                creds = get_credentials_by_phone_number_id(project["whatsapp_phone_number_id"])
                if creds:
                    project["access_token"] = creds.get("access_token")
                    project["phone_number_id"] = creds.get("phone_number_id")
            except Exception as e:
                logger.warning(f"Failed to get customer credentials: {e}")
        
        # Fallback to platform mode: use environment credentials
        if not project.get("phone_number_id"):
            project["phone_number_id"] = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
        if not project.get("access_token"):
            project["access_token"] = os.getenv("WHATSAPP_ACCESS_TOKEN")
        
        return project
        
    except Exception as e:
        logger.error(f"Failed to get project config: {e}")
        return {
            "phone_number_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID"),
            "access_token": os.getenv("WHATSAPP_ACCESS_TOKEN")
        }


def _send_whatsapp_otp(business: Dict, phone: str, otp: str) -> Dict[str, Any]:
    """
    Send OTP via WhatsApp using Meta's authentication template.
    
    IMPORTANT: Authentication templates have a predefined structure.
    The button is auto-generated by Meta - we ONLY provide the body parameter
    containing the OTP code.
    
    Args:
        business: Business config containing phone_number_id and access_token
        phone: Recipient phone number in E.164 format
        otp: The OTP code to send
        
    Returns:
        Dict with success status and message_id or error
    """
    phone_number_id = business.get("phone_number_id")
    access_token = business.get("access_token")
    
    if not phone_number_id or not access_token:
        logger.error("WhatsApp credentials not configured for OTP delivery")
        return {
            "success": False, 
            "error": "WhatsApp credentials not configured",
            "error_code": "CREDENTIALS_MISSING"
        }
    
    # Validate template contract BEFORE sending
    try:
        validate_auth_template(WHATSAPP_OTP_TEMPLATE, otp)
    except ValueError as e:
        logger.error(f"Template validation failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "error_code": "TEMPLATE_VALIDATION_FAILED"
        }
    
    # Format phone (remove + for WhatsApp API)
    whatsapp_phone = phone.lstrip('+')
    
    # Build the CORRECT payload for authentication templates
    # https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # AUTHENTICATION TEMPLATE PAYLOAD WITH COPY_CODE BUTTON
    # For WhatsApp authentication templates with "Copy code" button,
    # we must provide the OTP in BOTH body AND button components.
    # The button uses sub_type="copy_code" for authentication templates.
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": whatsapp_phone,
        "type": "template",
        "template": {
            "name": WHATSAPP_OTP_TEMPLATE,
            "language": {"code": WHATSAPP_OTP_LANGUAGE},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": otp}]
                },
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [
                        {
                            "type": "text",
                            "text": otp
                        }
                    ]
                }
            ]
        }
    }
    
    logger.info(f"Sending OTP to {whatsapp_phone} via template '{WHATSAPP_OTP_TEMPLATE}'")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        data = response.json()
        
        if response.status_code == 200:
            # Validate wamid presence to confirm delivery acceptance
            try:
                message_id = validate_whatsapp_response(data)
                logger.info(f"WhatsApp OTP sent successfully: wamid={message_id}")
                return {
                    "success": True, 
                    "message_id": message_id
                }
            except OTPDeliveryError as e:
                logger.error(f"WhatsApp response validation failed: {e}")
                return {
                    "success": False, 
                    "error": str(e),
                    "error_code": e.error_code
                }
        else:
            # Parse WhatsApp error response
            error_obj = data.get("error", {})
            error_code = error_obj.get("code", "UNKNOWN")
            error_message = error_obj.get("message", response.text)
            error_subcode = error_obj.get("error_subcode", "")
            
            logger.error(
                f"WhatsApp API error: code={error_code}, subcode={error_subcode}, "
                f"message={error_message}, status={response.status_code}"
            )
            
            return {
                "success": False, 
                "error": error_message,
                "error_code": str(error_code),
                "status_code": response.status_code
            }
            
    except requests.Timeout:
        logger.error("WhatsApp API timeout after 30 seconds")
        return {
            "success": False, 
            "error": "WhatsApp API timeout",
            "error_code": "TIMEOUT",
            "retryable": True
        }
    except requests.RequestException as e:
        logger.error(f"WhatsApp API request failed: {e}")
        return {
            "success": False, 
            "error": f"Network error: {str(e)}",
            "error_code": "NETWORK_ERROR",
            "retryable": True
        }
    except Exception as e:
        logger.error(f"Unexpected error sending WhatsApp OTP: {e}")
        return {
            "success": False, 
            "error": str(e),
            "error_code": "UNEXPECTED_ERROR"
        }


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
        
        # Get project webhook config
        result = db.table("otp_projects").select(
            "webhook_url, webhook_secret"
        ).eq("id", business_id).single().execute()
        
        project = result.data
        
        if not project or not project.get("webhook_url"):
            logger.debug(f"No webhook configured for project {business_id}")
            return {"success": True, "skipped": True}
        
        webhook_url = project["webhook_url"]
        webhook_secret = project.get("webhook_secret", "")
        
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
            "project_id": business_id,  # Use project_id
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
                "project_id": extra.get("business_id"),  # Use project_id
                "request_id": extra.get("request_id"),
                "event_type": extra.get("event_type"),
                "payload": {},
                "status": status,
                "last_error": error
            }).execute()
    except Exception as e:
        logger.warning(f"Failed to update webhook log: {e}")
