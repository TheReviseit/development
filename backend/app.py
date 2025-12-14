"""
Flask Backend for WhatsApp Admin Dashboard
Provides API endpoints for sending WhatsApp messages
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from whatsapp_service import WhatsAppService

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
    print(f'🌐 CORS enabled for: {frontend_url}\n')
    
    app.run(host='0.0.0.0', port=port, debug=debug)
