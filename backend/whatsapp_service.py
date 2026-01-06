"""
WhatsApp Cloud API Service
Handles all interactions with the WhatsApp Business API
"""

import os
import requests
from typing import Dict, Any


class WhatsAppService:
    """Service class for WhatsApp Cloud API operations"""
    
    def __init__(self):
        self.phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
        self.access_token = os.getenv('WHATSAPP_ACCESS_TOKEN')
        self.api_version = 'v18.0'
        self.base_url = f'https://graph.facebook.com/{self.api_version}'
        
    def send_text_message(self, to: str, message: str) -> Dict[str, Any]:
        """
        Send a text message via WhatsApp
        
        Args:
            to: Recipient phone number (with country code, no + sign)
            message: Message text to send
            
        Returns:
            Dict containing success status and response data
        """
        if not self.phone_number_id or not self.access_token:
            return {
                'success': False,
                'error': 'WhatsApp credentials not configured. Please check your .env file.'
            }
        
        # Check if credentials are placeholders
        if 'placeholder' in self.phone_number_id.lower() or 'placeholder' in self.access_token.lower():
            return {
                'success': False,
                'error': 'Please configure real WhatsApp API credentials in the .env file'
            }
        
        url = f'{self.base_url}/{self.phone_number_id}/messages'
        
        # Debug logging
        print(f"   🔧 Using Phone Number ID: {self.phone_number_id}")
        print(f"   📤 API URL: {url}")
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'text',
            'text': {
                'preview_url': False,
                'body': message
            }
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response_data = response.json()
            
            if response.status_code == 200:
                return {
                    'success': True,
                    'message_id': response_data.get('messages', [{}])[0].get('id'),
                    'data': response_data
                }
            else:
                error_message = response_data.get('error', {}).get('message', 'Unknown error')
                return {
                    'success': False,
                    'error': error_message,
                    'status_code': response.status_code,
                    'data': response_data
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Request timed out. Please try again.'
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Unexpected error: {str(e)}'
            }
    
    def check_status(self) -> Dict[str, Any]:
        """
        Check if WhatsApp API credentials are configured
        
        Returns:
            Dict containing configuration status
        """
        if not self.phone_number_id or not self.access_token:
            return {
                'configured': False,
                'message': 'WhatsApp credentials not found in environment variables'
            }
        
        if 'placeholder' in self.phone_number_id.lower() or 'placeholder' in self.access_token.lower():
            return {
                'configured': False,
                'message': 'Placeholder credentials detected. Please add real credentials.'
            }
        
        return {
            'configured': True,
            'message': 'WhatsApp credentials are configured',
            'phone_number_id': self.phone_number_id[:10] + '...'  # Partial for security
        }
    
    def send_message_with_credentials(
        self, 
        phone_number_id: str, 
        access_token: str, 
        to: str, 
        message: str
    ) -> Dict[str, Any]:
        """
        Send a text message using dynamic credentials (for multi-tenant support).
        
        Args:
            phone_number_id: The sender's WhatsApp phone number ID
            access_token: The Facebook/WhatsApp access token
            to: Recipient phone number (with country code, no + sign)
            message: Message text to send
            
        Returns:
            Dict containing success status and response data
        """
        if not phone_number_id or not access_token:
            return {
                'success': False,
                'error': 'Missing phone_number_id or access_token'
            }
        
        url = f'{self.base_url}/{phone_number_id}/messages'
        
        # Debug logging
        print(f"   🔧 Using Phone Number ID: {phone_number_id}")
        print(f"   📤 API URL: {url}")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'text',
            'text': {
                'preview_url': False,
                'body': message
            }
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response_data = response.json()
            
            if response.status_code == 200:
                return {
                    'success': True,
                    'message_id': response_data.get('messages', [{}])[0].get('id'),
                    'data': response_data
                }
            else:
                error_message = response_data.get('error', {}).get('message', 'Unknown error')
                return {
                    'success': False,
                    'error': error_message,
                    'status_code': response.status_code,
                    'data': response_data
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Request timed out. Please try again.'
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Unexpected error: {str(e)}'
            }

    def send_template_message(
        self,
        phone_number_id: str,
        access_token: str,
        to: str,
        template_name: str,
        language_code: str,
        components: list = None
    ) -> Dict[str, Any]:
        """
        Send a template message via WhatsApp.
        
        Args:
            phone_number_id: The sender's WhatsApp phone number ID
            access_token: The Facebook/WhatsApp access token
            to: Recipient phone number (with country code, no + sign)
            template_name: Name of the approved template
            language_code: Language code (e.g., 'en_US', 'en')
            components: List of component objects for variable substitution
                Format: [{"type": "body", "parameters": [{"type": "text", "text": "value"}]}]
            
        Returns:
            Dict containing success status and response data
        """
        if not phone_number_id or not access_token:
            return {
                'success': False,
                'error': 'Missing phone_number_id or access_token'
            }
        
        if not to or not template_name:
            return {
                'success': False,
                'error': 'Missing recipient phone number or template name'
            }
        
        url = f'{self.base_url}/{phone_number_id}/messages'
        
        print(f"   📤 Sending template '{template_name}' to {to}")
        print(f"   🔧 Using Phone Number ID: {phone_number_id}")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Build template payload
        template_payload = {
            'name': template_name,
            'language': {
                'code': language_code
            }
        }
        
        # Add components if provided (for variable substitution)
        if components:
            template_payload['components'] = components
        
        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'template',
            'template': template_payload
        }
        
        print(f"   📦 Payload: {payload}")
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            response_data = response.json()
            
            if response.status_code == 200:
                print(f"   ✅ Template message sent successfully!")
                return {
                    'success': True,
                    'message_id': response_data.get('messages', [{}])[0].get('id'),
                    'data': response_data
                }
            else:
                error_message = response_data.get('error', {}).get('message', 'Unknown error')
                error_code = response_data.get('error', {}).get('code', 'N/A')
                print(f"   ❌ Error: {error_message} (Code: {error_code})")
                return {
                    'success': False,
                    'error': error_message,
                    'error_code': error_code,
                    'status_code': response.status_code,
                    'data': response_data
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Request timed out. Please try again.'
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Unexpected error: {str(e)}'
            }

    def mark_message_as_read(
        self,
        phone_number_id: str = None,
        access_token: str = None,
        message_id: str = None,
        show_typing: bool = False
    ) -> Dict[str, Any]:
        """
        Mark a received message as read, optionally showing typing indicator.
        
        Per Meta's Oct 2025 API update, typing indicator can be included in the
        read receipt request. The typing indicator dismisses when you respond
        or after 25 seconds, whichever comes first.
        
        Args:
            phone_number_id: Sender's phone number ID (uses env if None)
            access_token: Access token (uses env if None)
            message_id: ID of the message to mark as read
            show_typing: If True, also show typing indicator to the user
            
        Returns:
            Success status and response
        """
        if not message_id:
            return {'success': False, 'error': 'message_id is required'}
            
        pid = phone_number_id or self.phone_number_id
        token = access_token or self.access_token
        
        if not pid or not token:
            return {'success': False, 'error': 'Credentials not configured'}
            
        url = f'{self.base_url}/{pid}/messages'
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'messaging_product': 'whatsapp',
            'status': 'read',
            'message_id': message_id
        }
        
        # Add typing indicator per Meta's Oct 2025 API
        # https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#typing-indicators
        if show_typing:
            payload['typing_indicator'] = {
                'type': 'text'
            }
        
        try:
            typing_msg = " (with typing indicator)" if show_typing else ""
            print(f"👀 Marking message {message_id} as read{typing_msg}...")
            response = requests.post(url, json=payload, headers=headers, timeout=5)
            if response.status_code != 200:
                print(f"⚠️ Read receipt response: {response.text}")
            return {'success': response.status_code == 200}
        except Exception as e:
            print(f"❌ Failed to mark as read: {e}")
            return {'success': False, 'error': str(e)}

    def send_typing_indicator(
        self,
        phone_number_id: str = None,
        access_token: str = None,
        to: str = None
    ) -> Dict[str, Any]:
        """
        Show typing indicator to the user.
        
        Args:
            phone_number_id: Sender's phone number ID (uses env if None)
            access_token: Access token (uses env if None)
            to: Recipient's phone number
            
        Returns:
            Success status and response
        """
        if not to:
            return {'success': False, 'error': 'Recipient phone number required'}
            
        pid = phone_number_id or self.phone_number_id
        token = access_token or self.access_token
        
        if not pid or not token:
            return {'success': False, 'error': 'Credentials not configured'}
            
        url = f'{self.base_url}/{pid}/messages'
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        # Sender action 'typing_on' shows the "typing..." status
        # It automatically turns off after a few seconds or when a message is sent
        # Correct payload for sender_action
        # https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#typing-indicators
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "sender_action",
            "sender_action": "typing_on" 
        }
        
        try:
            print(f"✍️ Sending typing indicator to {to}...")
            response = requests.post(url, json=payload, headers=headers, timeout=5)
            if response.status_code != 200:
                print(f"⚠️ Failed to send typing indicator: {response.text}")
            return {'success': response.status_code == 200}
        except Exception as e:
            print(f"❌ Failed to send typing indicator: {e}")
            return {'success': False, 'error': str(e)}

    def send_interactive_buttons(
        self,
        phone_number_id: str,
        access_token: str,
        to: str,
        body_text: str,
        buttons: list,
        header_text: str = None,
        footer_text: str = None
    ) -> Dict[str, Any]:
        """
        Send an interactive message with reply buttons.
        
        WhatsApp allows up to 3 buttons per message. Each button has an id and title.
        When user taps a button, the button title and id are sent back as the reply.
        
        Args:
            phone_number_id: The sender's WhatsApp phone number ID
            access_token: The Facebook/WhatsApp access token
            to: Recipient phone number (with country code, no + sign)
            body_text: Main message body text
            buttons: List of button dicts, e.g., [{"id": "yes", "title": "✅ Yes, Confirm"}]
                     Max 3 buttons, title max 20 chars, id max 256 chars
            header_text: Optional header text (max 60 chars)
            footer_text: Optional footer text (max 60 chars)
            
        Returns:
            Dict containing success status and response data
        """
        if not phone_number_id or not access_token:
            return {
                'success': False,
                'error': 'Missing phone_number_id or access_token'
            }
        
        if not buttons or len(buttons) > 3:
            return {
                'success': False,
                'error': 'Buttons required (1-3 buttons allowed)'
            }
        
        url = f'{self.base_url}/{phone_number_id}/messages'
        
        print(f"   🔘 Sending interactive buttons to {to}")
        print(f"   🔧 Using Phone Number ID: {phone_number_id}")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Build button objects for WhatsApp API
        button_objects = []
        for btn in buttons:
            button_objects.append({
                "type": "reply",
                "reply": {
                    "id": btn.get("id", btn.get("title", "button"))[:256],
                    "title": btn.get("title", "Button")[:20]  # WhatsApp limit: 20 chars
                }
            })
        
        # Build interactive message payload
        interactive_payload = {
            "type": "button",
            "body": {
                "text": body_text
            },
            "action": {
                "buttons": button_objects
            }
        }
        
        # Add optional header
        if header_text:
            interactive_payload["header"] = {
                "type": "text",
                "text": header_text[:60]  # WhatsApp limit: 60 chars
            }
        
        # Add optional footer
        if footer_text:
            interactive_payload["footer"] = {
                "text": footer_text[:60]  # WhatsApp limit: 60 chars
            }
        
        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'interactive',
            'interactive': interactive_payload
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response_data = response.json()
            
            if response.status_code == 200:
                print(f"   ✅ Interactive buttons sent successfully!")
                return {
                    'success': True,
                    'message_id': response_data.get('messages', [{}])[0].get('id'),
                    'data': response_data
                }
            else:
                error_message = response_data.get('error', {}).get('message', 'Unknown error')
                error_code = response_data.get('error', {}).get('code', 'N/A')
                print(f"   ❌ Error: {error_message} (Code: {error_code})")
                return {
                    'success': False,
                    'error': error_message,
                    'error_code': error_code,
                    'status_code': response.status_code,
                    'data': response_data
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Request timed out. Please try again.'
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Unexpected error: {str(e)}'
            }

    def send_interactive_list(
        self,
        phone_number_id: str,
        access_token: str,
        to: str,
        body_text: str,
        button_text: str,
        sections: list,
        header_text: str = None,
        footer_text: str = None
    ) -> Dict[str, Any]:
        """
        Send an interactive list message (menu with up to 10 items).
        
        WhatsApp List Messages show a single button that opens a list picker.
        Great for menus with more than 3 options.
        
        Args:
            phone_number_id: The sender's WhatsApp phone number ID
            access_token: The Facebook/WhatsApp access token
            to: Recipient phone number (with country code, no + sign)
            body_text: Main message body text
            button_text: Text shown on the button (max 20 chars), e.g., "View Menu"
            sections: List of section dicts with title and rows:
                [
                    {
                        "title": "Section Title",
                        "rows": [
                            {"id": "row_1", "title": "Item 1", "description": "Optional desc"},
                            {"id": "row_2", "title": "Item 2"}
                        ]
                    }
                ]
                Max 10 rows total, title max 24 chars, description max 72 chars
            header_text: Optional header text (max 60 chars)
            footer_text: Optional footer text (max 60 chars)
            
        Returns:
            Dict containing success status and response data
        """
        if not phone_number_id or not access_token:
            return {
                'success': False,
                'error': 'Missing phone_number_id or access_token'
            }
        
        if not sections:
            return {
                'success': False,
                'error': 'Sections required for list message'
            }
        
        url = f'{self.base_url}/{phone_number_id}/messages'
        
        print(f"   📋 Sending interactive list to {to}")
        print(f"   🔧 Using Phone Number ID: {phone_number_id}")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Build sections with proper row format
        formatted_sections = []
        for section in sections:
            formatted_rows = []
            for row in section.get("rows", []):
                row_obj = {
                    "id": row.get("id", row.get("title", "item"))[:200],
                    "title": row.get("title", "Item")[:24]
                }
                if row.get("description"):
                    row_obj["description"] = row["description"][:72]
                formatted_rows.append(row_obj)
            
            formatted_section = {"rows": formatted_rows}
            if section.get("title"):
                formatted_section["title"] = section["title"][:24]
            formatted_sections.append(formatted_section)
        
        # Build interactive list message payload
        interactive_payload = {
            "type": "list",
            "body": {
                "text": body_text
            },
            "action": {
                "button": button_text[:20],  # WhatsApp limit: 20 chars
                "sections": formatted_sections
            }
        }
        
        # Add optional header
        if header_text:
            interactive_payload["header"] = {
                "type": "text",
                "text": header_text[:60]
            }
        
        # Add optional footer
        if footer_text:
            interactive_payload["footer"] = {
                "text": footer_text[:60]
            }
        
        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'interactive',
            'interactive': interactive_payload
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response_data = response.json()
            
            if response.status_code == 200:
                print(f"   ✅ Interactive list sent successfully!")
                return {
                    'success': True,
                    'message_id': response_data.get('messages', [{}])[0].get('id'),
                    'data': response_data
                }
            else:
                error_message = response_data.get('error', {}).get('message', 'Unknown error')
                error_code = response_data.get('error', {}).get('code', 'N/A')
                print(f"   ❌ Error: {error_message} (Code: {error_code})")
                return {
                    'success': False,
                    'error': error_message,
                    'error_code': error_code,
                    'status_code': response.status_code,
                    'data': response_data
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Request timed out. Please try again.'
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Unexpected error: {str(e)}'
            }