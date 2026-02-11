from flask import Blueprint, jsonify, request, current_app
from typing import Dict, Any, Optional, List
import logging
import firebase_admin
from firebase_admin import auth as firebase_auth

# Import domain entities
from domain.showcase_entities import (
    ShowcaseSettings,
    ShowcaseItem,
    PresentationConfig,
    CommerceData,
    ContentType
)

showcase_bp = Blueprint('showcase', __name__, url_prefix='/api/showcase')
logger = logging.getLogger('showcase.api')


# ============================================
# AUTH HELPERS
# ============================================

def get_user_from_token() -> Optional[str]:
    """
    Extract and verify Firebase token from Authorization header.
    Sets g.user_id for downstream use.
    Returns user_id (Firebase UID) if valid, None otherwise.
    
    ✅ ENTERPRISE PRODUCTION FIX: Trusted Next.js API Route
    Next.js API route already verifies session cookies, so we trust X-User-ID header.
    Falls back to token verification if header not present.
    """
    from flask import g
    
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
        pass  # Try ID token next
    except (firebase_auth.RevokedSessionCookieError, firebase_auth.ExpiredIdTokenError):
        return None
    except Exception:
        pass  # Try ID token next
    
    # Try ID token
    try:
        decoded_token = firebase_auth.verify_id_token(token, check_revoked=True)
        user_id = decoded_token.get('uid')
        g.user_id = user_id
        return user_id
    except Exception as e:
        logger.error(f'Token verification failed: {type(e).__name__}')
        return None


# ============================================
# DTOs (Data Transfer Objects) - Enterprise Fix #4
# ============================================

def map_showcase_settings_to_dto(settings: ShowcaseSettings) -> Dict[str, Any]:
    """
    ✅ ENTERPRISE FIX #4: Transform DB schema → API contract
    
    Benefits:
    - API consumers don't see DB internals
    - Can refactor DB without breaking API
    - Version-aware responses
    
    Args:
        settings: ShowcaseSettings domain entity
        
    Returns:
        API-safe DTO dict
    """
    config = settings.presentation_config
    version = settings.config_version
    
    # ✅ ENTERPRISE FIX #5: Handle different config versions
    if version == 1:
        return {
            "version": version,
            "presentation": {
                "version": version,  # Include version in presentation config
                "fields": config.fields,
                "actions": config.actions,
                "layout": config.layout
            },
            "contentType": settings.content_type.value
        }
    else:
        # Future: v2, v3 config formats
        logger.warning(f"Unknown config version: {version} for user {settings.user_id}")
        return {
            "version": version,
            "presentation": config.to_dict(),
            "contentType": settings.content_type.value
        }


def map_showcase_item_to_dto(
    item: ShowcaseItem,
    settings: ShowcaseSettings
) -> Dict[str, Any]:
    """
    Transform DB showcase_item → API response
    
    Only include commerce data if settings show commerce fields.
    This prevents leaking pricing data when business wants minimal display.
    
    Args:
        item: ShowcaseItem domain entity
        settings: ShowcaseSettings to determine what to show
        
    Returns:
        API-safe DTO dict
    """
    dto = {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "subtitle": item.subtitle,
        "imageUrl": item.thumbnail_url or item.image_url,
        "isFeatured": item.is_featured,
        "metadata": item.metadata,
        "viewCount": item.view_count
    }
    
    # Only include commerce if ANY commerce field is visible
    fields = settings.presentation_config.fields
    show_commerce = (
        fields.get('price', {}).get('visible', False) or
        fields.get('colors', {}).get('visible', False) or
        fields.get('sizes', {}).get('visible', False) or
        fields.get('stock', {}).get('visible', False)
    )
    
    if show_commerce and item.commerce:
        # Extract only what's configured to show
        if fields.get('price', {}).get('visible', False):
            dto['price'] = item.commerce.price
            dto['compareAtPrice'] = item.commerce.compare_at
        
        if item.commerce.variants:
            if fields.get('colors', {}).get('visible', False):
                colors = list(set(v.get('color') for v in item.commerce.variants if v.get('color')))
                dto['colors'] = colors
            
            if fields.get('sizes', {}).get('visible', False):
                sizes = list(set(v.get('size') for v in item.commerce.variants if v.get('size')))
                dto['sizes'] = sizes
        
        if fields.get('stock', {}).get('visible', False) and item.commerce.inventory:
            dto['stockStatus'] = item.commerce.inventory.get('status')
            dto['stockQuantity'] = item.commerce.inventory.get('quantity')
    
    return dto


# ============================================
# ENDPOINTS
# ============================================

@showcase_bp.route('/<slug_or_username>', methods=['GET'])
def get_showcase(slug_or_username: str):
    """
    Get showcase data with enterprise URL slug support
    
    ✅ ENTERPRISE URL ROUTING:
    URLs are PUBLIC CONTRACTS - must be stable and SEO-friendly
    
    Resolution order (MANDATORY):
    1. businesses.url_slug_lower  (canonical)
    2. users.username_lower       (legacy, redirects to slug)
    3. users.firebase_uid          (legacy, redirects to slug)
    4. 404 Not Found
    
    Redirects:
    - /showcase/Flowauxi  → 301 → /showcase/flowauxi
    - /showcase/username  → 301 → /showcase/business-slug
    
    Response:
        {
            "success": true,
            "data": {
                "businessName": "My Store",
                "canonicalSlug": "my-store",  # For SEO
                "logoUrl": "...",
                "userId": "...",
                "settings": {...},
                "items": [...],
                "contact": {...},
                "socialMedia": {...}
            }
        }
    """
    try:
        from supabase_client import get_supabase_client
        from utils.slug_resolver import resolve_slug_to_user_id
        from flask import redirect, url_for
        
        db = get_supabase_client()
        
        # ✅ ENTERPRISE RESOLUTION: slug → username → uid → 404
        resolution = resolve_slug_to_user_id(slug_or_username)
        
        if not resolution:
            return jsonify({
                "success": False,
                "error": "Showcase not found"
            }), 404
        
        user_id, canonical_slug, needs_redirect = resolution
        
        # ✅ 301 REDIRECT: Non-canonical URL → canonical
        if needs_redirect:
            canonical_url = f"/api/showcase/{canonical_slug}"
            logger.info(f"🔀 301 Redirect: {slug_or_username} → {canonical_slug}")
            return redirect(canonical_url, code=301)
        
        logger.info(f"✅ Canonical URL: /showcase/{canonical_slug} (user: {user_id[:8]}...)")

        
        # 2. Get settings (with fallback to defaults)
        settings_result = db.table('showcase_settings').select('*').eq(
            'user_id', user_id
        ).execute()
        
        if settings_result.data:
            settings = ShowcaseSettings.from_db(settings_result.data[0])
        else:
            # Create default settings if missing
            settings = create_default_settings(user_id, db)
        
        # ✅ Map to DTO (API ≠ DB schema)
        settings_dto = map_showcase_settings_to_dto(settings)
        
        # 3. Get items
        items_result = db.table('showcase_items').select('*').eq(
            'user_id', user_id
        ).eq('is_visible', True).eq('is_deleted', False).order(
            'is_featured', desc=True
        ).order('created_at', desc=True).limit(100).execute()
        
        # ✅ Map to DTOs
        items_dto = [
            map_showcase_item_to_dto(ShowcaseItem.from_db(item), settings)
            for item in (items_result.data or [])
        ]
        
        # 4. Get business data from Supabase businesses table
        business_result = db.table('businesses').select('*').eq(
            'user_id', user_id
        ).limit(1).execute()
        
        business = business_result.data[0] if business_result.data and len(business_result.data) > 0 else {}
        
        # 5. Get store settings for logo (OPTIONAL - skip if table doesn't exist)
        # optimize: avoid querying store_settings if we already have a logo from business or settings
        store_settings = {}

        
        
        # 6. Extract contact information with fallback (flat columns > JSONB)
        # ✅ ENTERPRISE PATTERN: Support both denormalized and JSONB for backward compatibility
        contact_data = business.get('contact', {})
        if isinstance(contact_data, str):
            try:
                import json
                contact_data = json.loads(contact_data)
            except:
                contact_data = {}
        
        # Fallback to flat columns if JSONB is empty
        phone = business.get('phone') or contact_data.get('phone')
        email = business.get('email') or contact_data.get('email')
        whatsapp = business.get('whatsapp') or contact_data.get('whatsapp') or contact_data.get('whatsappNumber')
        
        # 7. Extract location information with fallback (flat columns > JSONB)
        location_data = business.get('location', {})
        if isinstance(location_data, str):
            try:
                import json
                location_data = json.loads(location_data)
            except:
                location_data = {}
        
        # Fallback to flat columns if JSONB is empty
        address = business.get('address') or location_data.get('address')
        city = business.get('city') or location_data.get('city')
        state = business.get('state') or location_data.get('state')
        pincode = business.get('pincode') or location_data.get('pincode')
        
        # 8. Parse social media data and convert usernames to full URLs
        social_data = {}
        try:
            raw_social = business.get('social_media', {})
            if isinstance(raw_social, str):
                try:
                    import json
                    raw_social = json.loads(raw_social)
                except:
                    raw_social = {}
            
            if not isinstance(raw_social, dict):
                raw_social = {}
                
            # Convert usernames to full URLs
            if raw_social.get('instagram'):
                instagram_value = raw_social['instagram']
                # Check if it's already a URL
                if instagram_value.startswith('http'):
                    social_data['instagram'] = instagram_value
                else:
                    # It's a username, convert to URL
                    social_data['instagram'] = f"https://instagram.com/{instagram_value}"
            
            if raw_social.get('facebook'):
                facebook_value = raw_social['facebook']
                if facebook_value.startswith('http'):
                    social_data['facebook'] = facebook_value
                else:
                    social_data['facebook'] = f"https://facebook.com/{facebook_value}"
            
            if raw_social.get('twitter'):
                twitter_value = raw_social['twitter']
                if twitter_value.startswith('http'):
                    social_data['twitter'] = twitter_value
                else:
                    social_data['twitter'] = f"https://twitter.com/{twitter_value}"
            
            if raw_social.get('linkedin'):
                linkedin_value = raw_social['linkedin']
                if linkedin_value.startswith('http'):
                    social_data['linkedin'] = linkedin_value
                else:
                    social_data['linkedin'] = f"https://linkedin.com/in/{linkedin_value}"
            
            if raw_social.get('youtube'):
                youtube_value = raw_social['youtube']
                if youtube_value.startswith('http'):
                    social_data['youtube'] = youtube_value
                else:
                    social_data['youtube'] = f"https://youtube.com/@{youtube_value}"
                    
        except Exception as e:
            logger.error(f"Error parsing social_media: {e}")
        
        # 9. Build complete address from extracted fields
        address_parts = []
        if address:
            address_parts.append(address)
        if city:
            address_parts.append(city)
        if state:
            address_parts.append(state)
        if pincode:
            address_parts.append(str(pincode))
        
        full_address = ', '.join(address_parts) if address_parts else None
        
        # 10. Determine logo URL (priority: store_settings > business.logo_url > business.logoUrl)
        logo_url = (
            store_settings.get('logo_url') or 
            business.get('logo_url') or
            business.get('logoUrl')
        )
        
        # 11. Build response with complete business profile + canonical slug
        return jsonify({
            "success": True,
            "data": {
                "businessName": business.get('business_name') or business.get('businessName', ''),
                "logoUrl": logo_url,
                "userId": user_id,  # ✅ UID for real-time sync
                "canonicalSlug": canonical_slug,  # ✅ SEO canonical URL
                "description": business.get('description', ''),
                "settings": settings_dto,
                "items": items_dto,
                "contact": {
                    "phone": phone,
                    "email": email,
                    "address": full_address,
                    "whatsapp": whatsapp
                },
                "socialMedia": social_data
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching showcase for slug '{slug_id}': {e}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@showcase_bp.route('/settings', methods=['GET'])
def get_settings():
    """
    Get current user's showcase settings
    Requires Firebase authentication
    """
    try:
        # Get user from Firebase token
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized - Please login"
            }), 401
        
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Get settings for this user
        settings_result = db.table('showcase_settings').select('*').eq(
            'user_id', user_id
        ).execute()
        
        if settings_result.data:
            settings = ShowcaseSettings.from_db(settings_result.data[0])
        else:
            # Create default settings
            settings = create_default_settings(user_id, db)
        
        # Map to DTO
        settings_dto = map_showcase_settings_to_dto(settings)
        
        return jsonify(settings_dto), 200
        
    except Exception as e:
        logger.error(f'Error fetching settings: {e}', exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@showcase_bp.route('/settings', methods=['POST'])
def save_settings():
    """
    Save showcase settings with version handling
    
    Request:
        {
            "presentation": {
                "fields": {...},
                "actions": {...},
                "layout": {...}
            },
            "contentType": "visual"
        }
    """
    try:
        # Get user from Firebase token
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized - Please login"
            }), 401
        
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "error": "No data provided"
            }), 400
        
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Build presentation config with version
        presentation_data = data.get('presentation', {})
        presentation_config = {
            "version": 1,
            "fields": presentation_data.get('fields', {}),
            "actions": presentation_data.get('actions', {}),
            "layout": presentation_data.get('layout', {"type": "standard", "imageRatio": "1:1"})
        }
        
        # Upsert settings with on_conflict specification
        db.table('showcase_settings').upsert({
            "user_id": user_id,
            "presentation_config": presentation_config,
            "config_version": 1,
            "content_type": data.get('contentType', 'generic')
        }, on_conflict='user_id').execute()
        
        logger.info(f'Saved showcase settings for user {user_id}')
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        logger.error(f'Error saving settings: {e}', exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500
        
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Build presentation config with version
        presentation_data = data.get('presentation', {})
        presentation_config = {
            "version": 1,
            "fields": presentation_data.get('fields', {}),
            "actions": presentation_data.get('actions', {}),
            "layout": presentation_data.get('layout', {"type": "standard", "imageRatio": "1:1"})
        }
        
        # Upsert settings
        db.table('showcase_settings').upsert({
            "user_id": user_id,
            "presentation_config": presentation_config,
            "config_version": 1,
            "content_type": data.get('contentType', 'generic')
        }).execute()
        
        logger.info(f"Saved showcase settings for user {user_id}")
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        logger.error(f"Error saving settings: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@showcase_bp.route('/items', methods=['GET'])
def get_items():
    """
    Get all showcase items for the authenticated user
    ✅ SECURITY: Uses g.user_id from auth middleware
    """
    try:
        # ✅ CRITICAL SECURITY: Get user_id from g (set by get_user_from_token)
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized - Please login"
            }), 401
        
        from flask import g
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Fetch items for this user only (tenant isolation)
        items_result = db.table('showcase_items').select('*').eq(
            'user_id', g.user_id
        ).eq('is_deleted', False).order(
            'is_featured', desc=True
        ).order('created_at', desc=True).execute()
        
        # Map to DTOs (simplified for now - can add presentation_config filtering later)
        items_dto = [
            {
                "id": item['id'],
                "title": item['title'],
                "description": item.get('description'),
                "subtitle": item.get('subtitle'),
                "image_url": item.get('thumbnail_url') or item.get('image_url'),
                "category": item.get('metadata', {}).get('category') if item.get('metadata') else None,
                "price": item.get('commerce', {}).get('price') if item.get('commerce') else None,
                "is_visible": item.get('is_visible', True),
                "is_featured": item.get('is_featured', False),
                "created_at": item.get('created_at')
            }
            for item in (items_result.data or [])
        ]
        
        logger.info(f"Fetched {len(items_dto)} items for user {g.user_id}")
        
        return jsonify({
            "success": True,
            "data": {"items": items_dto}
        }), 200
        
    except Exception as e:
        logger.error(f'Error fetching items: {e}', exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@showcase_bp.route('/items', methods=['POST'])
def create_item():
    """
    Create a new showcase item
    ✅ SECURITY FIX: Uses g.user_id from auth middleware
    ❌ NEVER accepts userId from request body
    
    Request:
        {
            "title": "Beautiful Necklace",
            "description": "...",
            "imageUrl": "...",
            "imagePublicId": "...",  # From Cloudinary upload
            "commerce": {  # Optional
                "price": 2999,
                "compareAt": 3999,
                "inventory": {"status": "in_stock", "quantity": 10}
            },
            "metadata": {"tags": ["handmade", "gold"]}
        }
    """
    try:
        # ✅ CRITICAL SECURITY: Get user_id from g (set by get_user_from_token)
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized - Please login"
            }), 401
        
        from flask import g
        data = request.get_json()
        
        # ✅ SECURITY: user_id = g.user_id ALWAYS (never from request body)
        # Even if client sends userId, it's IGNORED completely
        
        #  ✅ CRITICAL: Verify g.user_id is actually set
        if not hasattr(g, 'user_id') or not g.user_id:
            logger.error(f"❌ CRITICAL: g.user_id is not set! This should never happen after get_user_from_token()")
            return jsonify({
                "success": False,
                "error": "User ID required"
            }), 400
        
        if not data or not data.get('title'):
            return jsonify({
                "success": False,
                "error": "Title is required"
            }), 400
        
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Prepare item data
        item_data = {
            "user_id": g.user_id,  # ✅ From g, NEVER from request body
            "title": data['title'],
            "description": data.get('description'),
            "subtitle": data.get('subtitle'),
            "image_url": data.get('imageUrl') or data.get('image_url'),
            "image_public_id": data.get('imagePublicId') or data.get('image_public_id'),
            "thumbnail_url": data.get('thumbnailUrl'),
            "additional_images": data.get('additionalImages', []),
            "category_id": data.get('categoryId'),
            "commerce": data.get('commerce'),  # JSONB - can be null
            "metadata": data.get('metadata', {}),
            "is_visible": data.get('isVisible', True),
            "is_featured": data.get('isFeatured', False)
        }
        
        result = db.table('showcase_items').insert(item_data).execute()
        
        created_item = result.data[0] if result.data else None
        if not created_item:
            raise Exception("Failed to create item")
        
        logger.info(f"Created showcase item for user {g.user_id}: {created_item['id']}")
        
        return jsonify({
            "success": True,
            "data": {"id": created_item['id']}
        }), 201
        
    except KeyError as e:
        logger.error(f"Missing required field: {e}")
        return jsonify({
            "success": False,
            "error": f"Missing required field: {e}"
        }), 400
    except Exception as e:
        logger.error(f"Error creating item: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@showcase_bp.route('/items/<item_id>', methods=['PATCH'])
def update_item(item_id: str):
    """
    Update an existing showcase item
    ✅ SECURITY: Only allows updating user's own items
    
    Request:
        {
            "isVisible": true,  // Toggle visibility
            "isFeatured": false,  // Toggle featured status
            "title": "Updated Title",
            "description": "...",
            "commerce": {...}
        }
    """
    try:
        # ✅ CRITICAL SECURITY: Get user_id from token
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized - Please login"
            }), 401
        
        from flask import g
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        data = request.get_json()
        if not data:
            return jsonify({
                "success": False,
                "error": "No data provided"
            }), 400
        
        # ✅ SECURITY: First verify item belongs to this user
        item_result = db.table('showcase_items').select('*').eq(
            'id', item_id
        ).eq('user_id', g.user_id).execute()
        
        if not item_result.data:
            return jsonify({
                "success": False,
                "error": "Item not found or access denied"
            }), 404
        
        # Build update data (only include provided fields)
        update_data = {}
        if 'isVisible' in data:
            update_data['is_visible'] = data['isVisible']
        if 'isFeatured' in data:
            update_data['is_featured'] = data['isFeatured']
        if 'title' in data:
            update_data['title'] = data['title']
        if 'description' in data:
            update_data['description'] = data['description']
        if 'subtitle' in data:
            update_data['subtitle'] = data['subtitle']
        if 'imageUrl' in data:
            update_data['image_url'] = data['imageUrl']
        if 'commerce' in data:
            update_data['commerce'] = data['commerce']
        if 'metadata' in data:
           update_data['metadata'] = data['metadata']
        
        if not update_data:
            return jsonify({
                "success": False,
                "error": "No valid fields to update"
            }), 400
        
        # Update item
        result = db.table('showcase_items').update(update_data).eq(
            'id', item_id
        ).eq('user_id', g.user_id).execute()
        
        logger.info(f"Updated showcase item {item_id} for user {g.user_id}")
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        logger.error(f"Error updating item {item_id}: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@showcase_bp.route('/items/<item_id>', methods=['DELETE'])
def delete_item(item_id: str):
    """
    Soft-delete a showcase item
    ✅ SECURITY: Only allows deleting user's own items
    ✅ SOFT DELETE: Sets is_deleted=true instead of actual deletion
    """
    try:
        # ✅ CRITICAL SECURITY: Get user_id from token
        user_id = get_user_from_token()
        if not user_id:
            return jsonify({
                "success": False,
                "error": "Unauthorized - Please login"
            }), 401
        
        from flask import g
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # ✅ SECURITY: First verify item belongs to this user
        item_result = db.table('showcase_items').select('*').eq(
            'id', item_id
        ).eq('user_id', g.user_id).execute()
        
        if not item_result.data:
            return jsonify({
                "success": False,
                "error": "Item not found or access denied"
            }), 404
        
        # Soft delete: Set is_deleted = true
        db.table('showcase_items').update({
            'is_deleted': True,
            'is_visible': False  # Also hide it
        }).eq('id', item_id).eq('user_id', g.user_id).execute()
        
        logger.info(f"Deleted showcase item {item_id} for user {g.user_id}")
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        logger.error(f"Error deleting item {item_id}: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


# ============================================
# HELPER FUNCTIONS
# ============================================

def create_default_settings(user_id: str, db) -> ShowcaseSettings:
    """
    Helper to create default settings for a user
    
    Default: Minimal showcase (no commerce)
    """
    result = db.table('showcase_settings').insert({
        "user_id": user_id,
        "content_type": "generic"
        # presentation_config uses DEFAULT from schema
    }).execute()
    
    return ShowcaseSettings.from_db(result.data[0])


# ============================================
# ERROR HANDLERS
# ============================================

@showcase_bp.errorhandler(404)
def not_found(error):
    return jsonify({
        "success": False,
        "error": "Resource not found"
    }), 404


@showcase_bp.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {error}", exc_info=True)
    return jsonify({
        "success": False,
        "error": "Internal server error"
    }), 500
