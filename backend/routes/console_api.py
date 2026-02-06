"""
Console API Routes
Business logic endpoints for OTP Developer Console

Endpoints:
- Projects CRUD
- API Keys management
- OTP Logs
- Dashboard stats
- Analytics
- Webhooks
"""

import secrets
import hashlib
import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g

from middleware.console_auth_middleware import require_console_auth, get_client_ip
from middleware.subscription_guard import (
    get_org_subscription, 
    validate_key_environment,
    inject_subscription
)
from services.otp_service import generate_api_key
from services.audit_service import log_audit_event

logger = logging.getLogger('console.api')

# Create blueprint
console_api_bp = Blueprint('console_api', __name__, url_prefix='/console')


# =============================================================================
# DASHBOARD STATS
# =============================================================================

@console_api_bp.route('/dashboard/stats', methods=['GET'])
@require_console_auth()
def get_dashboard_stats():
    """
    Get dashboard overview statistics.
    
    Response:
        {
            "success": true,
            "stats": {
                "otps_sent_today": 123,
                "success_rate": 98.5,
                "failed_deliveries": 2,
                "rate_limit_hits": 5,
                "fraud_blocks": 1,
                "active_api_keys": 3
            }
        }
    """
    org_id = g.console_org_id
    
    if not org_id:
        return jsonify({
            'success': False,
            'error': 'NO_ORG',
            'message': 'No organization selected'
        }), 400
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Get project IDs for this org
        projects_result = db.table('otp_projects').select('id').eq('org_id', org_id).execute()
        project_ids = [p['id'] for p in (projects_result.data or [])]
        
        if not project_ids:
            return jsonify({
                'success': True,
                'stats': {
                    'otps_sent_today': 0,
                    'success_rate': 0,
                    'failed_deliveries': 0,
                    'rate_limit_hits': 0,
                    'fraud_blocks': 0,
                    'active_api_keys': 0
                }
            }), 200
        
        # Get API key IDs for these projects
        keys_result = db.table('otp_api_keys').select('id, business_id').in_(
            'project_id', project_ids
        ).is_('revoked_at', 'null').execute()
        
        business_ids = list(set([k.get('business_id') for k in (keys_result.data or []) if k.get('business_id')]))
        active_keys = len(keys_result.data or [])
        
        if not business_ids:
            return jsonify({
                'success': True,
                'stats': {
                    'otps_sent_today': 0,
                    'success_rate': 0,
                    'failed_deliveries': 0,
                    'rate_limit_hits': 0,
                    'fraud_blocks': 0,
                    'active_api_keys': active_keys
                }
            }), 200
        
        # Count OTPs sent today
        otps_today = db.table('otp_requests').select('id, status, delivery_status').in_(
            'business_id', business_ids
        ).gte('created_at', today_start.isoformat()).execute()
        
        otp_data = otps_today.data or []
        total_sent = len(otp_data)
        verified = sum(1 for o in otp_data if o.get('status') == 'verified')
        failed = sum(1 for o in otp_data if o.get('delivery_status') == 'failed')
        
        success_rate = (verified / total_sent * 100) if total_sent > 0 else 0
        
        # Count rate limit hits and fraud blocks from audit logs
        audit_result = db.table('otp_audit_logs').select('action').in_(
            'business_id', business_ids
        ).gte('created_at', today_start.isoformat()).execute()
        
        audit_data = audit_result.data or []
        rate_limit_hits = sum(1 for a in audit_data if a.get('action') == 'rate_limited')
        fraud_blocks = sum(1 for a in audit_data if a.get('action') == 'blocked')
        
        return jsonify({
            'success': True,
            'stats': {
                'otps_sent_today': total_sent,
                'success_rate': round(success_rate, 1),
                'failed_deliveries': failed,
                'rate_limit_hits': rate_limit_hits,
                'fraud_blocks': fraud_blocks,
                'active_api_keys': active_keys
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Dashboard stats error: {e}")
        return jsonify({
            'success': False,
            'error': 'STATS_ERROR'
        }), 500


# =============================================================================
# CHANNEL MANAGEMENT
# =============================================================================

@console_api_bp.route('/project/channels', methods=['GET'])
@require_console_auth()
def get_project_channels():
    """
    Get enabled OTP channels for the current project.
    
    Response:
        {
            "success": true,
            "channels": {
                "whatsapp": {"enabled": true, "configured": true, "requirements": [...]},
                "email": {"enabled": false, "configured": false, "requirements": [...]}
            },
            "plan": {"name": "starter", "allowedChannels": ["whatsapp"]}
        }
    """
    org_id = g.console_org_id
    
    if not org_id:
        return jsonify({
            'success': False,
            'error': 'NO_ORG'
        }), 400
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Get org's plan and settings
        org_result = db.table('otp_console_orgs').select(
            'id, plan, enabled_channels'
        ).eq('id', org_id).single().execute()
        
        org_data = org_result.data or {}
        plan_name = org_data.get('plan', 'starter')
        enabled_channels = org_data.get('enabled_channels') or {'whatsapp': True, 'email': False}
        
        # Define plan allowances
        plan_allowances = {
            'starter': ['whatsapp'],
            'growth': ['whatsapp', 'email'],
            'enterprise': ['whatsapp', 'email', 'sms']
        }
        
        allowed = plan_allowances.get(plan_name, ['whatsapp'])
        
        # Check configuration status
        # WhatsApp: Check if business is connected
        whatsapp_configured = True  # Assume configured for now
        
        # Email: Check if Resend API key exists
        email_configured = False
        try:
            import os
            email_configured = bool(os.getenv('RESEND_API_KEY'))
        except:
            pass
        
        return jsonify({
            'success': True,
            'channels': {
                'whatsapp': {
                    'enabled': enabled_channels.get('whatsapp', True),
                    'configured': whatsapp_configured,
                    'requirements': [
                        {'label': 'WhatsApp Business connected', 'met': whatsapp_configured},
                        {'label': 'OTP template approved', 'met': True}
                    ]
                },
                'email': {
                    'enabled': enabled_channels.get('email', False),
                    'configured': email_configured,
                    'requirements': [
                        {'label': 'Resend API key configured', 'met': email_configured},
                        {'label': 'Sender domain verified', 'met': email_configured}
                    ]
                }
            },
            'plan': {
                'name': plan_name,
                'allowedChannels': allowed
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Get channels error: {e}")
        # Return defaults on error
        return jsonify({
            'success': True,
            'channels': {
                'whatsapp': {
                    'enabled': True,
                    'configured': True,
                    'requirements': [
                        {'label': 'WhatsApp Business connected', 'met': True},
                        {'label': 'OTP template approved', 'met': True}
                    ]
                },
                'email': {
                    'enabled': False,
                    'configured': False,
                    'requirements': [
                        {'label': 'Resend API key configured', 'met': False},
                        {'label': 'Sender domain verified', 'met': False}
                    ]
                }
            },
            'plan': {
                'name': 'starter',
                'allowedChannels': ['whatsapp']
            }
        }), 200


@console_api_bp.route('/project/channels', methods=['PATCH'])
@require_console_auth(roles=['owner', 'admin'])
def update_project_channels():
    """
    Enable or disable an OTP channel.
    
    Request Body:
        {
            "channel": "email",
            "enabled": true
        }
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({'success': False, 'error': 'INVALID_JSON'}), 400
    
    channel = data.get('channel')
    enabled = data.get('enabled', False)
    
    if channel not in ['whatsapp', 'email', 'sms']:
        return jsonify({
            'success': False,
            'error': 'INVALID_CHANNEL',
            'message': 'Channel must be whatsapp, email, or sms'
        }), 400
    
    org_id = g.console_org_id
    user = g.console_user
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Get current settings
        org_result = db.table('otp_console_orgs').select(
            'id, plan, enabled_channels'
        ).eq('id', org_id).single().execute()
        
        if not org_result.data:
            return jsonify({'success': False, 'error': 'ORG_NOT_FOUND'}), 404
        
        org_data = org_result.data
        plan_name = org_data.get('plan', 'starter')
        current_channels = org_data.get('enabled_channels') or {'whatsapp': True, 'email': False}
        
        # Check plan allowance
        plan_allowances = {
            'starter': ['whatsapp'],
            'growth': ['whatsapp', 'email'],
            'enterprise': ['whatsapp', 'email', 'sms']
        }
        
        allowed = plan_allowances.get(plan_name, ['whatsapp'])
        
        if enabled and channel not in allowed:
            return jsonify({
                'success': False,
                'error': 'PLAN_RESTRICTION',
                'message': f'{channel.title()} OTP is not available on your plan. Upgrade to enable it.'
            }), 403
        
        # Update channels
        current_channels[channel] = enabled
        
        db.table('otp_console_orgs').update({
            'enabled_channels': current_channels,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', org_id).execute()
        
        # Audit log (async, non-blocking)
        log_audit_event(
            user_id=str(user.id),
            org_id=str(org_id),
            action='enable_channel' if enabled else 'disable_channel',
            resource_type='channel',
            resource_id=channel,  # Now TEXT, works with 'email', 'whatsapp' etc.
            metadata={'channel': channel, 'enabled': enabled}
        )
        
        return jsonify({
            'success': True,
            'channel': channel,
            'enabled': enabled
        }), 200
        
    except Exception as e:
        logger.error(f"Update channels error: {e}")
        return jsonify({'success': False, 'error': 'UPDATE_FAILED'}), 500


# =============================================================================
# PROJECTS
# =============================================================================

@console_api_bp.route('/projects', methods=['GET'])
@require_console_auth()
def list_projects():
    """List all projects for current organization."""
    org_id = g.console_org_id
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table('otp_projects').select(
            'id, name, description, environment, whatsapp_mode, created_at'
        ).eq('org_id', org_id).order('created_at', desc=True).execute()
        
        return jsonify({
            'success': True,
            'projects': result.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"List projects error: {e}")
        return jsonify({'success': False, 'error': 'LIST_FAILED'}), 500


@console_api_bp.route('/projects', methods=['POST'])
@require_console_auth(roles=['owner', 'admin'])
def create_project():
    """
    Create a new project.
    
    Request Body:
        {
            "name": "My App",
            "description": "Production app",
            "environment": "test"
        }
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({'success': False, 'error': 'INVALID_JSON'}), 400
    
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    environment = data.get('environment', 'test')
    
    if not name:
        return jsonify({
            'success': False,
            'error': 'MISSING_NAME',
            'message': 'Project name is required'
        }), 400
    
    if environment not in ['test', 'live']:
        return jsonify({
            'success': False,
            'error': 'INVALID_ENVIRONMENT',
            'message': 'Environment must be test or live'
        }), 400
    
    org_id = g.console_org_id
    user = g.console_user
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table('otp_projects').insert({
            'org_id': org_id,
            'name': name,
            'description': description,
            'environment': environment
        }).execute()
        
        project = result.data[0]
        
        # Audit log (async, non-blocking)
        log_audit_event(
            user_id=str(user.id),
            org_id=str(org_id),
            action='create_project',
            resource_type='project',
            resource_id=str(project['id'])
        )
        
        return jsonify({
            'success': True,
            'project': project
        }), 201
        
    except Exception as e:
        logger.error(f"Create project error: {e}")
        return jsonify({'success': False, 'error': 'CREATE_FAILED'}), 500


@console_api_bp.route('/projects/<project_id>', methods=['GET'])
@require_console_auth()
def get_project(project_id: str):
    """Get project details."""
    org_id = g.console_org_id
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table('otp_projects').select('*').eq(
            'id', project_id
        ).eq('org_id', org_id).single().execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'NOT_FOUND'}), 404
        
        return jsonify({
            'success': True,
            'project': result.data
        }), 200
        
    except Exception as e:
        logger.error(f"Get project error: {e}")
        return jsonify({'success': False, 'error': 'GET_FAILED'}), 500


@console_api_bp.route('/projects/<project_id>', methods=['PUT'])
@require_console_auth(roles=['owner', 'admin'])
def update_project(project_id: str):
    """Update project settings."""
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({'success': False, 'error': 'INVALID_JSON'}), 400
    
    org_id = g.console_org_id
    user = g.console_user
    
    # Build update object
    updates = {}
    if 'name' in data:
        updates['name'] = data['name'].strip()
    if 'description' in data:
        updates['description'] = data['description'].strip()
    if 'environment' in data and data['environment'] in ['test', 'live']:
        updates['environment'] = data['environment']
    if 'whatsapp_mode' in data and data['whatsapp_mode'] in ['platform', 'customer']:
        updates['whatsapp_mode'] = data['whatsapp_mode']
    if 'webhook_url' in data:
        updates['webhook_url'] = data['webhook_url']
    if 'otp_length' in data:
        updates['otp_length'] = max(4, min(8, int(data['otp_length'])))
    if 'otp_ttl_seconds' in data:
        updates['otp_ttl_seconds'] = max(60, min(600, int(data['otp_ttl_seconds'])))
    
    updates['updated_at'] = datetime.utcnow().isoformat()
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table('otp_projects').update(updates).eq(
            'id', project_id
        ).eq('org_id', org_id).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'NOT_FOUND'}), 404
        
        # Audit log (async, non-blocking)
        log_audit_event(
            user_id=str(user.id),
            org_id=str(org_id),
            action='update_project',
            resource_type='project',
            resource_id=str(project_id),
            metadata=updates
        )
        
        return jsonify({
            'success': True,
            'project': result.data[0]
        }), 200
        
    except Exception as e:
        logger.error(f"Update project error: {e}")
        return jsonify({'success': False, 'error': 'UPDATE_FAILED'}), 500


# =============================================================================
# API KEYS
# =============================================================================

@console_api_bp.route('/projects/<project_id>/keys', methods=['GET'])
@require_console_auth()
def list_api_keys(project_id: str):
    """List API keys for a project."""
    org_id = g.console_org_id
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Verify project belongs to org
        project = db.table('otp_projects').select('id').eq(
            'id', project_id
        ).eq('org_id', org_id).single().execute()
        
        if not project.data:
            return jsonify({'success': False, 'error': 'PROJECT_NOT_FOUND'}), 404
        
        # Get keys (don't return full key or hash)
        result = db.table('otp_api_keys').select(
            'id, key_prefix, name, scopes, environment, is_active, created_at, last_used_at, revoked_at'
        ).eq('project_id', project_id).order('created_at', desc=True).execute()
        
        return jsonify({
            'success': True,
            'keys': result.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"List keys error: {e}")
        return jsonify({'success': False, 'error': 'LIST_FAILED'}), 500


@console_api_bp.route('/projects/<project_id>/keys', methods=['POST'])
@require_console_auth(roles=['owner', 'admin', 'developer'])
def create_api_key(project_id: str):
    """
    Create a new API key.
    
    Request Body:
        {
            "name": "Production Key",
            "environment": "live",
            "scopes": ["send", "verify"]
        }
    
    Response:
        Returns the full API key ONCE (not stored)
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({'success': False, 'error': 'INVALID_JSON'}), 400
    
    name = data.get('name', 'API Key').strip()
    environment = data.get('environment', 'test')
    scopes = data.get('scopes', ['send', 'verify'])
    
    if environment not in ['test', 'live']:
        return jsonify({
            'success': False,
            'error': 'INVALID_ENVIRONMENT'
        }), 400
    
    org_id = g.console_org_id
    user = g.console_user
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Verify project and get its environment
        project = db.table('otp_projects').select('id, environment, org_id').eq(
            'id', project_id
        ).eq('org_id', org_id).single().execute()
        
        if not project.data:
            return jsonify({'success': False, 'error': 'PROJECT_NOT_FOUND'}), 404
        
        # Can't create live keys for test projects
        if environment == 'live' and project.data['environment'] == 'test':
            return jsonify({
                'success': False,
                'error': 'ENVIRONMENT_MISMATCH',
                'message': 'Cannot create live keys for test projects'
            }), 400
        
        # =====================================================================
        # BILLING GATE: Check entitlement for live keys
        # =====================================================================
        if environment == 'live':
            subscription = get_org_subscription(org_id)
            is_valid, error_msg = validate_key_environment('live', subscription)
            
            if not is_valid:
                logger.warning(
                    f"Live key creation denied for org {org_id}: "
                    f"level={subscription.get('entitlement_level') if subscription else 'none'}"
                )
                return jsonify({
                    'success': False,
                    'error': 'LIVE_ENTITLEMENT_REQUIRED',
                    'message': error_msg,
                    'current_level': subscription.get('entitlement_level', 'none') if subscription else 'none',
                    'redirect': '/console/billing/select-plan',
                    'cta': {
                        'text': 'Upgrade to create live keys',
                        'href': '/console/billing/select-plan'
                    }
                }), 402  # Payment Required
        
        # Generate API key
        is_test = environment == 'test'
        full_key, key_prefix, key_hash = generate_api_key(is_test=is_test)
        
        # Store key
        result = db.table('otp_api_keys').insert({
            'project_id': project_id,
            'key_prefix': key_prefix,
            'key_hash': key_hash,
            'name': name,
            'scopes': scopes,
            'environment': environment,
            'is_active': True
        }).execute()
        
        key_record = result.data[0]
        
        # Audit log (async, non-blocking)
        log_audit_event(
            user_id=str(user.id),
            org_id=str(org_id),
            action='create_api_key',
            resource_type='api_key',
            resource_id=str(key_record['id']),
            metadata={'name': name, 'environment': environment}
        )
        
        return jsonify({
            'success': True,
            'key': {
                'id': key_record['id'],
                'name': name,
                'key_prefix': key_prefix,
                'environment': environment,
                'scopes': scopes,
                'created_at': key_record['created_at']
            },
            'secret': full_key,  # Only returned once!
            'warning': 'Save this key now. It will not be shown again.'
        }), 201
        
    except Exception as e:
        logger.error(f"Create key error: {e}")
        return jsonify({'success': False, 'error': 'CREATE_FAILED'}), 500


@console_api_bp.route('/projects/<project_id>/keys/<key_id>/revoke', methods=['POST'])
@require_console_auth(roles=['owner', 'admin'])
def revoke_api_key(project_id: str, key_id: str):
    """Revoke (soft-delete) an API key."""
    org_id = g.console_org_id
    user = g.console_user
    
    try:
        data = request.get_json() or {}
    except Exception:
        data = {}
    
    reason = data.get('reason', 'Revoked by user')
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Verify project belongs to org
        project = db.table('otp_projects').select('id').eq(
            'id', project_id
        ).eq('org_id', org_id).single().execute()
        
        if not project.data:
            return jsonify({'success': False, 'error': 'PROJECT_NOT_FOUND'}), 404
        
        # Soft-delete the key
        result = db.table('otp_api_keys').update({
            'revoked_at': datetime.utcnow().isoformat(),
            'revoked_reason': reason,
            'is_active': False
        }).eq('id', key_id).eq('project_id', project_id).execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'KEY_NOT_FOUND'}), 404
        
        # Audit log (async, non-blocking)
        log_audit_event(
            user_id=str(user.id),
            org_id=str(org_id),
            action='revoke_api_key',
            resource_type='api_key',
            resource_id=str(key_id),
            metadata={'reason': reason}
        )
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Revoke key error: {e}")
        return jsonify({'success': False, 'error': 'REVOKE_FAILED'}), 500


# =============================================================================
# OTP LOGS
# =============================================================================

@console_api_bp.route('/logs', methods=['GET'])
@require_console_auth()
def get_otp_logs():
    """
    Get OTP request logs with pagination and filters.
    
    Query Params:
        - page: Page number (default 1)
        - limit: Items per page (default 50, max 100)
        - status: Filter by status
        - purpose: Filter by purpose
        - project_id: Filter by project
    """
    org_id = g.console_org_id
    
    page = int(request.args.get('page', 1))
    limit = min(int(request.args.get('limit', 50)), 100)
    status_filter = request.args.get('status')
    purpose_filter = request.args.get('purpose')
    project_id_filter = request.args.get('project_id')
    
    offset = (page - 1) * limit
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Get project IDs for this org
        if project_id_filter:
            # Verify project belongs to org
            project = db.table('otp_projects').select('id').eq(
                'id', project_id_filter
            ).eq('org_id', org_id).single().execute()
            
            if not project.data:
                return jsonify({'success': False, 'error': 'PROJECT_NOT_FOUND'}), 404
            
            project_ids = [project_id_filter]
        else:
            projects = db.table('otp_projects').select('id').eq('org_id', org_id).execute()
            project_ids = [p['id'] for p in (projects.data or [])]
        
        if not project_ids:
            return jsonify({
                'success': True,
                'logs': [],
                'pagination': {'page': page, 'limit': limit, 'total': 0}
            }), 200
        
        # Query otp_requests directly by project_id (the OTP service stores project_id)
        query = db.table('otp_requests').select(
            'request_id, phone, email, purpose, status, delivery_status, channel, attempts, resend_count, created_at'
        ).in_('project_id', project_ids)
        
        if status_filter:
            query = query.eq('status', status_filter)
        if purpose_filter:
            query = query.eq('purpose', purpose_filter)
        
        query = query.order('created_at', desc=True).range(offset, offset + limit - 1)
        
        result = query.execute()
        
        # Mask phone/email for display
        logs = []
        for log in (result.data or []):
            phone = log.get('phone') or ''
            email = log.get('email') or ''
            
            # Mask based on what's available
            if phone:
                masked_dest = f"{phone[:4]}****{phone[-2:]}" if len(phone) > 6 else '****'
            elif email:
                parts = email.split('@')
                if len(parts) == 2:
                    masked_dest = f"{parts[0][:2]}****@{parts[1]}"
                else:
                    masked_dest = '****'
            else:
                masked_dest = '****'
            
            logs.append({
                **log,
                'phone': masked_dest,  # Use phone field for backward compatibility
                'destination': masked_dest
            })
        
        return jsonify({
            'success': True,
            'logs': logs,
            'pagination': {
                'page': page,
                'limit': limit,
                'has_more': len(logs) == limit
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Get logs error: {e}")
        return jsonify({'success': False, 'error': 'LOGS_FAILED'}), 500


# =============================================================================
# ANALYTICS
# =============================================================================

@console_api_bp.route('/analytics', methods=['GET'])
@require_console_auth()
def get_analytics():
    """
    Get analytics data for charts.
    
    Query Params:
        - period: 7d, 30d, 90d (default 7d)
    """
    org_id = g.console_org_id
    period = request.args.get('period', '7d')
    
    days = {'7d': 7, '30d': 30, '90d': 90}.get(period, 7)
    start_date = datetime.utcnow() - timedelta(days=days)
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Get project IDs
        projects = db.table('otp_projects').select('id').eq('org_id', org_id).execute()
        project_ids = [p['id'] for p in (projects.data or [])]
        
        if not project_ids:
            return jsonify({
                'success': True,
                'analytics': {
                    'daily_volume': [],
                    'delivery_success': 0,
                    'verification_rate': 0,
                    'channel_breakdown': {'whatsapp': 0, 'sms': 0}
                }
            }), 200
        
        # Get API keys
        keys = db.table('otp_api_keys').select('business_id').in_(
            'project_id', project_ids
        ).execute()
        
        business_ids = list(set([k.get('business_id') for k in (keys.data or []) if k.get('business_id')]))
        
        if not business_ids:
            return jsonify({
                'success': True,
                'analytics': {
                    'daily_volume': [],
                    'delivery_success': 0,
                    'verification_rate': 0,
                    'channel_breakdown': {'whatsapp': 0, 'sms': 0}
                }
            }), 200
        
        # Get OTP data
        result = db.table('otp_requests').select(
            'status, delivery_status, channel, created_at'
        ).in_('business_id', business_ids).gte(
            'created_at', start_date.isoformat()
        ).execute()
        
        data = result.data or []
        
        # Calculate metrics
        total = len(data)
        delivered = sum(1 for d in data if d.get('delivery_status') == 'delivered')
        verified = sum(1 for d in data if d.get('status') == 'verified')
        whatsapp = sum(1 for d in data if d.get('channel') == 'whatsapp')
        sms = sum(1 for d in data if d.get('channel') == 'sms')
        
        delivery_success = (delivered / total * 100) if total > 0 else 0
        verification_rate = (verified / total * 100) if total > 0 else 0
        
        # TODO: Group by date for daily_volume chart
        
        return jsonify({
            'success': True,
            'analytics': {
                'total_otps': total,
                'delivery_success': round(delivery_success, 1),
                'verification_rate': round(verification_rate, 1),
                'channel_breakdown': {
                    'whatsapp': whatsapp,
                    'sms': sms
                }
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        return jsonify({'success': False, 'error': 'ANALYTICS_FAILED'}), 500
