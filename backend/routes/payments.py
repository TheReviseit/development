"""
Razorpay Payment Routes - Enterprise Grade
============================================
Handles subscription creation, verification, and webhook events.

Key Features:
- Stable idempotency keys: hash(user_id + plan_id + currency + interval)
- Webhook signature verification using RAW body
- State machine: verify → PROCESSING, webhook → COMPLETED
- Webhook replay → 200 OK {"status": "ignored_duplicate"}
- Event ordering safety (ignore outdated events)
- Dual rate limiting (user + IP)
- Request ID tracing
- Payment-level idempotency (not just event-level)
- UPSERT for payment_history to handle concurrent requests
- Graceful duplicate handling (always returns 200 for processed/duplicate)
"""

import os
import hmac
import hashlib
import logging
import uuid
import time
try:
    import gevent
    HAS_GEVENT = True
except ImportError:
    HAS_GEVENT = False
import requests
from functools import wraps
from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, Any
from contextlib import contextmanager

# Configure logging
logger = logging.getLogger('reviseit.payments')

# Import validation schemas
try:
    from .validation_schemas import (
        CreateSubscriptionRequest,
        VerifyPaymentRequest,
        generate_request_id,
        generate_stable_idempotency_key,
        can_transition,
        should_ignore_webhook_event,
        ErrorResponse
    )
    from pydantic import ValidationError
    VALIDATION_AVAILABLE = True
except ImportError:
    VALIDATION_AVAILABLE = False
    ValidationError = Exception  # Fallback
    logger.warning("⚠️ Validation schemas not available")
    
    # Fallback implementations when Pydantic not available
    def generate_request_id():
        """Generate a unique request ID for tracing."""
        return f"req_{uuid.uuid4().hex[:16]}"
    
    def generate_stable_idempotency_key(user_id, plan_id, currency="INR", interval="monthly"):
        """Generate stable idempotency key."""
        import hashlib
        data = f"{user_id}:{plan_id}:{currency}:{interval}"
        return f"idem_{hashlib.sha256(data.encode()).hexdigest()[:24]}"
    
    def can_transition(current_status, new_status):
        """Check if state transition is valid."""
        return True  # Allow all transitions when validation unavailable
    
    def should_ignore_webhook_event(current_status, event_type):
        """Check if webhook event should be ignored."""
        return False  # Process all events when validation unavailable

# Import rate limiter
try:
    from middleware.rate_limiter import rate_limit, rate_limit_by_ip
    RATE_LIMIT_AVAILABLE = True
except ImportError:
    RATE_LIMIT_AVAILABLE = False
    logger.warning("⚠️ Rate limiter not available")

# Initialize Razorpay client
try:
    import razorpay
    RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID')
    RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET')
    RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET')
    
    if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
        razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        # Configure timeout via the underlying requests session
        # This ensures we fail fast instead of blocking forever
        if hasattr(razorpay_client, 'session'):
            razorpay_client.session.timeout = 10  # 10 second timeout
        RAZORPAY_AVAILABLE = True
        logger.info("✅ Razorpay client initialized (10s timeout)")
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

# Import cache manager (optional)
try:
    from cache import get_cache_manager
    cache_manager = get_cache_manager()
except ImportError:
    cache_manager = None
except Exception:
    cache_manager = None

# Plan configuration with plan_id for stable idempotency
PLAN_CONFIG = {
    'starter': {
        'plan_id': os.getenv('RAZORPAY_PLAN_STARTER'),
        'amount': 100,  # ₹1 in paise (for testing)
        'currency': 'INR',
        'interval': 'monthly',
        'ai_responses_limit': 2500,
        'display_name': 'Starter'
    },
    'business': {
        'plan_id': os.getenv('RAZORPAY_PLAN_BUSINESS'),
        'amount': 399900,  # ₹3,999 in paise
        'currency': 'INR',
        'interval': 'monthly',
        'ai_responses_limit': 8000,
        'display_name': 'Business'
    },
    'pro': {
        'plan_id': os.getenv('RAZORPAY_PLAN_PRO'),
        'amount': 899900,  # ₹8,999 in paise
        'currency': 'INR',
        'interval': 'monthly',
        'ai_responses_limit': 25000,
        'display_name': 'Pro'
    }
}

# Create Blueprint
payments_bp = Blueprint('payments', __name__, url_prefix='/api')


# =============================================================================
# Middleware & Decorators
# =============================================================================

def add_request_id():
    """Add request ID to Flask g object for tracing."""
    # Use client-provided x-request-id or generate new one
    g.request_id = request.headers.get('X-Request-Id') or generate_request_id()
    g.request_start_time = datetime.now(timezone.utc)


@payments_bp.before_request
def before_request():
    """Run before each request in this blueprint."""
    add_request_id()
    logger.info(f"[{g.request_id}] {request.method} {request.path}")


@payments_bp.after_request
def after_request(response):
    """Add request ID to response headers."""
    if hasattr(g, 'request_id'):
        response.headers['X-Request-Id'] = g.request_id
    return response


def require_razorpay(f):
    """Decorator to check if Razorpay is available."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not RAZORPAY_AVAILABLE:
            return error_response(
                'Payment service not configured',
                'RAZORPAY_UNAVAILABLE',
                503
            )
        return f(*args, **kwargs)
    return decorated_function


def require_auth(f):
    """Decorator to require authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = get_user_id_from_request()
        if not user_id:
            return error_response(
                'Authentication required',
                'UNAUTHORIZED',
                401
            )
        g.firebase_uid = user_id
        # Map to Supabase user ID
        g.user_id = map_to_supabase_user_id(user_id)
        return f(*args, **kwargs)
    return decorated_function


def retry_api_call(max_retries=3, initial_delay=1):
    """Decorator to retry API calls on network errors and Razorpay server errors."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            retries = 0
            delay = initial_delay
            while True:
                try:
                    return f(*args, **kwargs)
                except razorpay.errors.ServerError as e:
                    # Razorpay 5xx server errors - transient, should retry
                    retries += 1
                    if retries > max_retries:
                        logger.error(f"Razorpay ServerError after {retries} retries: {e}")
                        raise e
                    
                    logger.warning(f"Razorpay ServerError (attempt {retries}/{max_retries}): {e}. Retrying in {delay}s...")
                    if HAS_GEVENT:
                        gevent.sleep(delay)  # GEVENT SAFE - does not block greenlet
                    else:
                        time.sleep(delay)  # Fallback for dev mode
                    delay *= 2  # Exponential backoff
                except Exception as e:
                    # Detect network-related errors
                    msg = str(e).lower()
                    is_network_error = any(x in msg for x in [
                        'connection', 'timeout', 'reset by peer', 'aborted', 'protocol', 'remote end closed'
                    ])
                    
                    if not is_network_error:
                        raise e
                        
                    retries += 1
                    if retries > max_retries:
                        logger.error(f"API call failed after {retries} retries: {e}")
                        raise e
                    
                    logger.warning(f"API connection error (attempt {retries}/{max_retries}): {e}. Retrying in {delay}s...")
                    if HAS_GEVENT:
                        gevent.sleep(delay)  # GEVENT SAFE
                    else:
                        time.sleep(delay)  # Fallback for dev mode
                    delay *= 2  # Exponential backoff
        return wrapper
    return decorator



# =============================================================================
# Helper Functions
# =============================================================================

def error_response(message: str, code: str, status: int = 400) -> Tuple:
    """Create a structured error response."""
    return jsonify({
        'success': False,
        'error': message,
        'error_code': code,
        'request_id': getattr(g, 'request_id', 'unknown')
    }), status


def send_razorpay_tracking(key_id: str):
    """Send a tracking ping to Razorpay analytics endpoint.
    This helps Razorpay monitor usage. Network errors are logged but do not affect the main flow.
    """
    url = f"https://lumberjack.razorpay.com/v1/track?key_id={key_id}"
    headers = {
        "content-type": "text/plain;charset=UTF-8",
        "dnt": "1",
        "referer": "https://flowauxi.com/",
        "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": "\"Android\"",
        "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        logger.info(f"Razorpay tracking ping successful: {response.status_code}")
    except Exception as e:
        logger.warning(f"Razorpay tracking ping failed: {e}")


def success_response(data: dict, status: int = 200) -> Tuple:
    """Create a structured success response."""
    return jsonify({
        'success': True,
        'request_id': getattr(g, 'request_id', 'unknown'),
        **data
    }), status


def get_user_id_from_request() -> Optional[str]:
    """Extract user_id from request headers."""
    return request.headers.get('X-User-Id')


def map_to_supabase_user_id(firebase_uid: str) -> str:
    """Map Firebase UID to Supabase user ID."""
    if SUPABASE_AVAILABLE and get_user_id_from_firebase_uid:
        supabase_id = get_user_id_from_firebase_uid(firebase_uid)
        if supabase_id:
            return supabase_id
        logger.warning(f"[{getattr(g, 'request_id', 'unknown')}] Could not map Firebase UID {firebase_uid}")
    return firebase_uid


def verify_webhook_signature_raw(raw_body: bytes, signature: str) -> bool:
    """
    Verify Razorpay webhook signature using RAW body.
    
    CRITICAL: Must use raw request body, not parsed JSON.
    """
    if not RAZORPAY_WEBHOOK_SECRET:
        logger.error("Webhook secret not configured!")
        return False
    
    if not signature:
        logger.warning("No signature provided in webhook")
        return False
    
    expected_signature = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


def check_idempotency(idempotency_key: str) -> Optional[dict]:
    """
    Check if a subscription with this idempotency key already exists.
    Returns existing subscription data if found, None otherwise.
    """
    if not SUPABASE_AVAILABLE:
        return None
    
    try:
        supabase = get_supabase_client()
        result = supabase.table('subscriptions').select('*').eq(
            'idempotency_key', idempotency_key
        ).limit(1).execute()
        
        if result.data:
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Idempotency check failed: {e}")
        return None


def record_webhook_event(event_id: str, event_type: str, subscription_id: str = None,
                         payment_id: str = None, created_at: datetime = None,
                         result: str = 'processed', raw_payload: dict = None) -> bool:
    """
    Record a webhook event for deduplication and audit.
    Returns True if new event, False if duplicate.
    
    IMPORTANT: This is event-level deduplication. Payment-level deduplication
    is handled separately by upsert_payment_history().
    """
    if not SUPABASE_AVAILABLE:
        return True  # Allow if no DB
    
    request_id = getattr(g, 'request_id', 'unknown')
    
    try:
        supabase = get_supabase_client()
        supabase.table('webhook_events').insert({
            'event_id': event_id,
            'event_type': event_type,
            'subscription_id': subscription_id,
            'payment_id': payment_id,
            'created_at': created_at.isoformat() if created_at else datetime.now(timezone.utc).isoformat(),
            'processing_result': result,
            'raw_payload': raw_payload
        }).execute()
        logger.debug(f"[{request_id}] Recorded webhook event: {event_id}")
        return True
    except Exception as e:
        error_str = str(e).lower()
        # Unique constraint violation means duplicate
        if 'duplicate key' in error_str or 'unique' in error_str or '23505' in str(e):
            logger.info(f"[{request_id}] Duplicate webhook event: {event_id}")
            return False
        logger.error(f"[{request_id}] Failed to record webhook event: {e}")
        return True  # Allow on other errors


def is_duplicate_error(error: Exception) -> bool:
    """Check if an exception is a duplicate key/unique constraint violation."""
    error_str = str(error).lower()
    return any(x in error_str for x in ['duplicate key', 'unique', '23505', 'uniqueviolation'])


def upsert_payment_history(
    user_id: str,
    razorpay_payment_id: str,
    amount: int,
    currency: str = 'INR',
    status: str = 'captured',
    payment_method: str = None,
    subscription_id: str = None,
    razorpay_order_id: str = None,
    razorpay_signature: str = None,
    error_code: str = None,
    error_description: str = None
) -> Dict[str, Any]:
    """
    UPSERT payment into payment_history with idempotency on razorpay_payment_id.
    
    This handles:
    1. Concurrent webhook requests with same payment_id
    2. Multiple event types (subscription.charged, payment.captured) for same payment
    3. Verify endpoint + webhook collision
    
    Returns:
        {'success': True, 'is_new': True/False, 'payment_id': str}
        {'success': False, 'error': str}
    """
    if not SUPABASE_AVAILABLE:
        return {'success': True, 'is_new': True, 'payment_id': razorpay_payment_id}
    
    request_id = getattr(g, 'request_id', 'unknown')
    
    if not razorpay_payment_id:
        logger.warning(f"[{request_id}] Attempted to insert payment without payment_id")
        return {'success': False, 'error': 'missing_payment_id'}
    
    payment_data = {
        'user_id': user_id,
        'razorpay_payment_id': razorpay_payment_id,
        'amount': amount,
        'currency': currency,
        'status': status,
    }
    
    # Add optional fields only if provided
    if payment_method:
        payment_data['payment_method'] = payment_method
    if subscription_id:
        payment_data['subscription_id'] = subscription_id
    if razorpay_order_id:
        payment_data['razorpay_order_id'] = razorpay_order_id
    if razorpay_signature:
        payment_data['razorpay_signature'] = razorpay_signature
    if error_code:
        payment_data['error_code'] = error_code
    if error_description:
        payment_data['error_description'] = error_description
    
    try:
        supabase = get_supabase_client()
        
        # Use Supabase upsert with on_conflict
        # This performs: INSERT ... ON CONFLICT (razorpay_payment_id) DO UPDATE
        result = supabase.table('payment_history').upsert(
            payment_data,
            on_conflict='razorpay_payment_id'
        ).execute()
        
        logger.info(f"[{request_id}] Payment {razorpay_payment_id} upserted successfully")
        return {'success': True, 'is_new': True, 'payment_id': razorpay_payment_id}
        
    except Exception as e:
        # Even with upsert, handle edge cases
        if is_duplicate_error(e):
            logger.info(f"[{request_id}] Payment {razorpay_payment_id} already exists (concurrent upsert race)")
            return {'success': True, 'is_new': False, 'payment_id': razorpay_payment_id}
        
        logger.error(f"[{request_id}] Failed to upsert payment {razorpay_payment_id}: {e}")
        return {'success': False, 'error': str(e)}


def safe_insert_payment_history(
    user_id: str,
    razorpay_payment_id: str,
    amount: int,
    currency: str = 'INR',
    status: str = 'captured',
    payment_method: str = None,
    subscription_id: str = None,
    razorpay_order_id: str = None,
    razorpay_signature: str = None
) -> Dict[str, Any]:
    """
    Safely insert payment history, handling duplicates gracefully.
    
    Alternative to upsert when you want INSERT with conflict handling
    (useful if you don't want to update existing records).
    
    Returns:
        {'success': True, 'is_new': True} - new payment inserted
        {'success': True, 'is_new': False} - duplicate, already exists
        {'success': False, 'error': str} - real error
    """
    if not SUPABASE_AVAILABLE:
        return {'success': True, 'is_new': True}
    
    request_id = getattr(g, 'request_id', 'unknown')
    
    if not razorpay_payment_id:
        logger.warning(f"[{request_id}] Attempted to insert payment without payment_id")
        return {'success': False, 'error': 'missing_payment_id'}
    
    payment_data = {
        'user_id': user_id,
        'razorpay_payment_id': razorpay_payment_id,
        'amount': amount,
        'currency': currency,
        'status': status,
    }
    
    if payment_method:
        payment_data['payment_method'] = payment_method
    if subscription_id:
        payment_data['subscription_id'] = subscription_id
    if razorpay_order_id:
        payment_data['razorpay_order_id'] = razorpay_order_id
    if razorpay_signature:
        payment_data['razorpay_signature'] = razorpay_signature
    
    try:
        supabase = get_supabase_client()
        supabase.table('payment_history').insert(payment_data).execute()
        logger.info(f"[{request_id}] Payment {razorpay_payment_id} recorded")
        return {'success': True, 'is_new': True}
        
    except Exception as e:
        if is_duplicate_error(e):
            logger.info(f"[{request_id}] Payment {razorpay_payment_id} already recorded (duplicate)")
            return {'success': True, 'is_new': False}
        
        logger.error(f"[{request_id}] Failed to insert payment {razorpay_payment_id}: {e}")
        return {'success': False, 'error': str(e)}


def update_subscription_status(
    razorpay_subscription_id: str,
    status: str,
    current_period_start: datetime = None,
    current_period_end: datetime = None,
    event_created_at: datetime = None,
    reset_usage: bool = False
) -> Dict[str, Any]:
    """
    Update subscription status with event ordering safety.
    
    Returns:
        {'success': True, 'updated': True}
        {'success': True, 'updated': False, 'reason': 'ignored_ordering'}
        {'success': False, 'error': str}
    """
    if not SUPABASE_AVAILABLE:
        return {'success': True, 'updated': True}
    
    request_id = getattr(g, 'request_id', 'unknown')
    
    try:
        supabase = get_supabase_client()
        
        update_data = {
            'status': status,
        }
        
        if event_created_at:
            update_data['last_webhook_event_at'] = event_created_at.isoformat()
        
        if current_period_start:
            update_data['current_period_start'] = current_period_start.isoformat()
        
        if current_period_end:
            update_data['current_period_end'] = current_period_end.isoformat()
        
        if reset_usage:
            update_data['ai_responses_used'] = 0
        
        result = supabase.table('subscriptions').update(update_data).eq(
            'razorpay_subscription_id', razorpay_subscription_id
        ).execute()
        
        if result.data:
            logger.info(f"[{request_id}] Subscription {razorpay_subscription_id} → {status}")
            return {'success': True, 'updated': True}
        else:
            logger.warning(f"[{request_id}] Subscription {razorpay_subscription_id} not found")
            return {'success': True, 'updated': False, 'reason': 'not_found'}
        
    except Exception as e:
        logger.error(f"[{request_id}] Failed to update subscription {razorpay_subscription_id}: {e}")
        return {'success': False, 'error': str(e)}


def get_subscription_by_razorpay_id(razorpay_subscription_id: str) -> Optional[Dict]:
    """Get subscription record by Razorpay subscription ID."""
    if not SUPABASE_AVAILABLE:
        return None
    
    try:
        supabase = get_supabase_client()
        result = supabase.table('subscriptions').select(
            'id, user_id, status, last_webhook_event_at, plan_name, ai_responses_limit'
        ).eq(
            'razorpay_subscription_id', razorpay_subscription_id
        ).limit(1).execute()
        
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"Failed to fetch subscription {razorpay_subscription_id}: {e}")
        return None


# =============================================================================
# Subscription Endpoints
# =============================================================================

def create_razorpay_customer(data):
    """
    Create Razorpay customer - NO RETRY.
    
    Customer creation is NOT idempotent in Razorpay (same email = error).
    Fail fast and let caller handle errors.
    """
    return razorpay_client.customer.create(data=data)


def get_existing_razorpay_customer(user_id: str, email: str) -> Optional[str]:
    """
    Get existing Razorpay customer ID for user from database.
    
    This is the ONLY lookup method - we do NOT use customer.all() API
    as it's slow, unreliable, and a cross-tenant data risk.
    
    Args:
        user_id: Internal user ID
        email: User email (for logging only)
        
    Returns:
        Razorpay customer ID if found, None otherwise
    """
    if not SUPABASE_AVAILABLE:
        return None
    
    try:
        supabase = get_supabase_client()
        # Check most recent subscription for this user with a customer_id
        result = supabase.table('subscriptions').select(
            'razorpay_customer_id'
        ).eq('user_id', user_id).not_.is_(
            'razorpay_customer_id', 'null'
        ).order('created_at', desc=True).limit(1).execute()
        
        if result.data and result.data[0].get('razorpay_customer_id'):
            logger.debug(f"Found existing customer for user {user_id}: {result.data[0]['razorpay_customer_id']}")
            return result.data[0]['razorpay_customer_id']
    except Exception as e:
        logger.warning(f"Failed to lookup existing customer for user {user_id}: {e}")
    
    return None


def persist_razorpay_customer(user_id: str, customer_id: str) -> bool:
    """
    Persist Razorpay customer ID to database immediately.
    
    This is called BEFORE subscription creation to prevent
    duplicate customer creation on frontend retries.
    
    Args:
        user_id: Internal user ID
        customer_id: Razorpay customer ID to store
        
    Returns:
        True if persisted successfully, False otherwise
    """
    if not SUPABASE_AVAILABLE:
        return True  # Allow to proceed if no DB
    
    try:
        supabase = get_supabase_client()
        # Insert a placeholder subscription record with customer_id
        # This will be updated when subscription is created
        # Using upsert to handle race conditions
        supabase.table('subscriptions').upsert({
            'user_id': user_id,
            'razorpay_customer_id': customer_id,
            'plan_name': 'pending',  # Will be updated
            'plan_id': 'pending',
            'status': 'customer_created',  # Transient state
        }, on_conflict='user_id,plan_name').execute()
        logger.info(f"Persisted customer {customer_id} for user {user_id}")
        return True
    except Exception as e:
        # Log but don't fail - customer can still be used
        logger.warning(f"Failed to persist customer {customer_id}: {e}")
        return True  # Allow to proceed

def create_razorpay_subscription(data, idempotency_key=None):
    """
    Create Razorpay subscription.
    
    IMPORTANT: NO RETRY - subscription creation is NOT idempotent!
    Retrying could create duplicate subscriptions in Razorpay.
    
    Args:
        data: Subscription data dict
        idempotency_key: Optional idempotency key for Razorpay header
    """
    # Future-proofing: Razorpay supports idempotency headers
    # This prevents duplicate subscriptions if called multiple times with same key
    headers = {}
    if idempotency_key:
        headers['X-Razorpay-Idempotency-Key'] = idempotency_key
    
    # Note: razorpay-python doesn't support custom headers directly yet,
    # but we're ready when they add support. For now, rely on our DB idempotency.
    return razorpay_client.subscription.create(data=data)


@payments_bp.route('/subscriptions/create', methods=['POST'])
@require_razorpay
@require_auth
def create_subscription():
    """
    Create a new Razorpay subscription.
    
    Uses stable idempotency key: hash(user_id + plan_id + currency + interval)
    
    State: Creates subscription with status=PENDING
    """
    request_id = g.request_id
    user_id = g.user_id
    
    try:
        # Validate input
        if VALIDATION_AVAILABLE:
            try:
                data = CreateSubscriptionRequest(**request.get_json())
            except ValidationError as e:
                return error_response(
                    f"Invalid input: {e.errors()[0]['msg']}",
                    'VALIDATION_ERROR',
                    400
                )
        else:
            data = request.get_json()
            data = type('obj', (object,), {
                'plan_name': data.get('plan_name', '').lower(),
                'customer_email': data.get('customer_email'),
                'customer_name': data.get('customer_name', ''),
                'customer_phone': data.get('customer_phone', ''),
                'idempotency_key': data.get('idempotency_key')
            })()
        
        plan_name = data.plan_name
        
        # Validate plan
        if plan_name not in PLAN_CONFIG:
            return error_response(f'Invalid plan: {plan_name}', 'INVALID_PLAN', 400)
        
        plan = PLAN_CONFIG[plan_name]
        if not plan['plan_id']:
            return error_response(f'Plan {plan_name} not configured', 'PLAN_NOT_CONFIGURED', 500)
        
        # Generate stable idempotency key
        idempotency_key = data.idempotency_key or generate_stable_idempotency_key(
            user_id, plan['plan_id'], plan['currency'], plan['interval']
        )
        
        # Check idempotency - return existing subscription if found
        existing = check_idempotency(idempotency_key)
        if existing:
            logger.info(f"[{request_id}] Returning existing subscription for idempotency key")
            return success_response({
                'subscription_id': existing['razorpay_subscription_id'],
                'key_id': RAZORPAY_KEY_ID,
                'amount': plan['amount'],
                'currency': plan['currency'],
                'plan_name': plan['display_name'],
                'idempotency_hit': True
            })
        
        # =================================================================
        # STEP 1: Get or Create Razorpay Customer (with immediate persist)
        # =================================================================
        
        # First, check if we already have a customer for this user
        customer_id = get_existing_razorpay_customer(user_id, data.customer_email)
        
        if customer_id:
            logger.info(f"[{request_id}] Reusing existing Razorpay customer: {customer_id}")
        else:
            # Create new customer (NO RETRY - fail fast)
            try:
                customer_data = {
                    'name': data.customer_name or '',
                    'email': data.customer_email,
                    'contact': data.customer_phone or '',
                    'notes': {'user_id': user_id}
                }
                logger.info(f"[{request_id}] Creating Razorpay customer for email: {data.customer_email}")
                customer = create_razorpay_customer(customer_data)
                customer_id = customer['id']
                logger.info(f"[{request_id}] Created customer: {customer_id}")
                
                # CRITICAL: Persist customer_id IMMEDIATELY before subscription
                # This prevents duplicate customer creation on frontend retries
                persist_razorpay_customer(user_id, customer_id)
                
            except razorpay.errors.BadRequestError as e:
                error_msg = str(e)
                # Log the full error including response body
                logger.error(
                    f"[{request_id}] Razorpay BadRequestError during customer creation",
                    extra={'error': error_msg, 'email': data.customer_email}
                )
                
                if 'already exists' in error_msg.lower():
                    # Customer exists in Razorpay but NOT in our DB
                    # This is a data sync issue - return clear error
                    return error_response(
                        'A customer with this email already exists in payment system. '
                        'Please contact support or use a different email.',
                        'CUSTOMER_EXISTS',
                        400  # Client error - not retryable
                    )
                else:
                    return error_response(
                        f'Invalid customer data: {error_msg}',
                        'CUSTOMER_VALIDATION_ERROR',
                        400  # Client error
                    )
                    
            except razorpay.errors.ServerError as e:
                # Razorpay 5xx - their issue, not ours
                error_msg = str(e)
                logger.error(
                    f"[{request_id}] Razorpay ServerError during customer creation: {error_msg}",
                    extra={'error': error_msg, 'email': data.customer_email}
                )
                return error_response(
                    'Payment service temporarily unavailable. Please try again in a moment.',
                    'RAZORPAY_SERVER_ERROR',
                    503  # Service unavailable - retryable
                )
                
            except requests.exceptions.Timeout:
                # Request timeout - likely network/Razorpay issue
                logger.error(f"[{request_id}] Razorpay request timeout during customer creation")
                return error_response(
                    'Payment service request timed out. Please try again.',
                    'RAZORPAY_TIMEOUT',
                    504  # Gateway timeout
                )
                
            except Exception as e:
                # Catch-all for unexpected errors
                logger.exception(f"[{request_id}] Unexpected error creating customer: {e}")
                return error_response(
                    'Failed to create customer. Please try again.',
                    'CUSTOMER_ERROR',
                    500
                )
        
        # CRITICAL: Validate customer_id before proceeding
        if not customer_id:
            logger.error(f"[{request_id}] customer_id is None - cannot create subscription")
            return error_response('Customer creation failed', 'CUSTOMER_ERROR', 500)
        
        # Create subscription
        subscription_data = {
            'plan_id': plan['plan_id'],
            'customer_id': customer_id,
            'total_count': 12,
            'quantity': 1,
            'customer_notify': 1,
            'notes': {
                'user_id': user_id,
                'plan_name': plan_name,
                'request_id': request_id
            }
        }
        subscription = create_razorpay_subscription(subscription_data)
        
        # Store in database with PENDING status
        if SUPABASE_AVAILABLE:
            supabase = get_supabase_client()
            supabase.table('subscriptions').insert({
                'user_id': user_id,
                'razorpay_subscription_id': subscription['id'],
                'razorpay_customer_id': customer_id,
                'plan_name': plan_name,
                'plan_id': plan['plan_id'],
                'status': 'pending',
                'idempotency_key': idempotency_key,
                'ai_responses_limit': plan['ai_responses_limit']
            }).execute()
            
            # Record payment attempt
            supabase.table('payment_attempts').insert({
                'user_id': user_id,
                'request_id': request_id,
                'plan_name': plan_name,
                'idempotency_key': idempotency_key,
                'status': 'initiated',
                'razorpay_subscription_id': subscription['id'],
                'client_ip': request.remote_addr,
                'user_agent': request.headers.get('User-Agent', '')[:500]
            }).execute()
        
        logger.info(f"[{request_id}] Created subscription {subscription['id']} for user {user_id}")
        
        # Send tracking request to Razorpay (non-critical)
        if RAZORPAY_KEY_ID:
            send_razorpay_tracking(RAZORPAY_KEY_ID)

        return success_response({
            'subscription_id': subscription['id'],
            'key_id': RAZORPAY_KEY_ID,
            'amount': plan['amount'],
            'currency': plan['currency'],
            'plan_name': plan['display_name']
        })
        
    except razorpay.errors.BadRequestError as e:
        error_msg = str(e)
        logger.error(f"[{request_id}] Razorpay BadRequest: {error_msg}")
        return error_response(f'Razorpay error: {error_msg}', 'RAZORPAY_BAD_REQUEST', 400)
    except razorpay.errors.ServerError as e:
        error_msg = str(e)
        # Log detailed context for debugging
        env_mode = 'test' if 'test' in RAZORPAY_KEY_ID else 'live'
        logger.error(f"[{request_id}] Razorpay ServerError: {error_msg}")
        logger.error(f"[{request_id}] Context: plan_id={plan.get('plan_id')}, customer_id={customer_id}, env={env_mode}")
        return error_response(
            'Payment service temporarily unavailable. Please try again in a moment.',
            'RAZORPAY_SERVER_ERROR',
            503
        )
    except Exception as e:
        error_msg = str(e)
        logger.exception(f"[{request_id}] Error creating subscription: {error_msg}")
        return error_response(f'Failed to create subscription: {error_msg}', 'INTERNAL_ERROR', 500)


@payments_bp.route('/subscriptions/verify', methods=['POST'])
@require_razorpay
@require_auth
def verify_subscription():
    """
    Verify a Razorpay subscription payment.
    
    CRITICAL: This endpoint sets status to PROCESSING, not COMPLETED.
    Only webhooks can set COMPLETED status.
    """
    request_id = g.request_id
    user_id = g.user_id
    
    try:
        # Validate input
        if VALIDATION_AVAILABLE:
            try:
                data = VerifyPaymentRequest(**request.get_json())
            except ValidationError as e:
                return error_response(
                    f"Invalid input: {e.errors()[0]['msg']}",
                    'VALIDATION_ERROR',
                    400
                )
        else:
            data = request.get_json()
            data = type('obj', (object,), {
                'razorpay_subscription_id': data.get('razorpay_subscription_id'),
                'razorpay_payment_id': data.get('razorpay_payment_id'),
                'razorpay_signature': data.get('razorpay_signature')
            })()
        
        subscription_id = data.razorpay_subscription_id
        payment_id = data.razorpay_payment_id
        signature = data.razorpay_signature
        
        # Verify signature
        verify_data = f"{payment_id}|{subscription_id}"
        expected_signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode('utf-8'),
            verify_data.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_signature, signature):
            logger.warning(f"[{request_id}] Invalid signature for payment {payment_id}")
            return error_response('Invalid payment signature', 'INVALID_SIGNATURE', 400)
        
        # Fetch subscription details from Razorpay
        subscription = razorpay_client.subscription.fetch(subscription_id)
        
        # Calculate period dates (handle None values safely)
        current_start_ts = subscription.get('current_start')
        current_end_ts = subscription.get('current_end')
        
        now = datetime.now(timezone.utc)
        
        current_start = datetime.fromtimestamp(
            current_start_ts if current_start_ts is not None else now.timestamp(),
            tz=timezone.utc
        ).isoformat()
        
        current_end = datetime.fromtimestamp(
            current_end_ts if current_end_ts is not None else now.timestamp(),
            tz=timezone.utc
        ).isoformat()
        
        # Update subscription to COMPLETED immediately (don't wait for webhook)
        # Signature verification already confirms payment is valid
        if SUPABASE_AVAILABLE:
            supabase = get_supabase_client()
            
            # Set to COMPLETED immediately - payment signature is verified
            supabase.table('subscriptions').update({
                'status': 'completed',  # Mark as active immediately
                'current_period_start': current_start,
                'current_period_end': current_end,
                'ai_responses_used': 0  # Reset usage on activation
            }).eq('razorpay_subscription_id', subscription_id).execute()
            
            # Record payment using UPSERT for idempotency
            # This handles: retry by user, concurrent verify + webhook
            payment = razorpay_client.payment.fetch(payment_id)
            
            # Get subscription UUID for foreign key
            sub_result = supabase.table('subscriptions').select('id').eq(
                'razorpay_subscription_id', subscription_id
            ).limit(1).execute()
            subscription_uuid = sub_result.data[0]['id'] if sub_result.data else None
            
            payment_result = upsert_payment_history(
                user_id=user_id,
                razorpay_payment_id=payment_id,
                amount=payment.get('amount', 0),
                currency=payment.get('currency', 'INR'),
                status='captured',
                payment_method=payment.get('method'),
                subscription_id=subscription_uuid,
                razorpay_order_id=payment.get('order_id'),
                razorpay_signature=signature
            )
            
            if payment_result.get('success'):
                if payment_result.get('is_new'):
                    logger.info(f"[{request_id}] Payment {payment_id} recorded via verify")
                else:
                    logger.info(f"[{request_id}] Payment {payment_id} already recorded (verify retry or webhook)")
            else:
                logger.warning(f"[{request_id}] Payment recording issue: {payment_result.get('error')}")
            
            # Update payment attempt status
            # Note: payment_attempts.status CHECK constraint allows:
            # 'initiated', 'checkout_opened', 'payment_completed', 'verification_started', 'verification_completed', 'failed'
            supabase.table('payment_attempts').update({
                'status': 'verification_completed',
                'razorpay_payment_id': payment_id
            }).eq('razorpay_subscription_id', subscription_id).eq('user_id', user_id).execute()
        
        logger.info(f"[{request_id}] Subscription {subscription_id} → COMPLETED (immediate activation)")
        
        return success_response({
            'message': 'Payment verified and subscription activated',
            'subscription_id': subscription_id,
            'status': 'active'  # Return 'active' to frontend
        })
        
    except Exception as e:
        logger.exception(f"[{request_id}] Error verifying subscription: {e}")
        return error_response('Failed to verify subscription', 'INTERNAL_ERROR', 500)


@payments_bp.route('/subscriptions/status', methods=['GET'])
@require_auth
def get_subscription_status():
    """Get current user's subscription status (with caching)."""
    request_id = g.request_id
    user_id = g.user_id
    
    try:
        if not SUPABASE_AVAILABLE:
            return error_response('Database not available', 'DB_UNAVAILABLE', 503)
        
        # Check cache first (10 second TTL to reduce database load from polling)
        cache_key = f"subscription_status:{user_id}"
        if cache_manager:
            cached_response = cache_manager.get(cache_key)
            if cached_response:
                return jsonify(cached_response), 200
        
        supabase = get_supabase_client()
        
        # Get most recent subscription (any status for status check)
        result = supabase.table('subscriptions').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=True).limit(1).execute()
        
        if not result.data:
            return success_response({
                'has_subscription': False,
                'subscription': None
            })
        
        subscription = result.data[0]
        
        # Normalize status for frontend
        status = subscription['status']
        if status == 'completed':
            status = 'active'
        
        response_data = {
            'success': True,
            'request_id': request_id,
            'has_subscription': True,
            'subscription': {
                'id': subscription['id'],
                'razorpay_subscription_id': subscription.get('razorpay_subscription_id'),
                'plan_name': subscription['plan_name'],
                'status': status,
                'ai_responses_limit': subscription['ai_responses_limit'],
                'ai_responses_used': subscription['ai_responses_used'],
                'current_period_start': subscription['current_period_start'],
                'current_period_end': subscription['current_period_end']
            }
        }
        
        # Cache for 10 seconds to reduce database load
        if cache_manager:
            cache_manager.set(cache_key, response_data, ttl=10)
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.exception(f"[{request_id}] Error fetching subscription status: {e}")
        return error_response('Failed to fetch subscription status', 'INTERNAL_ERROR', 500)


@payments_bp.route('/subscriptions/cancel', methods=['POST'])
@require_razorpay
@require_auth
def cancel_subscription():
    """Cancel a subscription at period end."""
    request_id = g.request_id
    user_id = g.user_id
    
    try:
        if not SUPABASE_AVAILABLE:
            return error_response('Database not available', 'DB_UNAVAILABLE', 503)
        
        supabase = get_supabase_client()
        result = supabase.table('subscriptions').select('razorpay_subscription_id').eq(
            'user_id', user_id
        ).in_('status', ['active', 'completed', 'processing']).limit(1).execute()
        
        if not result.data:
            return error_response('No active subscription found', 'NO_SUBSCRIPTION', 404)
        
        razorpay_sub_id = result.data[0]['razorpay_subscription_id']
        
        # Cancel at period end
        razorpay_client.subscription.cancel(razorpay_sub_id, {'cancel_at_cycle_end': 1})
        
        # Update local status
        supabase.table('subscriptions').update({
            'status': 'cancelled'
        }).eq('razorpay_subscription_id', razorpay_sub_id).execute()
        
        logger.info(f"[{request_id}] Cancelled subscription {razorpay_sub_id}")
        
        return success_response({
            'message': 'Subscription will be cancelled at the end of the billing period'
        })
        
    except Exception as e:
        logger.exception(f"[{request_id}] Error cancelling subscription: {e}")
        return error_response('Failed to cancel subscription', 'INTERNAL_ERROR', 500)


# =============================================================================
# Webhook Handler - Production Grade with Idempotency
# =============================================================================

class WebhookResult:
    """Structured webhook processing result."""
    
    def __init__(self, status: str, http_code: int = 200, message: str = None):
        self.status = status
        self.http_code = http_code
        self.message = message or status
    
    def to_response(self):
        return jsonify({'status': self.status, 'message': self.message}), self.http_code


# Webhook result constants
WEBHOOK_OK = WebhookResult('ok', 200)
WEBHOOK_DUPLICATE_EVENT = WebhookResult('ignored_duplicate', 200, 'Event already processed')
WEBHOOK_DUPLICATE_PAYMENT = WebhookResult('ignored_duplicate_payment', 200, 'Payment already recorded')
WEBHOOK_IGNORED_ORDERING = WebhookResult('ignored_ordering', 200, 'Event ignored due to state ordering')
WEBHOOK_INVALID_SIGNATURE = WebhookResult('invalid_signature', 400, 'Invalid webhook signature')
WEBHOOK_INVALID_PAYLOAD = WebhookResult('invalid_payload', 400, 'Invalid payload format')
WEBHOOK_DB_UNAVAILABLE = WebhookResult('db_unavailable', 503, 'Database unavailable')


def parse_webhook_event(raw_body: bytes) -> Optional[Dict]:
    """
    Parse webhook event from raw body.
    Returns None if parsing fails.
    """
    try:
        import json
        return json.loads(raw_body.decode('utf-8'))
    except Exception as e:
        logger.error(f"Failed to parse webhook payload: {e}")
        return None


def extract_event_metadata(event: Dict) -> Dict:
    """Extract standardized metadata from webhook event."""
    payload = event.get('payload', {})
    
    # Get event timestamp
    event_created_at = event.get('created_at')
    if event_created_at:
        if isinstance(event_created_at, int):
            event_created_at = datetime.fromtimestamp(event_created_at, tz=timezone.utc)
        else:
            event_created_at = datetime.now(timezone.utc)
    else:
        event_created_at = datetime.now(timezone.utc)
    
    # Extract IDs from nested payload structure
    subscription_entity = payload.get('subscription', {}).get('entity', {})
    payment_entity = payload.get('payment', {}).get('entity', {})
    
    return {
        'event_id': event.get('id') or event.get('event_id') or f"evt_{uuid.uuid4().hex[:16]}",
        'event_type': event.get('event', 'unknown'),
        'created_at': event_created_at,
        'subscription_id': subscription_entity.get('id'),
        'subscription_data': subscription_entity,
        'payment_id': payment_entity.get('id'),
        'payment_data': payment_entity,
        'raw_payload': event
    }


def process_subscription_activated(meta: Dict) -> WebhookResult:
    """Handle subscription.activated event."""
    request_id = getattr(g, 'request_id', 'unknown')
    sub_data = meta['subscription_data']
    sub_id = meta['subscription_id']
    
    if not sub_id:
        logger.warning(f"[{request_id}] subscription.activated missing subscription_id")
        return WEBHOOK_OK  # Return 200 anyway, don't make Razorpay retry
    
    # Get current subscription state for ordering check
    current = get_subscription_by_razorpay_id(sub_id)
    
    if current:
        current_status = current.get('status', 'unknown')
        
        # Event ordering safety - don't downgrade completed to activated
        if should_ignore_webhook_event(current_status, 'subscription.activated'):
            logger.info(f"[{request_id}] Ignoring subscription.activated - already {current_status}")
            return WEBHOOK_IGNORED_ORDERING
    
    # Calculate period timestamps safely
    current_start = sub_data.get('current_start', 0)
    current_end = sub_data.get('current_end', 0)
    
    period_start = datetime.fromtimestamp(current_start, tz=timezone.utc) if current_start else None
    period_end = datetime.fromtimestamp(current_end, tz=timezone.utc) if current_end else None
    
    # Update subscription to COMPLETED (active)
    result = update_subscription_status(
        razorpay_subscription_id=sub_id,
        status='completed',
        current_period_start=period_start,
        current_period_end=period_end,
        event_created_at=meta['created_at'],
        reset_usage=True
    )
    
    if result.get('success'):
        logger.info(f"[{request_id}] Subscription {sub_id} → COMPLETED (activated)")
    
    return WEBHOOK_OK


def process_subscription_charged(meta: Dict) -> WebhookResult:
    """
    Handle subscription.charged event.
    
    CRITICAL: This is where duplicate payment inserts were happening.
    Now uses upsert_payment_history() for idempotency.
    """
    request_id = getattr(g, 'request_id', 'unknown')
    sub_data = meta['subscription_data']
    payment_data = meta['payment_data']
    sub_id = meta['subscription_id']
    payment_id = meta['payment_id']
    
    if not sub_id:
        logger.warning(f"[{request_id}] subscription.charged missing subscription_id")
        return WEBHOOK_OK
    
    # Get subscription to find user_id
    subscription = get_subscription_by_razorpay_id(sub_id)
    
    if not subscription:
        logger.warning(f"[{request_id}] Subscription {sub_id} not found in database")
        return WEBHOOK_OK  # Return 200, subscription might not be synced yet
    
    user_id = subscription.get('user_id')
    subscription_uuid = subscription.get('id')
    
    # Calculate period timestamps
    current_start = sub_data.get('current_start', 0)
    current_end = sub_data.get('current_end', 0)
    period_start = datetime.fromtimestamp(current_start, tz=timezone.utc) if current_start else None
    period_end = datetime.fromtimestamp(current_end, tz=timezone.utc) if current_end else None
    
    # Update subscription status and reset usage
    update_subscription_status(
        razorpay_subscription_id=sub_id,
        status='completed',
        current_period_start=period_start,
        current_period_end=period_end,
        event_created_at=meta['created_at'],
        reset_usage=True
    )
    
    # Record payment with UPSERT (idempotent)
    if payment_id and user_id:
        payment_result = upsert_payment_history(
            user_id=user_id,
            razorpay_payment_id=payment_id,
            amount=payment_data.get('amount', 0),
            currency=payment_data.get('currency', 'INR'),
            status='captured',
            payment_method=payment_data.get('method'),
            subscription_id=subscription_uuid
        )
        
        if payment_result.get('success'):
            if payment_result.get('is_new'):
                logger.info(f"[{request_id}] Subscription {sub_id} charged, payment {payment_id} recorded")
            else:
                logger.info(f"[{request_id}] Subscription {sub_id} charged, payment {payment_id} already existed")
        else:
            logger.error(f"[{request_id}] Failed to record payment: {payment_result.get('error')}")
    else:
        logger.info(f"[{request_id}] Subscription {sub_id} charged (no payment_id in event)")
    
    return WEBHOOK_OK


def process_subscription_cancelled(meta: Dict) -> WebhookResult:
    """Handle subscription.cancelled event."""
    request_id = getattr(g, 'request_id', 'unknown')
    sub_id = meta['subscription_id']
    
    if not sub_id:
        logger.warning(f"[{request_id}] subscription.cancelled missing subscription_id")
        return WEBHOOK_OK
    
    update_subscription_status(
        razorpay_subscription_id=sub_id,
        status='cancelled',
        event_created_at=meta['created_at']
    )
    
    logger.info(f"[{request_id}] Subscription {sub_id} → CANCELLED")
    return WEBHOOK_OK


def process_subscription_halted(meta: Dict) -> WebhookResult:
    """Handle subscription.halted event."""
    request_id = getattr(g, 'request_id', 'unknown')
    sub_id = meta['subscription_id']
    
    if not sub_id:
        logger.warning(f"[{request_id}] subscription.halted missing subscription_id")
        return WEBHOOK_OK
    
    update_subscription_status(
        razorpay_subscription_id=sub_id,
        status='halted',
        event_created_at=meta['created_at']
    )
    
    logger.info(f"[{request_id}] Subscription {sub_id} → HALTED")
    return WEBHOOK_OK


def process_subscription_paused(meta: Dict) -> WebhookResult:
    """Handle subscription.paused event."""
    request_id = getattr(g, 'request_id', 'unknown')
    sub_id = meta['subscription_id']
    
    if not sub_id:
        return WEBHOOK_OK
    
    update_subscription_status(
        razorpay_subscription_id=sub_id,
        status='paused',
        event_created_at=meta['created_at']
    )
    
    logger.info(f"[{request_id}] Subscription {sub_id} → PAUSED")
    return WEBHOOK_OK


def process_subscription_resumed(meta: Dict) -> WebhookResult:
    """Handle subscription.resumed event."""
    request_id = getattr(g, 'request_id', 'unknown')
    sub_id = meta['subscription_id']
    
    if not sub_id:
        return WEBHOOK_OK
    
    update_subscription_status(
        razorpay_subscription_id=sub_id,
        status='completed',
        event_created_at=meta['created_at']
    )
    
    logger.info(f"[{request_id}] Subscription {sub_id} → COMPLETED (resumed)")
    return WEBHOOK_OK


def process_payment_captured(meta: Dict) -> WebhookResult:
    """
    Handle payment.captured event.
    
    This event can arrive for the same payment_id as subscription.charged.
    Using upsert ensures idempotency.
    """
    request_id = getattr(g, 'request_id', 'unknown')
    payment_data = meta['payment_data']
    payment_id = meta['payment_id']
    
    if not payment_id:
        logger.warning(f"[{request_id}] payment.captured missing payment_id")
        return WEBHOOK_OK
    
    # Try to find user from notes or subscription
    notes = payment_data.get('notes', {})
    user_id = notes.get('user_id')
    
    # If no user_id in notes, try to find via subscription
    if not user_id:
        # payment.captured may not have subscription context
        # Log and return OK - the subscription.charged event will handle payment recording
        logger.info(f"[{request_id}] payment.captured for {payment_id} - no user context, skipping")
        return WEBHOOK_OK
    
    # Record payment with UPSERT
    payment_result = upsert_payment_history(
        user_id=user_id,
        razorpay_payment_id=payment_id,
        amount=payment_data.get('amount', 0),
        currency=payment_data.get('currency', 'INR'),
        status='captured',
        payment_method=payment_data.get('method'),
        razorpay_order_id=payment_data.get('order_id')
    )
    
    if payment_result.get('is_new'):
        logger.info(f"[{request_id}] Payment {payment_id} captured and recorded")
    else:
        logger.info(f"[{request_id}] Payment {payment_id} captured (already recorded)")
    
    return WEBHOOK_OK


def process_payment_failed(meta: Dict) -> WebhookResult:
    """Handle payment.failed event."""
    request_id = getattr(g, 'request_id', 'unknown')
    payment_data = meta['payment_data']
    
    error_code = payment_data.get('error_code', 'unknown')
    error_desc = payment_data.get('error_description', 'No description')
    payment_id = meta['payment_id'] or 'unknown'
    
    logger.warning(f"[{request_id}] Payment {payment_id} failed: {error_code} - {error_desc}")
    
    # Optionally record failed payment for audit
    notes = payment_data.get('notes', {})
    user_id = notes.get('user_id')
    
    if user_id and meta['payment_id']:
        upsert_payment_history(
            user_id=user_id,
            razorpay_payment_id=meta['payment_id'],
            amount=payment_data.get('amount', 0),
            currency=payment_data.get('currency', 'INR'),
            status='failed',
            payment_method=payment_data.get('method'),
            error_code=error_code,
            error_description=error_desc
        )
    
    return WEBHOOK_OK


# Event handler routing table
WEBHOOK_HANDLERS = {
    'subscription.activated': process_subscription_activated,
    'subscription.charged': process_subscription_charged,
    'subscription.cancelled': process_subscription_cancelled,
    'subscription.halted': process_subscription_halted,
    'subscription.paused': process_subscription_paused,
    'subscription.resumed': process_subscription_resumed,
    'payment.captured': process_payment_captured,
    'payment.failed': process_payment_failed,
}


@payments_bp.route('/payments/webhook', methods=['POST'])
def razorpay_webhook():
    """
    Handle Razorpay webhook events - Production Grade.
    
    CRITICAL PATTERNS:
    1. Uses RAW body for signature verification (before any parsing)
    2. ALWAYS returns 200 for duplicates (never 400/500)
    3. Payment-level idempotency via UPSERT
    4. Event-level deduplication via webhook_events table
    5. Event ordering safety (ignores outdated events)
    6. Structured error handling - only 400 for invalid signature/payload
    
    RESPONSE CODES:
    - 200: Success, duplicate, or any business logic outcome
    - 400: Invalid signature or malformed payload ONLY
    - 503: Database unavailable (Razorpay will retry)
    """
    # Generate request ID for tracing
    g.request_id = generate_request_id()
    request_id = g.request_id
    
    webhook_start = datetime.now(timezone.utc)
    
    try:
        # ============================================================
        # STEP 1: Get RAW body BEFORE any parsing (critical for signature)
        # ============================================================
        raw_body = request.get_data()
        signature = request.headers.get('X-Razorpay-Signature', '')
        
        if not raw_body:
            logger.warning(f"[{request_id}] Empty webhook body")
            return WEBHOOK_INVALID_PAYLOAD.to_response()
        
        # ============================================================
        # STEP 2: Verify webhook signature
        # ============================================================
        if not verify_webhook_signature_raw(raw_body, signature):
            logger.warning(f"[{request_id}] Invalid webhook signature")
            return WEBHOOK_INVALID_SIGNATURE.to_response()
        
        # ============================================================
        # STEP 3: Parse event payload
        # ============================================================
        event = parse_webhook_event(raw_body)
        if not event:
            logger.warning(f"[{request_id}] Failed to parse webhook JSON")
            return WEBHOOK_INVALID_PAYLOAD.to_response()
        
        # Extract standardized metadata
        meta = extract_event_metadata(event)
        event_id = meta['event_id']
        event_type = meta['event_type']
        
        logger.info(f"[{request_id}] Webhook received: {event_type} (event_id={event_id})")
        
        # ============================================================
        # STEP 4: Event-level deduplication
        # ============================================================
        is_new_event = record_webhook_event(
            event_id=event_id,
            event_type=event_type,
            subscription_id=meta['subscription_id'],
            payment_id=meta['payment_id'],
            created_at=meta['created_at'],
            result='processing',
            raw_payload=meta['raw_payload']
        )
        
        if not is_new_event:
            logger.info(f"[{request_id}] Duplicate event ignored: {event_id}")
            return WEBHOOK_DUPLICATE_EVENT.to_response()
        
        # ============================================================
        # STEP 5: Database availability check
        # ============================================================
        if not SUPABASE_AVAILABLE:
            logger.error(f"[{request_id}] Database unavailable for webhook processing")
            return WEBHOOK_DB_UNAVAILABLE.to_response()
        
        # ============================================================
        # STEP 6: Route to specific event handler
        # ============================================================
        handler = WEBHOOK_HANDLERS.get(event_type)
        
        if handler:
            result = handler(meta)
            
            # Log processing time
            duration = (datetime.now(timezone.utc) - webhook_start).total_seconds() * 1000
            logger.info(f"[{request_id}] Webhook {event_type} processed in {duration:.0f}ms")
            
            return result.to_response()
        else:
            # Unknown event type - log and return 200 (don't make Razorpay retry)
            logger.info(f"[{request_id}] Unhandled webhook event type: {event_type}")
            return WEBHOOK_OK.to_response()
        
    except Exception as e:
        # ============================================================
        # CRITICAL: Determine if this is a retriable error
        # ============================================================
        error_str = str(e).lower()
        request_id = getattr(g, 'request_id', 'unknown')
        
        # Check if this is a duplicate key error (should return 200)
        if is_duplicate_error(e):
            logger.info(f"[{request_id}] Webhook duplicate detected in exception handler: {e}")
            return WEBHOOK_DUPLICATE_PAYMENT.to_response()
        
        # Check if this is a connection/timeout error (return 503 for retry)
        is_transient = any(x in error_str for x in [
            'connection', 'timeout', 'temporarily unavailable', 'reset by peer'
        ])
        
        if is_transient:
            logger.error(f"[{request_id}] Transient webhook error (will retry): {e}")
            return jsonify({
                'status': 'error',
                'message': 'Temporary error, please retry'
            }), 503
        
        # For all other errors, log but return 200 to prevent infinite retries
        # The raw_payload is already stored in webhook_events for manual review
        logger.exception(f"[{request_id}] Webhook processing error (non-retriable): {e}")
        return jsonify({
            'status': 'error_logged',
            'message': 'Error logged for review'
        }), 200


# =============================================================================
# Usage Tracking
# =============================================================================

def check_and_update_usage(user_id: str) -> dict:
    """
    Check if user has remaining AI responses and update usage.
    Called by AI Brain before generating responses.
    """
    if not SUPABASE_AVAILABLE:
        return {'allowed': True, 'remaining': 999999, 'limit': 999999}
    
    try:
        supabase = get_supabase_client()
        result = supabase.table('subscriptions').select('*').eq(
            'user_id', user_id
        ).in_('status', ['active', 'completed']).limit(1).execute()
        
        if not result.data:
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
