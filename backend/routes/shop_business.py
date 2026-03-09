"""
Shop Business Update Endpoint
Single write path for ALL business data — replaces frontend service-role writes.

ARCHITECTURE:
    Frontend → Next.js proxy → Flask → FeatureGateEngine → Supabase

SECURITY:
    - user_id ALWAYS derived from g.user_id (never from payload)
    - Slug changes gated by custom_domain feature
    - Slug uniqueness enforced by DB UNIQUE constraint
    - Service-role key lives only in backend
    - Firestore sync is fire-and-forget (non-blocking)

ENTITLEMENT ENFORCEMENT:
    - store_slug change → requires custom_domain feature (business/pro only)
    - All other fields → allowed for all plans
    - Future: razorpay_key_id, payments_enabled can be gated here
"""

from flask import Blueprint, request, jsonify, g
from typing import Optional
import logging
import re
import threading

try:
    from middleware import rate_limit
except ImportError:
    # No-op decorator when middleware unavailable
    def rate_limit(**kwargs):
        def decorator(f):
            return f
        return decorator

logger = logging.getLogger('shop.business')


def _generate_slug(text: str) -> str:
    """
    Generate a URL-safe slug from arbitrary text.
    e.g. "Flowauxi Store" → "flowauxi-store"
    """
    slug = text.lower().strip()
    # Replace spaces and non-alphanumeric chars with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    # Collapse multiple hyphens and strip leading/trailing
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug or 'store'

shop_business_bp = Blueprint('shop_business', __name__, url_prefix='/api/shop/business')


# =============================================================================
# AUTH HELPER (same pattern as showcase_api.py)
# =============================================================================

def _get_user_from_token() -> Optional[str]:
    """
    Extract and verify Firebase token from request.
    Sets g.user_id for downstream use.
    Returns user_id if valid, None otherwise.
    """
    import firebase_admin
    from firebase_admin import auth as firebase_auth

    #CRITICAL: X-User-ID header can contain EITHER Firebase UID OR Supabase UUID
    # depending on which Next.js route sent it. We MUST validate it's a Firebase UID.
    # If it's a UUID format (contains dashes), we need to look up the Firebase UID.
    user_id_header = request.headers.get('X-User-ID')
    if user_id_header:
        # Check if it's a UUID (contains dashes and 36 chars) or Firebase UID (alphanumeric)
        if '-' in user_id_header and len(user_id_header) == 36:
            # This is a Supabase UUID, need to convert to Firebase UID
            try:
                from supabase_client import get_supabase_client
                db = get_supabase_client()
                result = db.table('users').select('firebase_uid').eq('id', user_id_header).limit(1).execute()
                if result.data and result.data[0].get('firebase_uid'):
                    firebase_uid = result.data[0]['firebase_uid']
                    g.user_id = firebase_uid
                    logger.info(f"✅ Converted Supabase UUID → Firebase UID: ...{user_id_header[-8:]} → {firebase_uid}")
                    return firebase_uid
                else:
                    logger.warning(f"⚠️ No Firebase UID found for Supabase UUID: {user_id_header[:8]}...")
                    return None
            except Exception as e:
                logger.error(f"❌ Failed to convert UUID to Firebase UID: {e}")
                return None
        else:
            # This is already a Firebase UID
            g.user_id = user_id_header
            return user_id_header

    # Fallback: verify token directly
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        # Try cookie-based auth
        cookie_header = request.headers.get('Cookie', '')
        if not cookie_header:
            return None

    # Try session cookie from Cookie header
    cookie_header = request.headers.get('Cookie', '')
    if cookie_header:
        cookies = {}
        for item in cookie_header.split(';'):
            item = item.strip()
            if '=' in item:
                key, val = item.split('=', 1)
                cookies[key.strip()] = val.strip()

        # Try access_token cookie first
        access_token = cookies.get('access_token')
        if access_token:
            try:
                decoded = firebase_auth.verify_id_token(access_token, check_revoked=True)
                user_id = decoded.get('uid')
                if user_id:
                    g.user_id = user_id
                    return user_id
            except Exception:
                pass

        # Try session cookie
        session_cookie = cookies.get('session')
        if session_cookie:
            try:
                decoded = firebase_auth.verify_session_cookie(session_cookie, check_revoked=True)
                user_id = decoded.get('uid')
                if user_id:
                    g.user_id = user_id
                    return user_id
            except Exception:
                pass

    # Try Bearer token
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        try:
            decoded = firebase_auth.verify_session_cookie(token, check_revoked=True)
            user_id = decoded.get('uid')
            if user_id:
                g.user_id = user_id
                return user_id
        except Exception:
            pass

        try:
            decoded = firebase_auth.verify_id_token(token, check_revoked=True)
            user_id = decoded.get('uid')
            if user_id:
                g.user_id = user_id
                return user_id
        except Exception as e:
            logger.error(f'Token verification failed: {type(e).__name__}')

    return None


# =============================================================================
# FIELD MAPPING: camelCase/snake_case → DB column names
# =============================================================================

# Map of accepted payload keys → DB column name
FIELD_MAP = {
    # Profile
    'businessName': 'business_name',
    'business_name': 'business_name',
    'industry': 'industry',
    'customIndustry': 'custom_industry',
    'custom_industry': 'custom_industry',
    'description': 'description',
    # Contact & Social
    'contact': 'contact',
    'socialMedia': 'social_media',
    'social_media': 'social_media',
    # Location & Timings
    'location': 'location',
    'timings': 'timings',
    # Policies
    'policies': 'policies',
    'ecommercePolicies': 'ecommerce_policies',
    'ecommerce_policies': 'ecommerce_policies',
    # Content
    'faqs': 'faqs',
    'brandVoice': 'brand_voice',
    'brand_voice': 'brand_voice',
    # Logo
    'logoUrl': 'logo_url',
    'logo_url': 'logo_url',
    'logoPublicId': 'logo_public_id',
    'logo_public_id': 'logo_public_id',
    # Banners
    'banners': 'banners',
    # Product Options
    'sizeOptions': 'size_options',
    'size_options': 'size_options',
    'colorOptions': 'color_options',
    'color_options': 'color_options',
    # Payments
    'razorpayKeyId': 'razorpay_key_id',
    'razorpay_key_id': 'razorpay_key_id',
    'razorpayKeySecret': 'razorpay_key_secret',
    'razorpay_key_secret': 'razorpay_key_secret',
    'paymentsEnabled': 'payments_enabled',
    'payments_enabled': 'payments_enabled',
    # Branding
    'brandColor': 'brand_color',
    'brand_color': 'brand_color',
    # Slug (gated)
    'storeSlug': 'url_slug',
    'store_slug': 'url_slug',
    'urlSlug': 'url_slug',
    'url_slug': 'url_slug',
}

# Fields that are NEVER accepted from payload (derived server-side only)
BLACKLISTED_FIELDS = {'user_id', 'userId', 'id', 'created_at', 'updated_at'}

# Top-level payload keys that should be MERGED into a JSONB column
# key: payload field → (db_column, jsonb_sub_key)
JSONB_MERGE_FIELDS = {
    'codAvailable': ('ecommerce_policies', 'cod_available'),
}


# =============================================================================
# MAIN ENDPOINT
# =============================================================================

@shop_business_bp.route('/update', methods=['POST'])
@rate_limit(limit=10, window=60)
def update_business():
    """
    POST /api/shop/business/update

    Single write path for ALL business data.
    Replaces the old /api/business/save Next.js route.

    Auth: Firebase session cookie or Bearer token.
    Domain: g.product_domain from middleware.

    Slug changes are gated by custom_domain feature.
    All other fields are allowed for all plans.

    Returns:
        200: {"success": true}
        400: {"error": "..."}
        401: {"error": "NOT_AUTHENTICATED"}
        403: {"error": "FEATURE_GATED", "feature": "custom_domain", "upgrade_required": true}
        409: {"error": "SLUG_TAKEN", "field": "store_slug"}
        500: {"error": "..."}
    """

    # ── AUTH ──────────────────────────────────────────────────────────────
    user_id = _get_user_from_token()
    if not user_id:
        return jsonify({"error": "NOT_AUTHENTICATED"}), 401

    # ── PARSE PAYLOAD ────────────────────────────────────────────────────
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON body"}), 400

    # ── BUILD DB UPDATE (only explicitly provided fields) ────────────────
    db_data = {}
    slug_value = None
    pre_save_slug = None  # Will be populated before upsert for cache invalidation

    for payload_key, db_column in FIELD_MAP.items():
        if payload_key in payload:
            value = payload[payload_key]
            # Deduplicate: if already set by a prior alias, skip
            if db_column not in db_data:
                db_data[db_column] = value
            # Track slug value for entitlement check
            if db_column == 'url_slug':
                slug_value = value

    # Reject blacklisted fields
    for field in BLACKLISTED_FIELDS:
        if field in payload:
            logger.warning(f"⚠️ Rejected blacklisted field '{field}' from user {user_id}")

    has_jsonb_merges = any(k in payload for k in JSONB_MERGE_FIELDS)
    if not db_data and not has_jsonb_merges:
        return jsonify({"error": "No valid fields provided to update"}), 400

    field_names = list(db_data.keys())
    logger.info(f"🔄 Business update for user {user_id}: {len(field_names)} field(s) - [{', '.join(field_names)}]")

    # ── SUPABASE CLIENT ──────────────────────────────────────────────────
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
    except Exception as e:
        logger.error(f"❌ Failed to get Supabase client: {e}")
        return jsonify({"error": "Database unavailable"}), 500

    # ── PLAN-BASED SLUG ENFORCEMENT ──────────────────────────────────────
    # Starter plan users get a forced fallback slug (user_id[:8]).
    # Business/Pro plan users get a slug auto-generated from business_name
    # if their current slug is still the forced fallback (slug migration).
    #
    # IMPORTANT: This block runs on ANY save (not just when business_name changes)
    # so that upgrading to Business and then saving ANY field triggers migration.
    slug_forced_by_plan = False
    slug_auto_migrated = False  # True when Business/Pro user's forced slug was auto-regenerated
    pre_save_slug = None        # Captured before upsert for cache invalidation

    if 'url_slug' not in db_data:
        # CRITICAL: Always use 'shop' domain for slug enforcement.
        # The custom_domain feature and subscription are shop-domain features.
        # g.product_domain may be 'dashboard' when saving from /dashboard/profile.
        domain = 'shop'
        try:
            from services.feature_gate_engine import get_feature_gate_engine
            engine = get_feature_gate_engine()
            logger.info(
                f"🔍 DEBUG: Checking custom_domain for user_id='{user_id}' domain='{domain}' "
                f"engine_type={type(engine).__name__} engine_id={id(engine)}"
            )
            decision = engine.check_feature_access(user_id, domain, 'custom_domain')
            logger.info(
                f"🔍 DEBUG: custom_domain decision: allowed={decision.allowed} "
                f"denial_reason={getattr(decision, 'denial_reason', None)} "
                f"plan={getattr(decision, 'plan_slug', None)}"
            )

            # Always read current slug once — used in both branches below
            fallback_slug = user_id[:8].lower()
            try:
                current_record = db.table('businesses') \
                    .select('url_slug, business_name') \
                    .eq('user_id', user_id) \
                    .maybe_single() \
                    .execute()
                current_slug = current_record.data.get('url_slug') if current_record.data else None
                stored_business_name = current_record.data.get('business_name') if current_record.data else None
            except Exception:
                current_slug = None
                stored_business_name = None

            pre_save_slug = current_slug  # Capture for cache invalidation after upsert

            if not decision.allowed:
                # Starter plan: force slug to first 8 chars of UID
                db_data['url_slug'] = fallback_slug
                db_data['url_slug_lower'] = fallback_slug
                slug_value = fallback_slug
                slug_forced_by_plan = True
                logger.info(
                    f"🔒 Starter plan: forcing slug '{fallback_slug}' "
                    f"for user {user_id} (custom_domain denied)"
                )
            else:
                # Business/Pro plan: auto-generate slug from business_name when:
                # 1. Slug is still the forced UID fallback (or missing) — migration
                # 2. business_name is changing — keep slug in sync with name
                effective_name = db_data.get('business_name') or stored_business_name
                incoming_name = db_data.get('business_name')
                is_fallback_slug = (not current_slug or current_slug == fallback_slug)
                name_is_changing = (
                    incoming_name
                    and stored_business_name
                    and incoming_name.strip().lower() != stored_business_name.strip().lower()
                )

                if effective_name and (is_fallback_slug or name_is_changing):
                    new_slug = _generate_slug(effective_name)
                    # Collision check — don't steal another user's slug
                    try:
                        collision = db.table('businesses').select('user_id').eq(
                            'url_slug_lower', new_slug.lower()
                        ).neq('user_id', user_id).limit(1).execute()
                        if collision.data:
                            import hashlib
                            suffix = hashlib.md5(user_id.encode()).hexdigest()[:4]
                            new_slug = f"{new_slug}-{suffix}"
                            logger.info(f"⚠️ Slug collision, using: {new_slug}")
                    except Exception as col_err:
                        logger.warning(f"Collision check failed (non-critical): {col_err}")
                    db_data['url_slug'] = new_slug
                    db_data['url_slug_lower'] = new_slug.lower()
                    slug_value = new_slug
                    slug_auto_migrated = is_fallback_slug  # Only set for trigger control
                    reason = "migration" if is_fallback_slug else "name change"
                    logger.info(
                        f"🔓 Business plan: slug update ({reason}) from "
                        f"'{current_slug}' → '{new_slug}' for user {user_id}"
                    )
        except Exception as e:
            # Fail OPEN for slug assignment (not a security risk —
            # just UX preference). Log for monitoring.
            logger.warning(f"⚠️ Could not check custom_domain for slug enforcement: {e}")

    # ── SLUG ENTITLEMENT CHECK (server-side detection) ───────────────────
    # Skip this check if slug was forced by plan enforcement above,
    # or if it was auto-migrated (entitlement already verified above).
    if 'url_slug' in db_data and not slug_forced_by_plan and not slug_auto_migrated:
        try:
            # Fetch current slug from DB
            current_record = db.table('businesses') \
                .select('url_slug') \
                .eq('user_id', user_id) \
                .maybe_single() \
                .execute()

            current_slug = None
            if current_record.data:
                current_slug = current_record.data.get('url_slug')

            # Capture for cache invalidation (explicit slug change path)
            pre_save_slug = current_slug

            # Only enforce if slug is actually changing
            if slug_value != current_slug:
                logger.info(f"🔐 Slug change detected: '{current_slug}' → '{slug_value}' for user {user_id}")

                # CRITICAL: Always use 'shop' domain (see line 305 comment)
                domain = 'shop'

                # Check custom_domain feature via FeatureGateEngine
                try:
                    from services.feature_gate_engine import get_feature_gate_engine
                    engine = get_feature_gate_engine()
                    decision = engine.check_feature_access(user_id, domain, 'custom_domain')

                    if not decision.allowed:
                        logger.warning(
                            f"🚫 Slug change DENIED for user {user_id} "
                            f"(plan does not include custom_domain)"
                        )
                        return jsonify({
                            "error": "FEATURE_GATED",
                            "feature": "custom_domain",
                            "message": "Custom store URL requires Business or Pro plan",
                            "upgrade_required": True
                        }), 403

                    logger.info(f"✅ Slug change ALLOWED for user {user_id}")
                except Exception as e:
                    # FAIL CLOSED: if engine unavailable, deny slug change
                    logger.error(f"❌ FeatureGateEngine error (fail closed): {e}")
                    return jsonify({
                        "error": "FEATURE_CHECK_FAILED",
                        "message": "Unable to verify feature access. Please try again."
                    }), 503
            else:
                logger.info(f"ℹ️ Slug unchanged ('{current_slug}'), skipping entitlement check")
                # Remove from update since it hasn't changed
                del db_data['url_slug']

        except Exception as e:
            logger.error(f"❌ Failed to check current slug: {e}")
            return jsonify({"error": "Failed to validate slug change"}), 500

    # ── SLUG SESSION VARIABLE (for DB trigger if slug changing) ──────────
    # With migration 050, the trigger respects explicit slugs automatically.
    # We only need allow_slug_regeneration for auto-migration (fallback→name)
    # where the trigger should auto-generate based on a business_name change.
    if slug_auto_migrated:
        try:
            db.rpc('set_config', {
                'setting': 'app.allow_slug_regeneration',
                'value': 'true',
                'is_local': True
            }).execute()
            logger.info("✅ Slug regeneration session var set (auto-migrate path)")
        except Exception as e:
            logger.warning(f"⚠️ Could not set slug session variable: {e}")

    # ── DEFENSIVE DUPLICATE CHECK (should never happen after migration 040) ──
    try:
        # Check if multiple business records exist for this user
        duplicate_check = db.table('businesses') \
            .select('id, updated_at') \
            .eq('user_id', user_id) \
            .execute()
        
        if duplicate_check.data and len(duplicate_check.data) > 1:
            # CRITICAL: Multiple records found - clean up by keeping most recent
            logger.warning(
                f"⚠️ DUPLICATE DETECTED: Found {len(duplicate_check.data)} business records "
                f"for user {user_id}. Cleaning up..."
            )
            
            # Sort by updated_at descending, keep the first (most recent)
            sorted_records = sorted(
                duplicate_check.data,
                key=lambda x: x.get('updated_at', ''),
                reverse=True
            )
            keep_id = sorted_records[0]['id']
            delete_ids = [r['id'] for r in sorted_records[1:]]
            
            # Delete old duplicates
            for delete_id in delete_ids:
                try:
                    db.table('businesses').delete().eq('id', delete_id).execute()
                    logger.info(f"🗑️ Deleted duplicate business record: {delete_id}")
                except Exception as del_err:
                    logger.error(f"Failed to delete duplicate {delete_id}: {del_err}")
            
            logger.info(f"✅ Duplicate cleanup complete. Keeping record: {keep_id}")
    except Exception as e:
        # Non-critical - log and continue with upsert
        logger.warning(f"Duplicate check failed (non-critical): {e}")

    # ── JSONB FIELD MERGES (top-level payload keys → sub-keys of JSONB columns) ──
    # For fields like codAvailable that map into a JSONB sub-key, we fetch the
    # current JSONB object, set the sub-key, and include the merged object in db_data.
    jsonb_merge_keys = [k for k in JSONB_MERGE_FIELDS if k in payload]
    if jsonb_merge_keys:
        try:
            current_record = db.table('businesses') \
                .select('ecommerce_policies') \
                .eq('user_id', user_id) \
                .maybe_single() \
                .execute()
            current_ep = {}
            if current_record.data:
                current_ep = current_record.data.get('ecommerce_policies') or {}

            for payload_key in jsonb_merge_keys:
                db_column, sub_key = JSONB_MERGE_FIELDS[payload_key]
                merged = dict(current_ep)
                merged[sub_key] = payload[payload_key]
                # If db_data already has this column (from ecommercePolicies in the same
                # request), merge into that dict instead of overwriting it.
                if db_column in db_data and isinstance(db_data[db_column], dict):
                    db_data[db_column][sub_key] = payload[payload_key]
                else:
                    db_data[db_column] = merged
        except Exception as e:
            logger.warning(f"JSONB merge fetch failed (non-critical, will skip merge): {e}")

    # ── WRITE TO SUPABASE ────────────────────────────────────────────────
    db_data['user_id'] = user_id  # Always set from g.user_id, never payload

    # ── SYNC url_slug_lower (case-insensitive index column) ──────────────
    if 'url_slug' in db_data and db_data['url_slug']:
        db_data['url_slug_lower'] = db_data['url_slug'].lower()

    try:
        result = db.table('businesses') \
            .upsert(db_data, on_conflict='user_id') \
            .execute()

        logger.info(f"✅ Business data saved to Supabase for user {user_id}")

    except Exception as e:
        error_str = str(e)

        # Handle UNIQUE constraint violation on url_slug
        if 'unique' in error_str.lower() and 'url_slug' in error_str.lower():
            logger.warning(f"⚠️ Slug conflict: '{slug_value}' already taken")
            return jsonify({
                "error": "SLUG_TAKEN",
                "field": "store_slug",
                "message": f"The URL '{slug_value}' is already taken. Please choose a different one."
            }), 409

        # Handle other unique constraint violations
        if 'unique' in error_str.lower() or '23505' in error_str:
            logger.warning(f"⚠️ Unique constraint violation: {error_str}")
            return jsonify({
                "error": "DUPLICATE_VALUE",
                "message": "A unique constraint was violated."
            }), 409

        logger.error(f"❌ Supabase write failed: {e}")
        return jsonify({
            "error": "DATABASE_ERROR",
            "message": "Failed to save business data"
        }), 500

    # ── CACHE INVALIDATION (fire-and-forget, never blocks write) ─────────
    # Pass old slug so invalidate_slug_cache clears the stale Redis entry.
    # Without this, the old cached slug entry survives indefinitely and the
    # new slug lookup misses cache on first hit (benign but causes confusion).
    if 'business_name' in db_data or 'url_slug' in db_data:
        _captured_pre_save_slug = pre_save_slug  # Capture for closure

        def _invalidate_cache():
            try:
                from utils.slug_resolver import invalidate_slug_cache
                invalidate_slug_cache(user_id, old_slug=_captured_pre_save_slug)
                logger.info(f"✅ Slug cache invalidated for user {user_id} (old_slug={_captured_pre_save_slug})")
            except Exception as e:
                logger.warning(f"⚠️ Cache invalidation failed (non-critical): {e}")

        thread = threading.Thread(target=_invalidate_cache, daemon=True)
        thread.start()

    # ── NEXT.JS CACHE INVALIDATION (fire-and-forget) ────────────────────
    # Notify the Next.js frontend to invalidate its in-memory LRU cache
    # and trigger ISR revalidation for this store's page.
    def _invalidate_nextjs_cache():
        try:
            import os
            import requests as req
            nextjs_url = os.getenv('NEXTJS_URL', 'http://localhost:3001')
            revalidation_secret = os.getenv('REVALIDATION_SECRET', '')
            slug = db_data.get('url_slug') or pre_save_slug or user_id
            req.post(
                f"{nextjs_url}/api/revalidate",
                json={
                    "slug": slug,
                    "userId": user_id,
                    "type": "slug_change" if 'url_slug' in db_data else "store",
                },
                headers={"Authorization": f"Bearer {revalidation_secret}"},
                timeout=3,
            )
            logger.info(f"✅ Next.js cache invalidated for slug={slug}")
        except Exception as e:
            logger.warning(f"⚠️ Next.js cache invalidation failed (non-critical): {e}")

    thread_nextjs = threading.Thread(target=_invalidate_nextjs_cache, daemon=True)
    thread_nextjs.start()

    # ── FIRESTORE SYNC (fire-and-forget for backward compatibility) ──────
    def _sync_firestore():
        try:
            import firebase_admin
            from firebase_admin import firestore as firebase_firestore
            from datetime import datetime

            fs_db = firebase_firestore.client()
            # Build Firestore-safe data (exclude products, use payload as-is)
            fs_data = {k: v for k, v in payload.items()
                       if k not in BLACKLISTED_FIELDS and k != 'products' and k != 'productCategories'}
            fs_data['userId'] = user_id
            fs_data['updatedAt'] = datetime.utcnow().isoformat()

            fs_db.collection('businesses').document(user_id).set(fs_data, merge=True)
            logger.info(f"✅ Firestore sync complete for user {user_id}")
        except Exception as e:
            logger.warning(f"⚠️ Firestore sync failed (non-critical): {e}")

    thread = threading.Thread(target=_sync_firestore, daemon=True)
    thread.start()

    return jsonify({"success": True}), 200
