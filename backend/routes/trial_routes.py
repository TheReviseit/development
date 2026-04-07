"""
Trial API Routes — REST API for Free Trial Engine
=================================================

Endpoints:
    POST /api/trials/start         — Start a new trial
    GET  /api/trials/status        — Get trial status
    POST /api/trials/expire        — Manually expire a trial
    POST /api/trials/convert       — Convert trial to paid
    GET  /api/trials/metrics      — Get trial analytics
    GET  /api/trials/entitlement  — Check entitlement for frontend

Usage:
    - Shop domain signup → automatic trial start
    - Upgrade page → trial status display
    - Admin dashboard → trial management
"""

import logging
import os
import secrets
from flask import Blueprint, request, jsonify, g

logger = logging.getLogger('reviseit.trial_routes')

trial_bp = Blueprint('trials', __name__, url_prefix='/api/trials')


def get_client_ip():
    """Get client IP from request headers."""
    if 'X-Forwarded-For' in request.headers:
        return request.headers['X-Forwarded-For'].split(',')[0].strip()
    return request.remote_addr


def get_device_fingerprint():
    """Get device fingerprint from request headers."""
    return request.headers.get('X-Device-Fingerprint')


def get_user_agent():
    """Get user agent from request."""
    return request.user_agent.string if request.user_agent else None


# =============================================================================
# START TRIAL
# =============================================================================

@trial_bp.route('/start', methods=['POST'])
def start_trial():
    """
    Start a new free trial for the authenticated user.

    Request Body:
        {
            "plan_slug": "starter",
            "domain": "shop",  // optional, defaults to "shop"
            "source": "organic"  // optional
        }

    Response:
        {
            "success": true,
            "trial": {
                "id": "uuid",
                "status": "active",
                "plan_slug": "starter",
                "started_at": "ISO timestamp",
                "expires_at": "ISO timestamp",
                "days_remaining": 7
            }
        }

    Errors:
        400: Missing required fields
        403: Trial not allowed (abuse detected)
        409: Trial already exists
    """
    # Get user context (set by auth middleware)
    user_id = getattr(g, 'user_id', None)
    org_id = getattr(g, 'org_id', None)

    if not user_id or not org_id:
        return jsonify({
            'success': False,
            'error': 'UNAUTHORIZED',
            'message': 'Authentication required'
        }), 401

    data = request.get_json() or {}

    plan_slug = data.get('plan_slug', 'starter')
    domain = data.get('domain', 'shop')
    source = data.get('source', 'organic')

    # Get pricing plan ID
    try:
        from services.pricing_service import get_pricing_service
        pricing = get_pricing_service()
        plan = pricing.get_plan(domain, plan_slug, 'monthly')
        plan_id = plan['id']
    except Exception as e:
        logger.error(f"plan_lookup_failed: {e}")
        return jsonify({
            'success': False,
            'error': 'PLAN_NOT_FOUND',
            'message': f'Plan {plan_slug} not found for domain {domain}'
        }), 400

    # Get signup context
    ip_address = get_client_ip()
    device_fingerprint = get_device_fingerprint()
    user_agent = get_user_agent()

    # Extract email domain from user
    email = getattr(g, 'user_email', None)
    email_domain = email.split('@')[1] if email and '@' in email else None

    from services.trial_engine import TrialStartOptions, TrialEngineError

    options = TrialStartOptions(
        user_id=user_id,
        org_id=org_id,
        plan_slug=plan_slug,
        plan_id=plan_id,
        domain=domain,
        trial_days=7,
        source=source,
        ip_address=ip_address,
        email_domain=email_domain,
        device_fingerprint=device_fingerprint,
        user_agent=user_agent,
    )

    try:
        import asyncio

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        engine = asyncio.run(_get_trial_engine())
        trial_context = loop.run_until_complete(
            engine.start_trial(options)
        )

        return jsonify({
            'success': True,
            'trial': trial_context.to_dict(),
        }), 201

    except TrialEngineError as e:
        if 'already exists' in str(e).lower():
            return jsonify({
                'success': False,
                'error': 'TRIAL_EXISTS',
                'message': 'You already have an active trial'
            }), 409
        logger.error(f"start_trial_error: {e}")
        return jsonify({
            'success': False,
            'error': 'TRIAL_START_FAILED',
            'message': str(e)
        }), 400

    except Exception as e:
        logger.error(f"start_trial_unexpected_error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': 'Failed to start trial'
        }), 500


# =============================================================================
# INTERNAL START TRIAL (Server-to-server, no auth required)
# =============================================================================

@trial_bp.route('/internal/start', methods=['POST'])
def internal_start_trial():
    """
    Internal endpoint for starting trial during signup flow.

    This endpoint is called server-to-server during user creation.
    It requires an internal API key for security.

    Request Body:
        {
            "user_id": "uuid",
            "org_id": "uuid",
            "email": "user@example.com",
            "plan_slug": "starter",
            "domain": "shop",
            "source": "shop",
            "ip_address": "optional",
            "device_fingerprint": "optional",
            "user_agent": "optional"
        }

    Response:
        Same as /start endpoint
    """
    # Verify internal API key
    internal_key = request.headers.get('X-Internal-Api-Key')
    expected_key = os.getenv('INTERNAL_API_KEY', 'flowauxi-internal-key')
    dev_mode = os.getenv('FLASK_ENV') in ('development', 'dev', 'testing')

    if not dev_mode and internal_key != expected_key:
        logger.warning(f"[trial] Invalid internal API key received")
        return jsonify({
            'success': False,
            'error': 'UNAUTHORIZED',
            'message': 'Invalid internal API key'
        }), 401

    if dev_mode:
        logger.info(f"[trial] Dev mode - skipping API key validation")

    data = request.get_json() or {}

    user_id = data.get('user_id')
    org_id = data.get('org_id')
    email = data.get('email')
    plan_slug = data.get('plan_slug', 'starter')
    domain = data.get('domain', 'shop')
    source = data.get('source', 'organic')
    ip_address = data.get('ip_address')
    device_fingerprint = data.get('device_fingerprint')
    user_agent = data.get('user_agent')

    if not user_id or not org_id:
        return jsonify({
            'success': False,
            'error': 'MISSING_FIELDS',
            'message': 'user_id and org_id required'
        }), 400

    # Convert Firebase UID to Supabase UUID if needed
    # The frontend sends Firebase UID but the database expects Supabase UUID
    try:
        from supabase_client import get_user_id_from_firebase_uid
        
        # Check if user_id looks like Firebase UID (not a UUID)
        # UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars with dashes)
        is_uuid = '-' in user_id and len(user_id) == 36
        
        logger.info(f"[trial] user_id before conversion: {user_id[:10]}... (is_uuid={is_uuid})")
        
        if user_id and not is_uuid:
            supabase_uuid = get_user_id_from_firebase_uid(user_id)
            logger.info(f"[trial] user_id lookup result: {supabase_uuid}")
            if supabase_uuid:
                logger.info(f"[trial] Converted user_id Firebase UID {user_id[:10]}... → UUID {supabase_uuid}")
                user_id = supabase_uuid
            else:
                logger.error(f"[trial] FAILED to resolve user_id Firebase UID: {user_id[:10]}...")
        
        # Same for org_id
        is_org_uuid = '-' in org_id and len(org_id) == 36
        logger.info(f"[trial] org_id before conversion: {org_id[:10]}... (is_uuid={is_org_uuid})")
        
        if org_id and not is_org_uuid:
            supabase_uuid = get_user_id_from_firebase_uid(org_id)
            logger.info(f"[trial] org_id lookup result: {supabase_uuid}")
            if supabase_uuid:
                logger.info(f"[trial] Converted org_id Firebase UID {org_id[:10]}... → UUID {supabase_uuid}")
                org_id = supabase_uuid
            else:
                logger.error(f"[trial] FAILED to resolve org_id Firebase UID: {org_id[:10]}...")
                
    except Exception as e:
        logger.error(f"[trial] Error resolving Firebase UID: {e}")

    # Get pricing plan ID
    try:
        from services.pricing_service import get_pricing_service
        pricing = get_pricing_service()
        plan = pricing.get_plan(domain, plan_slug, 'monthly')
        plan_id = plan['id']
    except Exception as e:
        logger.error(f"plan_lookup_failed: {e}")
        return jsonify({
            'success': False,
            'error': 'PLAN_NOT_FOUND',
            'message': f'Plan {plan_slug} not found for domain {domain}'
        }), 400

    # Extract email domain
    email_domain = email.split('@')[1] if email and '@' in email else None

    # =========================================================================
    # Pre-flight idempotency check (PERFORMANCE OPTIMIZATION ONLY)
    # =========================================================================
    # This reduces unnecessary RPC calls for the common duplicate-call case.
    # It is NOT a correctness guarantee — a TOCTOU race between two concurrent
    # requests will still be handled correctly by ON CONFLICT in the RPC.
    # The RPC's atomicity is the actual idempotency guarantee.
    #
    # UID INCONSISTENCY NOTE: The frontend sends user.uid (Firebase UID) in
    # handleSelectFreeTrial. The backend UID→UUID conversion above handles it.
    # All callers should consistently send Firebase UID and let the backend
    # convert. If a future caller sends Supabase UUID directly, it also works
    # (the is_uuid check skips conversion). This is a latent footgun — audit
    # all callers if another duplicate-call bug surfaces.
    # =========================================================================
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        existing_check = db.table('free_trials').select(
            'id, status, started_at, expires_at'
        ).eq(
            'user_id', user_id
        ).eq(
            'org_id', org_id
        ).eq(
            'domain', domain
        ).in_(
            'status', ['active', 'expiring_soon']
        ).maybe_single().execute()

        # .maybe_single() returns None if no rows, or the row dict if exactly 1 row
        if existing_check is not None:
            trial_data = existing_check if isinstance(existing_check, dict) else existing_check.data
            if trial_data and trial_data.get('id'):
                logger.info(
                    f"[trial] Returning existing trial (idempotent pre-flight): "
                    f"{trial_data['id']}"
                )
                # Auto-heal: ensure user_products row exists for existing trial
                # This covers the case where a trial was created before Fix 1
                db.table('user_products').upsert({
                    'user_id': user_id,
                    'product': domain,
                    'status': 'trial',
                    'activated_by': 'system',
                    'trial_ends_at': trial_data.get('expires_at'),
                    'trial_days': 7,
                }, on_conflict='user_id,product').execute()

                return jsonify({
                    'success': True,
                    'trial': trial_data,
                    'is_existing': True,
                    'access_granted': True,
                }), 200
    except Exception as preflight_err:
        # Pre-flight is optional — if it fails, fall through to RPC
        logger.warning(f"[trial] Pre-flight check failed (non-fatal): {preflight_err}")

    # =========================================================================
    # Main trial creation via atomic RPC
    # =========================================================================
    from services.trial_engine import TrialStartOptions, TrialEngineError

    options = TrialStartOptions(
        user_id=user_id,
        org_id=org_id,
        plan_slug=plan_slug,
        plan_id=plan_id,
        domain=domain,
        trial_days=7,
        source=source,
        ip_address=ip_address,
        email_domain=email_domain,
        device_fingerprint=device_fingerprint,
        user_agent=user_agent,
    )

    try:
        import asyncio
        import time
        start_time = time.time()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            engine = asyncio.run(_get_trial_engine())
            trial_context = loop.run_until_complete(
                engine.start_trial(options)
            )
            
            duration_ms = int((time.time() - start_time) * 1000)

            # Structured logging for observability (trigger handles onboarding atomically)
            logger.info(
                f"[trial] trial.started | "
                f"trial_id={trial_context.trial_id} | "
                f"user_id={user_id[:8]}... | "
                f"domain={domain} | "
                f"plan={plan_slug} | "
                f"duration_ms={duration_ms} | "
                f"trigger_handled_onboarding=true"
            )

            # Onboarding completion is now handled atomically by DB trigger
            # Return success - onboarding_completed is guaranteed by trigger

            return jsonify({
                'success': True,
                'trial': trial_context.to_dict(),
                'access_granted': True,
            }), 201

        finally:
            loop.close()

    except TrialEngineError as e:
        if 'already exists' in str(e).lower():
            # Return existing trial instead of error (idempotent)
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                engine = asyncio.run(_get_trial_engine())
                existing = loop.run_until_complete(
                    engine.get_trial(user_id, org_id, domain)
                )
                loop.close()

                if existing:
                    logger.info(
                        f"[trial] trial.started.existing | "
                        f"user_id={user_id[:8]}... | "
                        f"trial_id={existing.trial_id} | "
                        f"domain={domain}"
                    )
                    return jsonify({
                        'success': True,
                        'trial': existing.to_dict(),
                        'is_existing': True,
                        'access_granted': True,
                    }), 200
            except:
                pass

            return jsonify({
                'success': False,
                'error': 'TRIAL_EXISTS',
                'message': 'You already have an active trial'
            }), 409

        logger.error(
            f"[trial] trial.start_failed | "
            f"user_id={user_id[:8]}... | "
            f"error={str(e)} | "
            f"error_type={type(e).__name__}"
        )
        return jsonify({
            'success': False,
            'error': 'TRIAL_START_FAILED',
            'message': str(e)
        }), 400

    except Exception as e:
        logger.error(f"internal_start_trial_error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': 'Failed to start trial'
        }), 500


# =============================================================================
# GET TRIAL STATUS
# =============================================================================

@trial_bp.route('/status', methods=['GET'])
def get_trial_status():
    """
    Get trial status for the authenticated user.

    Query Params:
        domain: string (optional, defaults to "shop")

    Response:
        {
            "success": true,
            "has_trial": true,
            "trial": {
                "id": "uuid",
                "status": "active",
                "plan_slug": "starter",
                "days_remaining": 5,
                "started_at": "ISO",
                "expires_at": "ISO"
            }
        }
    """
    user_id = getattr(g, 'user_id', None)
    org_id = getattr(g, 'org_id', None)

    if not user_id or not org_id:
        return jsonify({
            'success': False,
            'error': 'UNAUTHORIZED'
        }), 401

    domain = request.args.get('domain', 'shop')

    try:
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        engine = asyncio.run(_get_trial_engine())
        trial = loop.run_until_complete(
            engine.get_trial(user_id, org_id, domain)
        )

        if trial:
            return jsonify({
                'success': True,
                'has_trial': True,
                'trial': trial.to_dict(),
            })
        else:
            return jsonify({
                'success': True,
                'has_trial': False,
                'trial': None,
            })

    except Exception as e:
        logger.error(f"get_trial_status_error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR'
        }), 500


# =============================================================================
# CHECK ENTITLEMENT (for frontend)
# =============================================================================

@trial_bp.route('/entitlement', methods=['GET'])
def check_entitlement():
    """
    Get trial entitlement formatted for frontend.

    This endpoint is optimized for frontend consumption with:
    - Banner information
    - CTA text and URL
    - Access level

    Query Params:
        domain: string (optional, defaults to "shop")

    Response:
        {
            "success": true,
            "entitlement": {
                "has_access": true,
                "access_level": "full",
                "status": "active",
                "days_remaining": 5,
                "show_banner": true,
                "banner_type": "info",
                "banner_message": "You have 5 days remaining...",
                "cta_text": "Upgrade Now",
                "cta_url": "/upgrade?domain=shop"
            }
        }
    """
    user_id = getattr(g, 'user_id', None)
    org_id = getattr(g, 'org_id', None)

    if not user_id or not org_id:
        return jsonify({
            'success': False,
            'error': 'UNAUTHORIZED'
        }), 401

    domain = request.args.get('domain', 'shop')

    try:
        from middleware.trial_guard import get_trial_status_for_frontend
        entitlement = get_trial_status_for_frontend(user_id, org_id, domain)

        return jsonify({
            'success': True,
            'entitlement': entitlement,
        })

    except Exception as e:
        logger.error(f"check_entitlement_error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR'
        }), 500


# =============================================================================
# CONVERT TRIAL TO PAID
# =============================================================================

@trial_bp.route('/convert', methods=['POST'])
def convert_trial():
    """
    Convert trial to paid subscription.

    Called after successful payment during upgrade.

    Request Body:
        {
            "subscription_id": "uuid",
            "to_plan_slug": "growth"
        }

    Response:
        {
            "success": true,
            "message": "Trial converted successfully"
        }
    """
    user_id = getattr(g, 'user_id', None)
    org_id = getattr(g, 'org_id', None)

    if not user_id or not org_id:
        return jsonify({
            'success': False,
            'error': 'UNAUTHORIZED'
        }), 401

    data = request.get_json() or {}
    subscription_id = data.get('subscription_id')
    to_plan_slug = data.get('to_plan_slug')

    if not subscription_id or not to_plan_slug:
        return jsonify({
            'success': False,
            'error': 'MISSING_FIELDS',
            'message': 'subscription_id and to_plan_slug required'
        }), 400

    # Get trial
    try:
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        engine = asyncio.run(_get_trial_engine())
        trial = loop.run_until_complete(
            engine.get_trial(user_id, org_id, 'shop')
        )

        if not trial:
            return jsonify({
                'success': False,
                'error': 'NO_TRIAL',
                'message': 'No active trial found'
            }), 404

        success = loop.run_until_complete(
            engine.convert_to_paid(
                trial_id=trial.trial_id,
                subscription_id=subscription_id,
                to_plan_slug=to_plan_slug,
            )
        )

        if success:
            return jsonify({
                'success': True,
                'message': 'Trial converted successfully',
            })
        else:
            return jsonify({
                'success': False,
                'error': 'CONVERSION_FAILED',
                'message': 'Failed to convert trial'
            }), 500

    except Exception as e:
        logger.error(f"convert_trial_error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR'
        }), 500


# =============================================================================
# GET TRIAL METRICS (Admin)
# =============================================================================

@trial_bp.route('/metrics', methods=['GET'])
def get_trial_metrics():
    """
    Get trial metrics for analytics.

    Query Params:
        domain: string (optional, defaults to "shop")
        start_date: ISO date (optional)
        end_date: ISO date (optional)

    Response:
        {
            "success": true,
            "metrics": {
                "total_trials": 100,
                "active_trials": 45,
                "converted_trials": 30,
                "expired_trials": 20,
                "cancelled_trials": 5,
                "conversion_rate": 30.0,
                "churn_rate": 25.0
            }
        }
    """
    # Check admin access
    is_admin = getattr(g, 'is_admin', False)
    if not is_admin:
        return jsonify({
            'success': False,
            'error': 'FORBIDDEN',
            'message': 'Admin access required'
        }), 403

    domain = request.args.get('domain', 'shop')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    from datetime import datetime

    try:
        start = datetime.fromisoformat(start_date) if start_date else None
        end = datetime.fromisoformat(end_date) if end_date else None

        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        engine = asyncio.run(_get_trial_engine())
        metrics = loop.run_until_complete(
            engine.get_trial_metrics(domain, start, end)
        )

        return jsonify({
            'success': True,
            'metrics': metrics,
        })

    except Exception as e:
        logger.error(f"get_trial_metrics_error: {e}")
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR'
        }), 500


# =============================================================================
# HELPER
# =============================================================================

async def _get_trial_engine():
    """Get TrialEngine instance."""
    from services.trial_engine import get_trial_engine
    return get_trial_engine()


# =============================================================================
# ACTIVE TRIAL CHECK (Lightweight - for frontend auth guard)
# =============================================================================

@trial_bp.route('/active', methods=['GET'])
def get_active_trial_fast():
    """
    Lightweight endpoint for checking if user has an active trial.
    Optimized for dashboard auth guard - minimal data transfer.
    
    This replaces trusting URL params with server-verified state.
    
    Response:
        {
            "has_active_trial": true,
            "trial_id": "uuid",  // Only if has_active_trial is true
        }
    """
    user_id = getattr(g, 'user_id', None)
    org_id = getattr(g, 'org_id', None)

    if not user_id or not org_id:
        return jsonify({
            'has_active_trial': False,
            'error': 'UNAUTHORIZED'
        }), 401

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Optimized: Single query, minimal data
        # Index-only scan on (user_id, status) for speed
        result = db.table('free_trials').select(
            'id'
        ).eq(
            'user_id', user_id
        ).in_(
            'status', ['active', 'expiring_soon']
        ).limit(1).execute()

        has_active = len(result.data) > 0 if result.data else False
        trial_id = result.data[0]['id'] if has_active else None

        return jsonify({
            'has_active_trial': has_active,
            'trial_id': trial_id,
        }), 200

    except Exception as e:
        logger.error(f"[trial] active_check_failed | user_id={user_id[:8]}... | error={str(e)}")
        return jsonify({
            'has_active_trial': False,
            'error': 'INTERNAL_ERROR'
        }), 500
