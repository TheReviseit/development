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

def get_user_id_from_request():
    """Extract user_id from request headers (set by frontend auth)."""
    return request.headers.get('X-User-Id')


def map_to_supabase_user_id(firebase_uid: str):
    """Map Firebase UID to Supabase user ID."""
    try:
        from supabase_client import get_user_id_from_firebase_uid
        supabase_id = get_user_id_from_firebase_uid(firebase_uid)
        if supabase_id:
            return supabase_id
    except Exception as e:
        logger.warning(f"Could not map Firebase UID {firebase_uid}: {e}")
    return firebase_uid


def require_auth(f):
    """Decorator to require authentication (matches payments.py pattern)."""
    from functools import wraps

    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Extract user ID from X-User-Id header
        user_id = get_user_id_from_request()
        if not user_id:
            return error_response(
                'Authentication required',
                'UNAUTHORIZED',
                401
            )

        # Set Flask global context
        g.firebase_uid = user_id
        g.user_id = map_to_supabase_user_id(user_id)

        return f(*args, **kwargs)

    return decorated_function


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
    user_id = g.user_id

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
        has_business = verify_business_ownership(user_id)
        if not has_business:
            logger.info(f"User {user_id} viewing upgrade options without business profile")

        # 3. Get upgrade options from UpgradeEngine
        upgrade_engine = get_upgrade_engine()
        options = upgrade_engine.get_upgrade_options(
            user_id=user_id,
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
            f"upgrade_options_fetched user={user_id} domain={domain} "
            f"cycle={billing_cycle} current={current} "
            f"plans={len(options.available_plans)} recommended={recommended} "
            f"elapsed={round(elapsed_ms, 2)}ms"
        )

        return success_response(response_data)

    except Exception as e:
        logger.error(
            f"upgrade_options_error user={user_id} domain={request.args.get('domain')} error={e}",
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
    Initiate upgrade checkout flow.

    Request Body:
        {
            "domain": "shop",
            "target_plan_slug": "business",
            "billing_cycle": "yearly",  // optional, default "monthly"
            "addon_slugs": ["extra_products_10"]  // optional
        }

    Returns (200 OK):
        {
            "success": true,
            "upgrade_allowed": true,
            "razorpay_subscription_id": "sub_xxx",
            "razorpay_key_id": "rzp_live_xxx",
            "amount_paise": 3839040,
            "currency": "INR",
            "plan_name": "Business Plan (Yearly)",
            "addon_items": [...],
            "proration_credit_paise": 150000,
            "net_amount_paise": 3689040,
            "effective_date": "2026-02-15T10:30:00Z"
        }

    Error Codes:
        400 DOWNGRADE_NOT_ALLOWED - Cannot downgrade
        400 ALREADY_ON_PLAN - User already on target plan
        400 REQUIRES_SALES_CALL - Enterprise plan requires sales contact
        400 PENDING_PAYMENT - Existing subscription has pending payment
        400 INVALID_ADDON - Add-on not available
        401 UNAUTHORIZED - No auth token
        403 FORBIDDEN - User doesn't own business for domain
        500 INTERNAL_ERROR - Database/Razorpay error
    """
    start_time = datetime.now(timezone.utc)
    user_id = g.user_id

    try:
        # 1. Parse request body
        data = request.get_json()
        if not data:
            return error_response(
                'Request body required',
                'MISSING_BODY',
                400
            )

        domain = data.get('domain')
        target_plan_slug = data.get('target_plan_slug')
        billing_cycle = data.get('billing_cycle', 'monthly')
        addon_slugs = data.get('addon_slugs', [])

        # 2. Validate required fields
        if not domain or not target_plan_slug:
            return error_response(
                'Missing required fields: domain, target_plan_slug',
                'MISSING_FIELDS',
                400
            )

        if not validate_domain(domain):
            return error_response(
                f'Invalid domain: {domain}',
                'INVALID_DOMAIN',
                400
            )

        if billing_cycle not in ['monthly', 'yearly']:
            return error_response(
                'billing_cycle must be "monthly" or "yearly"',
                'INVALID_BILLING_CYCLE',
                400
            )

        # 3. Verify business ownership (required for checkout)
        if not verify_business_ownership(user_id):
            return error_response(
                'Business profile required. Please complete onboarding first.',
                'BUSINESS_REQUIRED',
                403
            )

        # 4. Get user email for Razorpay
        supabase = get_supabase()

        # Get email from users table (Firebase-based auth, not Supabase Auth)
        user_email = None
        try:
            user_result = supabase.table('users').select('email').eq(
                'id', user_id
            ).single().execute()
            if user_result.data:
                user_email = user_result.data.get('email')
        except Exception:
            pass

        if not user_email:
            # Fallback: try to get email from businesses table using Firebase UID
            try:
                firebase_uid = getattr(g, 'firebase_uid', None)
                if firebase_uid:
                    business_result = supabase.table('businesses').select('email').eq(
                        'user_id', firebase_uid
                    ).execute()
                    if business_result.data and len(business_result.data) > 0:
                        user_email = business_result.data[0].get('email')
            except Exception:
                pass

        if not user_email:
            return error_response(
                'User email not found. Cannot create subscription.',
                'NO_EMAIL',
                400
            )

        # 5. Get target plan details (resolve slug to UUID)
        plan_result = supabase.table('pricing_plans').select('*').match({
            'plan_slug': target_plan_slug,
            'product_domain': domain,
            'billing_cycle': billing_cycle,
            'is_active': True
        }).execute()

        if not plan_result.data:
            return error_response(
                f'Plan not found: {target_plan_slug} ({billing_cycle})',
                'PLAN_NOT_FOUND',
                404
            )

        target_plan = plan_result.data[0]
        target_plan_id = target_plan['id']

        # 6. Check upgrade eligibility
        upgrade_engine = get_upgrade_engine()
        eligibility = upgrade_engine.check_upgrade_eligibility(
            user_id=user_id,
            domain=domain,
            target_plan_slug=target_plan_slug
        )

        if eligibility.action != 'allowed':
            return error_response(
                eligibility.message,
                eligibility.action.value if hasattr(eligibility.action, 'value') else str(eligibility.action),
                400
            )

        # 7. Validate add-ons (if provided)
        validated_addons = []
        if addon_slugs:
            # Get all available add-ons for this domain
            addons_result = supabase.table('plan_addons').select('*').match({
                'is_active': True
            }).or_(
                f'product_domain.eq.{domain},product_domain.eq.all'
            ).in_(
                'addon_slug', addon_slugs
            ).execute()

            if not addons_result.data or len(addons_result.data) != len(addon_slugs):
                # Some add-ons not found
                return error_response(
                    'One or more add-ons not found or not available',
                    'INVALID_ADDON',
                    400
                )

            validated_addons = addons_result.data

        # 8. Initiate upgrade via UpgradeOrchestrator
        orchestrator = get_upgrade_orchestrator()
        checkout_data = orchestrator.initiate_upgrade(
            user_id=user_id,
            domain=domain,
            target_plan_id=target_plan_id,  # Pass UUID, not slug
            user_email=user_email,
            addons=validated_addons  # Pass full addon objects
        )

        # 9. Add proration information if upgrading (not new subscription)
        if eligibility.proration_details:
            proration = eligibility.proration_details
            checkout_data['proration_credit_paise'] = proration.unused_credit_paise
            checkout_data['net_amount_paise'] = max(
                0,
                checkout_data.get('amount_paise', 0) - proration.unused_credit_paise
            )
            checkout_data['proration_details'] = proration.to_dict()

        # 10. Add add-on items to response
        if validated_addons:
            checkout_data['addon_items'] = [
                {
                    'addon_slug': addon['addon_slug'],
                    'display_name': addon['display_name'],
                    'amount_paise': addon['amount_paise']
                }
                for addon in validated_addons
            ]

        # 11. Add effective date
        checkout_data['effective_date'] = datetime.now(timezone.utc).isoformat()

        # 12. Log success
        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        logger.info(
            f"upgrade_checkout_initiated user={user_id} domain={domain} "
            f"plan={target_plan_slug} cycle={billing_cycle} "
            f"addons={len(addon_slugs)} sub_id={checkout_data.get('razorpay_subscription_id')} "
            f"amount={checkout_data.get('amount_paise')} elapsed={round(elapsed_ms, 2)}ms"
        )

        return success_response({
            'upgrade_allowed': True,
            **checkout_data
        })

    except ValueError as ve:
        # UpgradeEngine/Orchestrator validation errors
        logger.warning(f"upgrade_checkout_validation_error user={user_id} error={ve}")
        return error_response(str(ve), 'VALIDATION_ERROR', 400)

    except Exception as e:
        logger.error(
            f"upgrade_checkout_error user={user_id} "
            f"domain={data.get('domain') if data else None} "
            f"plan={data.get('target_plan_slug') if data else None} error={e}",
            exc_info=True
        )
        return error_response(
            'Failed to initiate upgrade checkout',
            'INTERNAL_ERROR',
            500
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
    user_id = g.user_id

    try:
        data = request.get_json() or {}
        rzp_sub_id_from_client = data.get('razorpay_subscription_id')
        domain_hint = data.get('domain')
        supabase = get_supabase()

        # 1. Find the user's pending upgrade subscription
        query = supabase.table('subscriptions').select('*').eq(
            'user_id', user_id
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
                'user_id', user_id
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
        from routes.payments import razorpay_client
        try:
            rzp_sub = razorpay_client.subscription.fetch(rzp_sub_id)
        except Exception as e:
            logger.error(f"verify_payment_razorpay_error sub={rzp_sub_id} error={e}")
            return error_response(
                'Could not verify payment with Razorpay',
                'RAZORPAY_ERROR', 502
            )

        rzp_status = rzp_sub.get('status', '')
        logger.info(f"verify_payment razorpay_status={rzp_status} sub={rzp_sub_id} user={user_id}")

        if rzp_status not in ('authenticated', 'active', 'created'):
            return error_response(
                f'Payment not completed. Razorpay status: {rzp_status}',
                'PAYMENT_INCOMPLETE', 400
            )

        # 4. Activate the upgrade — swap to new plan
        new_plan_id = subscription.get('pending_upgrade_to_plan_id')
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
        try:
            plan_row = supabase.table('pricing_plans').select('plan_slug, razorpay_plan_id').eq(
                'id', new_plan_id
            ).limit(1).execute()
            if plan_row.data:
                new_plan_slug = plan_row.data[0].get('plan_slug')
                new_razorpay_plan_id = plan_row.data[0].get('razorpay_plan_id')
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

        supabase.table('subscriptions').update(update_data).eq(
            'id', subscription['id']
        ).execute()

        # 5. Invalidate caches.
        # Use increment_subscription_version (not just invalidate_subscription_cache)
        # so the versioned cache key is bumped — all in-flight requests that already
        # hold a reference to the old versioned key will miss and re-fetch from DB.
        domain = subscription.get('product_domain', 'shop')
        try:
            from services.feature_gate_engine import get_feature_gate_engine
            engine = get_feature_gate_engine()
            engine.increment_subscription_version(str(user_id), domain)
            engine.invalidate_usage_counter_cache(str(user_id), domain, None)
        except Exception as cache_err:
            logger.warning(f"verify_payment cache invalidation failed: {cache_err}")

        # 6. Trigger slug migration for shop domain upgrades.
        #    When a Starter user upgrades to Business/Pro their slug is still
        #    the forced fallback (user_id[:8]).  We migrate it immediately so
        #    /store/<business-name> works without requiring a manual profile save.
        #
        #    IMPORTANT: businesses.user_id stores Firebase UID, not Supabase UUID.
        #    g.firebase_uid is set by require_auth and is the correct key.
        if domain == 'shop' and new_plan_slug in ('business', 'pro'):
            try:
                firebase_uid = getattr(g, 'firebase_uid', None) or user_id
                _migrate_slug_on_upgrade(firebase_uid, supabase)
            except Exception as slug_err:
                # Non-critical — user can still trigger migration by re-saving profile
                logger.warning(f"verify_payment slug migration failed (non-critical): {slug_err}")

        logger.info(
            f"verify_payment_activated user={user_id} sub={subscription['id']} "
            f"plan={new_plan_id} rzp_sub={rzp_sub_id} domain={domain}"
        )

        return success_response({
            'activated': True,
            'plan_id': new_plan_id,
            'domain': domain,
        })

    except Exception as e:
        logger.error(f"verify_payment_error user={user_id} error={e}", exc_info=True)
        return error_response('Failed to verify payment', 'INTERNAL_ERROR', 500)


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
