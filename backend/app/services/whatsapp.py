import httpx
from typing import Optional, Dict, Any
from app.config import settings


class WhatsAppService:
    """WhatsApp Cloud API Service"""
    
    def __init__(self, phone_number_id: str, access_token: str):
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        self.base_url = f"{settings.WHATSAPP_API_BASE_URL}/{settings.WHATSAPP_API_VERSION}"
    
    async def send_text_message(self, to: str, text: str) -> Dict[str, Any]:
        """Send a text message"""
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {
                "body": text
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
    
    async def send_template_message(
        self,
        to: str,
        template_name: str,
        language_code: str = "en",
        components: Optional[list] = None
    ) -> Dict[str, Any]:
        """Send a template message"""
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "code": language_code
                }
            }
        }
        
        if components:
            payload["template"]["components"] = components
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
    
    async def send_interactive_message(
        self,
        to: str,
        message_type: str,  # button, list
        body_text: str,
        buttons: Optional[list] = None,
        header: Optional[str] = None,
        footer: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send an interactive message with buttons"""
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        interactive = {
            "type": message_type,
            "body": {
                "text": body_text
            }
        }
        
        if header:
            interactive["header"] = {"type": "text", "text": header}
        
        if footer:
            interactive["footer"] = {"text": footer}
        
        if message_type == "button" and buttons:
            interactive["action"] = {"buttons": buttons}
        
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": interactive
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
    
    async def mark_message_as_read(self, message_id: str) -> Dict[str, Any]:
        """Mark a message as read"""
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
