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
    
    if client:
        try:
            # Get user_id from firebase_uid first
            user_id = get_user_id_from_firebase_uid(firebase_uid)
            if user_id:
                result = client.table('connected_business_managers').select(
                    'id, business_name, business_email'
                ).eq('user_id', user_id).eq('is_active', True).limit(1).execute()
                
                if result.data:
                    business_info = result.data[0]
        except Exception as e:
            print(f"⚠️ Could not load business info from Supabase: {e}")
    
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
        converted_products.append({
            'id': p.get('id', ''),
            'sku': p.get('sku', ''),
            'name': p.get('name', ''),
            'category': p.get('category', ''),
            'description': p.get('description', ''),
            'price': p.get('price', 0),
            'price_unit': p.get('priceUnit', p.get('price_unit', 'INR')),
            'duration': p.get('duration', ''),
            'available': p.get('available', True),
            'sizes': p.get('sizes', []),
            'colors': p.get('colors', []),
            'variants': p.get('variants', []),
            'brand': p.get('brand', ''),
            'materials': p.get('materials', []),
            'imageUrl': p.get('imageUrl', p.get('image_url', '')),
        })
    
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
    }
