"""
Unified CheckoutService — single entry for subscription checkout initiation.

Consolidates onboarding (create-subscription), upgrade (/upgrade/checkout),
and payment-page (checkout-session) shared logic: idempotency claim, checkout_request
insert, and sync/async worker dispatch.
"""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from config.billing_flags import get_bool_flag

logger = logging.getLogger('reviseit.billing.checkout_service')


class CheckoutConflictError(Exception):
    """Duplicate in-flight checkout or idempotency in progress."""

    def __init__(self, message: str, error_code: str = 'DUPLICATE_REQUEST', retry_after_seconds: int = 5):
        self.error_code = error_code
        self.retry_after_seconds = retry_after_seconds
        super().__init__(message)


def build_idempotency_key(
    *,
    header_key: Optional[str],
    firebase_uid: str,
    domain: str,
    plan_slug: str,
    prefix: str = 'sub',
) -> str:
    if header_key:
        return header_key
    month_bucket = datetime.now(timezone.utc).strftime('%Y-%m')
    raw = f"{prefix}:{firebase_uid}:{domain}:{plan_slug}:{month_bucket}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def claim_checkout_idempotency(
    db,
    idempotency_key: str,
    user_id: str,
    tenant_id: str,
    firebase_uid: Optional[str] = None,
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Claim idempotency key. Returns (claim_token, cached_complete_response).
    Raises CheckoutConflictError on in-progress.
    """
    if not get_bool_flag('fix_server_idempotency', True):
        return str(uuid.uuid4()), None

    from services.billing_checkout_idempotency import (
        claim_or_reclaim,
        get_cached_complete,
        IdempotencyInProgress,
    )

    cached = get_cached_complete(db, idempotency_key)
    if cached:
        return None, cached

    try:
        _, claim_token = claim_or_reclaim(
            db, idempotency_key, user_id, tenant_id, firebase_uid=firebase_uid
        )
        return claim_token, None
    except IdempotencyInProgress as exc:
        raise CheckoutConflictError(
            'Subscription creation already in progress.',
            error_code='IDEMPOTENCY_IN_PROGRESS',
            retry_after_seconds=exc.retry_after_seconds,
        ) from exc


def insert_checkout_request(
    db,
    *,
    firebase_uid: str,
    domain: str,
    plan_pricing: Dict[str, Any],
    plan_slug: str,
    idempotency_key: str,
    user_email: str = '',
    user_phone: Optional[str] = None,
    billing_cycle: str = 'monthly',
) -> Tuple[str, str]:
    """Insert checkout_requests row. Returns (checkout_id, checkout_token)."""
    checkout_token = str(uuid.uuid4())
    checkout_data = {
        'user_id': firebase_uid,
        'firebase_uid': firebase_uid,
        'domain': domain,
        'target_plan_id': plan_pricing.get('id', ''),
        'target_plan_slug': plan_slug,
        'user_email': user_email,
        'checkout_token': checkout_token,
        'razorpay_plan_id': plan_pricing.get('razorpay_plan_id'),
        'amount_paise': plan_pricing.get('amount_paise', 0),
        'currency': plan_pricing.get('currency', 'INR'),
        'status': 'initiated',
        'billing_cycle': billing_cycle,
        'idempotency_key': idempotency_key,
    }
    if user_phone:
        checkout_data['user_phone'] = user_phone

    try:
        insert_result = db.table('checkout_requests').insert(checkout_data).execute()
    except Exception as e:
        err = str(e).lower()
        if 'unique constraint' in err or '23505' in err:
            raise CheckoutConflictError(
                'A subscription is already being created for this plan. Please wait.',
                error_code='DUPLICATE_REQUEST',
            ) from e
        raise

    checkout_id = insert_result.data[0]['id'] if insert_result.data else ''
    return checkout_id, checkout_token


def execute_checkout(
    checkout_token: str,
    *,
    async_enabled: Optional[bool] = None,
) -> Dict[str, Any]:
    """Run checkout worker sync or enqueue async task."""
    if async_enabled is None:
        async_enabled = os.getenv('ASYNC_SUBSCRIPTIONS', 'false').lower() == 'true'

    if async_enabled:
        try:
            from tasks.subscription_worker import create_subscription_task
            create_subscription_task.delay(checkout_token)
            return {'status': 'initiated', 'async': True}
        except Exception as e:
            logger.warning(f"async_checkout_enqueue_failed: {e}")

    from tasks.subscription_worker import execute
    return execute(checkout_token)


def finalize_idempotency_success(
    db,
    idempotency_key: str,
    claim_token: Optional[str],
    payload: Dict[str, Any],
) -> None:
    if not claim_token or not get_bool_flag('fix_server_idempotency', True):
        return
    from services.billing_checkout_idempotency import complete_claim
    complete_claim(db, idempotency_key, claim_token, payload)


def finalize_idempotency_failure(
    db,
    idempotency_key: str,
    claim_token: Optional[str],
    error_code: str,
) -> None:
    if not claim_token or not get_bool_flag('fix_server_idempotency', True):
        return
    from services.billing_checkout_idempotency import fail_claim
    fail_claim(db, idempotency_key, claim_token, error_code)
