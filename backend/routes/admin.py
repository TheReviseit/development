"""
Admin endpoint to resync usage counters for a specific user
"""

from flask import Blueprint, request, jsonify
from supabase_client import get_supabase_client
import logging

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


@admin_bp.route('/resync-usage-counter', methods=['POST'])
def resync_usage_counter():
    """
    Resync usage counter for a specific user
    
    POST /api/admin/resync-usage-counter
    Body: { "firebase_uid": "..." }
    
    Returns: { "success": true, "result": {...} }
    """
    try:
        data = request.get_json()
        firebase_uid = data.get('firebase_uid')
        
        if not firebase_uid:
            return jsonify({"error": "firebase_uid is required"}), 400
        
        db = get_supabase_client()
        
        # Call the SQL function
        result = db.rpc('resync_usage_counter_for_user', {
            'p_firebase_uid': firebase_uid
        }).execute()
        
        if result.data:
            return jsonify({
                "success": True,
                "result": result.data
            })
        else:
            return jsonify({
                "success": False,
                "error": "No result returned"
            }), 500
            
    except Exception as e:
        logger.error(f"Error resyncing usage counter: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@admin_bp.route('/check-product-usage/<firebase_uid>', methods=['GET'])
def check_product_usage(firebase_uid):
    """
    Check product usage for a specific user
    
    GET /api/admin/check-product-usage/<firebase_uid>
    
    Returns: { "actual_products": 0, "counter_value": 10, "is_accurate": false }
    """
    try:
        db = get_supabase_client()
        
        # Get Supabase UUID
        user_result = db.table('users').select('id, email').eq('firebase_uid', firebase_uid).execute()
        
        if not user_result.data:
            return jsonify({"error": "User not found"}), 404
        
        supabase_uuid = user_result.data[0]['id']
        email = user_result.data[0].get('email', 'N/A')
        
        # Count actual products
        products_result = db.table('products').select('id', count='exact').eq('user_id', firebase_uid).execute()
        actual_count = products_result.count or 0
        
        # Get counter value
        counter_result = db.table('usage_counters').select('current_value').eq(
            'user_id', supabase_uuid
        ).eq('domain', 'shop').eq('feature_key', 'create_product').execute()
        
        counter_value = counter_result.data[0]['current_value'] if counter_result.data else None
        
        return jsonify({
            "firebase_uid": firebase_uid,
            "email": email,
            "supabase_uuid": supabase_uuid,
            "actual_products": actual_count,
            "counter_value": counter_value,
            "is_accurate": actual_count == counter_value if counter_value is not None else None,
            "needs_resync": actual_count != counter_value if counter_value is not None else False
        })
        
    except Exception as e:
        logger.error(f"Error checking product usage: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@admin_bp.route('/clear-cache/<firebase_uid>', methods=['POST'])
def clear_user_cache(firebase_uid):
    """
    Clear all caches for a specific user (Redis + in-memory)
    
    POST /api/admin/clear-cache/<firebase_uid>
    
    Returns: { "success": true, "keys_deleted": 10 }
    """
    try:
        db = get_supabase_client()
        
        # Get Supabase UUID
        user_result = db.table('users').select('id').eq('firebase_uid', firebase_uid).execute()
        
        if not user_result.data:
            return jsonify({"error": "User not found"}), 404
        
        supabase_uuid = user_result.data[0]['id']
        
        # Clear Redis cache - use direct deletion since invalidate_pattern may return None
        total_deleted = 0
        try:
            import os
            import redis
            
            redis_url = os.getenv('REDIS_URL')
            if redis_url:
                r = redis.from_url(redis_url, decode_responses=True)
                
                # Delete all cache keys for this user
                patterns = [
                    f"fg:*:{supabase_uuid}:*",  # Feature gate caches
                    f"subscription:*:{supabase_uuid}",  # Subscription caches
                    f"plan_features:*",  # Plan features cache
                    f"entitlement:*:{supabase_uuid}",  # Entitlement cache
                ]
                
                for pattern in patterns:
                    keys = r.keys(pattern)
                    if keys:
                        deleted = r.delete(*keys)
                        total_deleted += deleted
                        logger.info(f"✅ Deleted {deleted} keys matching: {pattern}")
                
                # Also flush the in-memory L1 cache if available
                try:
                    from cache.redis_cache import get_cache_manager
                    cache = get_cache_manager()
                    if hasattr(cache, 'l1_cache'):
                        cache.l1_cache.clear()
                        logger.info("✅ Cleared L1 in-memory cache")
                except Exception as l1_error:
                    logger.warning(f"L1 cache clear skipped: {l1_error}")
                
                logger.info(f"✅ Total: Cleared {total_deleted} cache keys for user {firebase_uid}")
                
                return jsonify({
                    "success": True,
                    "firebase_uid": firebase_uid,
                    "supabase_uuid": supabase_uuid,
                    "keys_deleted": total_deleted,
                    "message": f"Cache cleared successfully ({total_deleted} keys deleted). Hard refresh your browser (Ctrl+Shift+R) and try again."
                })
            else:
                return jsonify({
                    "success": False,
                    "error": "Redis not configured (REDIS_URL not set)"
                }), 500
            
        except Exception as cache_error:
            logger.error(f"Cache clear failed: {cache_error}", exc_info=True)
            return jsonify({
                "success": False,
                "error": f"Cache clear failed: {str(cache_error)}"
            }), 500
            
    except Exception as e:
        logger.error(f"Error clearing cache: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@admin_bp.route('/debug-entitlement/<firebase_uid>', methods=['GET'])
def debug_entitlement(firebase_uid):
    """
    Complete diagnostic of user's entitlements and feature gate status
    
    GET /api/admin/debug-entitlement/<firebase_uid>
    
    Shows EVERYTHING: subscription, plan, plan_features, usage_counters, actual products
    """
    try:
        db = get_supabase_client()
        
        # Get Supabase UUID
        user_result = db.table('users').select('id, email').eq('firebase_uid', firebase_uid).execute()
        
        if not user_result.data:
            return jsonify({"error": "User not found"}), 404
        
        supabase_uuid = user_result.data[0]['id']
        email = user_result.data[0].get('email', 'N/A')
        
        debug_info = {
            "user": {
                "firebase_uid": firebase_uid,
                "supabase_uuid": supabase_uuid,
                "email": email
            }
        }
        
        # 1. Check subscription
        sub_result = db.table('subscriptions').select(
            'id, plan_id, status, created_at'
        ).eq('user_id', supabase_uuid).in_(
            'status', ['active', 'completed', 'processing']
        ).order('created_at', desc=True).limit(1).execute()
        
        if sub_result.data:
            subscription = sub_result.data[0]
            debug_info["subscription"] = subscription
            
            # 2. Get plan details
            # IMPORTANT: subscriptions.plan_id is the Razorpay plan ID (string), not pricing_plans.id
            razorpay_plan_id = subscription['plan_id']
            plan_result = db.table('pricing_plans').select(
                'id, plan_slug, product_domain, display_name, amount_paise, is_active, razorpay_plan_id'
            ).eq('razorpay_plan_id', razorpay_plan_id).execute()
            
            if plan_result.data:
                plan = plan_result.data[0]
                debug_info["plan"] = plan
                
                # 3. Get plan_features for this plan
                features_result = db.table('plan_features').select(
                    'feature_key, hard_limit, soft_limit, is_unlimited'
                ).eq('plan_id', plan['id']).execute()
                
                debug_info["plan_features"] = features_result.data or []
                
                # Check specifically for create_product
                create_product_feature = next(
                    (f for f in features_result.data if f['feature_key'] == 'create_product'),
                    None
                )
                debug_info["create_product_feature"] = create_product_feature or "NOT FOUND"
            else:
                debug_info["plan"] = "Plan not found!"
        else:
            debug_info["subscription"] = "No active subscription!"
        
        # 4. Check usage counter
        counter_result = db.table('usage_counters').select(
            'current_value, domain, feature_key, reset_at'
        ).eq('user_id', supabase_uuid).eq('domain', 'shop').eq(
            'feature_key', 'create_product'
        ).execute()
        
        debug_info["usage_counter"] = counter_result.data[0] if counter_result.data else "No counter"
        
        # 5. Count actual products
        products_result = db.table('products').select('id', count='exact').eq(
            'user_id', firebase_uid
        ).execute()
        debug_info["actual_products"] = products_result.count or 0
        
        # 6. Diagnosis
        diagnosis = []
        
        if debug_info["subscription"] == "No active subscription!":
            diagnosis.append("❌ NO ACTIVE SUBSCRIPTION - User must subscribe first!")
        elif debug_info.get("plan") == "Plan not found!":
            diagnosis.append("❌ PLAN NOT FOUND - Database integrity issue!")
        elif debug_info.get("create_product_feature") == "NOT FOUND":
            diagnosis.append("❌ PLAN_FEATURES MISSING - Run 046_fix_starter_plan_limits.sql!")
        elif debug_info.get("create_product_feature"):
            feature = debug_info["create_product_feature"]
            hard_limit = feature.get('hard_limit')
            current = debug_info.get("usage_counter", {}).get('current_value', 0) if isinstance(debug_info.get("usage_counter"), dict) else 0
            
            if hard_limit is None:
                diagnosis.append(f"❌ HARD_LIMIT IS NULL - Should be 10 for starter plan!")
            elif current >= hard_limit:
                diagnosis.append(f"❌ LIMIT REACHED - {current}/{hard_limit} products used")
            else:
                diagnosis.append(f"✅ SHOULD WORK - {current}/{hard_limit} products used, limit not reached")
        
        debug_info["diagnosis"] = diagnosis
        
        return jsonify(debug_info)
        
    except Exception as e:
        logger.error(f"Error debugging entitlement: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
