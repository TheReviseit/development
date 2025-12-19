"""
Flask Backend for WhatsApp Admin Dashboard
Provides API endpoints for sending WhatsApp messages
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from whatsapp_service import WhatsAppService

# AI Brain import (optional, graceful fallback if not available)
try:
    from ai_brain import AIBrain, AIBrainConfig
    ai_brain = AIBrain(config=AIBrainConfig.from_env())
    AI_BRAIN_AVAILABLE = True
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
        
        if not messages:
            # No messages - might be a status update
            return jsonify({'status': 'ok'}), 200
        
        message = messages[0]
        from_number = message.get('from')
        message_type = message.get('type')
        
        # Only handle text messages for now
        if message_type != 'text':
            print(f"⏭️ Skipping non-text message type: {message_type}")
            return jsonify({'status': 'ok'}), 200
        
        message_text = message.get('text', {}).get('body', '')
        
        print(f"💬 Message from {from_number}: {message_text}")
        
        # Generate AI response
        if AI_BRAIN_AVAILABLE and ai_brain:
            # Get business data (use cached or default)
            business_data = BUSINESS_DATA_CACHE.get('current', DEFAULT_BUSINESS_DATA)
            
            # Generate AI reply
            result = ai_brain.generate_reply(
                business_data=business_data,
                user_message=message_text,
                history=[]  # Could store conversation history per user
            )
            
            reply_text = result.get('reply', "I'll connect you with our team shortly.")
            intent = result.get('intent', 'unknown')
            needs_human = result.get('needs_human', False)
            
            print(f"🤖 AI Response (intent: {intent}, needs_human: {needs_human}): {reply_text}")
        else:
            # Fallback if AI not available
            reply_text = "Thank you for your message! Our team will respond shortly."
        
        # Send the reply
        send_result = whatsapp_service.send_text_message(from_number, reply_text)
        
        if send_result['success']:
            print(f"✅ Reply sent successfully to {from_number}")
        else:
            print(f"❌ Failed to send reply: {send_result.get('error')}")
        
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

