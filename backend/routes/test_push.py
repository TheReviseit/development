"""
Test endpoint for push notifications
"""

from flask import request, jsonify
from push_notification import send_push_to_user

def register_test_routes(app):
    @app.route('/api/test-push', methods=['POST'])
    def test_push():
        """
        Test endpoint to send a push notification
        
        POST Body:
        {
            "user_id": "uuid",
            "title": "Test",
            "body": "Test message",
            "data": {}
        }
        """
        try:
            data = request.get_json()
            
            user_id = data.get('user_id')
            title = data.get('title', 'Test Notification')
            body = data.get('body', 'This is a test')
            push_data = data.get('data', {})
            
            if not user_id:
                return jsonify({
                    'success': False,
                    'error': 'user_id is required'
                }), 400
            
            # Send push notification
            result = send_push_to_user(user_id, title, body, push_data)
            
            return jsonify({
                'success': result,
                'message': 'Push notification sent' if result else 'Failed to send push'
            }), 200
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
