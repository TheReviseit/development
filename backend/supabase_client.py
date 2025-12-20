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


def update_message_status(
    message_id: str,
    status: str,
    timestamp: Optional[str] = None
) -> bool:
    """
    Update the status of a message.
    Uses correct schema: wamid for lookup, status_updated_at for timestamp.
    
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
        result = client.table('whatsapp_messages').update(update_data).eq(
            'wamid', message_id
        ).execute()
        
        if result.data:
            print(f"📊 Message status updated: {message_id[:20]}... -> {status}")
            return True
        return False
        
    except Exception as e:
        print(f"⚠️ Could not update message status: {e}")
        return False
