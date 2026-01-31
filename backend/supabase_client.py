"""
Supabase Client for WhatsApp Multi-Tenant Support
Fetches customer credentials from the database based on phone_number_id
"""

import os
from typing import Dict, Any, Optional
from supabase import create_client, Client

# Import decryption utility
try:
    from crypto_utils import decrypt_token
    CRYPTO_AVAILABLE = True
except ImportError:
    print("⚠️ crypto_utils not available, tokens will not be decrypted")
    CRYPTO_AVAILABLE = False
    decrypt_token = None

# Initialize Supabase client
supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

_supabase_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    """Get or create Supabase client instance."""
    global _supabase_client
    
    if _supabase_client is not None:
        return _supabase_client
    
    if not supabase_url or not supabase_key:
        print("⚠️ Supabase credentials not configured")
        return None
    
    try:
        _supabase_client = create_client(supabase_url, supabase_key)
        print("✅ Supabase client initialized")
        return _supabase_client
    except Exception as e:
        print(f"❌ Failed to initialize Supabase client: {e}")
        return None


# =============================================================================
# FIREBASE UID → SUPABASE UUID TRANSLATION (Enterprise-Grade)
# =============================================================================

import time
from functools import lru_cache
from threading import Lock

# Thread-safe cache for user ID translations
_uid_cache: Dict[str, tuple] = {}  # {firebase_uid: (supabase_uuid, timestamp)}
_uid_cache_lock = Lock()
_UID_CACHE_TTL = 3600  # 1 hour cache TTL


def resolve_user_id(
    firebase_uid: str,
    allow_firebase_fallback: bool = False
) -> Optional[str]:
    """
    Enterprise-grade Firebase UID → Supabase UUID translation.
    
    This is the SINGLE SOURCE OF TRUTH for user ID resolution across the platform.
    All modules should use this function when they need to interact with tables
    that use Supabase UUIDs (like analytics_daily, push_subscriptions).
    
    Features:
    - TTL-based in-memory caching (1 hour)
    - Thread-safe operations
    - Graceful fallback options
    - Debug logging
    
    Args:
        firebase_uid: The Firebase Authentication UID
        allow_firebase_fallback: If True, returns firebase_uid when no mapping exists
                                 (useful for tables that accept both formats)
    
    Returns:
        Supabase UUID string, or None if translation fails
        (or firebase_uid if allow_firebase_fallback=True)
    
    Usage:
        >>> from supabase_client import resolve_user_id
        >>> supabase_uuid = resolve_user_id("PUlB2mAo6AaFmQ0WfqpSFgS7dDo1")
        >>> if supabase_uuid:
        ...     client.table("analytics_daily").eq("user_id", supabase_uuid)...
    """
    if not firebase_uid:
        return None
    
    # Check if already a valid UUID format (36 chars with hyphens)
    if _is_valid_uuid(firebase_uid):
        return firebase_uid
    
    # Check cache first (thread-safe)
    cached = _get_cached_user_id(firebase_uid)
    if cached is not None:
        return cached
    
    # Fetch from database
    resolved_id = _fetch_supabase_user_id(firebase_uid)
    
    if resolved_id:
        _cache_user_id(firebase_uid, resolved_id)
        return resolved_id
    
    # Fallback behavior
    if allow_firebase_fallback:
        print(f"⚠️ [UserID] No mapping found for {firebase_uid[:15]}..., using as-is (fallback enabled)")
        return firebase_uid
    
    print(f"⚠️ [UserID] No Supabase UUID found for Firebase UID: {firebase_uid[:15]}...")
    return None


def _is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID format."""
    if not value or len(value) != 36:
        return False
    # UUID format: 8-4-4-4-12 with hyphens at positions 8, 13, 18, 23
    return (
        value[8] == '-' and 
        value[13] == '-' and 
        value[18] == '-' and 
        value[23] == '-'
    )


def _get_cached_user_id(firebase_uid: str) -> Optional[str]:
    """Get user ID from cache if valid."""
    with _uid_cache_lock:
        if firebase_uid in _uid_cache:
            supabase_uuid, timestamp = _uid_cache[firebase_uid]
            if time.time() - timestamp < _UID_CACHE_TTL:
                return supabase_uuid
            # Expired - remove from cache
            del _uid_cache[firebase_uid]
    return None


def _cache_user_id(firebase_uid: str, supabase_uuid: str):
    """Cache user ID translation."""
    with _uid_cache_lock:
        # Limit cache size (LRU-style cleanup)
        if len(_uid_cache) > 10000:
            # Remove oldest 20% of entries
            sorted_entries = sorted(_uid_cache.items(), key=lambda x: x[1][1])
            for key, _ in sorted_entries[:2000]:
                del _uid_cache[key]
        
        _uid_cache[firebase_uid] = (supabase_uuid, time.time())


def _fetch_supabase_user_id(firebase_uid: str) -> Optional[str]:
    """Fetch Supabase user ID from database."""
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table('users').select('id').eq(
            'firebase_uid', firebase_uid
        ).single().execute()
        
        if result.data and result.data.get('id'):
            supabase_uuid = result.data['id']
            print(f"🔗 [UserID] Resolved: {firebase_uid[:10]}... → {supabase_uuid[:8]}...")
            return supabase_uuid
            
    except Exception as e:
        # Log but don't crash - this is a non-critical operation
        error_msg = str(e)
        if 'PGRST116' in error_msg:  # Single row not found
            print(f"⚠️ [UserID] No user record for Firebase UID: {firebase_uid[:15]}...")
        else:
            print(f"⚠️ [UserID] Error fetching user ID: {e}")
    
    return None


def invalidate_user_cache(firebase_uid: str = None):
    """Invalidate cached user ID translations."""
    with _uid_cache_lock:
        if firebase_uid:
            _uid_cache.pop(firebase_uid, None)
        else:
            _uid_cache.clear()


# =============================================================================
# UNIFIED WHATSAPP CREDENTIAL LOOKUP
# Production-grade multi-source credential resolution
# =============================================================================

def get_whatsapp_credentials_unified(
    firebase_uid: str = None,
    supabase_user_id: str = None
) -> Optional[Dict[str, Any]]:
    """
    Unified WhatsApp credential lookup that checks ALL storage locations.
    
    This is the production-grade credential resolver that handles multiple
    storage paths created by different onboarding flows.
    
    Lookup Priority:
    1. Facebook Embedded Signup (connected_phone_numbers → connected_facebook_accounts)
       - Most common for production users
       - Always up-to-date with Facebook's token system
       
    2. Onboarding Flow (whatsapp_connections table)
       - Legacy/manual onboarding path
       - May have manually entered tokens
    
    Args:
        firebase_uid: Firebase Auth UID (preferred - frontend identifier)
        supabase_user_id: Supabase internal user ID (optional)
        
    Returns:
        Dict with credentials:
        {
            'phone_number_id': str,
            'access_token': str,
            'display_phone_number': str,
            'business_name': str,
            'user_id': str,
            'source': 'facebook_embedded' | 'whatsapp_connections'
        }
        or None if not found
        
    Raises:
        No exceptions - returns None on any error
    """
    client = get_supabase_client()
    if not client:
        print("❌ [Credential Lookup] Supabase client not available")
        return None
    
    # Resolve Supabase user_id from Firebase UID if needed
    resolved_user_id = supabase_user_id
    
    if not resolved_user_id and firebase_uid:
        try:
            result = client.table('users').select('id').eq('firebase_uid', firebase_uid).single().execute()
            if result.data:
                resolved_user_id = result.data.get('id')
                print(f"🔗 [Credential Lookup] Firebase UID {firebase_uid[:15]}... → Supabase {resolved_user_id[:8]}...")
            else:
                print(f"⚠️ [Credential Lookup] No Supabase user found for Firebase UID: {firebase_uid[:15]}...")
        except Exception as e:
            print(f"⚠️ [Credential Lookup] Error resolving user ID: {e}")
    
    if not resolved_user_id:
        print("❌ [Credential Lookup] No user ID available for lookup")
        return None
    
    # ==========================================================================
    # METHOD 1: Facebook Embedded Signup (Primary)
    # ==========================================================================
    print(f"🔍 [Credential Lookup] Trying Facebook Embedded Signup path for user {resolved_user_id[:8]}...")
    
    try:
        # Step 1a: Find active phone number for this user
        phone_result = client.table('connected_phone_numbers').select(
            'id, phone_number_id, display_phone_number, whatsapp_account_id, is_active'
        ).eq('user_id', resolved_user_id).eq('is_active', True).limit(1).execute()
        
        if phone_result.data and len(phone_result.data) > 0:
            phone_data = phone_result.data[0]
            phone_number_id = phone_data.get('phone_number_id')
            whatsapp_account_id = phone_data.get('whatsapp_account_id')
            
            print(f"📱 [Credential Lookup] Found phone: {phone_data.get('display_phone_number')} (ID: {phone_number_id})")
            
            # Step 1b: Get WhatsApp account
            waba_result = client.table('connected_whatsapp_accounts').select(
                'id, waba_id, waba_name, business_manager_id'
            ).eq('id', whatsapp_account_id).eq('is_active', True).single().execute()
            
            if waba_result.data:
                business_manager_id = waba_result.data.get('business_manager_id')
                
                # Step 1c: Get Business Manager
                bm_result = client.table('connected_business_managers').select(
                    'id, business_name, facebook_account_id'
                ).eq('id', business_manager_id).eq('is_active', True).single().execute()
                
                if bm_result.data:
                    facebook_account_id = bm_result.data.get('facebook_account_id')
                    business_name = bm_result.data.get('business_name', 'Business')
                    
                    # Step 1d: Get Facebook account with access token
                    fb_result = client.table('connected_facebook_accounts').select(
                        'id, access_token, facebook_user_name, status'
                    ).eq('id', facebook_account_id).single().execute()
                    
                    if fb_result.data and fb_result.data.get('access_token'):
                        access_token = fb_result.data.get('access_token')
                        
                        # Decrypt token if needed
                        if CRYPTO_AVAILABLE and decrypt_token:
                            decrypted = decrypt_token(access_token)
                            if decrypted:
                                access_token = decrypted
                                print(f"🔓 [Credential Lookup] Token decrypted successfully")
                            else:
                                print(f"⚠️ [Credential Lookup] Token decryption failed, using as-is")
                        
                        print(f"✅ [Credential Lookup] SUCCESS via Facebook Embedded Signup: {business_name}")
                        
                        return {
                            'phone_number_id': phone_number_id,
                            'access_token': access_token,
                            'display_phone_number': phone_data.get('display_phone_number'),
                            'business_name': business_name,
                            'user_id': resolved_user_id,
                            'waba_id': waba_result.data.get('waba_id'),
                            'waba_name': waba_result.data.get('waba_name'),
                            'source': 'facebook_embedded',
                        }
    
    except Exception as e:
        print(f"⚠️ [Credential Lookup] Error in Facebook Embedded lookup: {e}")
    
    # ==========================================================================
    # METHOD 2: Onboarding Flow (Fallback)
    # ==========================================================================
    print(f"🔍 [Credential Lookup] Trying Onboarding whatsapp_connections path...")
    
    try:
        # First, get business_id for this user from the businesses table
        # The businesses table links to users via user_id (which is firebase_uid there)
        business_result = client.table('businesses').select(
            'id, business_name, user_id'
        ).eq('user_id', firebase_uid).limit(1).execute()
        
        if not business_result.data or len(business_result.data) == 0:
            # Try with supabase user_id as well
            business_result = client.table('businesses').select(
                'id, business_name, user_id'
            ).eq('user_id', resolved_user_id).limit(1).execute()
        
        if business_result.data and len(business_result.data) > 0:
            business_data = business_result.data[0]
            business_id = business_data.get('id')
            business_name = business_data.get('business_name', 'Business')
            
            print(f"🏢 [Credential Lookup] Found business: {business_name} (ID: {business_id[:8]}...)")
            
            # Get WhatsApp connection for this business
            conn_result = client.table('whatsapp_connections').select(
                'phone_number, phone_number_id, api_token, status'
            ).eq('business_id', business_id).single().execute()
            
            if conn_result.data:
                conn = conn_result.data
                phone_number_id = conn.get('phone_number_id')
                api_token = conn.get('api_token')
                
                if phone_number_id and api_token:
                    # Decrypt token if needed
                    access_token = api_token
                    if CRYPTO_AVAILABLE and decrypt_token:
                        decrypted = decrypt_token(api_token)
                        if decrypted:
                            access_token = decrypted
                            print(f"🔓 [Credential Lookup] Token decrypted successfully")
                        else:
                            print(f"⚠️ [Credential Lookup] Token decryption failed, using as-is")
                    
                    print(f"✅ [Credential Lookup] SUCCESS via whatsapp_connections: {business_name}")
                    
                    return {
                        'phone_number_id': phone_number_id,
                        'access_token': access_token,
                        'display_phone_number': conn.get('phone_number'),
                        'business_name': business_name,
                        'user_id': resolved_user_id,
                        'source': 'whatsapp_connections',
                    }
                else:
                    print(f"⚠️ [Credential Lookup] Incomplete credentials in whatsapp_connections")
        else:
            print(f"⚠️ [Credential Lookup] No business found for user")
            
    except Exception as e:
        # PGRST116 means no rows found (expected for new users)
        if 'PGRST116' not in str(e):
            print(f"⚠️ [Credential Lookup] Error in whatsapp_connections lookup: {e}")
    
    print(f"❌ [Credential Lookup] No credentials found in any location for user {resolved_user_id[:8]}...")
    return None


def get_credentials_by_phone_number_id(phone_number_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch WhatsApp credentials for a given phone_number_id.
    
    Lookup chain:
    connected_phone_numbers → connected_whatsapp_accounts → 
    connected_business_managers → connected_facebook_accounts
    
    Args:
        phone_number_id: The WhatsApp phone number ID from webhook metadata
        
    Returns:
        Dict with 'access_token', 'phone_number_id', 'user_id', etc. or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        # Step 1: Find phone number record
        phone_result = client.table('connected_phone_numbers').select(
            'id, phone_number_id, display_phone_number, user_id, whatsapp_account_id, is_active'
        ).eq('phone_number_id', phone_number_id).eq('is_active', True).single().execute()
        
        if not phone_result.data:
            print(f"⚠️ Phone number ID {phone_number_id} not found in database")
            return None
        
        phone_data = phone_result.data
        whatsapp_account_id = phone_data.get('whatsapp_account_id')
        user_id = phone_data.get('user_id')
        
        print(f"📱 Found phone: {phone_data.get('display_phone_number')} for user {user_id}")
        
        # Step 2: Get WhatsApp account
        waba_result = client.table('connected_whatsapp_accounts').select(
            'id, waba_id, waba_name, business_manager_id'
        ).eq('id', whatsapp_account_id).eq('is_active', True).single().execute()
        
        if not waba_result.data:
            print(f"⚠️ WhatsApp account not found for phone {phone_number_id}")
            return None
        
        business_manager_id = waba_result.data.get('business_manager_id')
        
        # Step 3: Get Business Manager
        bm_result = client.table('connected_business_managers').select(
            'id, business_name, facebook_account_id'
        ).eq('id', business_manager_id).eq('is_active', True).single().execute()
        
        if not bm_result.data:
            print(f"⚠️ Business manager not found")
            return None
        
        facebook_account_id = bm_result.data.get('facebook_account_id')
        business_name = bm_result.data.get('business_name')
        
        # Step 4: Get Facebook account with access token
        fb_result = client.table('connected_facebook_accounts').select(
            'id, access_token, facebook_user_name, status'
        ).eq('id', facebook_account_id).single().execute()
        
        if not fb_result.data:
            print(f"⚠️ Facebook account not found")
            return None
        
        access_token = fb_result.data.get('access_token')
        
        if not access_token:
            print(f"⚠️ Access token is empty for business: {business_name}")
            return None
        
        # Debug: Show encrypted token info
        token_preview = f"{access_token[:20]}...{access_token[-10:]}" if len(access_token) > 30 else "[short token]"
        print(f"🔐 Encrypted token from DB: {token_preview} (length: {len(access_token)})")
        
        # Decrypt the token if crypto is available
        if CRYPTO_AVAILABLE and decrypt_token:
            decrypted = decrypt_token(access_token)
            if decrypted:
                access_token = decrypted
                print(f"🔓 Token decrypted successfully (starts with: {access_token[:10]}...)")
            else:
                print(f"❌ Failed to decrypt token for business: {business_name}")
                return None
        else:
            print(f"⚠️ Crypto not available, using token as-is")
        
        print(f"✅ Found credentials for business: {business_name}")
        
        return {
            'phone_number_id': phone_number_id,
            'display_phone_number': phone_data.get('display_phone_number'),
            'access_token': access_token,
            'user_id': str(user_id),
            'business_name': business_name,
            'waba_id': waba_result.data.get('waba_id'),
            'waba_name': waba_result.data.get('waba_name'),
        }
        
    except Exception as e:
        print(f"❌ Error fetching credentials: {e}")
        return None


def get_credentials_for_user(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch WhatsApp credentials for a given user_id.
    This is used when sending messages from the dashboard.
    
    Args:
        user_id: The Supabase user UUID
        
    Returns:
        Dict with 'access_token', 'phone_number_id', etc. or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        # Step 1: Find active phone number for this user
        phone_result = client.table('connected_phone_numbers').select(
            'id, phone_number_id, display_phone_number, whatsapp_account_id'
        ).eq('user_id', user_id).eq('is_active', True).limit(1).execute()
        
        if not phone_result.data or len(phone_result.data) == 0:
            print(f"⚠️ No active phone number found for user {user_id}")
            return None
        
        phone_data = phone_result.data[0]
        phone_number_id = phone_data.get('phone_number_id')
        
        # Use the existing function to get full credentials
        return get_credentials_by_phone_number_id(phone_number_id)
        
    except Exception as e:
        print(f"❌ Error fetching credentials for user: {e}")
        return None



def get_firebase_uid_from_user_id(user_id: str) -> Optional[str]:
    """
    Get Firebase UID from Supabase internal user_id.
    
    The connected_phone_numbers table stores Supabase's internal UUID as user_id,
    but Firestore stores business data under Firebase Auth UID.
    
    Args:
        user_id: Supabase internal user UUID
        
    Returns:
        Firebase UID string or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table('users').select('firebase_uid').eq('id', user_id).single().execute()
        
        if result.data:
            firebase_uid = result.data.get('firebase_uid')
            print(f"🔗 Mapped Supabase user {user_id[:8]}... → Firebase UID {firebase_uid[:10] if firebase_uid else 'None'}...")
            return firebase_uid
    except Exception as e:
        print(f"⚠️ Could not get Firebase UID for user {user_id}: {e}")
    
    return None


def get_user_id_from_firebase_uid(firebase_uid: str) -> Optional[str]:
    """
    Get Supabase user ID from Firebase UID.
    
    The frontend uses Firebase Auth, which provides Firebase UID.
    But Supabase tables (like subscriptions) reference auth.users(id) which is the Supabase UUID.
    
    Args:
        firebase_uid: Firebase Auth UID
        
    Returns:
        Supabase user UUID string or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table('users').select('id').eq('firebase_uid', firebase_uid).single().execute()
        
        if result.data:
            user_id = result.data.get('id')
            print(f"🔗 Mapped Firebase UID {firebase_uid[:10]}... → Supabase user {user_id[:8] if user_id else 'None'}...")
            return user_id
    except Exception as e:
        print(f"⚠️ Could not get Supabase user ID for Firebase UID {firebase_uid}: {e}")
    
    return None


def get_business_data_for_user(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch business data for AI context based on user_id.
    This can be extended to include products, services, FAQ, etc.
    
    Args:
        user_id: The user ID from the phone number lookup
        
    Returns:
        Business data dict for AI Brain context
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        # Get business manager info for the user
        result = client.table('connected_business_managers').select(
            'business_name, business_email, business_vertical'
        ).eq('user_id', user_id).eq('is_active', True).single().execute()
        
        if result.data:
            return {
                'business_id': user_id,
                'business_name': result.data.get('business_name', 'Our Business'),
                'industry': result.data.get('business_vertical') or 'other',
                'contact': {'email': result.data.get('business_email', '')},
                'products_services': [],  # Can be extended to fetch from another table
            }
    except Exception as e:
        print(f"⚠️ Could not fetch business data: {e}")
    
    return None


def get_phone_number_uuid(phone_number_id: str) -> Optional[str]:
    """
    Get the UUID of a phone number record from its Meta phone_number_id.
    
    Args:
        phone_number_id: The Meta phone number ID (e.g., '829493816924844')
        
    Returns:
        The UUID of the phone number record or None
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table('connected_phone_numbers').select('id').eq(
            'phone_number_id', phone_number_id
        ).single().execute()
        
        if result.data:
            return result.data.get('id')
    except Exception as e:
        print(f"⚠️ Could not get phone number UUID: {e}")
    
    return None


def get_business_id_for_user(user_id: str) -> Optional[str]:
    """
    Get the business_id (connected_business_managers.id) for a user.
    
    Args:
        user_id: The user UUID
        
    Returns:
        The business manager UUID or None
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table('connected_business_managers').select('id').eq(
            'user_id', user_id
        ).eq('is_active', True).single().execute()
        
        if result.data:
            return result.data.get('id')
    except Exception as e:
        print(f"⚠️ Could not get business ID: {e}")
    
    return None


def get_ai_capabilities_from_supabase(firebase_uid: str) -> Optional[Dict[str, Any]]:
    """
    Load AI capabilities/settings from Supabase ai_capabilities table.
    
    This is used when Firestore business data is not available.
    The ai_capabilities table stores settings like:
    - appointment_booking_enabled
    - appointment_fields
    - appointment_business_hours
    - order_booking_enabled
    - order_fields
    - products_enabled
    
    Args:
        firebase_uid: The Firebase UID (same as used in frontend)
        
    Returns:
        AI capabilities dict or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table('ai_capabilities').select('*').eq(
            'user_id', firebase_uid
        ).single().execute()
        
        if result.data:
            print(f"✅ Loaded AI capabilities from Supabase for user: {firebase_uid[:15]}...")
            return result.data
        else:
            print(f"⚠️ No AI capabilities found in Supabase for user: {firebase_uid[:15]}...")
    except Exception as e:
        # PGRST116 = no rows returned (user doesn't have settings yet)
        if 'PGRST116' not in str(e):
            print(f"⚠️ Could not load AI capabilities: {e}")
    
    return None


def get_business_data_from_supabase(firebase_uid: str, credentials: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
    """
    Build business data from Supabase sources when Firestore is not available.
    
    Combines:
    1. AI capabilities from ai_capabilities table
    2. Business info from connected_business_managers
    3. Credentials info (if provided)
    
    Args:
        firebase_uid: The Firebase UID
        credentials: Optional WhatsApp credentials dict
        
    Returns:
        Business data dict compatible with AI Brain format
    """
    # Load AI capabilities
    ai_caps = get_ai_capabilities_from_supabase(firebase_uid)
    
    # Get business info from connected_business_managers
    client = get_supabase_client()
    business_info = None
    razorpay_settings = None
    
    if client:
        try:
            # Get user_id from firebase_uid first
            user_id = get_user_id_from_firebase_uid(firebase_uid)
            if user_id:
                # fetch business_info
                result = client.table('connected_business_managers').select(
                    'id, business_name, business_email'
                ).eq('user_id', user_id).eq('is_active', True).limit(1).execute()
                
                if result.data:
                    business_info = result.data[0]
            
            # Fetch Razorpay keys from businesses table using firebase_uid
            # The businesses table uses firebase_uid directly as user_id column
            biz_result = client.table('businesses').select(
                'razorpay_key_id, razorpay_key_secret, payments_enabled'
            ).eq('user_id', firebase_uid).single().execute()
            
            if biz_result.data:
                razorpay_settings = biz_result.data
                print(f"💰 Loaded Razorpay settings for user: {firebase_uid[:10]}...")
                
        except Exception as e:
            print(f"⚠️ Could not load business/payment info from Supabase: {e}")
    
    # Determine business name with priority:
    # 1. Business info from connected_business_managers
    # 2. Credentials
    # 3. Default
    business_name = 'Our Business'
    if business_info and business_info.get('business_name'):
        business_name = business_info['business_name']
    elif credentials and credentials.get('business_name'):
        business_name = credentials['business_name']
    
    # Build business data
    business_data = {
        'business_id': firebase_uid,
        'business_name': business_name,
        'industry': 'other',
        'description': '',
        'contact': {
            'phone': credentials.get('display_phone_number', '') if credentials else '',
            'email': business_info.get('business_email', '') if business_info else '',
        },
        'location': {},
        'timings': {},
        'products_services': [],
        'policies': {},
        'faqs': [],
        'social_media': {},
        'categories': [],
        'payment_settings': {
            'enabled': razorpay_settings.get('payments_enabled', False) if razorpay_settings else False,
            'key_id': razorpay_settings.get('razorpay_key_id') if razorpay_settings else None,
            'key_secret': razorpay_settings.get('razorpay_key_secret') if razorpay_settings else None,
        }
    }
    
    # Merge AI capabilities if available
    if ai_caps:
        business_data['ai_capabilities'] = {
            'appointment_booking_enabled': ai_caps.get('appointment_booking_enabled', False),
            'appointment_fields': ai_caps.get('appointment_fields', []),
            'appointment_business_hours': ai_caps.get('appointment_business_hours', {}),
            'appointment_minimal_mode': ai_caps.get('appointment_minimal_mode', False),
            'appointment_services': ai_caps.get('appointment_services', []),
            'order_booking_enabled': ai_caps.get('order_booking_enabled', False),
            'order_fields': ai_caps.get('order_fields', []),
            'order_minimal_mode': ai_caps.get('order_minimal_mode', False),
            'products_enabled': ai_caps.get('products_enabled', False),
        }
        print(f"📋 AI Capabilities: appointment={ai_caps.get('appointment_booking_enabled')}, order={ai_caps.get('order_booking_enabled')}")
    
    return business_data


def get_or_create_conversation(
    business_id: str,
    customer_phone: str,
    customer_name: Optional[str] = None
) -> Optional[str]:
    """
    Get existing conversation or create new one.
    
    Args:
        business_id: The business manager UUID
        customer_phone: Customer's phone number
        customer_name: Optional customer name
        
    Returns:
        The conversation UUID or None
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        # Try to find existing conversation
        result = client.table('whatsapp_conversations').select('id').eq(
            'business_id', business_id
        ).eq('customer_phone', customer_phone).single().execute()
        
        if result.data:
            return result.data.get('id')
    except Exception as e:
        # PGRST116 means no rows found, which is expected for new conversations
        if 'PGRST116' not in str(e):
            print(f"⚠️ Error finding conversation: {e}")
    
    # Create new conversation
    try:
        from datetime import datetime
        new_conv = {
            'business_id': business_id,
            'customer_phone': customer_phone,
            'customer_name': customer_name,
            'total_messages': 0,
            'unread_count': 0,
            'status': 'active',
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
        }
        
        result = client.table('whatsapp_conversations').insert(new_conv).execute()
        
        if result.data:
            print(f"📝 Created new conversation for {customer_phone}")
            return result.data[0].get('id')
    except Exception as e:
        # Handle race condition - conversation might have been created by another request
        if 'duplicate' in str(e).lower() or '23505' in str(e):
            try:
                result = client.table('whatsapp_conversations').select('id').eq(
                    'business_id', business_id
                ).eq('customer_phone', customer_phone).single().execute()
                if result.data:
                    return result.data.get('id')
            except:
                pass
        print(f"❌ Error creating conversation: {e}")
    
    return None


def update_conversation_stats(
    conversation_id: str,
    direction: str,
    message_preview: Optional[str] = None,
    is_ai_generated: bool = False
) -> None:
    """
    Update conversation statistics after a new message.
    
    Args:
        conversation_id: The conversation UUID
        direction: 'inbound' or 'outbound'
        message_preview: Preview text for last message
        is_ai_generated: Whether the message was AI-generated
    """
    client = get_supabase_client()
    if not client or not conversation_id:
        return
    
    try:
        from datetime import datetime
        
        # Get current stats
        result = client.table('whatsapp_conversations').select(
            'total_messages, unread_count, ai_replies_count, human_replies_count'
        ).eq('id', conversation_id).single().execute()
        
        if not result.data:
            return
            
        current = result.data
        updates = {
            'total_messages': (current.get('total_messages') or 0) + 1,
            'last_message_at': datetime.utcnow().isoformat(),
            'last_message_direction': direction,
            'updated_at': datetime.utcnow().isoformat(),
        }
        
        if message_preview:
            updates['last_message_preview'] = message_preview[:100]  # Limit preview length
        
        if direction == 'inbound':
            updates['unread_count'] = (current.get('unread_count') or 0) + 1
        elif direction == 'outbound':
            if is_ai_generated:
                updates['ai_replies_count'] = (current.get('ai_replies_count') or 0) + 1
            else:
                updates['human_replies_count'] = (current.get('human_replies_count') or 0) + 1
        
        client.table('whatsapp_conversations').update(updates).eq('id', conversation_id).execute()
        
    except Exception as e:
        print(f"⚠️ Could not update conversation stats: {e}")


def store_message(
    user_id: str,
    phone_number_id: str,
    message_id: str,
    direction: str,
    from_number: str,
    to_number: str,
    message_type: str,
    message_body: Optional[str] = None,
    status: str = 'sent',
    contact_name: Optional[str] = None,
    wamid: Optional[str] = None,
    media_url: Optional[str] = None,
    media_id: Optional[str] = None,
    conversation_origin: Optional[str] = None,
    is_ai_generated: bool = False
) -> Optional[Dict[str, Any]]:
    """
    Store a WhatsApp message in the database.
    Uses the correct schema with conversation_id, business_id, wamid, content.
    
    Args:
        user_id: The user UUID
        phone_number_id: The Meta phone number ID
        message_id: The WhatsApp message ID (wamid)
        direction: 'inbound' or 'outbound'
        from_number: Sender phone number
        to_number: Recipient phone number
        message_type: 'text', 'image', 'audio', etc.
        message_body: Text content of the message
        status: Message status ('sent', 'delivered', 'read', 'failed')
        contact_name: Name of the contact (from WhatsApp profile)
        wamid: WhatsApp message ID (same as message_id)
        media_url: URL for media messages
        media_id: Meta media ID
        conversation_origin: 'user_initiated' or 'business_initiated'
        is_ai_generated: Whether this is an AI-generated response
        
    Returns:
        The created message record or None on error
    """
    client = get_supabase_client()
    if not client:
        print("⚠️ Supabase client not available, cannot store message")
        return None
    
    try:
        # Get business_id from user_id
        business_id = get_business_id_for_user(user_id)
        if not business_id:
            print(f"⚠️ No business found for user {user_id}")
            return None
        
        # Determine customer phone (the external party)
        customer_phone = from_number if direction == 'inbound' else to_number
        
        # Get or create conversation
        conversation_id = get_or_create_conversation(
            business_id=business_id,
            customer_phone=customer_phone,
            customer_name=contact_name
        )
        
        if not conversation_id:
            print(f"⚠️ Could not get/create conversation for {customer_phone}")
            return None
        
        # Build message data using correct schema columns
        message_data = {
            'conversation_id': conversation_id,
            'business_id': business_id,
            'wamid': wamid or message_id,
            'direction': direction,
            'message_type': message_type,
            'content': message_body,  # Schema uses 'content' not 'message_body'
            'status': status,
            'is_ai_generated': is_ai_generated,
        }
        
        # Add media fields if present
        if media_url:
            message_data['media_url'] = media_url
        if media_id:
            message_data['media_id'] = media_id
        
        # Insert message
        result = client.table('whatsapp_messages').insert(message_data).execute()
        
        if result.data:
            print(f"💾 Message stored: {(wamid or message_id)[:20]}... ({direction})")
            
            # Update conversation stats
            update_conversation_stats(
                conversation_id=conversation_id,
                direction=direction,
                message_preview=message_body,
                is_ai_generated=is_ai_generated
            )
            
            # Update daily analytics in real-time
            update_analytics_daily(
                user_id=user_id,
                direction=direction,
                is_ai_generated=is_ai_generated
            )
            
            return result.data[0]
        else:
            print(f"⚠️ Message insert returned no data")
            return None
            
    except Exception as e:
        # Check if it's a duplicate message (already exists)
        if 'duplicate' in str(e).lower() or '23505' in str(e):
            print(f"⏭️ Message already exists: {(wamid or message_id)[:20]}...")
            return None
        print(f"❌ Error storing message: {e}")
        import traceback
        traceback.print_exc()
        return None


def update_analytics_daily(
    user_id: str,
    direction: str,
    is_ai_generated: bool = False,
    status: str = None
) -> None:
    """
    Update analytics_daily counters in real-time when a message is processed.
    
    Args:
        user_id: The user UUID
        direction: 'inbound' or 'outbound'
        is_ai_generated: Whether this is an AI-generated response
        status: Message status for updating delivery/read counts
    """
    client = get_supabase_client()
    if not client:
        return
    
    try:
        from datetime import datetime, date
        today = date.today().isoformat()
        
        # Build increment fields based on message type
        increments = {}
        if direction == 'inbound':
            increments['messages_received'] = 1
        elif direction == 'outbound':
            increments['messages_sent'] = 1
            if is_ai_generated:
                increments['ai_replies_generated'] = 1
        
        # Handle status updates (delivered, read, failed)
        if status == 'delivered':
            increments['messages_delivered'] = 1
        elif status == 'read':
            increments['messages_read'] = 1
        elif status == 'failed':
            increments['messages_failed'] = 1
        
        if not increments:
            return
        
        # Try to get existing record for today
        result = client.table('analytics_daily').select('*').eq(
            'user_id', user_id
        ).eq('date', today).execute()
        
        if result.data:
            # Update existing record
            existing = result.data[0]
            updates = {}
            for key, val in increments.items():
                updates[key] = (existing.get(key, 0) or 0) + val
            updates['updated_at'] = datetime.utcnow().isoformat()
            client.table('analytics_daily').update(updates).eq('id', existing['id']).execute()
            print(f"📊 Analytics updated: {increments}")
        else:
            # Insert new row for today
            new_row = {
                'user_id': user_id,
                'date': today,
                **{k: v for k, v in increments.items()},
            }
            client.table('analytics_daily').insert(new_row).execute()
            print(f"📊 Analytics created for {today}: {increments}")
            
    except Exception as e:
        # Don't fail the main operation if analytics update fails
        print(f"⚠️ Could not update analytics: {e}")


def update_message_status(
    message_id: str,
    status: str,
    timestamp: Optional[str] = None
) -> bool:
    """
    Update the status of a message.
    Uses correct schema: wamid for lookup, status_updated_at for timestamp.
    Also updates analytics for delivered/read/failed statuses.
    
    Args:
        message_id: The WhatsApp message ID (wamid)
        status: New status ('sent', 'delivered', 'read', 'failed')
        timestamp: ISO timestamp of the status update
        
    Returns:
        True if updated, False otherwise
    """
    client = get_supabase_client()
    if not client:
        return False
    
    try:
        update_data = {'status': status}
        
        # Use status_updated_at for all status changes (schema only has this column)
        if timestamp:
            update_data['status_updated_at'] = timestamp
        
        # Query by wamid (not message_id which doesn't exist)
        # Also select business_id for analytics update
        result = client.table('whatsapp_messages').update(update_data).eq(
            'wamid', message_id
        ).execute()
        
        if result.data:
            print(f"📊 Message status updated: {message_id[:20]}... -> {status}")
            
            # Update analytics for delivered/read/failed statuses
            if status in ('delivered', 'read', 'failed'):
                # Get the message to find related user
                msg_result = client.table('whatsapp_messages').select(
                    'business_id'
                ).eq('wamid', message_id).execute()
                
                if msg_result.data:
                    business_id = msg_result.data[0].get('business_id')
                    if business_id:
                        # Get user_id from business
                        bm_result = client.table('connected_business_managers').select(
                            'user_id'
                        ).eq('id', business_id).execute()
                        
                        if bm_result.data:
                            user_id = bm_result.data[0].get('user_id')
                            if user_id:
                                update_analytics_daily(
                                    user_id=str(user_id),
                                    direction='outbound',
                                    status=status
                                )
            
            return True
        return False
        
    except Exception as e:
        print(f"⚠️ Could not update message status: {e}")
        return False


def get_user_push_tokens(user_id: str) -> list[str]:
    """
    Fetch all active FCM push tokens for a user.
    
    Args:
        user_id: The Supabase user UUID (NOT Firebase UID)
        
    Returns:
        List of FCM token strings
    """
    client = get_supabase_client()
    if not client:
        return []
    
    try:
        # Fetch tokens from push_subscriptions table
        # NOTE: user_id MUST be a Supabase UUID, not Firebase UID
        result = client.table('push_subscriptions').select('fcm_token').eq(
            'user_id', user_id
        ).execute()
        
        if result.data:
            tokens = [row.get('fcm_token') for row in result.data if row.get('fcm_token')]
            print(f"🔑 Found {len(tokens)} push tokens for user {user_id[:8]}...")
            return tokens
    except Exception as e:
        error_str = str(e)
        if 'invalid input syntax for type uuid' in error_str:
            print(f"⚠️ Error fetching push tokens for user {user_id}: {e}")
            print(f"   Hint: user_id appears to be Firebase UID, not Supabase UUID. Notifications skipped.")
        else:
            print(f"⚠️ Error fetching push tokens for user {user_id}: {e}")
        
    return []

def delete_push_token(token: str) -> bool:
    """
    Remove an invalid or expired push token from the database.
    
    Args:
        token: The FCM token to remove
        
    Returns:
        True if deleted, False otherwise
    """
    client = get_supabase_client()
    if not client:
        return False
    
    try:
        client.table('push_subscriptions').delete().eq('fcm_token', token).execute()
        print(f"🗑️ Deleted push token {token[:10]}...")
        return True
    except Exception as e:
        print(f"⚠️ Error deleting push token: {e}")
        return False


# =============================================================================
# Businesses Table Functions (New consolidated storage)
# =============================================================================

def get_business_from_supabase(firebase_uid: str) -> Optional[Dict[str, Any]]:
    """
    Get business data from the new consolidated businesses table.
    Also fetches categories and products from normalized tables.
    
    Args:
        firebase_uid: The Firebase UID
        
    Returns:
        Business data dict or None
    """
    client = get_supabase_client()
    if not client:
        return None
    
    try:
        result = client.table('businesses').select('*').eq(
            'user_id', firebase_uid
        ).single().execute()
        
        if result.data:
            print(f"✅ Loaded business from Supabase businesses table: {result.data.get('business_name', 'Unknown')}")
            
            # Fetch categories from the separate product_categories table
            try:
                categories_result = client.table('product_categories').select('id, name').eq(
                    'user_id', firebase_uid
                ).eq('is_active', True).order('sort_order').execute()
                
                if categories_result.data:
                    category_names = [cat.get('name') for cat in categories_result.data if cat.get('name')]
                    print(f"📂 Loaded {len(category_names)} categories from product_categories table: {category_names}")
                    # Add categories to product_categories field
                    result.data['product_categories'] = category_names
                else:
                    print(f"⚠️ No categories found in product_categories table for user: {firebase_uid[:15]}...")
                    result.data['product_categories'] = []
            except Exception as cat_err:
                print(f"⚠️ Error loading categories: {cat_err}")
                result.data['product_categories'] = []
            
            # Fetch products from the normalized products table WITH variants
            try:
                products_result = client.table('products').select(
                    'id, name, description, sku, brand, price, compare_at_price, price_unit, '
                    'image_url, sizes, colors, materials, tags, duration, '
                    'is_available, stock_quantity, stock_status, '
                    'has_size_pricing, size_prices, size_stocks, '
                    'category_id, product_categories(name), '
                    'product_variants(id, color, size, price, compare_at_price, stock_quantity, '
                    'image_url, image_public_id, has_size_pricing, size_prices, size_stocks, is_available)'
                ).eq('user_id', firebase_uid).eq('is_deleted', False).order('name').execute()
                
                if products_result.data:
                    print(f"📦 Loaded {len(products_result.data)} products from normalized products table")
                    # Store the fetched products in the result data
                    result.data['products'] = products_result.data
                    
                    # Log first few products for debugging
                    for i, p in enumerate(products_result.data[:3]):
                        cat_name = p.get('product_categories', {}).get('name', 'No category') if p.get('product_categories') else 'No category'
                        img_status = "✅" if p.get('image_url') else "❌"
                        current_price = p.get('price', 0)
                        original_price = p.get('compare_at_price')
                        
                        if original_price and original_price > current_price:
                            price_display = f"Original: ₹{original_price}, Offer: ₹{current_price}"
                        else:
                            price_display = f"₹{current_price}"
                        
                        print(f"   Product {i+1}: {p.get('name')} | Category: {cat_name} | Image: {img_status} | Price: {price_display}")
                else:
                    print(f"⚠️ No products found in products table for user: {firebase_uid[:15]}...")
                    result.data['products'] = []
            except Exception as prod_err:
                print(f"⚠️ Error loading products: {prod_err}")
                import traceback
                traceback.print_exc()
                result.data['products'] = []
            
            return convert_supabase_business_to_ai_format(result.data)
    except Exception as e:
        # PGRST116 = no rows returned (user doesn't have data yet)
        if 'PGRST116' not in str(e):
            print(f"⚠️ Error loading business from Supabase: {e}")
    
    return None


def save_business_to_supabase(firebase_uid: str, business_data: Dict[str, Any]) -> bool:
    """
    Save/update business data in the Supabase businesses table.
    
    Args:
        firebase_uid: The Firebase UID
        business_data: The business data to save (frontend format)
        
    Returns:
        True if saved successfully
    """
    client = get_supabase_client()
    if not client:
        return False
    
    try:
        # Convert from frontend camelCase to database snake_case
        db_data = {
            'user_id': firebase_uid,
            'business_name': business_data.get('businessName', business_data.get('business_name', '')),
            'industry': business_data.get('industry', ''),
            'custom_industry': business_data.get('customIndustry', business_data.get('custom_industry', '')),
            'description': business_data.get('description', ''),
            'contact': business_data.get('contact', {}),
            'social_media': business_data.get('socialMedia', business_data.get('social_media', {})),
            'location': business_data.get('location', {}),
            'timings': business_data.get('timings', {}),
            'products': business_data.get('products', []),
            'product_categories': business_data.get('productCategories', business_data.get('product_categories', [])),
            'policies': business_data.get('policies', {}),
            'ecommerce_policies': business_data.get('ecommercePolicies', business_data.get('ecommerce_policies', {})),
            'faqs': business_data.get('faqs', []),
            'brand_voice': business_data.get('brandVoice', business_data.get('brand_voice', {})),
        }
        
        # Upsert - insert or update
        result = client.table('businesses').upsert(
            db_data,
            on_conflict='user_id'
        ).execute()
        
        if result.data:
            print(f"💾 Saved business data to Supabase for user: {firebase_uid[:15]}...")
            return True
        return False
        
    except Exception as e:
        print(f"❌ Error saving business to Supabase: {e}")
        return False


def convert_supabase_business_to_ai_format(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert Supabase businesses table format to AI Brain expected format.
    
    Args:
        data: Database row from businesses table
        
    Returns:
        Business data dict in AI Brain format
    """
    products = data.get('products', [])
    
    # Convert products to AI format
    converted_products = []
    for p in products:
        if not isinstance(p, dict):
            continue
        
        # Extract category name from the joined product_categories table
        # The join returns: product_categories: {name: "Category Name"}
        category_name = ''
        if p.get('product_categories') and isinstance(p.get('product_categories'), dict):
            category_name = p.get('product_categories', {}).get('name', '')
        elif p.get('category'):
            # Fallback to legacy 'category' field if present
            category_name = p.get('category', '')
        
        # Handle both is_available (normalized table) and available (legacy)
        is_available = p.get('is_available', p.get('available', True))
        
        # Handle pricing: Frontend convention is:
        # - price = current selling price (offer/discounted price)
        # - compare_at_price = original price (before discount)
        # 
        # IMPORTANT: Check if prices are swapped (compare_at_price < price means they're backwards)
        # If swapped, we need to correct them
        price_raw = p.get('price', 0)
        compare_at_price_raw = p.get('compare_at_price')
        
        # Convert to floats for comparison
        try:
            price_float = float(price_raw) if price_raw else 0.0
            compare_at_float = float(compare_at_price_raw) if compare_at_price_raw else None
        except (ValueError, TypeError):
            price_float = float(price_raw) if price_raw else 0.0
            compare_at_float = None
        
        # Debug logging
        print(f"🔍 Product: {p.get('name')} - price (raw): {price_raw}, compare_at_price (raw): {compare_at_price_raw}")
        print(f"   Converted: price={price_float}, compare_at={compare_at_float}")
        
        # Check if prices are swapped (compare_at_price < price means original < offer, which is wrong)
        # In correct e-commerce: compare_at_price (original) > price (offer)
        if compare_at_float is not None and compare_at_float > 0:
            if compare_at_float < price_float:
                # Prices are SWAPPED - fix them
                print(f"   ⚠️ Prices are SWAPPED! compare_at ({compare_at_float}) < price ({price_float})")
                print(f"   🔄 Swapping: original_price={price_float}, offer_price={compare_at_float}")
                original_price = price_float  # The higher value is the original
                current_price = compare_at_float  # The lower value is the offer
            else:
                # Prices are correct
                print(f"   ✅ Prices are correct: original={compare_at_float}, offer={price_float}")
                original_price = compare_at_float
                current_price = price_float
        else:
            # No compare_at_price, use price as current selling price
            print(f"   ℹ️ No compare_at_price, using price as current: {price_float}")
            original_price = None
            current_price = price_float
        
        # Handle size-based pricing (JSONB fields may come as strings)
        has_size_pricing = p.get('has_size_pricing', False)
        size_prices_raw = p.get('size_prices', {})
        size_stocks_raw = p.get('size_stocks', {})
        
        # Parse JSONB if it came as string
        if isinstance(size_prices_raw, str):
            try:
                import json
                size_prices = json.loads(size_prices_raw) if size_prices_raw else {}
            except:
                size_prices = {}
        else:
            size_prices = size_prices_raw or {}
        
        if isinstance(size_stocks_raw, str):
            try:
                import json
                size_stocks = json.loads(size_stocks_raw) if size_stocks_raw else {}
            except:
                size_stocks = {}
        else:
            size_stocks = size_stocks_raw or {}
        
        # Process variants from product_variants join
        variants_raw = p.get('product_variants', []) or []
        converted_variants = []
        
        for v in variants_raw:
            if not isinstance(v, dict):
                continue
            
            # Skip deleted variants
            if v.get('is_deleted', False):
                continue
            
            # Handle variant size pricing
            v_has_size_pricing = v.get('has_size_pricing', False)
            v_size_prices_raw = v.get('size_prices', {})
            v_size_stocks_raw = v.get('size_stocks', {})
            
            # Parse JSONB if it came as string
            if isinstance(v_size_prices_raw, str):
                try:
                    import json
                    v_size_prices = json.loads(v_size_prices_raw) if v_size_prices_raw else {}
                except:
                    v_size_prices = {}
            else:
                v_size_prices = v_size_prices_raw or {}
            
            if isinstance(v_size_stocks_raw, str):
                try:
                    import json
                    v_size_stocks = json.loads(v_size_stocks_raw) if v_size_stocks_raw else {}
                except:
                    v_size_stocks = {}
            else:
                v_size_stocks = v_size_stocks_raw or {}
            
            # Handle variant pricing - check for swapped prices
            v_price_raw = v.get('price')
            v_compare_at_price_raw = v.get('compare_at_price')
            
            # Convert to floats
            v_price_float = None
            v_compare_at_float = None
            try:
                v_price_float = float(v_price_raw) if v_price_raw else None
                v_compare_at_float = float(v_compare_at_price_raw) if v_compare_at_price_raw else None
            except (ValueError, TypeError):
                v_price_float = float(v_price_raw) if v_price_raw else None
                v_compare_at_float = None
            
            # Check if variant prices are swapped (same logic as product)
            if v_compare_at_float is not None and v_price_float is not None:
                if v_compare_at_float < v_price_float:
                    # Prices are SWAPPED - fix them
                    print(f"   ⚠️ Variant prices SWAPPED! compare_at ({v_compare_at_float}) < price ({v_price_float})")
                    print(f"   🔄 Swapping variant: original={v_price_float}, offer={v_compare_at_float}")
                    v_compare_at_price = v_price_float  # Higher value is original
                    v_price = v_compare_at_float  # Lower value is offer
                else:
                    # Prices are correct
                    v_price = v_price_float
                    v_compare_at_price = v_compare_at_float
            elif v_price_float:
                v_price = v_price_float
                v_compare_at_price = None
            else:
                # Fallback to base product price
                v_price = current_price
                v_compare_at_price = original_price
            
            converted_variants.append({
                'id': str(v.get('id', '')),
                'color': v.get('color', ''),
                'size': v.get('size', ''),
                'price': v_price if v_price else current_price,  # Fallback to base product price
                'compare_at_price': v_compare_at_price,
                'stock': v.get('stock_quantity', 0),
                'imageUrl': v.get('image_url', ''),
                'imagePublicId': v.get('image_public_id', ''),
                'has_size_pricing': v_has_size_pricing,
                'size_prices': v_size_prices,
                'size_stocks': v_size_stocks,
                'is_available': v.get('is_available', True),
            })
        
        converted_products.append({
            'id': str(p.get('id', '')),
            'sku': p.get('sku', ''),
            'name': p.get('name', ''),
            'category': category_name,
            'description': p.get('description', ''),
            'price': current_price,  # Current selling price (offer price)
            'compare_at_price': original_price,  # Original price (before discount, if on sale)
            'price_unit': p.get('price_unit', p.get('priceUnit', 'INR')),
            'duration': p.get('duration', ''),
            'available': is_available,
            'sizes': p.get('sizes', []) or [],
            'colors': p.get('colors', []) or [],
            'variants': converted_variants,  # Now includes properly formatted variants
            'brand': p.get('brand', ''),
            'materials': p.get('materials', []) or [],
            'imageUrl': p.get('image_url', p.get('imageUrl', '')),
            'stock_quantity': p.get('stock_quantity', 0),
            'stock_status': p.get('stock_status', 'in_stock'),
            # Size-based pricing fields
            'has_size_pricing': has_size_pricing,
            'size_prices': size_prices,
            'size_stocks': size_stocks,
        })
    
    # Log products for debugging
    print(f"📦 Converted {len(converted_products)} products")
    for p in converted_products[:3]:  # Show first 3
        current_price = p.get('price')
        original_price = p.get('compare_at_price')
        has_offer = original_price and original_price > current_price
        
        if has_offer:
            discount = ((original_price - current_price) / original_price) * 100
            price_info = f"Original: ₹{original_price}, Offer: ₹{current_price} ({discount:.0f}% OFF)"
        else:
            price_info = f"₹{current_price}"
        
        print(f"   - {p.get('name')} (category: {p.get('category')}, price: {price_info}, image: {'✅' if p.get('imageUrl') else '❌'})")
    
    # Convert timings
    timings = data.get('timings', {})
    converted_timings = {}
    for day, timing in timings.items():
        if isinstance(timing, dict):
            converted_timings[day] = {
                'open': timing.get('open', '09:00'),
                'close': timing.get('close', '18:00'),
                'is_closed': timing.get('isClosed', timing.get('is_closed', False)),
            }
    
    location = data.get('location', {})
    social_media = data.get('social_media', {})
    
    return {
        'business_id': data.get('user_id', ''),
        'business_name': data.get('business_name', 'Our Business'),
        'industry': data.get('industry', 'other'),
        'description': data.get('description', ''),
        'contact': data.get('contact', {}),
        'location': {
            'address': location.get('address', ''),
            'city': location.get('city', ''),
            'state': location.get('state', ''),
            'pincode': location.get('pincode', ''),
            'google_maps_link': location.get('googleMapsLink', location.get('google_maps_link', '')),
        },
        'timings': converted_timings,
        'products_services': converted_products,
        'policies': data.get('policies', {}),
        'faqs': data.get('faqs', []),
        'social_media': {
            'instagram': social_media.get('instagram', ''),
            'facebook': social_media.get('facebook', ''),
            'twitter': social_media.get('twitter', ''),
            'youtube': social_media.get('youtube', ''),
        },
        'categories': data.get('product_categories', []),
        'payment_settings': {
            'enabled': data.get('payments_enabled', False),
            'key_id': data.get('razorpay_key_id'),
            'key_secret': data.get('razorpay_key_secret'),
        }
    }
