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
