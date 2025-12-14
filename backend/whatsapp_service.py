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
