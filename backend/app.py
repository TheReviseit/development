"""
Flask Backend for WhatsApp Admin Dashboard
Provides API endpoints for sending WhatsApp messages
"""

import os
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from whatsapp_service import WhatsAppService

# Supabase client for multi-tenant credential lookup
try:
    from supabase_client import (
        get_credentials_by_phone_number_id, 
        get_business_data_for_user,
        store_message,
        update_message_status
    )
    SUPABASE_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Supabase client not available: {e}")
    SUPABASE_AVAILABLE = False
    get_credentials_by_phone_number_id = None
    get_business_data_for_user = None
    store_message = None
    update_message_status = None

# AI Brain import (optional, graceful fallback if not available)
try:
    from ai_brain import AIBrain, AIBrainConfig
    from supabase_client import get_supabase_client
    
    # Initialize with Supabase client for LLM usage tracking
    supabase_client = get_supabase_client() if SUPABASE_AVAILABLE else None
    ai_brain = AIBrain(
        config=AIBrainConfig.from_env(),
        supabase_client=supabase_client
    )
    AI_BRAIN_AVAILABLE = True
    print("🧠 AI Brain initialized with usage tracking")
except ImportError as e:
    print(f"⚠️ AI Brain not available: {e}")
    ai_brain = None
    AI_BRAIN_AVAILABLE = False

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Configure CORS to allow requests from frontend
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
CORS(app, resources={
    r"/api/*": {
        "origins": [frontend_url],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Initialize WhatsApp service
whatsapp_service = WhatsAppService()


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'message': 'WhatsApp Admin API is running'
    }), 200


@app.route('/api/whatsapp/status', methods=['GET'])
def check_whatsapp_status():
    """Check WhatsApp API configuration status"""
    status = whatsapp_service.check_status()
    return jsonify(status), 200


@app.route('/api/whatsapp/send', methods=['POST'])
def send_message():
    """
    Send a WhatsApp message
    
    Expected JSON body:
    {
        "to": "recipient_phone_number",  // Format: country code + number (e.g., 919876543210)
        "message": "Your message text"
    }
    """
    try:
        # Validate request data
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        to = data.get('to', '').strip()
        message = data.get('message', '').strip()
        
        # Validate required fields
        if not to:
            return jsonify({
                'success': False,
                'error': 'Recipient phone number is required'
            }), 400
        
        if not message:
            return jsonify({
                'success': False,
                'error': 'Message text is required'
            }), 400
        
        # Remove + sign if present
        to = to.replace('+', '')
        
        # Validate phone number format (basic check)
        if not to.isdigit():
            return jsonify({
                'success': False,
                'error': 'Invalid phone number format. Use digits only (e.g., 919876543210)'
            }), 400
        
        if len(to) < 10 or len(to) > 15:
            return jsonify({
                'success': False,
                'error': 'Phone number must be between 10 and 15 digits'
            }), 400
        
        # Send message via WhatsApp service
        result = whatsapp_service.send_text_message(to, message)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500


# ============================================
# WhatsApp Webhook (receives incoming messages)
# ============================================

# Store for business data (in production, fetch from database)
BUSINESS_DATA_CACHE = {}

# Default business data if none provided
DEFAULT_BUSINESS_DATA = {
    "business_id": "default",
    "business_name": "Our Business",
    "industry": "other",
    "products_services": [],
    "contact": {"phone": os.getenv('WHATSAPP_PHONE_NUMBER_ID', '')},
}

@app.route('/api/whatsapp/webhook', methods=['GET'])
def verify_webhook():
    """
    Verify webhook for WhatsApp Cloud API.
    Facebook sends a GET request to verify the webhook URL.
    """
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    verify_token = os.getenv('WHATSAPP_VERIFY_TOKEN', 'reviseit_webhook_token')
    
    if mode == 'subscribe' and token == verify_token:
        print(f"✅ Webhook verified successfully!")
        return challenge, 200
    else:
        print(f"❌ Webhook verification failed. Token: {token}")
        return 'Forbidden', 403


@app.route('/api/whatsapp/webhook', methods=['POST'])
def webhook():
    """
    Receive incoming WhatsApp messages and respond with AI.
    """
    try:
        data = request.get_json()
        
        # Log incoming webhook
        print(f"📨 Webhook received: {data}")
        
        # Extract message data
        entry = data.get('entry', [{}])[0]
        changes = entry.get('changes', [{}])[0]
        value = changes.get('value', {})
        messages = value.get('messages', [])
        statuses = value.get('statuses', [])
        
        # Extract phone_number_id from webhook metadata (identifies which customer this is for)
        metadata = value.get('metadata', {})
        phone_number_id = metadata.get('phone_number_id')
        display_phone = metadata.get('display_phone_number', 'Unknown')
        
        print(f"📞 Webhook for phone: {display_phone} (ID: {phone_number_id})")
        
        # Handle status updates (sent, delivered, read)
        if statuses and SUPABASE_AVAILABLE and update_message_status:
            for status_update in statuses:
                status_msg_id = status_update.get('id')
                status = status_update.get('status')
                timestamp = status_update.get('timestamp')
                
                if status_msg_id and status:
                    # Convert timestamp to ISO format
                    from datetime import datetime
                    iso_timestamp = None
                    if timestamp:
                        try:
                            iso_timestamp = datetime.fromtimestamp(int(timestamp)).isoformat()
                        except:
                            pass
                    
                    update_message_status(status_msg_id, status, iso_timestamp)
        
        if not messages:
            # No messages - was a status update
            return jsonify({'status': 'ok'}), 200
        
        message = messages[0]
        from_number = message.get('from')
        message_type = message.get('type')
        msg_id = message.get('id')
        
        # Get contact name from contacts array
        contacts = value.get('contacts', [])
        contact_name = None
        if contacts:
            contact_name = contacts[0].get('profile', {}).get('name')
        
        # Extract message content based on type
        message_text = ''
        media_id = None
        if message_type == 'text':
            message_text = message.get('text', {}).get('body', '')
        elif message_type in ['image', 'video', 'audio', 'document']:
            media_data = message.get(message_type, {})
            media_id = media_data.get('id')
            message_text = media_data.get('caption', '')
        
        print(f"💬 Message from {from_number}: {message_text or f'[{message_type}]'}")
        
        # 1. Fetch credentials (needed for read receipts, typing, and sending)
        credentials = None
        business_data = None
        user_id = None
        
        if SUPABASE_AVAILABLE and phone_number_id:
            credentials = get_credentials_by_phone_number_id(phone_number_id)
            if credentials:
                user_id = credentials.get('user_id')
                # Get business-specific data for AI context
                try:
                    business_data = get_business_data_for_user(user_id) or DEFAULT_BUSINESS_DATA
                    business_data['business_name'] = credentials.get('business_name', 'Our Business')
                except Exception as e:
                    print(f"⚠️ Error fetching business data: {e}")
                    business_data = BUSINESS_DATA_CACHE.get('current', DEFAULT_BUSINESS_DATA)
        
        if not business_data:
             business_data = BUSINESS_DATA_CACHE.get('current', DEFAULT_BUSINESS_DATA)

        # 2. Store the incoming message in the database
        if SUPABASE_AVAILABLE and store_message and user_id:
            store_message(
                user_id=user_id,
                phone_number_id=phone_number_id,
                message_id=msg_id,
                direction='inbound',
                from_number=from_number,
                to_number=display_phone,
                message_type=message_type,
                message_body=message_text if message_text else None,
                status='delivered',
                contact_name=contact_name,
                wamid=msg_id,
                media_id=media_id,
                conversation_origin='user_initiated'
            )

        # 3. Mark as Read & Send Typing Indicator
        # We need the specific access_token and phone_number_id for this business
        wa_id = credentials.get('phone_number_id') if credentials else None
        token = credentials.get('access_token') if credentials else None
        
        # Mark as read
        if msg_id:
            whatsapp_service.mark_message_as_read(wa_id, token, msg_id)
            
        # NOTE: Typing indicator disabled - WhatsApp API v18.0 doesn't support sender_action
        # whatsapp_service.send_typing_indicator(wa_id, token, from_number)
        
        # Generate response immediately (typing indicator no longer used)
        
        # 4. Generate AI response (only for text messages)
        if message_type == 'text':
            if AI_BRAIN_AVAILABLE and ai_brain:
                # Generate AI reply
                try:
                    result = ai_brain.generate_reply(
                        business_data=business_data,
                        user_message=message_text,
                        history=[]  # Could store conversation history per user
                    )
                    
                    reply_text = result.get('reply', "I'll connect you with our team shortly.")
                    intent = result.get('intent', 'unknown')
                    needs_human = result.get('needs_human', False)
                    
                    print(f"🤖 AI Response (intent: {intent}, needs_human: {needs_human}): {reply_text}")
                    
                    # Log metadata for debugging
                    metadata = result.get('metadata', {})
                    if 'error' in metadata:
                        print(f"⚠️ AI Error in metadata: {metadata['error']}")
                    if metadata.get('generation_method') == 'error':
                        print(f"⚠️ Error generation method detected")
                        
                except Exception as e:
                    print(f"❌ Exception in AI generation: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    reply_text = "Thank you for your message! Our team will respond shortly."
            else:
                # Fallback if AI not available
                reply_text = "Thank you for your message! Our team will respond shortly."
        else:
            # For non-text messages
            reply_text = f"Thank you for sending a {message_type}! Our team will review it shortly."
        
        # 5. Send the reply using dynamic credentials (multi-tenant) or fallback to .env
        if credentials and credentials.get('access_token'):
            print(f"🏢 Using credentials for: {credentials.get('business_name')}")
            send_result = whatsapp_service.send_message_with_credentials(
                phone_number_id=credentials['phone_number_id'],
                access_token=credentials['access_token'],
                to=from_number,
                message=reply_text
            )
        else:
            # Fallback to .env credentials
            print(f"⚠️ Using fallback .env credentials")
            send_result = whatsapp_service.send_text_message(from_number, reply_text)
        
        if send_result['success']:
            reply_message_id = send_result.get('message_id', 'N/A')
            print(f"✅ Reply sent successfully to {from_number}")
            print(f"   📋 Message ID: {reply_message_id}")
            print(f"   📦 Full Response: {send_result.get('data', {})}")
            
            # 6. Store the outgoing message in the database
            if SUPABASE_AVAILABLE and store_message and user_id and reply_message_id != 'N/A':
                store_message(
                    user_id=user_id,
                    phone_number_id=phone_number_id,
                    message_id=reply_message_id,
                    direction='outbound',
                    from_number=display_phone,
                    to_number=from_number,
                    message_type='text',
                    message_body=reply_text,
                    status='sent',
                    wamid=reply_message_id,
                    conversation_origin='business_initiated',
                    is_ai_generated=True  # Mark as AI-generated
                )
        else:
            print(f"❌ Failed to send reply: {send_result.get('error')}")
            print(f"   📦 Full Response: {send_result.get('data', {})}")
        
        return jsonify({'status': 'ok'}), 200
        
    except Exception as e:
        print(f"❌ Webhook error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/whatsapp/set-business-data', methods=['POST'])
def set_business_data():
    """
    Set business data for the AI to use in responses.
    Called by frontend when business profile is saved.
    """
    try:
        data = request.get_json()
        BUSINESS_DATA_CACHE['current'] = data
        print(f"📊 Business data updated: {data.get('business_name', 'Unknown')}")
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================
# AI Brain Endpoints
# ============================================

@app.route('/api/ai/status', methods=['GET'])
def ai_status():
    """Check AI Brain availability and configuration"""
    return jsonify({
        'available': AI_BRAIN_AVAILABLE,
        'message': 'AI Brain is ready' if AI_BRAIN_AVAILABLE else 'AI Brain not configured'
    }), 200


@app.route('/api/ai/generate-reply', methods=['POST'])
def generate_ai_reply():
    """
    Generate AI reply for customer message.
    
    POST Body:
    {
        "business_data": {
            "business_id": "biz_123",
            "business_name": "Style Studio",
            "industry": "salon",
            "products_services": [{"name": "Haircut", "price": 300}],
            ...
        },
        "user_message": "What is the price for haircut?",
        "history": [{"role": "user", "content": "Hi"}]
    }
    """
    if not AI_BRAIN_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'AI Brain not available. Please install dependencies: pip install -r requirements_ai.txt'
        }), 503
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        business_data = data.get('business_data')
        user_message = data.get('user_message', '').strip()
        history = data.get('history', [])
        business_id = data.get('business_id')
        
        if not user_message:
            return jsonify({
                'success': False,
                'error': 'user_message is required'
            }), 400
        
        if not business_data and not business_id:
            return jsonify({
                'success': False,
                'error': 'Either business_data or business_id is required'
            }), 400
        
        # Generate reply using AI Brain
        result = ai_brain.generate_reply(
            business_data=business_data,
            user_message=user_message,
            history=history,
            business_id=business_id
        )
        
        return jsonify({
            'success': True,
            **result
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'AI generation error: {str(e)}'
        }), 500


@app.route('/api/ai/detect-intent', methods=['POST'])
def detect_intent():
    """
    Detect intent from a message (useful for analytics).
    
    POST Body:
    {
        "message": "What is the price?",
        "history": []
    }
    """
    if not AI_BRAIN_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'AI Brain not available'
        }), 503
    
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        history = data.get('history', [])
        
        if not message:
            return jsonify({
                'success': False,
                'error': 'message is required'
            }), 400
        
        result = ai_brain.detect_intent(message, history)
        
        return jsonify({
            'success': True,
            **result
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Intent detection error: {str(e)}'
        }), 500


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500


if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    print(f'\n🚀 WhatsApp Admin API Server')
    print(f'📡 Running on: http://localhost:{port}')
    print(f'🔧 Environment: {os.getenv("FLASK_ENV", "production")}')
    print(f'🌐 CORS enabled for: {frontend_url}')
    print(f'🧠 AI Brain: {"Ready ✅" if AI_BRAIN_AVAILABLE else "Not configured ⚠️"}\n')
    
    app.run(host='0.0.0.0', port=port, debug=debug)

