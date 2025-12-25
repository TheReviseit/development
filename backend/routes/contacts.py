"""
Contact Management API for WhatsApp Automation.
Handles contact CRUD, tagging, import/export, and segmentation.
"""

import os
import csv
import io
from typing import Dict, Any, List, Optional
from flask import Blueprint, request, jsonify, Response
from functools import wraps
from datetime import datetime

# Create blueprint
contacts_bp = Blueprint('contacts', __name__, url_prefix='/api/contacts')

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


def normalize_phone(phone: str) -> str:
    """Normalize phone number to E.164 format (without +)."""
    # Remove all non-digit characters
    digits = ''.join(c for c in phone if c.isdigit())
    
    # Remove leading zeros
    digits = digits.lstrip('0')
    
    # Add country code if missing (default to India +91)
    if len(digits) == 10:
        digits = '91' + digits
    
    return digits


@contacts_bp.route('', methods=['GET'])
@require_auth
def list_contacts():
    """
    List contacts with filtering and pagination.
    
    Query params:
    - page: Page number (default 1)
    - limit: Items per page (default 50, max 100)
    - search: Search by name or phone
    - tags: Filter by tags (comma-separated)
    - opted_in: Filter by opt-in status (true/false)
    - sort: Sort field (name, phone_number, last_contact_at, created_at)
    - order: Sort order (asc, desc)
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        client = get_supabase_client()
        user_id = request.user_id
        
        # Pagination
        page = int(request.args.get('page', 1))
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = (page - 1) * limit
        
        # Build query
        query = client.table('contacts').select('*', count='exact').eq('user_id', user_id)
        
        # Search filter
        search = request.args.get('search')
        if search:
            # Search in name and phone_number
            query = query.or_(f'name.ilike.%{search}%,phone_number.ilike.%{search}%')
        
        # Tag filter
        tags = request.args.get('tags')
        if tags:
            tag_list = [t.strip() for t in tags.split(',')]
            query = query.contains('tags', tag_list)
        
        # Opted-in filter
        opted_in = request.args.get('opted_in')
        if opted_in is not None:
            query = query.eq('opted_in', opted_in.lower() == 'true')
        
        # Sorting
        sort_field = request.args.get('sort', 'created_at')
        sort_order = request.args.get('order', 'desc')
        query = query.order(sort_field, desc=(sort_order == 'desc'))
        
        # Pagination
        query = query.range(offset, offset + limit - 1)
        
        # Execute
        result = query.execute()
        
        total_count = result.count if hasattr(result, 'count') else len(result.data or [])
        total_pages = (total_count + limit - 1) // limit
        
        return jsonify({
            'success': True,
            'contacts': result.data or [],
            'pagination': {
                'page': page,
                'limit': limit,
                'total_count': total_count,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            }
        })
    
    except Exception as e:
        print(f"❌ Error listing contacts: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('', methods=['POST'])
@require_auth
def create_contact():
    """
    Create a new contact.
    
    Body:
    {
        "phone_number": "919876543210",
        "name": "John Doe",
        "email": "john@example.com",
        "tags": ["vip", "new"],
        "custom_fields": {"company": "Acme Inc"}
    }
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        phone = data.get('phone_number')
        if not phone:
            return jsonify({'success': False, 'error': 'Phone number is required'}), 400
        
        # Normalize phone number
        normalized_phone = normalize_phone(phone)
        
        client = get_supabase_client()
        
        # Check if contact already exists
        existing = client.table('contacts').select('id').eq(
            'user_id', user_id
        ).eq('phone_number', normalized_phone).limit(1).execute()
        
        if existing.data:
            return jsonify({
                'success': False,
                'error': 'Contact with this phone number already exists',
                'existing_id': existing.data[0]['id']
            }), 409
        
        # Create contact
        contact_data = {
            'user_id': user_id,
            'phone_number': normalized_phone,
            'phone_normalized': normalized_phone,  # E.164 format for deduplication
            'name': data.get('name'),
            'email': data.get('email'),
            'tags': data.get('tags', []),
            'custom_fields': data.get('custom_fields', {}),
            'opted_in': data.get('opted_in', True)
        }
        
        result = client.table('contacts').insert(contact_data).execute()
        
        return jsonify({
            'success': True,
            'contact': result.data[0] if result.data else None
        }), 201
    
    except Exception as e:
        print(f"❌ Error creating contact: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/<contact_id>', methods=['GET'])
@require_auth
def get_contact(contact_id: str):
    """Get a single contact by ID."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('contacts').select('*').eq(
            'id', contact_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Contact not found'}), 404
        
        return jsonify({
            'success': True,
            'contact': result.data[0]
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/<contact_id>', methods=['PUT'])
@require_auth
def update_contact(contact_id: str):
    """
    Update a contact.
    
    Body: Same as create, all fields optional
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        client = get_supabase_client()
        
        # Build update data (only include provided fields)
        update_data = {}
        
        allowed_fields = ['name', 'email', 'tags', 'custom_fields', 'opted_in', 'is_blocked']
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]
        
        # Handle phone number update
        if 'phone_number' in data:
            normalized = normalize_phone(data['phone_number'])
            update_data['phone_number'] = normalized
            update_data['phone_normalized'] = normalized
        
        # Handle opt-out timestamp
        if 'opted_in' in data and not data['opted_in']:
            update_data['opted_out_at'] = datetime.utcnow().isoformat()
        
        if not update_data:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400
        
        # Update
        result = client.table('contacts').update(update_data).eq(
            'id', contact_id
        ).eq('user_id', user_id).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Contact not found'}), 404
        
        return jsonify({
            'success': True,
            'contact': result.data[0]
        })
    
    except Exception as e:
        print(f"❌ Error updating contact: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/<contact_id>', methods=['DELETE'])
@require_auth
def delete_contact(contact_id: str):
    """Delete a contact."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('contacts').delete().eq(
            'id', contact_id
        ).eq('user_id', user_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Contact deleted successfully'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/<contact_id>/tags', methods=['POST'])
@require_auth
def add_tags(contact_id: str):
    """
    Add tags to a contact.
    
    Body: {"tags": ["vip", "premium"]}
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        new_tags = data.get('tags', [])
        if not new_tags:
            return jsonify({'success': False, 'error': 'No tags provided'}), 400
        
        client = get_supabase_client()
        
        # Get current tags
        result = client.table('contacts').select('tags').eq(
            'id', contact_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Contact not found'}), 404
        
        current_tags = result.data[0].get('tags', []) or []
        
        # Merge tags (unique)
        merged_tags = list(set(current_tags + new_tags))
        
        # Update
        update_result = client.table('contacts').update({'tags': merged_tags}).eq(
            'id', contact_id
        ).execute()
        
        return jsonify({
            'success': True,
            'tags': merged_tags
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/<contact_id>/tags', methods=['DELETE'])
@require_auth
def remove_tags(contact_id: str):
    """
    Remove tags from a contact.
    
    Body: {"tags": ["vip"]}
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        tags_to_remove = data.get('tags', [])
        if not tags_to_remove:
            return jsonify({'success': False, 'error': 'No tags provided'}), 400
        
        client = get_supabase_client()
        
        # Get current tags
        result = client.table('contacts').select('tags').eq(
            'id', contact_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Contact not found'}), 404
        
        current_tags = result.data[0].get('tags', []) or []
        
        # Remove specified tags
        updated_tags = [t for t in current_tags if t not in tags_to_remove]
        
        # Update
        update_result = client.table('contacts').update({'tags': updated_tags}).eq(
            'id', contact_id
        ).execute()
        
        return jsonify({
            'success': True,
            'tags': updated_tags
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/import', methods=['POST'])
@require_auth
def import_contacts():
    """
    Bulk import contacts from CSV.
    
    Body (multipart/form-data):
    - file: CSV file
    - mapping: JSON mapping {"phone": "Phone Number", "name": "Name", ...}
    - tags: Optional tags to apply to all imported contacts
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        if not file.filename.endswith('.csv'):
            return jsonify({'success': False, 'error': 'File must be CSV'}), 400
        
        # Parse mapping
        import json
        mapping_str = request.form.get('mapping', '{}')
        mapping = json.loads(mapping_str)
        
        if 'phone' not in mapping:
            return jsonify({'success': False, 'error': 'Phone column mapping required'}), 400
        
        # Parse tags
        tags = request.form.get('tags', '').split(',')
        tags = [t.strip() for t in tags if t.strip()]
        
        # Read CSV
        content = file.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(content))
        
        client = get_supabase_client()
        
        imported = 0
        skipped = 0
        errors = []
        
        for row in reader:
            try:
                phone = row.get(mapping['phone'], '')
                if not phone:
                    skipped += 1
                    continue
                
                normalized_phone = normalize_phone(phone)
                
                contact_data = {
                    'user_id': user_id,
                    'phone_number': normalized_phone,
                    'phone_normalized': normalized_phone,
                    'name': row.get(mapping.get('name', ''), None),
                    'email': row.get(mapping.get('email', ''), None),
                    'tags': tags,
                    'custom_fields': {}
                }
                
                # Add any extra mapped fields to custom_fields
                for key, col in mapping.items():
                    if key not in ['phone', 'name', 'email'] and col in row:
                        contact_data['custom_fields'][key] = row[col]
                
                # Upsert (update if exists)
                client.table('contacts').upsert(
                    contact_data,
                    on_conflict='user_id,phone_normalized'
                ).execute()
                
                imported += 1
                
            except Exception as e:
                errors.append(f"Row error: {str(e)}")
                skipped += 1
        
        return jsonify({
            'success': True,
            'imported': imported,
            'skipped': skipped,
            'errors': errors[:10]  # Return first 10 errors
        })
    
    except Exception as e:
        print(f"❌ Error importing contacts: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/export', methods=['GET'])
@require_auth
def export_contacts():
    """
    Export contacts as CSV.
    
    Query params:
    - tags: Filter by tags (optional)
    - opted_in: Filter by opt-in status (optional)
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        # Build query
        query = client.table('contacts').select('*').eq('user_id', user_id)
        
        # Apply filters
        tags = request.args.get('tags')
        if tags:
            tag_list = [t.strip() for t in tags.split(',')]
            query = query.contains('tags', tag_list)
        
        opted_in = request.args.get('opted_in')
        if opted_in is not None:
            query = query.eq('opted_in', opted_in.lower() == 'true')
        
        result = query.execute()
        contacts = result.data or []
        
        # Generate CSV
        output = io.StringIO()
        fieldnames = ['phone_number', 'name', 'email', 'tags', 'opted_in', 'created_at', 'last_contact_at']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for contact in contacts:
            writer.writerow({
                'phone_number': contact.get('phone_number', ''),
                'name': contact.get('name', ''),
                'email': contact.get('email', ''),
                'tags': ','.join(contact.get('tags', [])),
                'opted_in': contact.get('opted_in', True),
                'created_at': contact.get('created_at', ''),
                'last_contact_at': contact.get('last_contact_at', '')
            })
        
        output.seek(0)
        
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=contacts.csv'}
        )
    
    except Exception as e:
        print(f"❌ Error exporting contacts: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/tags', methods=['GET'])
@require_auth
def get_all_tags():
    """Get all unique tags used across contacts."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('contacts').select('tags').eq('user_id', user_id).execute()
        
        # Collect unique tags
        all_tags = set()
        for contact in result.data or []:
            for tag in contact.get('tags', []) or []:
                all_tags.add(tag)
        
        return jsonify({
            'success': True,
            'tags': sorted(list(all_tags))
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# CONTACT LISTS
# =====================================================

@contacts_bp.route('/lists', methods=['GET'])
@require_auth
def list_contact_lists():
    """List all contact lists for the user."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        result = client.table('contact_lists').select('*').eq(
            'user_id', user_id
        ).order('created_at', desc=True).execute()
        
        return jsonify({
            'success': True,
            'lists': result.data or []
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/lists', methods=['POST'])
@require_auth
def create_contact_list():
    """
    Create a new contact list.
    
    Body:
    {
        "name": "VIP Customers",
        "description": "High value customers",
        "is_dynamic": false,
        "filter_criteria": null,  // For dynamic lists: {"tags": ["vip"]}
        "contact_ids": ["uuid1", "uuid2"]  // For static lists
    }
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        data = request.get_json()
        
        if not data or not data.get('name'):
            return jsonify({'success': False, 'error': 'Name is required'}), 400
        
        client = get_supabase_client()
        
        # Create list
        list_data = {
            'user_id': user_id,
            'name': data['name'],
            'description': data.get('description'),
            'is_dynamic': data.get('is_dynamic', False),
            'filter_criteria': data.get('filter_criteria')
        }
        
        result = client.table('contact_lists').insert(list_data).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Failed to create list'}), 500
        
        list_id = result.data[0]['id']
        
        # Add contacts if provided (for static lists)
        contact_ids = data.get('contact_ids', [])
        if contact_ids and not data.get('is_dynamic'):
            members = [{'list_id': list_id, 'contact_id': cid} for cid in contact_ids]
            client.table('contact_list_members').insert(members).execute()
            
            # Update count
            client.table('contact_lists').update({
                'contact_count': len(contact_ids)
            }).eq('id', list_id).execute()
        
        return jsonify({
            'success': True,
            'list': result.data[0]
        }), 201
    
    except Exception as e:
        print(f"❌ Error creating contact list: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@contacts_bp.route('/lists/<list_id>/members', methods=['GET'])
@require_auth
def get_list_members(list_id: str):
    """Get all members of a contact list."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        client = get_supabase_client()
        
        # Verify list ownership
        list_result = client.table('contact_lists').select('id, is_dynamic, filter_criteria').eq(
            'id', list_id
        ).eq('user_id', user_id).limit(1).execute()
        
        if not list_result.data:
            return jsonify({'success': False, 'error': 'List not found'}), 404
        
        list_info = list_result.data[0]
        
        if list_info.get('is_dynamic'):
            # Dynamic list - query contacts based on filter criteria
            filter_criteria = list_info.get('filter_criteria', {})
            query = client.table('contacts').select('*').eq('user_id', user_id)
            
            if filter_criteria.get('tags'):
                query = query.contains('tags', filter_criteria['tags'])
            if filter_criteria.get('opted_in') is not None:
                query = query.eq('opted_in', filter_criteria['opted_in'])
            
            result = query.execute()
            contacts = result.data or []
        else:
            # Static list - get from membership table
            result = client.table('contact_list_members').select(
                'contacts(*)'
            ).eq('list_id', list_id).execute()
            
            contacts = [m.get('contacts') for m in result.data or [] if m.get('contacts')]
        
        return jsonify({
            'success': True,
            'contacts': contacts,
            'count': len(contacts)
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
