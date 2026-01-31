"""
WhatsApp Media Service - Document Upload and Send
Isolated service for WhatsApp media operations.

NO invoice logic here - only media operations.
Retry-safe, idempotent operations.
"""

import logging
import requests
from typing import Dict, Any, Optional

logger = logging.getLogger('reviseit.services.whatsapp_media')

# WhatsApp API version
API_VERSION = "v18.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"


# =============================================================================
# Document Upload
# =============================================================================

def upload_document(
    phone_number_id: str,
    access_token: str,
    pdf_bytes: bytes,
    filename: str,
    mime_type: str = "application/pdf"
) -> Optional[str]:
    """
    Upload PDF bytes to WhatsApp Media API.
    
    Args:
        phone_number_id: WhatsApp Business phone number ID
        access_token: Facebook/WhatsApp access token
        pdf_bytes: PDF file bytes
        filename: Filename for the document
        mime_type: MIME type (default: application/pdf)
        
    Returns:
        media_id on success, None on failure
        
    Note:
        WhatsApp Media API accepts files up to 100MB
        PDFs should be well under this limit
    """
    if not phone_number_id or not access_token:
        logger.error("Missing phone_number_id or access_token")
        return None
    
    if not pdf_bytes:
        logger.error("Empty PDF bytes provided")
        return None
    
    url = f"{BASE_URL}/{phone_number_id}/media"
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    # Multipart form data for file upload
    files = {
        "file": (filename, pdf_bytes, mime_type)
    }
    
    data = {
        "messaging_product": "whatsapp",
        "type": mime_type
    }
    
    try:
        logger.info(f"📤 Uploading document: {filename} ({len(pdf_bytes)} bytes)")
        
        response = requests.post(
            url,
            headers=headers,
            data=data,
            files=files,
            timeout=30
        )
        
        response_data = response.json()
        
        if response.status_code == 200 and "id" in response_data:
            media_id = response_data["id"]
            logger.info(f"✅ Document uploaded successfully, media_id: {media_id}")
            return media_id
        else:
            error_msg = response_data.get("error", {}).get("message", "Unknown error")
            logger.error(f"❌ Upload failed: {error_msg}")
            return None
            
    except requests.exceptions.Timeout:
        logger.error("❌ Upload timeout - WhatsApp API slow")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Upload network error: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ Upload unexpected error: {e}")
        return None


# =============================================================================
# Document Message Send
# =============================================================================

def send_document_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    media_id: str,
    filename: str,
    caption: Optional[str] = None
) -> Dict[str, Any]:
    """
    Send document message using uploaded media_id.
    
    Args:
        phone_number_id: WhatsApp Business phone number ID
        access_token: Facebook/WhatsApp access token
        to: Recipient phone number (with country code, no +)
        media_id: Media ID from upload_document
        filename: Display filename for the document
        caption: Optional caption text
        
    Returns:
        Dict with success status and message_id or error
    """
    if not phone_number_id or not access_token:
        return {
            "success": False,
            "error": "Missing phone_number_id or access_token"
        }
    
    if not media_id:
        return {
            "success": False,
            "error": "Missing media_id"
        }
    
    url = f"{BASE_URL}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Build document payload
    document_payload = {
        "id": media_id,
        "filename": filename
    }
    
    if caption:
        document_payload["caption"] = caption[:1024]  # WhatsApp limit
    
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "document",
        "document": document_payload
    }
    
    try:
        logger.info(f"📄 Sending document to {to}: {filename}")
        
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=15
        )
        
        response_data = response.json()
        
        if response.status_code == 200:
            message_id = response_data.get("messages", [{}])[0].get("id")
            logger.info(f"✅ Document sent successfully, message_id: {message_id}")
            return {
                "success": True,
                "message_id": message_id,
                "data": response_data
            }
        else:
            error_msg = response_data.get("error", {}).get("message", "Unknown error")
            error_code = response_data.get("error", {}).get("code", "N/A")
            logger.error(f"❌ Send failed: {error_msg} (Code: {error_code})")
            return {
                "success": False,
                "error": error_msg,
                "error_code": error_code,
                "status_code": response.status_code,
                "data": response_data
            }
            
    except requests.exceptions.Timeout:
        logger.error("❌ Send timeout")
        return {
            "success": False,
            "error": "Request timed out"
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Send network error: {e}")
        return {
            "success": False,
            "error": f"Network error: {str(e)}"
        }
    except Exception as e:
        logger.error(f"❌ Send unexpected error: {e}")
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }


# =============================================================================
# Combined Upload and Send (Convenience)
# =============================================================================

def upload_and_send_document(
    phone_number_id: str,
    access_token: str,
    to: str,
    pdf_bytes: bytes,
    filename: str,
    caption: Optional[str] = None
) -> Dict[str, Any]:
    """
    Upload PDF and send as document in one call.
    
    This is the main function for invoice delivery.
    
    Args:
        phone_number_id: WhatsApp Business phone number ID
        access_token: Facebook/WhatsApp access token
        to: Recipient phone number
        pdf_bytes: PDF file bytes
        filename: Display filename
        caption: Optional caption text
        
    Returns:
        Dict with success status, media_id, message_id or error
    """
    # Step 1: Upload
    media_id = upload_document(
        phone_number_id=phone_number_id,
        access_token=access_token,
        pdf_bytes=pdf_bytes,
        filename=filename
    )
    
    if not media_id:
        return {
            "success": False,
            "error": "Failed to upload document to WhatsApp"
        }
    
    # Step 2: Send
    result = send_document_message(
        phone_number_id=phone_number_id,
        access_token=access_token,
        to=to,
        media_id=media_id,
        filename=filename,
        caption=caption
    )
    
    # Add media_id to result for tracking
    result["media_id"] = media_id
    
    return result
