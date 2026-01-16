"""
Flask routes for AI-driven appointment booking.
These endpoints are used by the AI brain to check availability and book appointments.
"""

from flask import Blueprint, request, jsonify, g
import logging
from datetime import datetime, date
import os
import requests

logger = logging.getLogger(__name__)

appointments_bp = Blueprint('appointments', __name__)

# Frontend API URL
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
INTERNAL_API_KEY = os.environ.get('INTERNAL_API_KEY', 'flowauxi-internal-key')


def get_internal_headers():
    """Get headers for internal API calls."""
    return {
        'Content-Type': 'application/json',
        'x-api-key': INTERNAL_API_KEY
    }


@appointments_bp.route('/api/appointments/config/<user_id>', methods=['GET'])
def get_appointment_config(user_id: str):
    """
    Get appointment configuration for a business.
    
    Args:
        user_id: Business owner's Firebase UID
        
    Query params:
        date: Optional date to check availability (YYYY-MM-DD)
    """
    try:
        check_date = request.args.get('date')
        
        # Call frontend API
        params = {'user_id': user_id}
        if check_date:
            params['date'] = check_date
            
        response = requests.get(
            f'{FRONTEND_URL}/api/ai-appointment-book',
            params=params,
            headers=get_internal_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'success': True,
                'config': data.get('config', {}),
                'available_slots': data.get('available_slots', [])
            })
        else:
            return jsonify({
                'success': False,
                'error': response.json().get('error', 'Unknown error')
            }), response.status_code
            
    except requests.RequestException as e:
        logger.error(f"Error fetching appointment config: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to connect to appointment service'
        }), 503


@appointments_bp.route('/api/appointments/check-availability', methods=['POST'])
def check_availability():
    """
    Check availability for a specific date and optionally time.
    
    Request body:
    {
        "user_id": "firebase_uid",
        "date": "2025-01-15",
        "time": "10:00" (optional)
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        
        user_id = data.get('user_id')
        check_date = data.get('date')
        check_time = data.get('time')
        
        if not user_id or not check_date:
            return jsonify({
                'success': False,
                'error': 'user_id and date are required'
            }), 400
        
        # Call frontend API
        response = requests.get(
            f'{FRONTEND_URL}/api/ai-appointment-book',
            params={'user_id': user_id, 'date': check_date},
            headers=get_internal_headers(),
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({
                'success': False,
                'error': 'Failed to check availability'
            }), 500
        
        result = response.json()
        available_slots = result.get('available_slots', [])
        
        if check_time:
            # Check specific time
            is_available = check_time in available_slots
            return jsonify({
                'success': True,
                'available': is_available,
                'date': check_date,
                'time': check_time,
                'alternative_slots': available_slots[:5] if not is_available else []
            })
        else:
            # Return all available slots
            return jsonify({
                'success': True,
                'date': check_date,
                'available_slots': available_slots,
                'total_available': len(available_slots)
            })
            
    except Exception as e:
        logger.error(f"Error checking availability: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@appointments_bp.route('/api/appointments/book', methods=['POST'])
def book_appointment():
    """
    Book an appointment through the AI bot.
    
    Request body:
    {
        "user_id": "firebase_uid",
        "customer_name": "John Doe",
        "customer_phone": "9876543210",
        "customer_email": "john@example.com" (optional),
        "date": "2025-01-15",
        "time": "10:00",
        "service": "Haircut" (optional),
        "notes": "Additional info" (optional),
        "custom_fields": {} (optional)
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        
        # Validate required fields
        required = ['user_id', 'customer_name', 'customer_phone', 'date', 'time']
        missing = [f for f in required if not data.get(f)]
        
        if missing:
            return jsonify({
                'success': False,
                'error': f"Missing required fields: {', '.join(missing)}"
            }), 400
        
        # Forward to frontend API
        response = requests.post(
            f'{FRONTEND_URL}/api/ai-appointment-book',
            json=data,
            headers=get_internal_headers(),
            timeout=15
        )
        
        result = response.json()
        
        if response.status_code == 200 and result.get('success'):
            return jsonify({
                'success': True,
                'appointment': result.get('appointment'),
                'confirmation_message': result.get('message')
            })
        elif response.status_code == 409:
            # Conflict - time slot not available
            return jsonify({
                'success': False,
                'conflict': True,
                'error': result.get('error', 'Time slot not available'),
                'available_slots': result.get('available_slots', []),
                'message': result.get('message', 'Please choose a different time.')
            }), 409
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to book appointment')
            }), response.status_code
            
    except requests.RequestException as e:
        logger.error(f"Error booking appointment: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to connect to appointment service'
        }), 503
    except Exception as e:
        logger.error(f"Error in book_appointment: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@appointments_bp.route('/api/appointments/cancel/<appointment_id>', methods=['POST'])
def cancel_appointment(appointment_id: str):
    """
    Cancel an appointment.
    
    Request body:
    {
        "user_id": "firebase_uid"
    }
    """
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'user_id is required'
            }), 400
        
        # Forward to frontend API
        response = requests.delete(
            f'{FRONTEND_URL}/api/appointments/{appointment_id}',
            headers=get_internal_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            return jsonify({
                'success': True,
                'message': 'Appointment cancelled successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to cancel appointment'
            }), response.status_code
            
    except Exception as e:
        logger.error(f"Error cancelling appointment: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# AI Brain integration helpers
def get_booking_prompt_for_business(user_id: str) -> dict:
    """
    Get appointment booking configuration for AI prompts.
    
    Returns fields to ask and business hours for the AI to use.
    """
    try:
        response = requests.get(
            f'{FRONTEND_URL}/api/ai-appointment-book',
            params={'user_id': user_id},
            headers=get_internal_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            config = data.get('config', {})
            
            if not config.get('enabled'):
                return {'enabled': False}
            
            # Build fields list for AI prompt
            fields = config.get('fields', [])
            if config.get('minimal_mode'):
                fields = [f for f in fields if f['id'] in ['name', 'phone', 'date', 'time']]
            
            hours = config.get('business_hours', {})
            
            return {
                'enabled': True,
                'fields': fields,
                'business_hours': {
                    'start': hours.get('start', '09:00'),
                    'end': hours.get('end', '18:00'),
                    'slot_duration': hours.get('duration', 60)
                },
                'minimal_mode': config.get('minimal_mode', False)
            }
    except Exception as e:
        logger.error(f"Error getting booking prompt config: {e}")
    
    return {'enabled': False}
