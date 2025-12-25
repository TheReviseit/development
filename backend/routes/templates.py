"""
Template Management API for WhatsApp Message Templates.
Handles CRUD operations and syncing with Meta Graph API.
"""

import os
import requests
from typing import Dict, Any, List, Optional
from flask import Blueprint, request, jsonify
from functools import wraps

# Create blueprint
templates_bp = Blueprint('templates', __name__, url_prefix='/api/templates')

# Import from parent modules
try:
    from supabase_client import get_supabase_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    get_supabase_client = None

GRAPH_API_VERSION = "v18.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


def get_user_waba_credentials(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the user's WABA ID and access token.
    Returns dict with 'waba_id' and 'access_token' or None.
    """
    if not SUPABASE_AVAILABLE:
        return None
    
    try:
        client = get_supabase_client()
        
        # Get user's connected phone number -> WABA -> Facebook account chain
        result = client.table('connected_phone_numbers').select(
            'id, whatsapp_account_id, connected_whatsapp_accounts!inner(waba_id, business_manager_id, connected_business_managers!inner(facebook_account_id, connected_facebook_accounts!inner(access_token)))'
        ).eq('user_id', user_id).eq('is_active', True).eq('is_primary', True).limit(1).execute()
        
        if result.data and len(result.data) > 0:
            phone = result.data[0]
            waba = phone.get('connected_whatsapp_accounts', {})
            bm = waba.get('connected_business_managers', {})
            fb = bm.get('connected_facebook_accounts', {})
            
            # Import decrypt function
            from crypto_utils import decrypt_token
            access_token = decrypt_token(fb.get('access_token', ''))
            
            return {
                'waba_id': waba.get('waba_id'),
                'access_token': access_token
            }
    except Exception as e:
        print(f"❌ Error getting WABA credentials: {e}")
    
    return None


def require_auth(f):
    """Decorator to require authentication (simplified - integrate with your auth)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        # TODO: Replace with actual auth check
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'Authentication required'}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated


@templates_bp.route('', methods=['GET'])
@require_auth
def list_templates():
    """
    List all templates for the authenticated user.
    
    Query params:
    - status: Filter by status (APPROVED, PENDING, REJECTED)
    - category: Filter by category (MARKETING, UTILITY, AUTHENTICATION)
    - search: Search by template name
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        client = get_supabase_client()
        user_id = request.user_id
        
        # Build query
        query = client.table('whatsapp_message_templates').select('*').eq('user_id', user_id)
        
        # Apply filters
        status = request.args.get('status')
        if status:
            query = query.eq('status', status.upper())
        
        category = request.args.get('category')
        if category:
            query = query.eq('category', category.upper())
        
        search = request.args.get('search')
        if search:
            query = query.ilike('template_name', f'%{search}%')
        
        # Execute
        result = query.order('created_at', desc=True).execute()
        
        return jsonify({
            'success': True,
            'templates': result.data or [],
            'count': len(result.data or [])
        })
    
    except Exception as e:
        print(f"❌ Error listing templates: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@templates_bp.route('/sync', methods=['POST'])
@require_auth
def sync_templates():
    """
    Sync templates from Meta Graph API to local database.
    Fetches all templates for the user's WABA.
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        
        # Get WABA credentials
        creds = get_user_waba_credentials(user_id)
        if not creds or not creds.get('access_token'):
            return jsonify({
                'success': False,
                'error': 'WhatsApp Business Account not connected'
            }), 400
        
        waba_id = creds['waba_id']
        access_token = creds['access_token']
        
        # Fetch templates from Meta
        url = f"{GRAPH_API_BASE}/{waba_id}/message_templates"
        params = {
            'access_token': access_token,
            'fields': 'id,name,status,category,language,components',
            'limit': 100
        }
        
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            error = response.json().get('error', {})
            return jsonify({
                'success': False,
                'error': error.get('message', 'Failed to fetch templates from Meta')
            }), response.status_code
        
        meta_templates = response.json().get('data', [])
        
        # Sync to database
        client = get_supabase_client()
        synced_count = 0
        
        for template in meta_templates:
            # Parse components
            components = template.get('components', [])
            header = next((c for c in components if c.get('type') == 'HEADER'), None)
            body = next((c for c in components if c.get('type') == 'BODY'), None)
            footer = next((c for c in components if c.get('type') == 'FOOTER'), None)
            buttons = next((c for c in components if c.get('type') == 'BUTTONS'), None)
            
            # Extract variables from body
            body_text = body.get('text', '') if body else ''
            variables = []
            import re
            var_matches = re.findall(r'\{\{(\d+)\}\}', body_text)
            for idx in var_matches:
                variables.append({'index': int(idx), 'example': ''})
            
            template_data = {
                'user_id': user_id,
                'waba_id': waba_id,
                'meta_template_id': template['id'],
                'template_name': template['name'],
                'category': template['category'],
                'language': template['language'],
                'status': template['status'],
                'header_type': header.get('format') if header else None,
                'header_content': header.get('text') or header.get('example', {}).get('header_handle', [None])[0] if header else None,
                'body_text': body_text,
                'footer_text': footer.get('text') if footer else None,
                'buttons': buttons.get('buttons', []) if buttons else [],
                'variables': variables,
                'last_synced_at': 'now()'
            }
            
            # Upsert template
            client.table('whatsapp_message_templates').upsert(
                template_data,
                on_conflict='user_id,waba_id,meta_template_id'
            ).execute()
            synced_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Synced {synced_count} templates from Meta',
            'synced_count': synced_count
        })
    
    except Exception as e:
        print(f"❌ Error syncing templates: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@templates_bp.route('', methods=['POST'])
@require_auth
def create_template():
    """
    Create a new message template.
    
    Body:
    {
        "name": "order_confirmation",
        "category": "UTILITY",
        "language": "en",
        "header": {"type": "TEXT", "text": "Order Confirmed!"},
        "body": "Hi {{1}}, your order #{{2}} is confirmed.",
        "footer": "Thank you for shopping with us",
        "buttons": [{"type": "URL", "text": "Track Order", "url": "https://..."}]
    }
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        # Validate required fields
        required = ['name', 'category', 'body']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {", ".join(missing)}'
            }), 400
        
        # Get WABA credentials
        creds = get_user_waba_credentials(user_id)
        if not creds or not creds.get('access_token'):
            return jsonify({
                'success': False,
                'error': 'WhatsApp Business Account not connected'
            }), 400
        
        waba_id = creds['waba_id']
        access_token = creds['access_token']
        
        # Build components array for Meta API
        components = []
        
        # Header
        header = data.get('header')
        if header:
            header_component = {'type': 'HEADER'}
            if header.get('type') == 'TEXT':
                header_component['format'] = 'TEXT'
                header_component['text'] = header.get('text', '')
            else:
                header_component['format'] = header.get('type', 'TEXT')
            components.append(header_component)
        
        # Body (required)
        body_text = data['body']
        body_component = {'type': 'BODY', 'text': body_text}
        
        # Extract example values for variables
        import re
        var_matches = re.findall(r'\{\{(\d+)\}\}', body_text)
        if var_matches:
            examples = data.get('body_examples', [f'example{i}' for i in var_matches])
            body_component['example'] = {'body_text': [examples]}
        
        components.append(body_component)
        
        # Footer
        footer = data.get('footer')
        if footer:
            components.append({'type': 'FOOTER', 'text': footer})
        
        # Buttons
        buttons = data.get('buttons', [])
        if buttons:
            components.append({'type': 'BUTTONS', 'buttons': buttons})
        
        # Create template via Meta API
        url = f"{GRAPH_API_BASE}/{waba_id}/message_templates"
        payload = {
            'name': data['name'],
            'category': data['category'].upper(),
            'language': data.get('language', 'en'),
            'components': components
        }
        
        response = requests.post(
            url,
            params={'access_token': access_token},
            json=payload
        )
        
        if response.status_code not in [200, 201]:
            error = response.json().get('error', {})
            return jsonify({
                'success': False,
                'error': error.get('message', 'Failed to create template')
            }), response.status_code
        
        meta_response = response.json()
        template_id = meta_response.get('id')
        
        # Store in database
        client = get_supabase_client()
        
        template_data = {
            'user_id': user_id,
            'waba_id': waba_id,
            'meta_template_id': template_id,
            'template_name': data['name'],
            'category': data['category'].upper(),
            'language': data.get('language', 'en'),
            'status': 'PENDING',  # New templates are pending approval
            'header_type': header.get('type') if header else None,
            'header_content': header.get('text') if header else None,
            'body_text': body_text,
            'footer_text': footer,
            'buttons': buttons,
            'variables': [{'index': int(i), 'example': ''} for i in var_matches]
        }
        
        result = client.table('whatsapp_message_templates').insert(template_data).execute()
        
        return jsonify({
            'success': True,
            'template_id': template_id,
            'message': 'Template submitted for approval',
            'data': result.data[0] if result.data else None
        }), 201
    
    except Exception as e:
        print(f"❌ Error creating template: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@templates_bp.route('/<template_id>', methods=['DELETE'])
@require_auth
def delete_template(template_id: str):
    """
    Delete a message template.
    
    Args:
        template_id: The template ID to delete
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        # Get template from DB
        result = client.table('whatsapp_message_templates').select('*').eq(
            'id', template_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        template = result.data[0]
        
        # Get WABA credentials
        creds = get_user_waba_credentials(user_id)
        if creds and creds.get('access_token'):
            # Delete from Meta
            waba_id = creds['waba_id']
            access_token = creds['access_token']
            
            url = f"{GRAPH_API_BASE}/{waba_id}/message_templates"
            params = {
                'access_token': access_token,
                'name': template['template_name']
            }
            
            response = requests.delete(url, params=params)
            
            if response.status_code not in [200, 404]:
                # Log but don't fail - template might already be deleted from Meta
                print(f"⚠️ Meta deletion returned: {response.status_code}")
        
        # Delete from database
        client.table('whatsapp_message_templates').delete().eq(
            'id', template_id
        ).execute()
        
        return jsonify({
            'success': True,
            'message': 'Template deleted successfully'
        })
    
    except Exception as e:
        print(f"❌ Error deleting template: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@templates_bp.route('/<template_id>', methods=['GET'])
@require_auth
def get_template(template_id: str):
    """Get a single template by ID."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('whatsapp_message_templates').select('*').eq(
            'id', template_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        return jsonify({
            'success': True,
            'template': result.data[0]
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
