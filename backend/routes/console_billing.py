"""
Console Billing Routes
Console-specific billing endpoints for plan selection and Razorpay checkout.

These routes use console auth (cookie-based JWT) and update the
otp_console_subscriptions table for console entitlements.

Endpoints:
- GET  /console/billing/plans         - List available plans
- GET  /console/billing/current       - Get current subscription
- POST /console/billing/create-order  - Create Razorpay order
- POST /console/billing/verify        - Verify payment (backup)
- GET  /console/billing/status        - Poll subscription status
"""

import os
import hmac
import hashlib
import logging
import uuid
from datetime import datetime, timezone, timedelta
from functools import wraps
from typing import Optional, Dict, Any, Tuple

from flask import Blueprint, request, jsonify, g

from middleware.console_auth_middleware import require_console_auth

logger = logging.getLogger('console.billing')

# Initialize Razorpay client
try:
    import razorpay
    RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID')
    RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET')
    
    if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
        razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        RAZORPAY_AVAILABLE = True
    else:
        razorpay_client = None
        RAZORPAY_AVAILABLE = False
        logger.warning("Razorpay credentials not configured for console")
except ImportError:
    razorpay_client = None
    RAZORPAY_AVAILABLE = False
    logger.warning("Razorpay SDK not installed")

# Console plan configuration
# Console plan configuration
CONSOLE_PLAN_CONFIG = {
    'starter': {
        'plan_id': os.getenv('RAZORPAY_PLAN_CONSOLE_STARTER', os.getenv('RAZORPAY_PLAN_STARTER')),
        'amount': 79900,  # ₹799 in paise
        'currency': 'INR',
        'interval': 'monthly',
        'display_name': 'Starter',
        'entitlement_level': 'live',
        'features': [
            "Live OTP API access",
            "WhatsApp OTPs at ₹0.75/OTP",
            "Standard API latency",
            "1 Webhook integration",
            "Basic usage analytics",
            "Email support",
            "Secure API keys & console access"
        ]
    },
    'growth': {
        'plan_id': os.getenv('RAZORPAY_PLAN_CONSOLE_GROWTH', os.getenv('RAZORPAY_PLAN_BUSINESS')),
        'amount': 199900,  # ₹1,999 in paise
        'currency': 'INR',
        'interval': 'monthly',
        'display_name': 'Growth',
        'entitlement_level': 'live',
        'features': [
            "WhatsApp OTPs at ₹0.60/OTP",
            "Priority API routing (lower latency)",
            "Unlimited webhooks",
            "Production-grade API keys",
            "Advanced analytics dashboard",
            "Priority chat support"
        ]
    },
    'enterprise': {
        'plan_id': None,  # Contact sales only
        'amount': 0,
        'currency': 'INR',
        'interval': 'monthly',
        'display_name': 'Enterprise',
        'entitlement_level': 'enterprise',
        'action': 'contact_sales',
        'features': [
            "Volume OTP pricing (₹0.50/OTP and below)",
            "Dedicated account manager",
            "Custom SLA (99.9%+ uptime)",
            "High throughput & custom rate limits",
            "White-label & IP-restricted APIs",
            "Custom integrations",
            "24/7 premium support"
        ]
    }
}

# Create blueprint
console_billing_bp = Blueprint('console_billing', __name__, url_prefix='/console/billing')


# =============================================================================
# HELPERS
# =============================================================================

def error_response(message: str, code: str, status: int = 400) -> Tuple:
    """Create structured error response."""
    return jsonify({
        'success': False,
        'error': code,
        'message': message
    }), status


def success_response(data: dict, status: int = 200) -> Tuple:
    """Create structured success response."""
    return jsonify({
        'success': True,
        **data
    }), status


def get_console_subscription(org_id: str) -> Optional[Dict[str, Any]]:
    """Fetch console subscription for an org."""
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table('otp_console_subscriptions').select('*').eq(
            'org_id', org_id
        ).single().execute()
        
        return result.data
    except Exception as e:
        logger.debug(f"No subscription found for org {org_id}: {e}")
        return None


def generate_idempotency_key(org_id: str, plan_name: str) -> str:
    """Generate stable idempotency key for order creation."""
    data = f"{org_id}:{plan_name}:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    return f"console_{hashlib.sha256(data.encode()).hexdigest()[:24]}"


# =============================================================================
# PLAN ENDPOINTS
# =============================================================================

@console_billing_bp.route('/plans', methods=['GET'])
def list_plans():
    """
    List available billing plans.
    
    No auth required - public endpoint for pricing page.
    """
    plans = []
    for plan_id, config in CONSOLE_PLAN_CONFIG.items():
        plans.append({
            'id': plan_id,
            'name': config['display_name'],
            'amount': config['amount'],
            'amount_display': f"₹{config['amount'] // 100}/month",
            'currency': config['currency'],
            'interval': config['interval'],
            'features': config['features']
        })
    
    return success_response({'plans': plans})


@console_billing_bp.route('/current', methods=['GET'])
@require_console_auth()
def get_current_subscription():
    """
    Get current subscription for the authenticated org.
    """
    org_id = g.console_org_id
    
    subscription = get_console_subscription(org_id)
    
    if not subscription:
        return success_response({
            'subscription': None,
            'entitlement_level': 'none',
            'can_create_live_keys': False
        })
    
    return success_response({
        'subscription': {
            'id': subscription['id'],
            'plan_name': subscription['plan_name'],
            'billing_status': subscription['billing_status'],
            'entitlement_level': subscription['entitlement_level'],
            'current_period_start': subscription.get('current_period_start'),
            'current_period_end': subscription.get('current_period_end'),
            'grace_period_end': subscription.get('grace_period_end')
        },
        'entitlement_level': subscription['entitlement_level'],
        'can_create_live_keys': subscription['entitlement_level'] in ('live', 'enterprise')
    })


# =============================================================================
# ORDER CREATION
# =============================================================================

@console_billing_bp.route('/create-order', methods=['POST'])
@require_console_auth()
def create_order():
    """
    Create a Razorpay subscription order.
    
    Request:
        {
            "plan_name": "starter"
        }
    
    Response:
        {
            "subscription_id": "sub_xxx",
            "key_id": "rzp_xxx",
            "amount": 49900,
            "currency": "INR"
        }
    """
    if not RAZORPAY_AVAILABLE:
        return error_response(
            'Payment service not available',
            'RAZORPAY_UNAVAILABLE',
            503
        )
    
    org_id = g.console_org_id
    user = g.console_user
    
    try:
        data = request.get_json() or {}
    except Exception:
        return error_response('Invalid JSON', 'INVALID_JSON', 400)
    
    plan_name = data.get('plan_name', '').lower()
    
    if plan_name not in CONSOLE_PLAN_CONFIG:
        return error_response(
            f'Invalid plan: {plan_name}',
            'INVALID_PLAN',
            400
        )
    
    plan = CONSOLE_PLAN_CONFIG[plan_name]
    
    if not plan['plan_id']:
        return error_response(
            f'Plan {plan_name} not configured',
            'PLAN_NOT_CONFIGURED',
            500
        )
    
    # Check for existing subscription
    existing_sub = get_console_subscription(org_id)
    
    # If already active, don't allow new subscription
    if existing_sub and existing_sub['billing_status'] == 'active':
        return error_response(
            'You already have an active subscription',
            'ALREADY_SUBSCRIBED',
            400
        )
    
    # Generate idempotency key
    idempotency_key = generate_idempotency_key(org_id, plan_name)
    
    # Check if there's a pending order with this key
    if existing_sub and existing_sub.get('idempotency_key') == idempotency_key:
        if existing_sub['billing_status'] == 'payment_pending':
            # Return existing order
            return success_response({
                'subscription_id': existing_sub['razorpay_subscription_id'],
                'key_id': RAZORPAY_KEY_ID,
                'amount': plan['amount'],
                'currency': plan['currency'],
                'plan_name': plan['display_name'],
                'existing_order': True
            })
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Get org details for customer creation
        org_result = db.table('otp_organizations').select(
            'name, owner_id'
        ).eq('id', org_id).single().execute()
        
        org = org_result.data if org_result.data else {}
        
        # Create or get Razorpay customer
        customer_id = None
        try:
            customer = razorpay_client.customer.create(data={
                'name': org.get('name', 'Organization'),
                'email': user.email,
                'notes': {
                    'org_id': org_id,
                    'user_id': user.id
                }
            })
            customer_id = customer['id']
        except razorpay.errors.BadRequestError as e:
            if 'already exists' in str(e).lower():
                # Find existing customer by email
                customers = razorpay_client.customer.all({'count': 100})
                for c in customers.get('items', []):
                    if c.get('email') == user.email:
                        customer_id = c['id']
                        break
            if not customer_id:
                logger.error(f"Failed to create/find customer: {e}")
                return error_response('Failed to create customer', 'CUSTOMER_ERROR', 500)
        
        # Create Razorpay subscription
        subscription = razorpay_client.subscription.create(data={
            'plan_id': plan['plan_id'],
            'customer_id': customer_id,
            'total_count': 12,  # 12 months
            'quantity': 1,
            'customer_notify': 1,
            'notes': {
                'org_id': org_id,
                'plan_name': plan_name,
                'idempotency_key': idempotency_key
            }
        })
        
        # Upsert subscription record
        subscription_data = {
            'org_id': org_id,
            'plan_name': plan_name,
            'billing_status': 'payment_pending',
            'entitlement_level': 'sandbox',  # Stays sandbox until payment
            'razorpay_subscription_id': subscription['id'],
            'razorpay_customer_id': customer_id,
            'idempotency_key': idempotency_key
        }
        
        if existing_sub:
            # Update existing record
            db.table('otp_console_subscriptions').update(
                subscription_data
            ).eq('id', existing_sub['id']).execute()
        else:
            # Insert new record
            db.table('otp_console_subscriptions').insert(
                subscription_data
            ).execute()
        
        # Audit log
        db.table('otp_console_audit_logs').insert({
            'user_id': user.id,
            'org_id': org_id,
            'action': 'create_billing_order',
            'resource_type': 'subscription',
            'resource_id': subscription['id'],
            'details': {
                'plan_name': plan_name,
                'amount': plan['amount']
            }
        }).execute()
        
        logger.info(f"Created order {subscription['id']} for org {org_id}, plan {plan_name}")
        
        return success_response({
            'subscription_id': subscription['id'],
            'key_id': RAZORPAY_KEY_ID,
            'amount': plan['amount'],
            'currency': plan['currency'],
            'plan_name': plan['display_name']
        })
        
    except razorpay.errors.BadRequestError as e:
        logger.error(f"Razorpay error: {e}")
        return error_response(f'Payment error: {e}', 'RAZORPAY_ERROR', 400)
    except Exception as e:
        logger.exception(f"Order creation failed: {e}")
        return error_response('Failed to create order', 'ORDER_FAILED', 500)


# =============================================================================
# PAYMENT VERIFICATION
# =============================================================================

@console_billing_bp.route('/verify', methods=['POST'])
@require_console_auth()
def verify_payment():
    """
    Verify payment after Razorpay checkout completes.
    
    NOTE: This is a BACKUP verification. The webhook is the source of truth.
    This endpoint sets status to 'processing' so frontend can show progress.
    
    Request:
        {
            "razorpay_subscription_id": "sub_xxx",
            "razorpay_payment_id": "pay_xxx",
            "razorpay_signature": "..."
        }
    """
    org_id = g.console_org_id
    
    try:
        data = request.get_json() or {}
    except Exception:
        return error_response('Invalid JSON', 'INVALID_JSON', 400)
    
    subscription_id = data.get('razorpay_subscription_id')
    payment_id = data.get('razorpay_payment_id')
    signature = data.get('razorpay_signature')
    
    if not all([subscription_id, payment_id, signature]):
        return error_response(
            'Missing required fields',
            'MISSING_FIELDS',
            400
        )
    
    # Verify signature
    try:
        razorpay_client.utility.verify_subscription_payment_signature({
            'razorpay_subscription_id': subscription_id,
            'razorpay_payment_id': payment_id,
            'razorpay_signature': signature
        })
    except razorpay.errors.SignatureVerificationError:
        logger.warning(f"Signature verification failed for {subscription_id}")
        return error_response('Invalid signature', 'INVALID_SIGNATURE', 400)
    
    # Update status to processing (webhook will set to active)
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        db.table('otp_console_subscriptions').update({
            'billing_status': 'active',
            'entitlement_level': 'live',  # Grant live access
            'current_period_start': datetime.now(timezone.utc).isoformat(),
            'current_period_end': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        }).eq('org_id', org_id).eq(
            'razorpay_subscription_id', subscription_id
        ).execute()
        
        logger.info(f"Payment verified for org {org_id}, subscription {subscription_id}")
        
        return success_response({
            'status': 'active',
            'message': 'Payment verified successfully'
        })
        
    except Exception as e:
        logger.error(f"Failed to update subscription after verify: {e}")
        return error_response('Failed to update subscription', 'UPDATE_FAILED', 500)


@console_billing_bp.route('/status', methods=['GET'])
@require_console_auth()
def poll_status():
    """
    Poll subscription status.
    
    Frontend uses this to poll while waiting for webhook.
    Returns current billing_status and entitlement_level.
    """
    org_id = g.console_org_id
    
    subscription = get_console_subscription(org_id)
    
    if not subscription:
        return success_response({
            'status': 'none',
            'entitlement_level': 'none',
            'ready': False
        })
    
    return success_response({
        'status': subscription['billing_status'],
        'entitlement_level': subscription['entitlement_level'],
        'ready': subscription['entitlement_level'] in ('live', 'enterprise'),
        'plan_name': subscription['plan_name']
    })


# =============================================================================
# WEBHOOK HANDLER
# =============================================================================

@console_billing_bp.route('/webhook', methods=['POST'])
def handle_webhook():
    """
    Handle Razorpay webhook events for console subscriptions.
    
    Events handled:
    - subscription.authenticated: Set active
    - subscription.charged: Renew period
    - subscription.halted: Set suspended
    - subscription.cancelled: Set cancelled
    - payment.captured: Confirm payment
    - payment.failed: Log failure
    """
    WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET')
    
    if not WEBHOOK_SECRET:
        logger.error("Webhook secret not configured")
        return jsonify({'status': 'error', 'message': 'Webhook not configured'}), 500
    
    # Get raw body for signature verification
    raw_body = request.get_data()
    signature = request.headers.get('X-Razorpay-Signature')
    
    if not signature:
        logger.warning("Webhook request without signature")
        return jsonify({'status': 'error'}), 401
    
    # Verify signature
    expected_signature = hmac.new(
        WEBHOOK_SECRET.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(expected_signature, signature):
        logger.warning("Webhook signature verification failed")
        return jsonify({'status': 'error'}), 401
    
    try:
        payload = request.get_json()
    except Exception:
        return jsonify({'status': 'error'}), 400
    
    event = payload.get('event')
    entity = payload.get('payload', {})
    
    logger.info(f"Received webhook event: {event}")
    
    # Extract subscription ID from payload
    subscription_data = entity.get('subscription', {}).get('entity', {})
    razorpay_sub_id = subscription_data.get('id')
    
    if not razorpay_sub_id:
        # Try to get from payment
        payment_data = entity.get('payment', {}).get('entity', {})
        razorpay_sub_id = payment_data.get('subscription_id')
    
    if not razorpay_sub_id:
        logger.warning(f"Webhook missing subscription ID: {event}")
        return jsonify({'status': 'ignored', 'reason': 'no_subscription_id'}), 200
    
    # Check if this is a console subscription (exists in our table)
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table('otp_console_subscriptions').select('id, org_id, plan_name').eq(
            'razorpay_subscription_id', razorpay_sub_id
        ).single().execute()
        
        if not result.data:
            # Not a console subscription, ignore
            return jsonify({'status': 'ignored', 'reason': 'not_console_subscription'}), 200
        
        sub_record = result.data
        plan_config = CONSOLE_PLAN_CONFIG.get(sub_record['plan_name'], {})
        target_entitlement = plan_config.get('entitlement_level', 'live')
        
        # Handle event types
        if event in ('subscription.authenticated', 'subscription.activated'):
            db.table('otp_console_subscriptions').update({
                'billing_status': 'active',
                'entitlement_level': target_entitlement,
                'current_period_start': datetime.now(timezone.utc).isoformat(),
                'current_period_end': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            }).eq('id', sub_record['id']).execute()
            
            logger.info(f"Subscription {razorpay_sub_id} activated, entitlement={target_entitlement}")
            
        elif event == 'subscription.charged':
            # Renewal
            db.table('otp_console_subscriptions').update({
                'billing_status': 'active',
                'current_period_start': datetime.now(timezone.utc).isoformat(),
                'current_period_end': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            }).eq('id', sub_record['id']).execute()
            
            logger.info(f"Subscription {razorpay_sub_id} renewed")
            
        elif event == 'subscription.halted':
            db.table('otp_console_subscriptions').update({
                'billing_status': 'suspended',
                'entitlement_level': 'sandbox'  # Downgrade to sandbox
            }).eq('id', sub_record['id']).execute()
            
            logger.info(f"Subscription {razorpay_sub_id} halted")
            
        elif event == 'subscription.cancelled':
            db.table('otp_console_subscriptions').update({
                'billing_status': 'cancelled',
                'entitlement_level': 'sandbox'
            }).eq('id', sub_record['id']).execute()
            
            logger.info(f"Subscription {razorpay_sub_id} cancelled")
            
        elif event == 'payment.captured':
            # Payment successful, ensure active
            current = db.table('otp_console_subscriptions').select(
                'billing_status'
            ).eq('id', sub_record['id']).single().execute()
            
            if current.data and current.data['billing_status'] != 'active':
                db.table('otp_console_subscriptions').update({
                    'billing_status': 'active',
                    'entitlement_level': target_entitlement
                }).eq('id', sub_record['id']).execute()
            
            logger.info(f"Payment captured for {razorpay_sub_id}")
            
        elif event == 'payment.failed':
            logger.warning(f"Payment failed for {razorpay_sub_id}")
            # Don't change status, let user retry
        
        return jsonify({'status': 'processed'}), 200
        
    except Exception as e:
        logger.exception(f"Webhook processing error: {e}")
        return jsonify({'status': 'error'}), 500
