"""
WhatsApp messaging routes with proper credential handling.
"""

from flask import Blueprint, request, jsonify
import logging
import os

logger = logging.getLogger(__name__)

# Import WhatsApp service and Supabase client
try:
    from whatsapp_service import WhatsAppService
    from supabase_client import (
        get_supabase_client,
        get_credentials_for_user,
        store_message,
        get_business_id_for_user
    )
    SERVICES_AVAILABLE = True
except ImportError as e:
    logger.error(f"Failed to import services: {e}")
    SERVICES_AVAILABLE = False

messaging_bp = Blueprint('messaging', __name__)
whatsapp_service = WhatsAppService() if SERVICES_AVAILABLE else None


@messaging_bp.route('/api/whatsapp/send-message', methods=['POST'])
def send_message_with_user_credentials():
    """
    Send a WhatsApp message using the authenticated user's credentials.
    This endpoint is used by the dashboard to send messages to customers.
    """
    if not SERVICES_AVAILABLE:
        return jsonify({
            'success': False,
            'message': 'WhatsApp service not available'
        }), 503
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400
        
        to = data.get('to', '').strip()
        message = data.get('message', '').strip()
        user_id = request.headers.get('X-User-ID')
        
        if not to:
            return jsonify({
                'success': False,
                'message': 'Recipient phone number is required'
            }), 400
        
        if not message:
            return jsonify({
                'success': False,
                'message': 'Message text is required'
            }), 400
        
        if not user_id:
            return jsonify({
                'success': False,
                'message': 'User authentication required. Please log in again.'
            }), 401
        
        # Clean phone number
        to = to.replace('+', '').replace(' ', '').replace('-', '')
        
        if not to.isdigit():
            return jsonify({
                'success': False,
                'message': 'Invalid phone number format'
            }), 400
        
        # Get user's WhatsApp Business credentials from Supabase
        credentials = get_credentials_for_user(user_id)
        
        if not credentials:
            return jsonify({
                'success': False,
                'message': 'No WhatsApp Business account connected. Please connect your account in settings.'
            }), 400
        
        phone_number_id = credentials.get('phone_number_id')
        access_token = credentials.get('access_token')
        display_phone = credentials.get('display_phone_number', 'Unknown')
        
        if not phone_number_id or not access_token:
            return jsonify({
                'success': False,
                'message': 'Invalid WhatsApp credentials. Please reconnect your account.'
            }), 400
        
        # Send message using user's credentials
        logger.info(f"📤 Sending message to {to} using phone number ID: {phone_number_id}")
        
        result = whatsapp_service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=message
        )
        
        if result['success']:
            message_id = result.get('message_id', 'N/A')
            logger.info(f"✅ Message sent successfully: {message_id}")
            
            # Store message in database
            if message_id != 'N/A':
                try:
                    store_message(
                        user_id=user_id,
                        phone_number_id=phone_number_id,
                        message_id=message_id,
                        direction='outbound',
                        from_number=display_phone,
                        to_number=to,
                        message_type='text',
                        message_body=message,
                        status='sent',
                        wamid=message_id,
                        conversation_origin='business_initiated',
                        is_ai_generated=False
                    )
                except Exception as store_err:
                    logger.warning(f"Failed to store message: {store_err}")
            
            return jsonify({
                'success': True,
                'message': 'Message sent successfully',
                'data': {
                    'messageId': message_id
                }
            }), 200
        else:
            error_msg = result.get('error', 'Failed to send message')
            logger.error(f"❌ Failed to send message: {error_msg}")
            return jsonify({
                'success': False,
                'message': error_msg
            }), 400
            
    except Exception as e:
        logger.error(f"❌ Send message error: {e}")
        return jsonify({
            'success': False,
            'message': f'Server error: {str(e)}'
        }), 500


def register_messaging_routes(app):
    """Register messaging routes with the Flask app."""
    app.register_blueprint(messaging_bp)
    logger.info("✅ Registered messaging routes")
