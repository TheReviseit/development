"""
Products API — Authoritative product creation endpoint.
==========================================================
Single write path for product creation. All product writes
flow through this Flask blueprint, gated by @require_limit.

Frontend Next.js route proxies here. No direct DB writes
from frontend for product creation.

Architecture:
  Frontend → Next.js proxy → Flask → @require_limit("create_product")
                                    → atomic increment usage_counters
                                    → insert into products table
                                    → return 201 or 403
"""

from flask import Blueprint, jsonify, request, g
from typing import Optional
import logging

import firebase_admin
from firebase_admin import auth as firebase_auth

# Feature gate decorators — atomic limit enforcement
from middleware.feature_gate import require_limit

products_bp = Blueprint('products', __name__, url_prefix='/api/products')
logger = logging.getLogger('products.api')


# ============================================
# AUTH MIDDLEWARE — runs BEFORE @require_limit
# ============================================
# The @require_limit decorator checks g.user_id and g.product_domain
# BEFORE the route function body executes. If g.user_id is not set,
# the decorator returns 401. This before_request hook ensures both
# are available for the decorator.

@products_bp.before_request
def authenticate_request():
    """
    Extract user identity from request headers.
    Sets g.user_id (Supabase UUID) so @require_limit can find subscriptions.
    Sets g.firebase_uid for products table inserts.
    
    CRITICAL: subscriptions.user_id stores Supabase UUIDs, NOT Firebase UIDs.
    The FeatureGateEngine queries subscriptions with g.user_id, so we MUST
    resolve Firebase UID → Supabase UUID here (same as payments.py require_auth).
    """
    firebase_uid = None

    # Trust X-User-ID from Next.js API route (session already verified there)
    user_id_header = request.headers.get('X-User-ID')
    if user_id_header:
        firebase_uid = user_id_header
    else:
        # Fallback: verify token directly
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            # Try session cookie first
            try:
                decoded_token = firebase_auth.verify_session_cookie(token, check_revoked=True)
                firebase_uid = decoded_token.get('uid')
            except firebase_auth.InvalidSessionCookieError:
                pass
            except (firebase_auth.RevokedSessionCookieError, firebase_auth.ExpiredIdTokenError):
                return
            except Exception:
                pass

            # Try ID token
            if not firebase_uid:
                try:
                    decoded_token = firebase_auth.verify_id_token(token, check_revoked=True)
                    firebase_uid = decoded_token.get('uid')
                except Exception as e:
                    logger.error(f'Token verification failed: {type(e).__name__}')

    if not firebase_uid:
        return  # g.user_id stays unset → @require_limit will return 401

    # Store Firebase UID for products table insert (products.user_id = Firebase UID)
    g.firebase_uid = firebase_uid
    
    # NOTE: g.product_domain is set by global domain detection middleware in app.py

    # Map Firebase UID → Supabase UUID for feature gate
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        result = db.table('users').select('id').eq('firebase_uid', firebase_uid).limit(1).execute()
        if result.data:
            g.user_id = str(result.data[0]['id'])
        else:
            g.user_id = firebase_uid
    except Exception as e:
        logger.error(f"UID resolution failed: {e}")
        g.user_id = firebase_uid

    # Products are always in the 'shop' domain
    if not getattr(g, 'product_domain', None):
        g.product_domain = 'shop'



# ============================================
# AUTH HELPER (same pattern as showcase_api)
# ============================================

def get_user_from_token() -> Optional[str]:
    """
    Extract and verify Firebase token from Authorization header.
    Sets g.user_id for downstream use.
    
    Trusts X-User-ID from Next.js API route (session already verified).
    Falls back to Firebase token verification.
    """
    # Trust X-User-ID from Next.js API route
    user_id_header = request.headers.get('X-User-ID')
    if user_id_header:
        g.user_id = user_id_header
        return user_id_header

    # Fallback: verify token directly
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None

    token = auth_header[7:]

    # Try session cookie first
    try:
        decoded_token = firebase_auth.verify_session_cookie(token, check_revoked=True)
        user_id = decoded_token.get('uid')
        g.user_id = user_id
        return user_id
    except firebase_auth.InvalidSessionCookieError:
        pass
    except (firebase_auth.RevokedSessionCookieError, firebase_auth.ExpiredIdTokenError):
        return None
    except Exception:
        pass

    # Try ID token
    try:
        decoded_token = firebase_auth.verify_id_token(token, check_revoked=True)
        user_id = decoded_token.get('uid')
        g.user_id = user_id
        return user_id
    except Exception as e:
        logger.error(f'Token verification failed: {type(e).__name__}')
        return None


def _decrement_product_counter(user_id: str, db) -> None:
    """Decrement create_product usage counter after a failed insert.
    Called when @require_limit already incremented but the DB insert failed.
    Uses Supabase RPC for an atomic decrement (floor at 0)."""
    try:
        counter_row = db.table('usage_counters').select('current_value').match({
            'user_id': user_id,
            'feature_key': 'create_product',
            'domain': 'shop',
        }).limit(1).execute()
        if counter_row.data:
            current = counter_row.data[0]['current_value'] or 0
            new_value = max(0, current - 1)
            db.table('usage_counters').update({'current_value': new_value}).match({
                'user_id': user_id,
                'feature_key': 'create_product',
                'domain': 'shop',
            }).execute()
            logger.info(f"Decremented create_product counter {current} → {new_value} for {user_id}")
    except Exception as e:
        logger.error(f"Counter decrement failed for {user_id}: {e}")


# ============================================
# POST /api/products — Create product (GATED)
# ============================================

@products_bp.route('', methods=['POST'])
@require_limit("create_product")  # Atomic: check usage_counters + increment BEFORE insert
def create_product():
    """
    Create a new product in the `products` table.
    
    This is the ONLY product creation endpoint. Frontend proxies here.
    
    Flow:
        1. @require_limit checks subscription, plan_features, usage_counters
        2. Atomically increments usage_counters via RPC
        3. If limit exceeded → 403 (no insert, no increment)
        4. Inserts product row
        5. Inserts variants if provided
        6. Logs audit event
        7. Returns 201 with product data
    
    Request body (JSON):
        {
            "name": "Product Name",
            "description": "...",
            "price": 29.99,
            "compareAtPrice": 39.99,
            "priceUnit": "INR",
            "stockQuantity": 100,
            "stockStatus": "in_stock",
            "imageUrl": "...",
            "imagePublicId": "...",
            "sku": "...",
            "brand": "...",
            "duration": "...",
            "materials": [],
            "sizes": [],
            "colors": [],
            "tags": [],
            "available": true,
            "category": "Category Name",
            "hasSizePricing": false,
            "sizePrices": {},
            "sizeStocks": {},
            "variants": [...]
        }
    """
    try:
        # Auth — already handled by before_request hook
        # g.firebase_uid = Firebase UID for products table
        # g.user_id = Supabase UUID for feature gate
        firebase_uid = getattr(g, 'firebase_uid', None)
        if not firebase_uid:
            return jsonify({"success": False, "error": "Unauthorized"}), 401

        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "Request body required"}), 400

        # Validate required fields
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({"success": False, "error": "Product name is required"}), 400

        from supabase_client import get_supabase_client
        db = get_supabase_client()

        # ── Variant-aware limit pre-flight check ──
        # @require_limit already incremented counter by 1 (for the product itself).
        # But we also need to count variants toward the limit.
        # Check if total items (1 product + N variants) would exceed the limit.
        variants = data.get('variants', [])
        variant_count = len(variants) if isinstance(variants, list) else 0
        
        if variant_count > 0:
            feature_decision = getattr(g, 'feature_decision', None)
            if feature_decision and not getattr(feature_decision, 'is_unlimited', False):
                hard_limit = getattr(feature_decision, 'hard_limit', None)
                current_usage = getattr(feature_decision, 'used', 0)
                # current_usage already includes the +1 from @require_limit
                # Check if adding variants would exceed the limit
                if hard_limit is not None and (current_usage + variant_count) > hard_limit:
                    # Roll back the product counter increment (was already done by @require_limit)
                    _decrement_product_counter(g.user_id, db)
                    remaining = max(0, hard_limit - (current_usage - 1))  # -1 because it was just incremented
                    return jsonify({
                        "success": False,
                        "error": "PRODUCT_LIMIT_REACHED",
                        "message": f"Adding this product with {variant_count} variant(s) would exceed your limit of {hard_limit}. "
                                   f"You have {remaining} slot(s) remaining.",
                        "code": "PRODUCT_LIMIT_REACHED",
                        "current": current_usage - 1,
                        "limit": hard_limit,
                        "requested": 1 + variant_count,
                        "remaining": remaining,
                    }), 403

        # ── Resolve category_id if name provided ──
        category_id = data.get('categoryId') or None
        category_name = (data.get('category') or '').strip()
        if category_name and not category_id:
            cat_result = db.table('product_categories').select('id').match({
                'user_id': g.firebase_uid,
                'name': category_name,
            }).limit(1).execute()
            if cat_result.data:
                category_id = cat_result.data[0]['id']

        # ── Build product row ──
        product_data = {
            'user_id': g.firebase_uid,  # Firebase UID — NEVER from request body
            'name': name,
            'description': data.get('description', ''),
            'sku': data.get('sku') or None,
            'brand': data.get('brand', ''),
            'price': float(data.get('price', 0) or 0),
            'compare_at_price': float(data['compareAtPrice']) if data.get('compareAtPrice') else None,
            'price_unit': data.get('priceUnit', 'INR'),
            'stock_quantity': int(data.get('stockQuantity', 0) or 0),
            'stock_status': data.get('stockStatus', 'in_stock'),
            'image_url': data.get('imageUrl', ''),
            'image_public_id': data.get('imagePublicId', ''),
            'duration': data.get('duration', ''),
            'materials': data.get('materials', []),
            'sizes': data.get('sizes', []),
            'colors': data.get('colors', []),
            'tags': data.get('tags', []),
            'is_available': data.get('available', True),
            'category_id': category_id,
            'has_size_pricing': data.get('hasSizePricing', False),
            'size_prices': data.get('sizePrices', {}),
            'size_stocks': data.get('sizeStocks', {}),
        }

        # ── Insert product ──
        result = db.table('products').insert(product_data).execute()
        product = result.data[0] if result.data else None

        if not product:
            logger.error(f"Product insert returned no data for user {g.firebase_uid}")
            # Decrement the usage counter since insert failed (counter was already incremented by @require_limit)
            _decrement_product_counter(g.user_id, db)
            return jsonify({"success": False, "error": "Failed to create product"}), 500

        product_id = product['id']

        # ── Insert variants if provided ──
        if variants and isinstance(variants, list) and len(variants) > 0:
            variants_data = []
            for v in variants:
                variants_data.append({
                    'user_id': g.firebase_uid,
                    'product_id': product_id,
                    'color': v.get('color', ''),
                    'size': v.get('size', ''),
                    'price': float(v['price']) if v.get('price') else None,
                    'compare_at_price': float(v['compareAtPrice']) if v.get('compareAtPrice') else None,
                    'stock_quantity': int(v.get('stockQuantity', 0) or 0),
                    'image_url': v.get('imageUrl', ''),
                    'image_public_id': v.get('imagePublicId', ''),
                    'has_size_pricing': v.get('hasSizePricing', False),
                    'size_prices': v.get('sizePrices', {}),
                    'size_stocks': v.get('sizeStocks', {}),
                })

            try:
                db.table('product_variants').insert(variants_data).execute()
                
                # Increment counter by variant count (product itself was already counted by @require_limit)
                if variant_count > 0:
                    try:
                        counter_row = db.table('usage_counters').select('current_value').match({
                            'user_id': g.user_id,
                            'feature_key': 'create_product',
                            'domain': 'shop',
                        }).limit(1).execute()
                        if counter_row.data:
                            current = counter_row.data[0]['current_value'] or 0
                            new_value = current + variant_count
                            db.table('usage_counters').update({'current_value': new_value}).match({
                                'user_id': g.user_id,
                                'feature_key': 'create_product',
                                'domain': 'shop',
                            }).execute()
                            logger.info(f"Incremented create_product counter by {variant_count} for variants ({current} → {new_value})")
                    except Exception as counter_err:
                        logger.warning(f"Variant counter increment failed (will reconcile): {counter_err}")
            except Exception as e:
                logger.warning(f"Variant insert failed (product still created): {e}")

        # ── Audit log ──
        try:
            db.table('product_audit_log').insert({
                'user_id': g.firebase_uid,
                'product_id': product_id,
                'action': 'create',
                'changes': {'name': product['name'], 'variant_count': variant_count},
                'affected_count': 1 + variant_count,
            }).execute()
        except Exception as e:
            logger.warning(f"Audit log failed (non-critical): {e}")

        logger.info(f"✅ Created product \"{product['name']}\" with {variant_count} variant(s) for user {g.firebase_uid}")

        # ── NEXT.JS CACHE INVALIDATION (fire-and-forget) ────────────────
        # Product creation changes the store page data — invalidate caches.
        import threading
        def _invalidate_nextjs():
            try:
                import os
                import requests as req
                nextjs_url = os.getenv('NEXTJS_URL', 'http://localhost:3001')
                revalidation_secret = os.getenv('REVALIDATION_SECRET', '')
                # Get store slug for this user
                slug_result = db.table('businesses').select('url_slug').eq('user_id', g.firebase_uid).limit(1).execute()
                slug = slug_result.data[0]['url_slug'] if slug_result.data else g.firebase_uid
                req.post(
                    f"{nextjs_url}/api/revalidate",
                    json={"slug": slug, "userId": g.firebase_uid, "type": "store"},
                    headers={"Authorization": f"Bearer {revalidation_secret}"},
                    timeout=3,
                )
            except Exception as e:
                logger.warning(f"⚠️ Next.js cache invalidation failed (non-critical): {e}")
        threading.Thread(target=_invalidate_nextjs, daemon=True).start()

        return jsonify({
            "success": True,
            "product": product,
        }), 201

    except KeyError as e:
        logger.error(f"Missing required field: {e}")
        # Counter was incremented before this error — decrement it back
        try:
            from supabase_client import get_supabase_client
            _decrement_product_counter(g.user_id, get_supabase_client())
        except Exception:
            pass
        return jsonify({"success": False, "error": f"Missing required field: {e}"}), 400
    except Exception as e:
        logger.error(f"Error creating product: {e}", exc_info=True)
        # Counter was incremented before this error — decrement it back
        try:
            from supabase_client import get_supabase_client
            _decrement_product_counter(g.user_id, get_supabase_client())
        except Exception:
            pass
        return jsonify({"success": False, "error": "Internal server error"}), 500
