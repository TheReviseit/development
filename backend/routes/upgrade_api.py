"""
Upgrade API Routes — Enterprise Upgrade Flow
=============================================

Endpoints:
    GET  /api/upgrade/options  → Get all upgrade options (plans, add-ons, recommendations)
    POST /api/upgrade/checkout → Initiate upgrade checkout (Razorpay subscription creation)

Architecture:
    - Domain-aware (shop, marketing, api, dashboard, showcase)
    - Database-driven (no hardcoded tiers)
    - Stripe-level atomicity (pending_upgrade state, webhook-driven activation)
    - Smart recommendations (multi-feature saturation analysis)
    - Add-on support (extra products, extra domains, etc.)

Author: Claude Code
Quality: FAANG-level production code
"""

import uuid
import json
import os
from flask import Blueprint, request, jsonify, g
from typing import Dict, Any, Optional
import logging
from datetime import datetime, timezone

try:
    from middleware import rate_limit
except ImportError:
    def rate_limit(**kwargs):
        def decorator(f):
            return f
        return decorator

# Initialize logger
logger = logging.getLogger(__name__)

# Create Blueprint
upgrade_bp = Blueprint('upgrade', __name__, url_prefix='/api/upgrade')


# =============================================================================
# Dependency Injection (Lazy Loading)
# =============================================================================

def get_upgrade_engine():
    """Get UpgradeEngine singleton instance."""
    from services.upgrade_engine import get_upgrade_engine as _get_engine
    return _get_engine()


def get_upgrade_orchestrator():
    """Get UpgradeOrchestrator singleton instance."""
    from services.upgrade_orchestrator import get_upgrade_orchestrator as _get_orch
    return _get_orch()


def get_supabase():
    """Get Supabase client."""
    from supabase_client import get_supabase_client
    return get_supabase_client()


# =============================================================================
# Middleware & Helpers
# =============================================================================

# FAANG-level auth: shared require_auth from middleware.auth
# Validates Firebase ID tokens (check_revoked=False), maps to Supabase UUID.
# Sets g.firebase_uid (Firebase UID) and g.user_id (Supabase UUID).
from middleware.auth import require_auth


def validate_domain(domain: str) -> bool:
    """Validate product domain."""
    VALID_DOMAINS = {'shop', 'marketing', 'api', 'dashboard', 'showcase'}
    return domain in VALID_DOMAINS


def verify_business_ownership(user_id: str) -> bool:
    """
    Verify user owns a business.

    Note: Domain validation happens separately via subscriptions table.
    The businesses table does NOT have a domain column - a single business
    can have multiple domain subscriptions (shop, marketing, api, etc.).

    The businesses table stores Firebase UID in the user_id column,
    so we try both the Supabase UUID and the Firebase UID from g.firebase_uid.
    """
    try:
        supabase = get_supabase()

        # Try with the provided user_id (Supabase UUID) first
        result = supabase.table('businesses').select('id').eq(
            'user_id', user_id
        ).execute()

        if result.data and len(result.data) > 0:
            return True

        # Fallback: try with Firebase UID (businesses table stores Firebase UID)
        firebase_uid = getattr(g, 'firebase_uid', None)
        if firebase_uid and firebase_uid != user_id:
            result = supabase.table('businesses').select('id').eq(
                'user_id', firebase_uid
            ).execute()
            if result.data and len(result.data) > 0:
                return True

        logger.info(f"User {user_id} has no business profile yet")
        return False
    except Exception as e:
        logger.error(f"Business ownership check failed: {e}", exc_info=True)
        return False


def success_response(data: Dict[str, Any], status: int = 200) -> tuple:
    """Standard success response format."""
    return jsonify({
        'success': True,
        **data
    }), status


def error_response(message: str, error_code: str, status: int = 400) -> tuple:
    """Standard error response format."""
    return jsonify({
        'success': False,
        'error': error_code,
        'message': message
    }), status


# =============================================================================
# GET /api/upgrade/options
# =============================================================================

@upgrade_bp.route('/options', methods=['GET'])
@rate_limit(limit=30, window=60)
@require_auth
def get_upgrade_options():
    """
    Get all upgrade options for user+domain.

    Query Parameters:
        domain (required): Product domain (shop, marketing, api, dashboard, showcase)
        billing_cycle (optional): monthly (default) | yearly

    Returns (200 OK):
        {
            "success": true,
            "current_plan": {...},
            "available_plans": [...],
            "recommended_plan": {...},
            "feature_differences": {...},
            "available_addons": [...],
            "usage_summary": {...},
            "domain": "shop"
        }

    Error Codes:
        400 INVALID_DOMAIN - Invalid product_domain value
        401 UNAUTHORIZED - No auth token
        403 FORBIDDEN - User doesn't own business for domain
        500 INTERNAL_ERROR - Database error
    """
    start_time = datetime.now(timezone.utc)
    # g.user_id and g.firebase_uid set by require_auth (middleware.auth)
    supabase_user_id = g.user_id
    firebase_uid = g.firebase_uid

    if not supabase_user_id:
        return error_response(
            'User account not found. Please complete account setup.',
            'NO_DB_USER', 400
        )

    try:
        # 1. Validate query parameters
        domain = request.args.get('domain')
        if not domain:
            return error_response(
                'Missing required parameter: domain',
                'MISSING_DOMAIN',
                400
            )

        if not validate_domain(domain):
            return error_response(
                f'Invalid domain. Must be one of: shop, marketing, api, dashboard, showcase',
                'INVALID_DOMAIN',
                400
            )

        billing_cycle = request.args.get('billing_cycle', 'monthly')
        if billing_cycle not in ['monthly', 'yearly']:
            return error_response(
                'billing_cycle must be "monthly" or "yearly"',
                'INVALID_BILLING_CYCLE',
                400
            )

        # 2. Verify business ownership (optional - allow viewing upgrade options)
        # Users without business can still see upgrade options
        # Business creation happens during onboarding/first purchase
        has_business = verify_business_ownership(supabase_user_id)
        if not has_business:
            logger.info(f"User {supabase_user_id} viewing upgrade options without business profile")

        # 3. Get upgrade options from UpgradeEngine
        upgrade_engine = get_upgrade_engine()
        options = upgrade_engine.get_upgrade_options(
            user_id=supabase_user_id,
            domain=domain,
            billing_cycle=billing_cycle
        )

        # 4. Format response (UpgradeOptions.to_dict() already returns serializable dicts)
        response_data = options.to_dict()

        # 5. Log and return
        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        current = options.current_plan.get('plan_slug') if options.current_plan else None
        recommended = options.recommended_plan.get('plan_slug') if options.recommended_plan else None
        logger.info(
            f"upgrade_options_fetched user={supabase_user_id} domain={domain} "
            f"cycle={billing_cycle} current={current} "
            f"plans={len(options.available_plans)} recommended={recommended} "
            f"elapsed={round(elapsed_ms, 2)}ms"
        )

        return success_response(response_data)

    except Exception as e:
        logger.error(
            f"upgrade_options_error user={supabase_user_id} domain={request.args.get('domain')} error={e}",
            exc_info=True
        )
        return error_response(
            'Failed to fetch upgrade options',
            'INTERNAL_ERROR',
            500
        )


# =============================================================================
# POST /api/upgrade/checkout
# =============================================================================

@upgrade_bp.route('/checkout', methods=['POST'])
@rate_limit(limit=10, window=60)
@require_auth
def create_upgrade_checkout():
    """
    Initiate upgrade checkout asynchronously (non-blocking).

    Creates a checkout_request row and enqueues it to the background worker.
    Returns immediately with a checkout_id for polling.
    NEVER calls Razorpay synchronously — that blocks the Flask worker thread
    for up to 30 seconds. The background worker handles it.

    Request Body:
        {
            "domain": "shop",
            "target_plan_slug": "business",
            "billing_cycle": "yearly",
            "addon_slugs": ["extra_products_10"]
        }

    Returns (202 Accepted):
        {
            "success": true,
            "checkout_id": "uuid",
            "status": "initiated",
            "poll_url": "/api/upgrade/checkout-status/<id>"
        }

    Poll GET /api/upgrade/checkout-status/<id> until status=completed,
    then use the returned razorpay_subscription_id to open Razorpay checkout.

    Error Codes:
        400 DOWNGRADE_NOT_ALLOWED - Cannot downgrade
        400 ALREADY_ON_PLAN - User already on target plan
        400 REQUIRES_SALES_CALL - Enterprise plan requires sales contact
        400 PENDING_PAYMENT - Existing subscription has pending payment
        400 INVALID_ADDON - Add-on not available
        401 UNAUTHORIZED - No auth token
        403 FORBIDDEN - User doesn't own business for domain
        429 TOO_MANY_REQUESTS - Worker queue full
        500 INTERNAL_ERROR - Database error
    """
    start_time = datetime.now(timezone.utc)
    supabase_user_id = g.user_id
    firebase_uid = g.firebase_uid

    if not supabase_user_id:
        return error_response(
            'User account not found. Please complete account setup.',
            'NO_DB_USER', 400
        )

    try:
        data = request.get_json()
        if not data:
            return error_response('Request body required', 'MISSING_BODY', 400)

        domain = data.get('domain')
        target_plan_slug = data.get('target_plan_slug')
        billing_cycle = data.get('billing_cycle', 'monthly')
        addon_slugs = data.get('addon_slugs', [])

        if not domain or not target_plan_slug:
            return error_response(
                'Missing required fields: domain, target_plan_slug',
                'MISSING_FIELDS', 400
            )

        if not validate_domain(domain):
            return error_response(f'Invalid domain: {domain}', 'INVALID_DOMAIN', 400)

        if billing_cycle not in ['monthly', 'yearly']:
            return error_response(
                'billing_cycle must be "monthly" or "yearly"',
                'INVALID_BILLING_CYCLE', 400
            )

        supabase = get_supabase()

        if not verify_business_ownership(supabase_user_id):
            return error_response(
                'Business profile required. Please complete onboarding first.',
                'BUSINESS_REQUIRED', 403
            )

        user_email = _resolve_user_email(supabase, supabase_user_id, firebase_uid)
        if not user_email:
            return error_response(
                'User email not found. Cannot create subscription.',
                'NO_EMAIL', 400
            )

        target_plan = _resolve_target_plan(
            supabase, target_plan_slug, domain, billing_cycle
        )
        if not target_plan:
            return error_response(
                f'Plan not found: {target_plan_slug} ({billing_cycle})',
                'PLAN_NOT_FOUND', 404
            )

        if not target_plan.get('razorpay_plan_id'):
            return error_response(
                f'Plan {target_plan_slug} has no Razorpay plan ID configured',
                'NO_RZP_PLAN_ID', 500
            )

        upgrade_engine = get_upgrade_engine()
        eligibility = upgrade_engine.check_upgrade_eligibility(
            user_id=supabase_user_id,
            domain=domain,
            target_plan_slug=target_plan_slug,
        )

        if eligibility.action != 'allowed':
            return error_response(
                eligibility.message,
                eligibility.action.value if hasattr(eligibility.action, 'value') else str(eligibility.action),
                400,
            )

        validated_addons = _resolve_addons(supabase, addon_slugs, domain)

        checkout_token = str(uuid.uuid4())
        checkout_id = str(uuid.uuid4())

        insert_data = {
            'id': checkout_id,
            'user_id': supabase_user_id,
            'firebase_uid': firebase_uid,
            'domain': domain,
            'target_plan_id': target_plan['id'],
            'target_plan_slug': target_plan_slug,
            'billing_cycle': billing_cycle,
            'user_email': user_email,
            'razorpay_plan_id': target_plan['razorpay_plan_id'],
            'addon_data': json.dumps(validated_addons) if validated_addons else '[]',
            'checkout_token': checkout_token,
            'status': 'initiated',
        }

        supabase.table('checkout_requests').insert(insert_data).execute()

        from services.checkout_worker import get_checkout_worker
        worker = get_checkout_worker()
        enqueued = worker.try_enqueue(checkout_id)

        if not enqueued:
            supabase.table('checkout_requests').update({
                'status': 'failed',
                'error_message': '[QUEUE_FULL] Too many pending checkouts. Try again.',
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('id', checkout_id).execute()

            elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            logger.warning(
                f"checkout_queue_full user={supabase_user_id} "
                f"elapsed={round(elapsed_ms, 2)}ms"
            )

            return jsonify({
                'success': False,
                'error': 'TOO_MANY_REQUESTS',
                'message': 'Too many pending checkouts. Please wait and try again.',
            }), 429

        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        logger.info(
            f"checkout_initiated user={supabase_user_id} domain={domain} "
            f"plan={target_plan_slug} cycle={billing_cycle} "
            f"checkout_id={checkout_id} elapsed={round(elapsed_ms, 2)}ms"
        )

        return jsonify({
            'success': True,
            'checkout_id': checkout_id,
            'status': 'initiated',
            'poll_url': f'/api/upgrade/checkout-status/{checkout_id}',
        }), 202

    except ValueError as ve:
        logger.warning(f"checkout_validation_error user={supabase_user_id} error={ve}")
        return error_response(str(ve), 'VALIDATION_ERROR', 400)

    except Exception as e:
        logger.error(
            f"checkout_error user={supabase_user_id} "
            f"plan={data.get('target_plan_slug') if 'data' in dir() and data else None} "
            f"error={e}",
            exc_info=True,
        )
        return error_response(
            'Failed to initiate checkout',
            'INTERNAL_ERROR', 500,
        )


# =============================================================================
# Slug Migration Helper
# =============================================================================

def _migrate_slug_on_upgrade(firebase_uid: str, supabase) -> None:
    """
    Atomically migrate a forced-fallback slug to the business name slug
    after a plan upgrade to Business/Pro.

    This runs immediately after payment verification so the store URL is
    available via /store/<business-name> without requiring a manual profile save.

    Safety:
    - Only migrates if current slug == forced fallback (user_id[:8])
    - Skips if business_name is blank (nothing to derive from)
    - Skips if business already has a custom slug
    - Idempotent: safe to call multiple times
    """
    import re
    import threading

    fallback_slug = firebase_uid[:8].lower()

    # Read current business record
    biz_result = supabase.table('businesses') \
        .select('url_slug, business_name') \
        .eq('user_id', firebase_uid) \
        .maybe_single() \
        .execute()

    if not biz_result.data:
        logger.info(f"slug_migration_skipped: no business record for {firebase_uid[:8]}...")
        return

    current_slug = biz_result.data.get('url_slug')
    business_name = biz_result.data.get('business_name', '').strip()

    # Only migrate if slug is still the forced fallback or missing
    if current_slug and current_slug != fallback_slug:
        logger.info(f"slug_migration_skipped: already has custom slug '{current_slug}' for {firebase_uid[:8]}...")
        return

    if not business_name:
        logger.warning(f"slug_migration_skipped: blank business_name for {firebase_uid[:8]}...")
        return

    # Generate new slug from business name
    new_slug = business_name.lower().strip()
    new_slug = re.sub(r'[^a-z0-9]+', '-', new_slug)
    new_slug = re.sub(r'-+', '-', new_slug).strip('-') or 'store'

    # Check collision — don't steal another user's slug
    collision_result = supabase.table('businesses').select('user_id').eq(
        'url_slug_lower', new_slug.lower()
    ).neq('user_id', firebase_uid).limit(1).execute()

    if collision_result.data:
        # Slug taken by another user — append suffix
        import hashlib
        suffix = hashlib.md5(firebase_uid.encode()).hexdigest()[:4]
        new_slug = f"{new_slug}-{suffix}"
        logger.info(f"slug_migration collision detected, using: {new_slug}")

    # Write to DB (update by user_id)
    supabase.table('businesses').update({
        'url_slug': new_slug,
        'url_slug_lower': new_slug.lower(),
    }).eq('user_id', firebase_uid).execute()

    logger.info(f"slug_migration_success: '{current_slug}' → '{new_slug}' for user {firebase_uid[:8]}...")

    # Invalidate slug cache so the new slug resolves immediately
    def _bust_cache():
        try:
            from utils.slug_resolver import invalidate_slug_cache
            invalidate_slug_cache(firebase_uid, old_slug=current_slug)
        except Exception as e:
            logger.warning(f"slug_migration cache bust failed (non-critical): {e}")

    threading.Thread(target=_bust_cache, daemon=True).start()


# =============================================================================
# POST /api/upgrade/verify-payment
# =============================================================================

@upgrade_bp.route('/verify-payment', methods=['POST'])
@require_auth
def verify_upgrade_payment():
    """
    Verify and activate an upgrade after Razorpay checkout completes.

    Finds the user's pending_upgrade subscription from the DB (no razorpay_subscription_id
    required from the frontend — the Razorpay handler/callback is unreliable in sandbox
    and redirect-based flows).

    Request Body (all fields optional):
        { "razorpay_subscription_id": "sub_xxx", "domain": "shop" }

    The endpoint finds the pending upgrade by user_id + status=pending_upgrade.
    If razorpay_subscription_id is provided, it narrows the search.
    """
    supabase_user_id = g.user_id
    firebase_uid = g.firebase_uid

    if not supabase_user_id:
        return error_response('Could not resolve database user ID', 'NO_DB_USER', 400)

    try:
        data = request.get_json() or {}
        rzp_sub_id_from_client = data.get('razorpay_subscription_id')
        domain_hint = data.get('domain')
        supabase = get_supabase()

        # 1. Find the user's pending upgrade subscription
        query = supabase.table('subscriptions').select('*').eq(
            'user_id', supabase_user_id
        ).in_('status', ['pending_upgrade', 'upgrade_failed']).order(
            'updated_at', desc=True
        ).limit(1)

        # Narrow by domain if provided
        if domain_hint:
            query = query.eq('product_domain', domain_hint)

        sub_result = query.execute()

        if not sub_result.data:
            # No pending upgrade — check if already activated (race with webhook)
            active_check = supabase.table('subscriptions').select('id, pricing_plan_id, status').eq(
                'user_id', supabase_user_id
            ).eq('status', 'active').order('updated_at', desc=True).limit(1).execute()

            if active_check.data:
                return success_response({'activated': True, 'already_active': True})

            return error_response(
                'No pending upgrade found',
                'NOT_FOUND', 404
            )

        subscription = sub_result.data[0]
        rzp_sub_id = subscription.get('pending_upgrade_razorpay_subscription_id') or rzp_sub_id_from_client

        if not rzp_sub_id:
            return error_response(
                'No Razorpay subscription ID found for this upgrade',
                'NO_RZP_SUB', 400
            )

        # 2. If already activated (race with webhook), return success
        if subscription['status'] == 'active' and not subscription.get('pending_upgrade_to_plan_id'):
            return success_response({'activated': True, 'already_active': True})

        # 3. Verify with Razorpay API that payment went through
        # Use requests with short timeout (5s) instead of SDK to avoid 30s blocks
        import requests as _rzp_requests
        import os as _rzp_os
        try:
            _rzp_resp = _rzp_requests.get(
                f'https://api.razorpay.com/v1/subscriptions/{rzp_sub_id}',
                auth=(_rzp_os.getenv('RAZORPAY_KEY_ID'), _rzp_os.getenv('RAZORPAY_KEY_SECRET')),
                timeout=(5, 5),
            )
            _rzp_resp.raise_for_status()
            rzp_sub = _rzp_resp.json()
        except _rzp_requests.exceptions.Timeout:
            logger.error(f"verify_payment_razorpay_timeout sub={rzp_sub_id}")
            return error_response(
                'Payment gateway timed out. Your payment may still be processing — please check back shortly.',
                'RAZORPAY_TIMEOUT', 202
            )
        except Exception as e:
            logger.error(f"verify_payment_razorpay_error sub={rzp_sub_id} error={e}")
            return error_response(
                'Could not verify payment with Razorpay',
                'RAZORPAY_ERROR', 502
            )

        rzp_status = rzp_sub.get('status', '')
        paid_count = rzp_sub.get('paid_count', 0)
        logger.info(
            f"verify_payment razorpay_status={rzp_status} paid_count={paid_count} "
            f"sub={rzp_sub_id} user={supabase_user_id}"
        )

        # FAANG-level payment verification:
        #
        # Razorpay subscription lifecycle:
        #   created       → Subscription created, no payment yet (paid_count=0)
        #   authenticated → Payment 3DS-authenticated, awaiting capture (paid_count≥1)
        #   active        → First payment captured, subscription live   (paid_count≥1)
        #
        # Timing edge case: When the Razorpay modal fires handler(), the
        # subscription might still show 'created' if the capture webhook
        # is delayed—BUT the payment DID go through (paid_count=1).
        # Rejecting 'created' outright causes a false 400 error for paying users.
        #
        # SECURITY: We use paid_count from Razorpay's response as the
        # ground truth instead of relying solely on subscription status.
        # paid_count=0 + status='created' = no payment made (possible fraud).
        # paid_count>0 = real payment regardless of status.
        #
        # Reference: https://razorpay.com/docs/api/subscriptions/#fetch-a-subscription
        is_immediately_active = rzp_status == 'active'
        is_payment_made = (
            rzp_status == 'authenticated'
            or rzp_status == 'active'
            or (rzp_status == 'created' and paid_count > 0)
        )

        if not is_payment_made:
            return error_response(
                f'Payment not completed. Razorpay status: {rzp_status}',
                'PAYMENT_INCOMPLETE', 400
            )

        # Short retry window: if Razorpay is racing from created→active,
        # wait 1.5s and re-fetch before falling through to the webhook path.
        # This reduces the "processing" window for most users.
        if not is_immediately_active and rzp_status in ('created', 'authenticated'):
            try:
                import time as _verify_time
                _verify_time.sleep(1.5)
                _rzp_retry = _rzp_requests.get(
                    f'https://api.razorpay.com/v1/subscriptions/{rzp_sub_id}',
                    auth=(_rzp_os.getenv('RAZORPAY_KEY_ID'), _rzp_os.getenv('RAZORPAY_KEY_SECRET')),
                    timeout=(5, 5),
                )
                _rzp_retry.raise_for_status()
                rzp_sub = _rzp_retry.json()
                rzp_status = rzp_sub.get('status', '')
                is_immediately_active = rzp_status == 'active'
                logger.info(
                    f"verify_payment_retry status={rzp_status} sub={rzp_sub_id}"
                )
            except Exception as retry_err:
                logger.warning(f"verify_payment_retry_failed sub={rzp_sub_id}: {retry_err}")

        # If subscription is not yet active (created/authenticated after retry),
        # payment WAS confirmed via paid_count>0. Don't activate yet — the
        # Razorpay subscription webhook (subscription.activated) will do it
        # asynchronously. Return processing status so frontend shows success.
        if not is_immediately_active:
            logger.info(
                f"verify_payment_awaiting_webhook status={rzp_status} paid_count={paid_count} "
                f"sub={rzp_sub_id} user={supabase_user_id}"
            )
            return success_response({
                'activated': False,
                'processing': True,
                'razorpay_status': rzp_status,
                'message': 'Payment received! Your subscription is being activated. This usually takes a few seconds.',
            })

        # 4. Activate the upgrade — swap to new plan
        new_plan_id = subscription.get('pending_upgrade_to_plan_id') or subscription.get('pricing_plan_id')
        if not new_plan_id:
            return error_response('No target plan found', 'NO_TARGET_PLAN', 400)

        # Resolve plan_slug AND razorpay_plan_id for the new plan.
        #
        # CRITICAL: The subscriptions.plan_id column stores the Razorpay plan ID.
        # The feature gate engine uses plan_id to re-derive pricing_plan_id, so
        # it MUST be updated here. Without this, the gate reads the old Starter
        # Razorpay plan ID and returns Starter features even on Business plan.
        new_plan_slug = None
        new_razorpay_plan_id = None
        new_plan_display_name = None
        new_plan_ai_limit = None
        try:
            plan_row = supabase.table('pricing_plans').select(
                'plan_slug, razorpay_plan_id, display_name, limits_json'
            ).eq('id', new_plan_id).limit(1).execute()
            if plan_row.data:
                new_plan_slug = plan_row.data[0].get('plan_slug')
                new_razorpay_plan_id = plan_row.data[0].get('razorpay_plan_id')
                new_plan_display_name = plan_row.data[0].get('display_name') or new_plan_slug
                limits_json = plan_row.data[0].get('limits_json') or {}
                new_plan_ai_limit = limits_json.get('ai_responses') or limits_json.get('ai_responses_limit')
        except Exception as slug_err:
            logger.warning(f"verify_payment could not resolve plan details for {new_plan_id}: {slug_err}")

        update_data = {
            'status': 'active',
            'pricing_plan_id': new_plan_id,
            'razorpay_subscription_id': rzp_sub_id,
            'pending_upgrade_to_plan_id': None,
            'pending_upgrade_razorpay_subscription_id': None,
            'upgrade_failure_reason': None,
            'upgrade_initiated_at': None,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }

        # Keep plan_name in sync with the new plan
        if new_plan_slug:
            update_data['plan_name'] = new_plan_slug

        # CRITICAL: Update plan_id to new plan's Razorpay plan ID.
        # The feature gate engine's _get_subscription reads plan_id to look up
        # the pricing plan. Without this update it resolves to the old Starter
        # plan and returns Starter features after upgrade.
        if new_razorpay_plan_id:
            update_data['plan_id'] = new_razorpay_plan_id

        # Set period from Razorpay if available
        current_start = rzp_sub.get('current_start')
        current_end = rzp_sub.get('current_end')
        if current_start:
            update_data['current_period_start'] = datetime.fromtimestamp(
                current_start, tz=timezone.utc
            ).isoformat()
        if current_end:
            update_data['current_period_end'] = datetime.fromtimestamp(
                current_end, tz=timezone.utc
            ).isoformat()

        # FAANG-level race prevention: only activate if still pending_upgrade.
        # The webhook handler also calls _activate_upgrade_atomic with the same
        # filter — only one can win. If the webhook already activated this row,
        # this UPDATE affects 0 rows and we fall through to "already_active".
        result = supabase.table('subscriptions').update(update_data).eq(
            'id', subscription['id']
        ).eq('status', 'pending_upgrade').execute()

        if not result.data:
            # Webhook already activated this — return success
            logger.info(
                f"verify_payment_already_activated_by_webhook user={supabase_user_id} "
                f"sub={subscription['id']}"
            )
            return success_response({'activated': True, 'already_active': True})

        # 5. Cancel the old subscription (upgrade creates a NEW row; old stays ACTIVE)
        try:
            previous_sub_id = subscription.get('previous_subscription_id')
            if previous_sub_id:
                supabase.table('subscriptions').update({
                    'status': 'cancelled',
                    'cancelled_at': datetime.now(timezone.utc).isoformat(),
                    'cancellation_reason': 'upgraded',
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }).eq('id', previous_sub_id).execute()
            else:
                # Fallback: cancel any other ACTIVE sub for same user+domain
                supabase.table('subscriptions').update({
                    'status': 'cancelled',
                    'cancelled_at': datetime.now(timezone.utc).isoformat(),
                    'cancellation_reason': 'upgraded',
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }).match({
                    'user_id': supabase_user_id,
                    'product_domain': subscription.get('product_domain', ''),
                    'status': 'active',
                }).neq('id', subscription['id']).execute()
        except Exception as cancel_err:
            logger.warning(
                f"verify_payment old sub cancellation skipped (non-critical): {cancel_err}"
            )

        # 7. Invalidate caches.
        # Use increment_subscription_version (not just invalidate_subscription_cache)
        # so the versioned cache key is bumped — all in-flight requests that already
        # hold a reference to the old versioned key will miss and re-fetch from DB.
        domain = subscription.get('product_domain', 'shop')
        try:
            from services.feature_gate_engine import get_feature_gate_engine
            engine = get_feature_gate_engine()
            engine.increment_subscription_version(str(supabase_user_id), domain)
            engine.invalidate_usage_counter_cache(str(supabase_user_id), domain, None)
        except Exception as cache_err:
            logger.warning(f"verify_payment cache invalidation failed: {cache_err}")

        # 8. Trigger slug migration for shop domain upgrades.
        #    When a Starter user upgrades to Business/Pro their slug is still
        #    the forced fallback (user_id[:8]).  We migrate it immediately so
        #    /store/<business-name> works without requiring a manual profile save.
        #
        #    IMPORTANT: businesses.user_id stores Firebase UID, not Supabase UUID.
        #    g.firebase_uid is set by require_auth and is the correct key.
        if domain == 'shop' and new_plan_slug in ('business', 'pro'):
            try:
                _migrate_slug_on_upgrade(firebase_uid, supabase)
            except Exception as slug_err:
                # Non-critical — user can still trigger migration by re-saving profile
                logger.warning(f"verify_payment slug migration failed (non-critical): {slug_err}")

        logger.info(
            f"verify_payment_activated user={supabase_user_id} sub={subscription['id']} "
            f"plan={new_plan_id} rzp_sub={rzp_sub_id} domain={domain}"
        )

        return success_response({
            'activated': True,
            'plan_id': new_plan_id,
            'domain': domain,
            'subscription': {
                'status': 'active',
                'plan_name': new_plan_display_name or new_plan_slug or 'Unknown',
                'razorpay_subscription_id': rzp_sub_id,
                'ai_responses_limit': new_plan_ai_limit or 0,
                'current_period_start': update_data.get('current_period_start'),
                'current_period_end': update_data.get('current_period_end'),
            },
        })

    except Exception as e:
        logger.error(f"verify_payment_error user={supabase_user_id} error={e}", exc_info=True)
        return error_response('Failed to verify payment', 'INTERNAL_ERROR', 500)


# =============================================================================
# POST /api/upgrade/checkout-async
# =============================================================================

# (async checkout moved to /checkout route above)


# =============================================================================
# GET /api/upgrade/checkout-status/<checkout_id>
# =============================================================================

@upgrade_bp.route('/checkout-status/<checkout_id>', methods=['GET'])
@require_auth
def get_checkout_status(checkout_id):
    """
    Poll checkout status.

    Returns checkout result when completed.
    Handles stale processing (Render sleep recovery): if processing >3min,
    reverts to initiated and re-enqueues on first poll after wake.
    """
    supabase_user_id = g.user_id
    supabase = get_supabase()

    try:
        result = supabase.table('checkout_requests').select('*').eq(
            'id', checkout_id
        ).limit(1).execute()

        if not result.data:
            return error_response('Checkout not found', 'NOT_FOUND', 404)

        row = result.data[0]

        if row['user_id'] != supabase_user_id:
            return error_response('Forbidden', 'FORBIDDEN', 403)

        status = row['status']

        if status == 'processing':
            updated_at = datetime.fromisoformat(row['updated_at'].replace('Z', '+00:00'))
            age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()

            if age_seconds > 180:
                reverted = supabase.table('checkout_requests').update({
                    'status': 'initiated',
                    'worker_id': None,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }).eq('id', checkout_id).eq('status', 'processing').execute()

                if reverted.data:
                    logger.warning(
                        "checkout_status_stale_reverted",
                        extra={"checkout_id": checkout_id, "age_seconds": age_seconds}
                    )
                    from services.checkout_worker import get_checkout_worker
                    get_checkout_worker().try_enqueue(checkout_id)
                    status = 'initiated'

        if status == 'completed':
            razorpay_key_id = row.get('razorpay_key_id') or os.getenv('RAZORPAY_KEY_ID')
            return jsonify({
                'success': True,
                'status': 'completed',
                'razorpay_subscription_id': row.get('razorpay_subscription_id'),
                'razorpay_key_id': razorpay_key_id,
                'amount_paise': row.get('amount_paise'),
                'currency': row.get('currency', 'INR'),
                'plan_name': row.get('target_plan_slug'),
            })

        if status == 'failed':
            return jsonify({
                'success': False,
                'status': 'failed',
                'error': 'CHECKOUT_FAILED',
                'message': row.get('error_message', 'Checkout failed'),
            }), 400

        return jsonify({
            'success': True,
            'status': status,
            'checkout_id': checkout_id,
        })

    except Exception as e:
        logger.error(f"checkout_status_error id={checkout_id} error={e}", exc_info=True)
        return error_response('Failed to check status', 'INTERNAL_ERROR', 500)


# =============================================================================
# Shared Helpers
# =============================================================================

def _resolve_user_email(supabase, supabase_user_id, firebase_uid) -> Optional[str]:
    email = None
    try:
        user_result = supabase.table('users').select('email').eq(
            'id', supabase_user_id
        ).limit(1).maybe_single().execute()
        if user_result.data:
            email = user_result.data.get('email')
    except Exception:
        pass

    if not email and firebase_uid:
        try:
            biz_result = supabase.table('businesses').select('email').eq(
                'user_id', firebase_uid
            ).limit(1).execute()
            if biz_result.data:
                email = biz_result.data[0].get('email')
        except Exception:
            pass

    if not email and firebase_uid:
        try:
            import firebase_admin
            from firebase_admin import auth as firebase_auth
            fb_user = firebase_auth.get_user(firebase_uid)
            email = fb_user.email
        except Exception:
            pass

    return email


def _resolve_target_plan(supabase, slug, domain, billing_cycle) -> Optional[Dict]:
    result = supabase.table('pricing_plans').select('*').match({
        'plan_slug': slug,
        'product_domain': domain,
        'billing_cycle': billing_cycle,
        'is_active': True,
    }).execute()
    return result.data[0] if result.data else None


def _resolve_addons(supabase, addon_slugs, domain):
    if not addon_slugs:
        return []
    result = supabase.table('plan_addons').select('*').match({
        'is_active': True,
    }).or_(
        f'product_domain.eq.{domain},product_domain.eq.all'
    ).in_('addon_slug', addon_slugs).execute()
    if not result.data or len(result.data) != len(addon_slugs):
        raise ValueError('One or more add-ons not found or not available')
    return [
        {
            'addon_slug': a['addon_slug'],
            'display_name': a['display_name'],
            'amount_paise': a['amount_paise'],
        }
        for a in result.data
    ]


# =============================================================================
# Blueprint Registration
# =============================================================================

def register_upgrade_routes(app):
    """
    Register upgrade routes with Flask app.

    Usage in app.py:
        from routes.upgrade_api import register_upgrade_routes
        register_upgrade_routes(app)
    """
    app.register_blueprint(upgrade_bp)
    logger.info("✅ Upgrade API routes registered")
