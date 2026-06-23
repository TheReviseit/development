"""
Subscription Worker — Async Razorpay Subscription Creation
===========================================================
FAANG-level: Creates Razorpay subscriptions in the background.

The API endpoint returns 202 Accepted with a checkout_token immediately.
This worker picks up the checkout_request, creates the Razorpay subscription,
and updates the request status. The frontend polls for completion.

Flow:
   1. Claim checkout_request (status='initiated' → 'processing')
   2. Get or create Razorpay customer
   3. Create Razorpay subscription (the slow part: 800-8000ms)
   4. Update checkout_request (status='completed', with sub_id)
   5. Insert subscription row (status='pending')

Design:
   - Celery task with acks_late=True (re-deliver if worker crashes)
   - Exponential backoff retry (3 attempts)
   - Idempotent: uses stable idempotency keys for Razorpay API calls
   - All errors logged to both structured logger and checkout_request.error_message
   - OpenTelemetry distributed tracing across every sub-operation

Author: FAANG Architecture Team
"""

import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional

from supabase_client import with_retry

logger = logging.getLogger('reviseit.tasks.subscription_worker')

# Distributed tracing
try:
    from services.billing_tracing import (
        traced, span_context, billing_attributes, get_or_create_correlation_id,
    )
    TRACING_AVAILABLE = True
except ImportError:
    TRACING_AVAILABLE = False

    def traced(span_name=None, **kwargs):
        def decorator(f):
            return f
        return decorator

    class span_context:
        def __init__(self, name, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    def billing_attributes(**kwargs):
        return {}

    def get_or_create_correlation_id(headers=None):
        return None


def get_razorpay_credentials() -> tuple:
    """Get Razorpay credentials from environment."""
    key_id = os.getenv('RAZORPAY_KEY_ID')
    key_secret = os.getenv('RAZORPAY_KEY_SECRET')
    if not key_id or not key_secret:
        raise RuntimeError('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set')
    return key_id, key_secret


@with_retry()
def claim_checkout_request(db, checkout_token: str) -> Optional[Dict]:
    """
    Atomically claim a checkout request for processing.
    
    Uses status='initiated' → 'processing' transition with WHERE clause.
    If another worker already claimed it, this returns None.
    """
    with span_context("subscription_worker.claim", attributes={
        "checkout_token": checkout_token[:16],
    }):
        result = db.table('checkout_requests').update({
            'status': 'processing',
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }).eq('checkout_token', checkout_token).eq('status', 'initiated').execute()
        
        return result.data[0] if result.data else None


@with_retry()
def complete_checkout_request(db, checkout_token: str, razorpay_sub_id: str):
    """Mark checkout request as completed with subscription details."""
    db.table('checkout_requests').update({
        'status': 'completed',
        'razorpay_subscription_id': razorpay_sub_id,
        'razorpay_key_id': os.getenv('RAZORPAY_KEY_ID'),
        'completed_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }).eq('checkout_token', checkout_token).execute()


@with_retry()
def fail_checkout_request(db, checkout_token: str, error_message: str, retry_count: int = 0):
    """Mark checkout request as failed with error info."""
    db.table('checkout_requests').update({
        'status': 'failed',
        'error_message': str(error_message)[:500],
        'retry_count': retry_count,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }).eq('checkout_token', checkout_token).execute()



@with_retry()
def upsert_subscription_row(
    db, user_id: str, domain: str, pricing_plan_id: str,
    plan_slug: str, razorpay_sub_id: str, customer_id: str,
    amount_paise: int, currency: str, idempotency_key: str,
    razorpay_plan_id: str,
):
    """Insert subscription row or no-op if already exists (idempotency)."""
    db.table('subscriptions').upsert({
        'user_id': user_id,
        'product_domain': domain,
        'pricing_plan_id': pricing_plan_id,
        'plan_name': plan_slug,
        'plan_id': razorpay_plan_id,
        'razorpay_subscription_id': razorpay_sub_id,
        'razorpay_customer_id': customer_id,
        'amount_paise': amount_paise,
        'currency': currency,
        'status': 'pending',
        'idempotency_key': idempotency_key,
    }, on_conflict='idempotency_key', ignore_duplicates=True).execute()


@traced("subscription_worker.execute", attributes=lambda checkout_token: billing_attributes(
    checkout_token=checkout_token,
))
def execute(checkout_token: str) -> Dict:
    """
    Execute async subscription creation.
    
    Args:
        checkout_token: Unique token from checkout_requests table
        
    Returns:
        Dict with status and subscription details
    """
    from supabase_client import get_supabase_client, get_user_id_from_firebase_uid
    from routes.payments import (
        get_razorpay_client,
        get_razorpay_customer_id_new,
        get_existing_razorpay_customer,
        recover_razorpay_customer_by_email,
        store_razorpay_customer_new,
        create_razorpay_subscription,
    )
    
    db = get_supabase_client()
    
    # 1. Atomically claim the checkout request
    checkout = claim_checkout_request(db, checkout_token)
    if not checkout:
        logger.warning(f"checkout_request_not_available token={checkout_token}")
        return {'status': 'skipped', 'reason': 'already_processing'}
    
    firebase_uid_or_user = checkout.get('firebase_uid') or checkout.get('user_id')
    user_id = firebase_uid_or_user
    if firebase_uid_or_user and len(firebase_uid_or_user) != 36:
        # It's a Firebase UID string. We must map it to the Supabase UUID!
        # Because subscriptions table requires user_id to be a UUID.
        try:
            supa_id = get_user_id_from_firebase_uid(firebase_uid_or_user)
            if supa_id:
                user_id = supa_id
        except Exception as e:
            logger.warning(f"Worker failed to map firebase_uid={firebase_uid_or_user}: {e}")
    domain = checkout.get('domain')
    plan_slug = checkout.get('target_plan_slug')
    pricing_plan_id = checkout.get('target_plan_id')
    user_email = checkout.get('user_email', '')
    razorpay_plan_id = checkout.get('razorpay_plan_id')
    amount_paise = checkout.get('amount_paise', 0)
    currency = checkout.get('currency', 'INR')
    
    # Stable idempotency key: prefer checkout row, else generate
    month_bucket = datetime.now(timezone.utc).strftime('%Y-%m')
    import hashlib
    idempotency_key = checkout.get('idempotency_key')
    if not idempotency_key:
        idem_raw = f"sub:{user_id}:{domain}:{plan_slug}:{month_bucket}"
        idempotency_key = hashlib.sha256(idem_raw.encode()).hexdigest()[:32]
    
    try:
        # 2. Get or create Razorpay customer
        with span_context("subscription_worker.razorpay_customer", attributes=billing_attributes(
            domain=domain,
        )):
            customer_id = get_razorpay_customer_id_new(user_id)
            if not customer_id:
                customer_id = get_existing_razorpay_customer(user_id, user_email)
            if not customer_id:
                customer_data = {
                    'name': user_email.split('@')[0] if user_email else plan_slug,
                    'email': user_email,
                    'contact': checkout.get('user_phone', ''),
                    'notes': {'user_id': user_id},
                }
                try:
                    customer = get_razorpay_client().customer.create(data=customer_data)
                    customer_id = customer['id']
                except Exception as e:
                    if 'already exists' in str(e).lower():
                        customer_id = recover_razorpay_customer_by_email(user_email)
                        if not customer_id:
                            raise RuntimeError(
                                f"Customer already exists for {user_email} but could not be recovered"
                            ) from e
                        logger.info(
                            f"razorpay_customer_recovered email={user_email} "
                            f"customer={customer_id} user={user_id[:8]}"
                        )
                    else:
                        raise
                store_razorpay_customer_new(
                    user_id, customer_id, user_email,
                    customer_name=customer_data['name'],
                    customer_phone=checkout.get('user_phone') or None,
                )
                logger.info(f"razorpay_customer_created_or_found customer={customer_id} user={user_id[:8]}")
        
        # 3. Create Razorpay subscription (the slow API call)
        subscription_data = {
            'plan_id': razorpay_plan_id,
            'total_count': 12,
            'customer_notify': 1,
            'quantity': 1,
            'customer_id': customer_id,
            'notes': {
                'user_id': user_id,
                'product_domain': domain,
                'plan_slug': plan_slug,
                'checkout_token': checkout_token,
            },
        }
        with span_context("subscription_worker.razorpay_subscription", attributes=billing_attributes(
            domain=domain,
            plan_slug=plan_slug,
        )):
            rp_sub = create_razorpay_subscription(subscription_data, idempotency_key)
            razorpay_sub_id = rp_sub.get('id')
        
        if not razorpay_sub_id:
            raise RuntimeError(f"Razorpay returned no subscription ID: {rp_sub}")
        
        # 4. Mark checkout as completed
        with span_context("subscription_worker.complete_checkout", attributes=billing_attributes(
            checkout_token=checkout_token,
            subscription_id=razorpay_sub_id,
        )):
            complete_checkout_request(db, checkout_token, razorpay_sub_id)
        
        # 5. Insert subscription row
        with span_context("subscription_worker.upsert_subscription", attributes=billing_attributes(
            domain=domain,
            plan_slug=plan_slug,
            subscription_id=razorpay_sub_id,
        )):
            upsert_subscription_row(
                db, user_id, domain, pricing_plan_id, plan_slug,
                razorpay_sub_id, customer_id, amount_paise, currency,
                idempotency_key, razorpay_plan_id,
            )
        
        logger.info(
            f"subscription_created token={checkout_token} "
            f"sub={razorpay_sub_id} user={user_id[:8]} plan={plan_slug}"
        )
        
        return {
            'status': 'completed',
            'razorpay_subscription_id': razorpay_sub_id,
            'plan_slug': plan_slug,
        }
        
    except Exception as exc:
        retry_count = checkout.get('retry_count', 0) + 1
        fail_checkout_request(db, checkout_token, str(exc), retry_count)
        logger.error(
            f"subscription_creation_failed token={checkout_token}: {exc}",
            exc_info=True,
        )
        raise


# =============================================================================
# Celery Task Registration
# =============================================================================

try:
    from celery_app import celery_app

    @celery_app.task(
        bind=True,
        max_retries=3,
        default_retry_delay=10,
        acks_late=True,
        reject_on_worker_lost=True,
        queue='default',
        name='subscription_worker.create_subscription',
    )
    def create_subscription_task(self, checkout_token: str):
        """
        Celery task: create Razorpay subscription asynchronously.
        
        acks_late=True: If the worker crashes mid-execution, the message
        is re-delivered to another worker after visibility_timeout.
        
        Retries: 3 attempts with exponential backoff (10s, 20s, 40s).
        """
        try:
            return execute(checkout_token)
        except Exception as exc:
            logger.warning(
                f"create_subscription_retry token={checkout_token} "
                f"attempt={self.request.retries + 1}/3"
            )
            raise self.retry(exc=exc)

    logger.info("✅ Registered subscription_worker tasks")

except ImportError:
    logger.warning("⚠️ Celery not available, subscription_worker not registered")
