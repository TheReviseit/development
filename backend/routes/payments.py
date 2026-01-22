"""
Razorpay Payment Routes
Handles subscription creation, verification, and webhook events.
"""

import os
import hmac
import hashlib
import logging
from functools import wraps
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone

# Configure logging
logger = logging.getLogger('reviseit.payments')

# Initialize Razorpay client
try:
    import razorpay
    RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID')
    RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET')
    RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET')
    
    if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
        razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        RAZORPAY_AVAILABLE = True
        logger.info("✅ Razorpay client initialized")
    else:
        razorpay_client = None
        RAZORPAY_AVAILABLE = False
        logger.warning("⚠️ Razorpay credentials not configured")
except ImportError:
    razorpay_client = None
    RAZORPAY_AVAILABLE = False
    logger.warning("⚠️ Razorpay SDK not installed")

# Import Supabase client
try:
    from supabase_client import get_supabase_client, get_user_id_from_firebase_uid
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    get_supabase_client = None
    get_user_id_from_firebase_uid = None

# Plan configuration
PLAN_CONFIG = {
    'starter': {
        'plan_id': os.getenv('RAZORPAY_PLAN_STARTER'),
        'amount': 100,  # ₹1 in paise (for testing)
        'ai_responses_limit': 2500,
        'display_name': 'Starter'
    },
    'business': {
        'plan_id': os.getenv('RAZORPAY_PLAN_BUSINESS'),
        'amount': 399900,  # ₹3,999 in paise
        'ai_responses_limit': 8000,
        'display_name': 'Business'
    },
    'pro': {
        'plan_id': os.getenv('RAZORPAY_PLAN_PRO'),
        'amount': 899900,  # ₹8,999 in paise
        'ai_responses_limit': 25000,
        'display_name': 'Pro'
    }
}

# Create Blueprint
payments_bp = Blueprint('payments', __name__, url_prefix='/api')


def require_razorpay(f):
    """Decorator to check if Razorpay is available."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not RAZORPAY_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'Payment service not configured'
            }), 503
        return f(*args, **kwargs)
    return decorated_function


def get_user_id_from_request():
    """Extract user_id from request headers or auth token."""
    # Check for user_id in headers (set by frontend after auth)
    user_id = request.headers.get('X-User-Id')
    if user_id:
        return user_id
    
    # Check Authorization header for Supabase JWT
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        # In production, decode and verify JWT
        # For now, extract from Supabase client
        pass
    
    return None


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify Razorpay webhook signature."""
    if not RAZORPAY_WEBHOOK_SECRET:
        logger.warning("Webhook secret not configured, skipping verification")
        return True  # Allow in development
    
    expected_signature = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode('utf-8'),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


# =============================================================================
# Subscription Endpoints
# =============================================================================

@payments_bp.route('/subscriptions/create', methods=['POST'])
@require_razorpay
def create_subscription():
    """
    Create a new Razorpay subscription for a user.
    
    Request Body:
        - plan_name: 'starter' | 'business' | 'pro'
        - customer_email: User's email
        - customer_name: User's name (optional)
        - customer_phone: User's phone (optional)
    
    Returns:
        - subscription_id: Razorpay subscription ID
        - key_id: Razorpay key for frontend
    """
    try:
        data = request.get_json()
        plan_name = data.get('plan_name', '').lower()
        customer_email = data.get('customer_email')
        customer_name = data.get('customer_name', '')
        customer_phone = data.get('customer_phone', '')
        
        firebase_uid = get_user_id_from_request()
        if not firebase_uid:
            return jsonify({
                'success': False,
                'error': 'Authentication required'
            }), 401
        
        # Convert Firebase UID to Supabase user ID for database FK constraint
        user_id = None
        if SUPABASE_AVAILABLE and get_user_id_from_firebase_uid:
            user_id = get_user_id_from_firebase_uid(firebase_uid)
        
        if not user_id:
            logger.warning(f"Could not map Firebase UID {firebase_uid} to Supabase user ID")
            # Use Firebase UID directly if mapping fails - may work if users table doesn't have this user
            user_id = firebase_uid
        
        # Validate plan
        if plan_name not in PLAN_CONFIG:
            return jsonify({
                'success': False,
                'error': f'Invalid plan: {plan_name}'
            }), 400
        
        plan = PLAN_CONFIG[plan_name]
        if not plan['plan_id']:
            return jsonify({
                'success': False,
                'error': f'Plan {plan_name} not configured in Razorpay'
            }), 500
        
        # Create or get existing Razorpay customer
        customer_id = None
        try:
            customer_data = {
                'name': customer_name,
                'email': customer_email,
                'contact': customer_phone,
                'notes': {
                    'user_id': user_id
                }
            }
            customer = razorpay_client.customer.create(data=customer_data)
            customer_id = customer['id']
        except razorpay.errors.BadRequestError as e:
            # Customer might already exist, try to find by email
            if 'already exists' in str(e).lower():
                # Fetch customers and find by email
                customers = razorpay_client.customer.all({'count': 100})
                for c in customers.get('items', []):
                    if c.get('email') == customer_email:
                        customer_id = c['id']
                        break
                if not customer_id:
                    # Create without email to avoid conflict
                    customer = razorpay_client.customer.create(data={
                        'name': customer_name,
                        'contact': customer_phone,
                        'notes': {'user_id': user_id}
                    })
                    customer_id = customer['id']
            else:
                raise e
        
        if not customer_id:
            return jsonify({
                'success': False,
                'error': 'Failed to create or find customer'
            }), 500
        
        # Create subscription
        subscription_data = {
            'plan_id': plan['plan_id'],
            'customer_id': customer_id,
            'total_count': 12,  # 12 billing cycles (1 year for monthly)
            'quantity': 1,
            'customer_notify': 1,
            'notes': {
                'user_id': user_id,
                'plan_name': plan_name
            }
        }
        subscription = razorpay_client.subscription.create(data=subscription_data)
        
        # Store subscription in database
        if SUPABASE_AVAILABLE:
            supabase = get_supabase_client()
            supabase.table('subscriptions').insert({
                'user_id': user_id,
                'razorpay_subscription_id': subscription['id'],
                'razorpay_customer_id': customer_id,
                'plan_name': plan_name,
                'plan_id': plan['plan_id'],
                'status': 'pending',
                'ai_responses_limit': plan['ai_responses_limit']
            }).execute()
        
        logger.info(f"Created subscription {subscription['id']} for user {user_id}")
        
        return jsonify({
            'success': True,
            'subscription_id': subscription['id'],
            'key_id': RAZORPAY_KEY_ID,
            'amount': plan['amount'],
            'currency': 'INR',
            'plan_name': plan['display_name']
        })
        
    except razorpay.errors.BadRequestError as e:
        logger.error(f"Razorpay bad request: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        import traceback
        logger.error(f"Error creating subscription: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Failed to create subscription: {str(e)}'
        }), 500


@payments_bp.route('/subscriptions/verify', methods=['POST'])
@require_razorpay
def verify_subscription():
    """
    Verify a Razorpay subscription payment.
    
    Request Body:
        - razorpay_subscription_id: Subscription ID
        - razorpay_payment_id: Payment ID
        - razorpay_signature: Payment signature
    """
    try:
        data = request.get_json()
        subscription_id = data.get('razorpay_subscription_id')
        payment_id = data.get('razorpay_payment_id')
        signature = data.get('razorpay_signature')
        
        firebase_uid = get_user_id_from_request()
        if not firebase_uid:
            return jsonify({
                'success': False,
                'error': 'Authentication required'
            }), 401
        
        # Convert Firebase UID to Supabase user ID for database FK constraint
        user_id = None
        if SUPABASE_AVAILABLE and get_user_id_from_firebase_uid:
            user_id = get_user_id_from_firebase_uid(firebase_uid)
        
        if not user_id:
            logger.warning(f"Could not map Firebase UID {firebase_uid} to Supabase user ID for verify")
            user_id = firebase_uid
        
        # Verify signature
        verify_data = f"{payment_id}|{subscription_id}"
        expected_signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode('utf-8'),
            verify_data.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_signature, signature):
            logger.warning(f"Invalid signature for payment {payment_id}")
            return jsonify({
                'success': False,
                'error': 'Invalid payment signature'
            }), 400
        
        # Fetch subscription details from Razorpay
        subscription = razorpay_client.subscription.fetch(subscription_id)
        
        # Calculate period dates
        current_start = datetime.fromtimestamp(
            subscription.get('current_start', datetime.now(timezone.utc).timestamp()),
            tz=timezone.utc
        ).isoformat()
        current_end = datetime.fromtimestamp(
            subscription.get('current_end', datetime.now(timezone.utc).timestamp()),
            tz=timezone.utc
        ).isoformat()
        
        # Update subscription in database
        if SUPABASE_AVAILABLE:
            supabase = get_supabase_client()
            
            # Update subscription status
            supabase.table('subscriptions').update({
                'status': 'active',
                'current_period_start': current_start,
                'current_period_end': current_end,
                'ai_responses_used': 0  # Reset usage on new billing period
            }).eq('razorpay_subscription_id', subscription_id).execute()
            
            # Record payment
            payment = razorpay_client.payment.fetch(payment_id)
            supabase.table('payment_history').insert({
                'user_id': user_id,
                'razorpay_payment_id': payment_id,
                'razorpay_order_id': payment.get('order_id'),
                'razorpay_signature': signature,
                'amount': payment.get('amount', 0),
                'currency': payment.get('currency', 'INR'),
                'status': 'captured',
                'payment_method': payment.get('method')
            }).execute()
        
        logger.info(f"Verified subscription {subscription_id} for user {user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Subscription activated successfully',
            'subscription_id': subscription_id,
            'status': 'active'
        })
        
    except Exception as e:
        logger.error(f"Error verifying subscription: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to verify subscription'
        }), 500


@payments_bp.route('/subscriptions/status', methods=['GET'])
def get_subscription_status():
    """
    Get current user's subscription status.
    
    Returns subscription details including:
        - plan_name
        - status
        - ai_responses_limit
        - ai_responses_used
        - current_period_end
    """
    try:
        firebase_uid = get_user_id_from_request()
        if not firebase_uid:
            return jsonify({
                'success': False,
                'error': 'Authentication required'
            }), 401
        
        # Convert Firebase UID to Supabase user ID for database lookup
        user_id = None
        if SUPABASE_AVAILABLE and get_user_id_from_firebase_uid:
            user_id = get_user_id_from_firebase_uid(firebase_uid)
        
        if not user_id:
            user_id = firebase_uid  # Fallback to Firebase UID
        
        if not SUPABASE_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        supabase = get_supabase_client()
        result = supabase.table('subscriptions').select('*').eq(
            'user_id', user_id
        ).eq('status', 'active').order('created_at', desc=True).limit(1).execute()
        
        if not result.data:
            return jsonify({
                'success': True,
                'has_subscription': False,
                'subscription': None
            })
        
        subscription = result.data[0]
        return jsonify({
            'success': True,
            'has_subscription': True,
            'subscription': {
                'id': subscription['id'],
                'plan_name': subscription['plan_name'],
                'status': subscription['status'],
                'ai_responses_limit': subscription['ai_responses_limit'],
                'ai_responses_used': subscription['ai_responses_used'],
                'current_period_start': subscription['current_period_start'],
                'current_period_end': subscription['current_period_end']
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching subscription status: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch subscription status'
        }), 500


@payments_bp.route('/subscriptions/cancel', methods=['POST'])
@require_razorpay
def cancel_subscription():
    """Cancel a subscription at period end."""
    try:
        firebase_uid = get_user_id_from_request()
        if not firebase_uid:
            return jsonify({
                'success': False,
                'error': 'Authentication required'
            }), 401
        
        # Convert Firebase UID to Supabase user ID for database lookup
        user_id = None
        if SUPABASE_AVAILABLE and get_user_id_from_firebase_uid:
            user_id = get_user_id_from_firebase_uid(firebase_uid)
        
        if not user_id:
            user_id = firebase_uid  # Fallback to Firebase UID
        
        if not SUPABASE_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        supabase = get_supabase_client()
        result = supabase.table('subscriptions').select('razorpay_subscription_id').eq(
            'user_id', user_id
        ).eq('status', 'active').limit(1).execute()
        
        if not result.data:
            return jsonify({
                'success': False,
                'error': 'No active subscription found'
            }), 404
        
        razorpay_sub_id = result.data[0]['razorpay_subscription_id']
        
        # Cancel subscription at period end
        razorpay_client.subscription.cancel(razorpay_sub_id, {
            'cancel_at_cycle_end': 1
        })
        
        # Update local status
        supabase.table('subscriptions').update({
            'status': 'cancelled'
        }).eq('razorpay_subscription_id', razorpay_sub_id).execute()
        
        logger.info(f"Cancelled subscription {razorpay_sub_id} for user {user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Subscription will be cancelled at the end of the billing period'
        })
        
    except Exception as e:
        logger.error(f"Error cancelling subscription: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to cancel subscription'
        }), 500


# =============================================================================
# Webhook Handler
# =============================================================================

@payments_bp.route('/payments/webhook', methods=['POST'])
def razorpay_webhook():
    """
    Handle Razorpay webhook events.
    
    Events handled:
        - subscription.authenticated
        - subscription.activated
        - subscription.charged
        - subscription.cancelled
        - subscription.halted
        - payment.captured
        - payment.failed
    """
    try:
        payload = request.get_data()
        signature = request.headers.get('X-Razorpay-Signature', '')
        
        # Verify webhook signature
        if not verify_webhook_signature(payload, signature):
            logger.warning("Invalid webhook signature received")
            return jsonify({'error': 'Invalid signature'}), 400
        
        event = request.get_json()
        event_type = event.get('event')
        payload_data = event.get('payload', {})
        
        logger.info(f"Received webhook event: {event_type}")
        
        if not SUPABASE_AVAILABLE:
            logger.error("Database not available for webhook processing")
            return jsonify({'error': 'Database unavailable'}), 503
        
        supabase = get_supabase_client()
        
        # Handle subscription events
        if event_type == 'subscription.activated':
            subscription = payload_data.get('subscription', {}).get('entity', {})
            sub_id = subscription.get('id')
            
            supabase.table('subscriptions').update({
                'status': 'active',
                'current_period_start': datetime.fromtimestamp(
                    subscription.get('current_start', 0), tz=timezone.utc
                ).isoformat(),
                'current_period_end': datetime.fromtimestamp(
                    subscription.get('current_end', 0), tz=timezone.utc
                ).isoformat()
            }).eq('razorpay_subscription_id', sub_id).execute()
            
        elif event_type == 'subscription.charged':
            subscription = payload_data.get('subscription', {}).get('entity', {})
            payment = payload_data.get('payment', {}).get('entity', {})
            sub_id = subscription.get('id')
            
            # Reset usage for new billing period
            supabase.table('subscriptions').update({
                'ai_responses_used': 0,
                'current_period_start': datetime.fromtimestamp(
                    subscription.get('current_start', 0), tz=timezone.utc
                ).isoformat(),
                'current_period_end': datetime.fromtimestamp(
                    subscription.get('current_end', 0), tz=timezone.utc
                ).isoformat()
            }).eq('razorpay_subscription_id', sub_id).execute()
            
            # Record payment
            user_result = supabase.table('subscriptions').select('user_id, id').eq(
                'razorpay_subscription_id', sub_id
            ).limit(1).execute()
            
            if user_result.data:
                supabase.table('payment_history').insert({
                    'subscription_id': user_result.data[0]['id'],
                    'user_id': user_result.data[0]['user_id'],
                    'razorpay_payment_id': payment.get('id'),
                    'amount': payment.get('amount', 0),
                    'currency': payment.get('currency', 'INR'),
                    'status': 'captured',
                    'payment_method': payment.get('method')
                }).execute()
            
        elif event_type == 'subscription.cancelled':
            subscription = payload_data.get('subscription', {}).get('entity', {})
            sub_id = subscription.get('id')
            
            supabase.table('subscriptions').update({
                'status': 'cancelled'
            }).eq('razorpay_subscription_id', sub_id).execute()
            
        elif event_type == 'subscription.halted':
            subscription = payload_data.get('subscription', {}).get('entity', {})
            sub_id = subscription.get('id')
            
            supabase.table('subscriptions').update({
                'status': 'halted'
            }).eq('razorpay_subscription_id', sub_id).execute()
            
        elif event_type == 'payment.failed':
            payment = payload_data.get('payment', {}).get('entity', {})
            error = payment.get('error_code', '')
            error_desc = payment.get('error_description', '')
            
            logger.warning(f"Payment failed: {error} - {error_desc}")
        
        return jsonify({'status': 'ok'})
        
    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        return jsonify({'error': 'Webhook processing failed'}), 500


# =============================================================================
# Usage Tracking
# =============================================================================

def check_and_update_usage(user_id: str) -> dict:
    """
    Check if user has remaining AI responses and update usage.
    Called by AI Brain before generating responses.
    
    Returns:
        dict with 'allowed', 'remaining', 'limit'
    """
    if not SUPABASE_AVAILABLE:
        return {'allowed': True, 'remaining': 999999, 'limit': 999999}
    
    try:
        supabase = get_supabase_client()
        result = supabase.table('subscriptions').select('*').eq(
            'user_id', user_id
        ).eq('status', 'active').limit(1).execute()
        
        if not result.data:
            # No active subscription - use free tier (limited)
            return {'allowed': True, 'remaining': 50, 'limit': 50}
        
        subscription = result.data[0]
        limit = subscription['ai_responses_limit']
        used = subscription['ai_responses_used']
        
        if used >= limit:
            return {
                'allowed': False,
                'remaining': 0,
                'limit': limit,
                'message': 'AI response limit reached. Please upgrade your plan.'
            }
        
        # Increment usage
        supabase.table('subscriptions').update({
            'ai_responses_used': used + 1
        }).eq('id', subscription['id']).execute()
        
        return {
            'allowed': True,
            'remaining': limit - used - 1,
            'limit': limit
        }
        
    except Exception as e:
        logger.error(f"Error checking usage: {e}")
        return {'allowed': True, 'remaining': 100, 'limit': 100}
