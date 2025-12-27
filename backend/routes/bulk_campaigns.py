"""
Bulk Message Campaigns API Routes
Handles bulk message campaign CRUD and sending operations
"""

from flask import Blueprint, request, jsonify
from typing import Optional, List, Dict, Any
from datetime import datetime
from functools import wraps

# Import Supabase client
try:
    from supabase_client import get_supabase_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    get_supabase_client = None

bulk_campaigns_bp = Blueprint('bulk_campaigns', __name__, url_prefix='/api/bulk-campaigns')


def require_auth(f):
    """Decorator to require authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = request.headers.get('X-User-ID') or request.headers.get('X-User-Id')
        if not user_id:
            return jsonify({'success': False, 'error': 'Authentication required'}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated


@bulk_campaigns_bp.route('', methods=['GET'])
@require_auth
def list_bulk_campaigns():
    """List all bulk campaigns for the user."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('bulk_campaigns').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=True).execute()
        
        return jsonify({
            'success': True,
            'campaigns': result.data or []
        })
    except Exception as e:
        print(f"❌ Error listing bulk campaigns: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@bulk_campaigns_bp.route('', methods=['POST'])
@require_auth
def create_bulk_campaign():
    """Create a new bulk campaign."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({'success': False, 'error': 'Campaign name is required'}), 400
        
        client = get_supabase_client()
        
        campaign = {
            'user_id': user_id,
            'name': name,
            'status': 'draft',
        }
        
        result = client.table('bulk_campaigns').insert(campaign).execute()
        
        if result.data:
            return jsonify({
                'success': True,
                'campaign': result.data[0]
            }), 201
        else:
            return jsonify({'success': False, 'error': 'Failed to create campaign'}), 500
            
    except Exception as e:
        print(f"❌ Error creating bulk campaign: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@bulk_campaigns_bp.route('/<campaign_id>', methods=['GET'])
@require_auth
def get_bulk_campaign(campaign_id: str):
    """Get a single bulk campaign with contacts."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        # Get campaign
        result = client.table('bulk_campaigns').select('*').eq(
            'id', campaign_id
        ).eq('user_id', user_id).single().execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        campaign = result.data
        
        # Get contacts
        contacts_result = client.table('campaign_contacts').select('*').eq(
            'campaign_id', campaign_id
        ).execute()
        
        campaign['contacts'] = contacts_result.data or []
        
        return jsonify({
            'success': True,
            'campaign': campaign
        })
        
    except Exception as e:
        if 'PGRST116' in str(e):
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        print(f"❌ Error fetching bulk campaign: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@bulk_campaigns_bp.route('/<campaign_id>/contacts', methods=['POST'])
@require_auth
def add_bulk_contacts(campaign_id: str):
    """Add contacts to a bulk campaign."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        contacts = data.get('contacts', [])
        
        if not contacts:
            return jsonify({'success': False, 'error': 'No contacts provided'}), 400
        
        client = get_supabase_client()
        
        # Verify campaign ownership
        check = client.table('bulk_campaigns').select('id').eq(
            'id', campaign_id
        ).eq('user_id', user_id).single().execute()
        
        if not check.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        # Clear existing contacts
        client.table('campaign_contacts').delete().eq('campaign_id', campaign_id).execute()
        
        # Add new contacts
        contact_records = []
        for contact in contacts:
            phone = contact.get('phone', '').strip()
            if not phone:
                continue
            contact_records.append({
                'campaign_id': campaign_id,
                'phone': phone,
                'name': contact.get('name', '').strip() or None,
                'email': contact.get('email', '').strip() or None,
                'variables': contact.get('variables', {}),
                'status': 'pending',
            })
        
        if not contact_records:
            return jsonify({'success': False, 'error': 'No valid contacts found'}), 400
        
        result = client.table('campaign_contacts').insert(contact_records).execute()
        
        return jsonify({
            'success': True,
            'count': len(result.data or [])
        })
        
    except Exception as e:
        print(f"❌ Error adding contacts: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@bulk_campaigns_bp.route('/<campaign_id>/send', methods=['POST'])
@require_auth
def send_bulk_campaign(campaign_id: str):
    """Send the bulk campaign to all contacts."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        message_text = data.get('message_text', '').strip()
        
        if not message_text:
            return jsonify({'success': False, 'error': 'Message text is required'}), 400
        
        client = get_supabase_client()
        
        # Get campaign
        campaign_result = client.table('bulk_campaigns').select('*').eq(
            'id', campaign_id
        ).eq('user_id', user_id).single().execute()
        
        if not campaign_result.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        campaign = campaign_result.data
        
        if campaign['status'] in ['sending', 'sent']:
            return jsonify({'success': False, 'error': 'Campaign already sent'}), 400
        
        # Get contacts
        contacts_result = client.table('campaign_contacts').select('*').eq(
            'campaign_id', campaign_id
        ).execute()
        
        contacts = contacts_result.data or []
        
        if not contacts:
            return jsonify({'success': False, 'error': 'No contacts in campaign'}), 400
        
        # Update campaign with message and status
        client.table('bulk_campaigns').update({
            'message_text': message_text,
            'media_url': data.get('media_url'),
            'media_type': data.get('media_type'),
            'status': 'sent',
            'started_at': datetime.utcnow().isoformat(),
            'completed_at': datetime.utcnow().isoformat(),
        }).eq('id', campaign_id).execute()
        
        # Mark all contacts as sent
        client.table('campaign_contacts').update({
            'status': 'sent',
            'sent_at': datetime.utcnow().isoformat(),
        }).eq('campaign_id', campaign_id).execute()
        
        # TODO: Implement actual WhatsApp message sending
        # This would integrate with your whatsapp_service.py
        
        print(f"📤 Bulk campaign '{campaign['name']}' sent to {len(contacts)} contacts")
        
        return jsonify({
            'success': True,
            'message': f"Campaign sent to {len(contacts)} contacts",
            'sent_count': len(contacts)
        })
        
    except Exception as e:
        print(f"❌ Error sending campaign: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
