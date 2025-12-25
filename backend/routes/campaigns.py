"""
Broadcast Campaigns API for WhatsApp Automation.
Handles campaign creation, scheduling, sending, and tracking.
"""

import os
from typing import Dict, Any, List, Optional
from flask import Blueprint, request, jsonify
from functools import wraps
from datetime import datetime, timedelta

# Create blueprint
campaigns_bp = Blueprint('campaigns', __name__, url_prefix='/api/campaigns')

# Import from parent modules
try:
    from supabase_client import get_supabase_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    get_supabase_client = None


def require_auth(f):
    """Decorator to require authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'Authentication required'}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated


@campaigns_bp.route('', methods=['GET'])
@require_auth
def list_campaigns():
    """
    List all campaigns for the user.
    
    Query params:
    - status: Filter by status
    - page, limit: Pagination
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        page = int(request.args.get('page', 1))
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = (page - 1) * limit
        
        query = client.table('broadcast_campaigns').select(
            '*, whatsapp_message_templates(template_name, category)',
            count='exact'
        ).eq('user_id', user_id)
        
        status = request.args.get('status')
        if status:
            query = query.eq('status', status)
        
        query = query.order('created_at', desc=True).range(offset, offset + limit - 1)
        
        result = query.execute()
        
        return jsonify({
            'success': True,
            'campaigns': result.data or [],
            'total': result.count if hasattr(result, 'count') else len(result.data or [])
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('', methods=['POST'])
@require_auth
def create_campaign():
    """
    Create a new broadcast campaign.
    
    Body:
    {
        "name": "Holiday Sale",
        "template_id": "uuid-of-template",
        "contact_list_id": "uuid-of-list" | null,
        "segment_filters": {"tags": ["vip"], "opted_in": true},
        "scheduled_at": "2024-12-26T10:00:00Z" | null,
        "variables_mapping": {"1": "name", "2": "custom_fields.order_id"},
        "messages_per_second": 10
    }
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        required = ['name', 'template_id']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({'success': False, 'error': f'Missing: {", ".join(missing)}'}), 400
        
        client = get_supabase_client()
        
        # Verify template exists and belongs to user
        template_result = client.table('whatsapp_message_templates').select('id, status').eq(
            'id', data['template_id']
        ).eq('user_id', user_id).limit(1).execute()
        
        if not template_result.data:
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        if template_result.data[0].get('status') != 'APPROVED':
            return jsonify({'success': False, 'error': 'Template must be approved by Meta'}), 400
        
        # Get user's primary phone number
        phone_result = client.table('connected_phone_numbers').select('id').eq(
            'user_id', user_id
        ).eq('is_active', True).eq('is_primary', True).limit(1).execute()
        
        phone_number_id = phone_result.data[0]['id'] if phone_result.data else None
        
        # Calculate recipient count
        recipient_count = 0
        if data.get('contact_list_id'):
            # From list
            list_result = client.table('contact_lists').select('contact_count').eq(
                'id', data['contact_list_id']
            ).limit(1).execute()
            if list_result.data:
                recipient_count = list_result.data[0].get('contact_count', 0)
        elif data.get('segment_filters'):
            # From filters
            filters = data['segment_filters']
            query = client.table('contacts').select('id', count='exact').eq('user_id', user_id)
            
            if filters.get('tags'):
                query = query.contains('tags', filters['tags'])
            if filters.get('opted_in') is not None:
                query = query.eq('opted_in', filters['opted_in'])
            
            count_result = query.execute()
            recipient_count = count_result.count if hasattr(count_result, 'count') else len(count_result.data or [])
        
        # Create campaign
        campaign_data = {
            'user_id': user_id,
            'phone_number_id': phone_number_id,
            'name': data['name'],
            'template_id': data['template_id'],
            'contact_list_id': data.get('contact_list_id'),
            'segment_filters': data.get('segment_filters'),
            'variables_mapping': data.get('variables_mapping', {}),
            'status': 'scheduled' if data.get('scheduled_at') else 'draft',
            'scheduled_at': data.get('scheduled_at'),
            'total_recipients': recipient_count,
            'messages_per_second': data.get('messages_per_second', 10)
        }
        
        result = client.table('broadcast_campaigns').insert(campaign_data).execute()
        
        return jsonify({
            'success': True,
            'campaign': result.data[0] if result.data else None
        }), 201
    
    except Exception as e:
        print(f"❌ Error creating campaign: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>', methods=['GET'])
@require_auth
def get_campaign(campaign_id: str):
    """Get a single campaign with full details."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('broadcast_campaigns').select(
            '*, whatsapp_message_templates(*)'
        ).eq('id', campaign_id).eq('user_id', user_id).limit(1).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        return jsonify({
            'success': True,
            'campaign': result.data[0]
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>', methods=['PUT'])
@require_auth
def update_campaign(campaign_id: str):
    """
    Update a campaign (only if in draft/scheduled status).
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        client = get_supabase_client()
        
        # Check current status
        current = client.table('broadcast_campaigns').select('status').eq(
            'id', campaign_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not current.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        if current.data[0]['status'] not in ['draft', 'scheduled']:
            return jsonify({'success': False, 'error': 'Cannot edit campaign in progress'}), 400
        
        # Build update data
        update_data = {}
        allowed = ['name', 'template_id', 'contact_list_id', 'segment_filters',
                   'variables_mapping', 'scheduled_at', 'messages_per_second']
        
        for field in allowed:
            if field in data:
                update_data[field] = data[field]
        
        if 'scheduled_at' in data:
            update_data['status'] = 'scheduled' if data['scheduled_at'] else 'draft'
        
        result = client.table('broadcast_campaigns').update(update_data).eq(
            'id', campaign_id
        ).eq('user_id', user_id).execute()
        
        return jsonify({
            'success': True,
            'campaign': result.data[0] if result.data else None
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>', methods=['DELETE'])
@require_auth
def delete_campaign(campaign_id: str):
    """Delete a campaign (only if in draft status)."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        # Check status
        current = client.table('broadcast_campaigns').select('status').eq(
            'id', campaign_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not current.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        if current.data[0]['status'] not in ['draft', 'cancelled', 'failed']:
            return jsonify({'success': False, 'error': 'Cannot delete active campaign'}), 400
        
        client.table('broadcast_campaigns').delete().eq('id', campaign_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Campaign deleted'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>/send', methods=['POST'])
@require_auth
def start_campaign(campaign_id: str):
    """
    Start sending a campaign.
    
    This queues all recipients and begins the sending process.
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        # Get campaign
        campaign_result = client.table('broadcast_campaigns').select('*').eq(
            'id', campaign_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not campaign_result.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        campaign = campaign_result.data[0]
        
        if campaign['status'] not in ['draft', 'scheduled']:
            return jsonify({'success': False, 'error': f"Cannot start campaign in status: {campaign['status']}"}), 400
        
        # Get template
        template_result = client.table('whatsapp_message_templates').select('*').eq(
            'id', campaign['template_id']
        ).limit(1).execute()
        
        if not template_result.data or template_result.data[0]['status'] != 'APPROVED':
            return jsonify({'success': False, 'error': 'Template not approved'}), 400
        
        # Get recipients
        if campaign.get('contact_list_id'):
            # From contact list
            list_info = client.table('contact_lists').select('is_dynamic, filter_criteria').eq(
                'id', campaign['contact_list_id']
            ).limit(1).execute()
            
            if list_info.data and list_info.data[0].get('is_dynamic'):
                # Dynamic list
                filters = list_info.data[0].get('filter_criteria', {})
                query = client.table('contacts').select('id, phone_number, name, custom_fields').eq(
                    'user_id', user_id
                ).eq('opted_in', True)
                
                if filters.get('tags'):
                    query = query.contains('tags', filters['tags'])
                
                contacts_result = query.execute()
            else:
                # Static list
                contacts_result = client.table('contact_list_members').select(
                    'contacts(id, phone_number, name, custom_fields)'
                ).eq('list_id', campaign['contact_list_id']).execute()
                
                contacts_result.data = [m.get('contacts') for m in contacts_result.data or [] if m.get('contacts')]
        
        elif campaign.get('segment_filters'):
            # From filters
            filters = campaign['segment_filters']
            query = client.table('contacts').select('id, phone_number, name, custom_fields').eq(
                'user_id', user_id
            ).eq('opted_in', True)
            
            if filters.get('tags'):
                query = query.contains('tags', filters['tags'])
            
            contacts_result = query.execute()
        else:
            return jsonify({'success': False, 'error': 'No recipients defined'}), 400
        
        contacts = contacts_result.data or []
        
        if not contacts:
            return jsonify({'success': False, 'error': 'No recipients found'}), 400
        
        # Create recipient records
        variables_mapping = campaign.get('variables_mapping', {})
        recipients = []
        
        for contact in contacts:
            # Resolve variables from contact data
            resolved_vars = {}
            for var_index, field_path in variables_mapping.items():
                value = contact.get(field_path)
                if not value and '.' in field_path:
                    # Handle nested fields like custom_fields.order_id
                    parts = field_path.split('.')
                    value = contact
                    for part in parts:
                        value = value.get(part, {}) if isinstance(value, dict) else ''
                resolved_vars[var_index] = str(value) if value else ''
            
            recipients.append({
                'campaign_id': campaign_id,
                'contact_id': contact['id'],
                'phone_number': contact['phone_number'],
                'variables': resolved_vars,
                'status': 'queued',
                'queued_at': datetime.utcnow().isoformat()
            })
        
        # Insert recipients in batches
        batch_size = 100
        for i in range(0, len(recipients), batch_size):
            batch = recipients[i:i + batch_size]
            client.table('campaign_recipients').insert(batch).execute()
        
        # Update campaign status
        client.table('broadcast_campaigns').update({
            'status': 'sending',
            'started_at': datetime.utcnow().isoformat(),
            'total_recipients': len(recipients)
        }).eq('id', campaign_id).execute()
        
        # TODO: Trigger background worker to actually send messages
        # For now, we just queue them
        
        return jsonify({
            'success': True,
            'message': f'Campaign started with {len(recipients)} recipients',
            'queued': len(recipients)
        })
    
    except Exception as e:
        print(f"❌ Error starting campaign: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>/pause', methods=['POST'])
@require_auth
def pause_campaign(campaign_id: str):
    """Pause a sending campaign."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('broadcast_campaigns').update({
            'status': 'paused'
        }).eq('id', campaign_id).eq('user_id', user_id).eq('status', 'sending').execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Campaign not found or not sending'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Campaign paused'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>/resume', methods=['POST'])
@require_auth
def resume_campaign(campaign_id: str):
    """Resume a paused campaign."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('broadcast_campaigns').update({
            'status': 'sending'
        }).eq('id', campaign_id).eq('user_id', user_id).eq('status', 'paused').execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Campaign not found or not paused'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Campaign resumed'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>/cancel', methods=['POST'])
@require_auth
def cancel_campaign(campaign_id: str):
    """Cancel a campaign."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('broadcast_campaigns').update({
            'status': 'cancelled'
        }).eq('id', campaign_id).eq('user_id', user_id).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Campaign cancelled'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@campaigns_bp.route('/<campaign_id>/stats', methods=['GET'])
@require_auth
def get_campaign_stats(campaign_id: str):
    """Get detailed statistics for a campaign."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        # Get campaign
        campaign = client.table('broadcast_campaigns').select(
            'id, name, status, total_recipients, messages_sent, messages_delivered, messages_read, messages_failed, started_at, completed_at'
        ).eq('id', campaign_id).eq('user_id', user_id).limit(1).execute()
        
        if not campaign.data:
            return jsonify({'success': False, 'error': 'Campaign not found'}), 404
        
        # Get recipient status breakdown
        recipients = client.table('campaign_recipients').select('status').eq(
            'campaign_id', campaign_id
        ).execute()
        
        status_counts = {}
        for r in recipients.data or []:
            status = r.get('status', 'pending')
            status_counts[status] = status_counts.get(status, 0) + 1
        
        campaign_data = campaign.data[0]
        total = campaign_data['total_recipients'] or 1
        
        return jsonify({
            'success': True,
            'campaign': campaign_data,
            'stats': {
                'by_status': status_counts,
                'delivery_rate': round((campaign_data['messages_delivered'] / total) * 100, 1),
                'read_rate': round((campaign_data['messages_read'] / total) * 100, 1),
                'failure_rate': round((campaign_data['messages_failed'] / total) * 100, 1),
                'pending': status_counts.get('pending', 0) + status_counts.get('queued', 0)
            }
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
