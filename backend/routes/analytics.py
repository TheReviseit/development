"""
Analytics API for WhatsApp Automation Dashboard.
Provides aggregated metrics, trends, and reporting.
"""

import os
from typing import Dict, Any, List, Optional
from flask import Blueprint, request, jsonify
from functools import wraps
from datetime import datetime, timedelta

# Create blueprint
analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')

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


def get_date_range(period: str) -> tuple:
    """Get start and end dates for a period."""
    end_date = datetime.utcnow().date()
    
    if period == '7d':
        start_date = end_date - timedelta(days=7)
    elif period == '30d':
        start_date = end_date - timedelta(days=30)
    elif period == '90d':
        start_date = end_date - timedelta(days=90)
    else:
        start_date = end_date - timedelta(days=7)
    
    return start_date.isoformat(), (end_date + timedelta(days=1)).isoformat()


@analytics_bp.route('/overview', methods=['GET'])
@require_auth
def get_overview():
    """
    Get dashboard overview statistics.
    
    Query params:
    - period: Time period (7d, 30d, 90d)
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        period = request.args.get('period', '7d')
        start_date, end_date = get_date_range(period)
        
        client = get_supabase_client()
        
        # Get aggregated analytics from analytics_daily table
        analytics_result = client.table('analytics_daily').select('*').eq(
            'user_id', user_id
        ).gte('date', start_date).lt('date', end_date).execute()
        
        analytics_data = analytics_result.data or []
        
        # Calculate totals
        totals = {
            'messages_sent': sum(d.get('messages_sent', 0) for d in analytics_data),
            'messages_received': sum(d.get('messages_received', 0) for d in analytics_data),
            'messages_delivered': sum(d.get('messages_delivered', 0) for d in analytics_data),
            'messages_read': sum(d.get('messages_read', 0) for d in analytics_data),
            'messages_failed': sum(d.get('messages_failed', 0) for d in analytics_data),
            'ai_replies_generated': sum(d.get('ai_replies_generated', 0) for d in analytics_data),
            'ai_tokens_used': sum(d.get('ai_tokens_used', 0) for d in analytics_data),
            'ai_cost_usd': 0,  # Calculated from LLM usage tracker, not stored in analytics_daily
            'conversations_started': sum(d.get('conversations_started', 0) for d in analytics_data),
            'broadcast_messages': sum(d.get('campaign_messages_sent', 0) for d in analytics_data)
        }
        
        # Calculate rates
        total_sent = totals['messages_sent'] or 1  # Avoid division by zero
        delivery_rate = round((totals['messages_delivered'] / total_sent) * 100, 1) if total_sent > 0 else 0
        read_rate = round((totals['messages_read'] / total_sent) * 100, 1) if total_sent > 0 else 0
        
        # Get user's business_id from connected_business_managers
        bm_result = client.table('connected_business_managers').select('id').eq(
            'user_id', user_id
        ).limit(1).execute()
        
        business_id = bm_result.data[0]['id'] if bm_result.data else None
        
        # Get active conversations count using business_id
        active_convos_count = 0
        if business_id:
            active_convos = client.table('whatsapp_conversations').select('id', count='exact').eq(
                'business_id', business_id
            ).eq('status', 'active').execute()
            active_convos_count = active_convos.count if hasattr(active_convos, 'count') else 0
        
        # Get LLM usage from tracker (if available)
        # FIXED: Use business_id (not user_id) for tracking!
        llm_usage = None
        if business_id:
            try:
                from llm_usage_tracker import get_usage_tracker
                tracker = get_usage_tracker()
                llm_usage = tracker.get_usage(business_id)  # Use business_id!
            except Exception as e:
                print(f"⚠️ LLM tracker unavailable: {e}")
                llm_usage = None
        
        # Calculate AI metrics from consistent source
        # Priority: Real-time tracker > Historical aggregated data
        USD_TO_INR = 89.58
        
        if llm_usage:
            # Use real-time tracker data (most accurate for current billing period)
            ai_tokens_used = llm_usage.get('tokens_used', 0)
            ai_tokens_limit = llm_usage.get('tokens_limit', 1_600_000)
            ai_tokens_percent = llm_usage.get('tokens_percent', 0)
            ai_replies = llm_usage.get('replies_used', 0)
            ai_cost_usd = llm_usage.get('cost_usd', 0)
            ai_cost_inr = llm_usage.get('cost_inr', 0)
        else:
            # Fallback to aggregated historical data
            ai_tokens_used = totals['ai_tokens_used']
            ai_tokens_limit = 1_600_000  # Default starter plan
            ai_tokens_percent = round((ai_tokens_used / ai_tokens_limit) * 100, 1) if ai_tokens_limit > 0 else 0
            ai_replies = totals['ai_replies_generated']
            ai_cost_usd = totals['ai_cost_usd']
            ai_cost_inr = round(ai_cost_usd * USD_TO_INR, 2)
        
        # Build trends data
        trends = {
            'dates': [],
            'sent': [],
            'received': [],
            'ai_replies': []
        }
        
        for d in sorted(analytics_data, key=lambda x: x['date']):
            trends['dates'].append(d['date'])
            trends['sent'].append(d.get('messages_sent', 0))
            trends['received'].append(d.get('messages_received', 0))
            trends['ai_replies'].append(d.get('ai_replies_generated', 0))
        
        return jsonify({
            'success': True,
            'period': period,
            'messages': {
                'sent': totals['messages_sent'],
                'received': totals['messages_received'],
                'delivered': totals['messages_delivered'],
                'read': totals['messages_read'],
                'failed': totals['messages_failed'],
                'delivery_rate': delivery_rate,
                'read_rate': read_rate
            },
            'ai': {
                'replies_generated': ai_replies,
                'tokens_used': ai_tokens_used,
                'tokens_limit': ai_tokens_limit,
                'tokens_percent': ai_tokens_percent,
                'cost_usd': round(ai_cost_usd, 4),
                'cost_inr': round(ai_cost_inr, 2)
            },
            'conversations': {
                'started': totals['conversations_started'],
                'active': active_convos_count
            },
            'campaigns': {
                'broadcast_messages': totals['broadcast_messages']
            },
            'trends': trends
        })
    
    except Exception as e:
        print(f"❌ Error getting analytics overview: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@analytics_bp.route('/messages', methods=['GET'])
@require_auth
def get_message_analytics():
    """
    Get detailed message analytics.
    
    Query params:
    - period: Time period (7d, 30d, 90d)
    - group_by: Grouping (day, hour, status, type)
    """
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        period = request.args.get('period', '7d')
        group_by = request.args.get('group_by', 'day')
        start_date, end_date = get_date_range(period)
        
        client = get_supabase_client()
        
        # Get user's business_id first
        bm_result = client.table('connected_business_managers').select('id').eq(
            'user_id', user_id
        ).limit(1).execute()
        
        business_id = bm_result.data[0]['id'] if bm_result.data else None
        
        if not business_id:
            return jsonify({
                'success': True,
                'period': period,
                'total': 0,
                'by_direction': {'inbound': 0, 'outbound': 0},
                'by_status': {},
                'by_type': {},
                'ai_generated': 0,
                'human_sent': 0
            })
        
        # Get messages in period using business_id
        result = client.table('whatsapp_messages').select(
            'id, direction, status, message_type, created_at, is_ai_generated'
        ).eq('business_id', business_id).gte('created_at', start_date).lt('created_at', end_date).execute()
        
        messages = result.data or []
        
        # Group by direction
        by_direction = {'inbound': 0, 'outbound': 0}
        by_status = {'sent': 0, 'delivered': 0, 'read': 0, 'failed': 0}
        by_type = {}
        ai_generated = 0
        
        for msg in messages:
            direction = msg.get('direction', 'outbound')
            by_direction[direction] = by_direction.get(direction, 0) + 1
            
            status = msg.get('status', 'sent')
            by_status[status] = by_status.get(status, 0) + 1
            
            msg_type = msg.get('message_type', 'text')
            by_type[msg_type] = by_type.get(msg_type, 0) + 1
            
            if msg.get('is_ai_generated'):
                ai_generated += 1
        
        return jsonify({
            'success': True,
            'period': period,
            'total': len(messages),
            'by_direction': by_direction,
            'by_status': by_status,
            'by_type': by_type,
            'ai_generated': ai_generated,
            'human_sent': by_direction['outbound'] - ai_generated
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@analytics_bp.route('/conversations', methods=['GET'])
@require_auth
def get_conversation_analytics():
    """Get conversation analytics including response times."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        period = request.args.get('period', '7d')
        start_date, end_date = get_date_range(period)
        
        client = get_supabase_client()
        
        # Get conversations - use business_id
        bm_result = client.table('connected_business_managers').select('id').eq(
            'user_id', user_id
        ).limit(1).execute()
        
        business_id = bm_result.data[0]['id'] if bm_result.data else None
        
        if not business_id:
            return jsonify({
                'success': True,
                'period': period,
                'total': 0,
                'by_status': {},
                'avg_messages_per_conversation': 0
            })
        
        result = client.table('whatsapp_conversations').select(
            'id, status, created_at, updated_at, total_messages'
        ).eq('business_id', business_id).gte('created_at', start_date).lt('created_at', end_date).execute()
        
        conversations = result.data or []
        
        # Group by status
        by_status = {'open': 0, 'pending': 0, 'resolved': 0, 'closed': 0}
        total_messages = 0
        
        for conv in conversations:
            status = conv.get('status', 'open')
            by_status[status] = by_status.get(status, 0) + 1
            total_messages += conv.get('total_messages', 0)
        
        avg_messages_per_conv = round(total_messages / len(conversations), 1) if conversations else 0
        
        return jsonify({
            'success': True,
            'period': period,
            'total': len(conversations),
            'by_status': by_status,
            'avg_messages_per_conversation': avg_messages_per_conv
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@analytics_bp.route('/campaigns', methods=['GET'])
@require_auth
def get_campaign_analytics():
    """Get campaign analytics."""
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        user_id = request.user_id
        period = request.args.get('period', '30d')
        start_date, end_date = get_date_range(period)
        
        client = get_supabase_client()
        
        result = client.table('broadcast_campaigns').select(
            'id, name, status, total_recipients, messages_sent, messages_delivered, messages_read, messages_failed, created_at'
        ).eq('user_id', user_id).gte('created_at', start_date).lt('created_at', end_date).execute()
        
        campaigns = result.data or []
        
        # Aggregate stats
        totals = {
            'campaigns': len(campaigns),
            'recipients': sum(c.get('total_recipients', 0) for c in campaigns),
            'sent': sum(c.get('messages_sent', 0) for c in campaigns),
            'delivered': sum(c.get('messages_delivered', 0) for c in campaigns),
            'read': sum(c.get('messages_read', 0) for c in campaigns),
            'failed': sum(c.get('messages_failed', 0) for c in campaigns)
        }
        
        # By status
        by_status = {}
        for c in campaigns:
            status = c.get('status', 'draft')
            by_status[status] = by_status.get(status, 0) + 1
        
        return jsonify({
            'success': True,
            'period': period,
            'totals': totals,
            'by_status': by_status,
            'campaigns': campaigns
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@analytics_bp.route('/ai-usage', methods=['GET'])
@require_auth
def get_ai_usage():
    """Get AI/LLM usage analytics."""
    try:
        user_id = request.user_id
        
        if not SUPABASE_AVAILABLE:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        client = get_supabase_client()
        
        # Get business_id for this user
        bm_result = client.table('connected_business_managers').select('id').eq(
            'user_id', user_id
        ).limit(1).execute()
        
        business_id = bm_result.data[0]['id'] if bm_result.data else None
        
        if not business_id:
            return jsonify({
                'success': True,
                'usage': {
                    'tokens_used': 0,
                    'tokens_limit': 1_600_000,
                    'tokens_percent': 0,
                    'replies_used': 0,
                    'replies_limit': 1000,
                    'cost_usd': 0,
                    'cost_inr': 0,
                    'plan': 'starter'
                }
            })
        
        # Try to get from usage tracker (real-time data)
        try:
            from llm_usage_tracker import get_usage_tracker
            tracker = get_usage_tracker()
            usage = tracker.get_usage(business_id)  # Use business_id!
            
            return jsonify({
                'success': True,
                'usage': usage
            })
        except ImportError:
            pass
        
        # Fallback to database
        result = client.table('business_llm_usage').select('*').eq(
            'business_id', business_id
        ).limit(1).execute()
        
        if result.data:
            data = result.data[0]
            tokens_used = data.get('monthly_tokens_used', 0)
            tokens_limit = 1_600_000  # Default starter plan
            return jsonify({
                'success': True,
                'usage': {
                    'tokens_used': tokens_used,
                    'tokens_limit': tokens_limit,
                    'tokens_percent': round((tokens_used / tokens_limit) * 100, 1) if tokens_limit > 0 else 0,
                    'replies_used': data.get('monthly_llm_replies', 0),
                    'replies_limit': 1000,
                    'billing_cycle_start': data.get('billing_cycle_start'),
                    'billing_cycle_end': data.get('billing_cycle_end'),
                    'cost_usd': 0,
                    'cost_inr': 0
                }
            })
        
        return jsonify({
            'success': True,
            'usage': {
                'tokens_used': 0,
                'tokens_limit': 1_600_000,
                'tokens_percent': 0,
                'replies_used': 0,
                'replies_limit': 1000,
                'cost_usd': 0,
                'cost_inr': 0,
                'plan': 'starter'
            }
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@analytics_bp.route('/aggregate', methods=['POST'])
def aggregate_daily_analytics():
    """
    Aggregate analytics for a specific date (scheduled job endpoint).
    Called by cron job to update analytics_daily table.
    
    Body: {"date": "2024-12-24"} or empty for yesterday
    """
    # This should be protected by a secret key in production
    api_key = request.headers.get('X-API-Key')
    expected_key = os.getenv('ANALYTICS_API_KEY')
    
    if expected_key and api_key != expected_key:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    if not SUPABASE_AVAILABLE:
        return jsonify({'success': False, 'error': 'Database not available'}), 503
    
    try:
        data = request.get_json() or {}
        target_date = data.get('date') or (datetime.utcnow().date() - timedelta(days=1)).isoformat()
        
        client = get_supabase_client()
        
        # Get all users
        users_result = client.table('users').select('id').execute()
        users = users_result.data or []
        
        aggregated_count = 0
        
        for user in users:
            user_id = user['id']
            
            # Get user's business_id
            bm_result = client.table('connected_business_managers').select('id').eq(
                'user_id', user_id
            ).limit(1).execute()
            
            business_id = bm_result.data[0]['id'] if bm_result.data else None
            
            if not business_id:
                continue  # Skip users without a connected business
            
            # Get message stats for the day
            next_date = (datetime.fromisoformat(target_date) + timedelta(days=1)).date().isoformat()
            
            messages = client.table('whatsapp_messages').select('direction, status, is_ai_generated').eq(
                'business_id', business_id
            ).gte('created_at', target_date).lt('created_at', next_date).execute()
            
            msg_data = messages.data or []
            
            stats = {
                'user_id': user_id,
                'date': target_date,
                'messages_sent': sum(1 for m in msg_data if m.get('direction') == 'outbound'),
                'messages_received': sum(1 for m in msg_data if m.get('direction') == 'inbound'),
                'messages_delivered': sum(1 for m in msg_data if m.get('status') == 'delivered'),
                'messages_read': sum(1 for m in msg_data if m.get('status') == 'read'),
                'messages_failed': sum(1 for m in msg_data if m.get('status') == 'failed'),
                'ai_replies_generated': sum(1 for m in msg_data if m.get('is_ai_generated'))
            }
            
            # Upsert analytics
            client.table('analytics_daily').upsert(
                stats,
                on_conflict='user_id,date'
            ).execute()
            
            aggregated_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Aggregated analytics for {aggregated_count} users on {target_date}'
        })
    
    except Exception as e:
        print(f"❌ Error aggregating analytics: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
