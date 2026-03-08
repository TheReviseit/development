"""
Billing Admin API — Monitoring & Management Endpoints
=======================================================

Admin-only endpoints for monitoring subscription health, viewing
billing events, managing suspensions, and triggering manual actions.

All endpoints require admin authentication.

Endpoints:
    GET  /api/admin/billing/dashboard      — Overview dashboard data
    GET  /api/admin/billing/subscriptions   — List subscriptions with filters
    GET  /api/admin/billing/events          — Billing event log
    GET  /api/admin/billing/retries         — Payment retry queue
    GET  /api/admin/billing/suspensions     — Active suspensions
    GET  /api/admin/billing/mrr             — MRR breakdown
    POST /api/admin/billing/reactivate      — Manually reactivate subscription
    POST /api/admin/billing/suspend         — Manually suspend subscription
    POST /api/admin/billing/run-monitor     — Trigger billing monitor cycle
"""

import logging
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify

logger = logging.getLogger('reviseit.billing_admin')

billing_admin_bp = Blueprint('billing_admin', __name__, url_prefix='/api/admin/billing')


# =============================================================================
# Helpers
# =============================================================================

def _get_supabase():
    from supabase_client import get_supabase_client
    return get_supabase_client()


def _require_admin():
    """Simple admin check — extend with your auth middleware."""
    admin_key = request.headers.get('X-Admin-Key', '')
    import os
    expected = os.getenv('ADMIN_API_KEY', '')
    if not expected or admin_key != expected:
        return False
    return True


def _error(message, code, status=400):
    return jsonify({'success': False, 'error': code, 'message': message}), status


def _success(data, status=200):
    return jsonify({'success': True, **data}), status


# =============================================================================
# GET /api/admin/billing/dashboard
# =============================================================================

@billing_admin_bp.route('/dashboard', methods=['GET'])
def billing_dashboard():
    """
    Overview dashboard with key billing metrics.

    Returns:
        - subscription_counts: by status
        - revenue: total MRR
        - at_risk: past_due + grace_period count
        - recent_failures: last 24h payment failures
        - active_suspensions: count
    """
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        supabase = _get_supabase()

        # Subscription counts by status
        counts = {}
        for status in ['active', 'past_due', 'grace_period', 'suspended',
                       'cancelled', 'halted', 'paused', 'expired', 'trialing',
                       'pending', 'pending_upgrade']:
            result = supabase.table('subscriptions').select(
                'id', count='exact'
            ).eq('status', status).execute()
            counts[status] = result.count or 0

        # Payment failures in last 24h
        yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        failures = supabase.table('billing_events').select(
            'id', count='exact'
        ).eq('event_type', 'payment.failed').gte(
            'created_at', yesterday
        ).execute()

        # Active suspensions
        active_suspensions = supabase.table('account_suspensions').select(
            'id', count='exact'
        ).is_('reactivated_at', 'null').execute()

        # Pending retries
        pending_retries = supabase.table('payment_retries').select(
            'id', count='exact'
        ).eq('status', 'pending').execute()

        return _success({
            'subscription_counts': counts,
            'total_active': counts.get('active', 0) + counts.get('trialing', 0),
            'total_at_risk': counts.get('past_due', 0) + counts.get('grace_period', 0),
            'total_suspended': counts.get('suspended', 0),
            'total_churned': counts.get('cancelled', 0) + counts.get('expired', 0),
            'payment_failures_24h': failures.count or 0,
            'active_suspensions': active_suspensions.count or 0,
            'pending_retries': pending_retries.count or 0,
            'generated_at': datetime.now(timezone.utc).isoformat(),
        })

    except Exception as e:
        logger.error(f"billing_dashboard_error: {e}", exc_info=True)
        return _error('Failed to load dashboard', 'INTERNAL_ERROR', 500)


# =============================================================================
# GET /api/admin/billing/subscriptions
# =============================================================================

@billing_admin_bp.route('/subscriptions', methods=['GET'])
def list_subscriptions():
    """
    List subscriptions with optional filters.

    Query params:
        status: Filter by status (e.g., past_due, suspended)
        domain: Filter by product_domain
        limit: Max results (default 50, max 200)
        offset: Pagination offset
    """
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        supabase = _get_supabase()

        status_filter = request.args.get('status')
        domain_filter = request.args.get('domain')
        limit = min(int(request.args.get('limit', 50)), 200)
        offset = int(request.args.get('offset', 0))

        query = supabase.table('subscriptions').select(
            'id, user_id, product_domain, status, plan_name, '
            'current_period_start, current_period_end, grace_period_end, '
            'last_payment_failure_at, payment_retry_count, '
            'suspended_at, suspension_reason, '
            'razorpay_subscription_id, created_at, updated_at',
            count='exact'
        )

        if status_filter:
            query = query.eq('status', status_filter)
        if domain_filter:
            query = query.eq('product_domain', domain_filter)

        result = query.order('updated_at', desc=True).range(
            offset, offset + limit - 1
        ).execute()

        return _success({
            'subscriptions': result.data or [],
            'total': result.count or 0,
            'limit': limit,
            'offset': offset,
        })

    except Exception as e:
        logger.error(f"list_subscriptions_error: {e}", exc_info=True)
        return _error('Failed to list subscriptions', 'INTERNAL_ERROR', 500)


# =============================================================================
# GET /api/admin/billing/events
# =============================================================================

@billing_admin_bp.route('/events', methods=['GET'])
def list_billing_events():
    """
    Query billing events with filters.

    Query params:
        subscription_id: Filter by subscription
        user_id: Filter by user
        event_type: Filter by type
        limit: Max results (default 50)
        offset: Pagination offset
    """
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        supabase = _get_supabase()

        limit = min(int(request.args.get('limit', 50)), 200)
        offset = int(request.args.get('offset', 0))

        query = supabase.table('billing_events').select('*', count='exact')

        sub_id = request.args.get('subscription_id')
        user_id = request.args.get('user_id')
        event_type = request.args.get('event_type')

        if sub_id:
            query = query.eq('subscription_id', sub_id)
        if user_id:
            query = query.eq('user_id', user_id)
        if event_type:
            query = query.eq('event_type', event_type)

        result = query.order('created_at', desc=True).range(
            offset, offset + limit - 1
        ).execute()

        return _success({
            'events': result.data or [],
            'total': result.count or 0,
            'limit': limit,
            'offset': offset,
        })

    except Exception as e:
        logger.error(f"list_events_error: {e}", exc_info=True)
        return _error('Failed to list events', 'INTERNAL_ERROR', 500)


# =============================================================================
# GET /api/admin/billing/retries
# =============================================================================

@billing_admin_bp.route('/retries', methods=['GET'])
def list_retries():
    """List payment retries, optionally filtered by status."""
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        supabase = _get_supabase()

        status_filter = request.args.get('status', 'pending')
        limit = min(int(request.args.get('limit', 50)), 200)

        query = supabase.table('payment_retries').select('*', count='exact')
        if status_filter != 'all':
            query = query.eq('status', status_filter)

        result = query.order('scheduled_at').limit(limit).execute()

        return _success({
            'retries': result.data or [],
            'total': result.count or 0,
        })

    except Exception as e:
        logger.error(f"list_retries_error: {e}", exc_info=True)
        return _error('Failed to list retries', 'INTERNAL_ERROR', 500)


# =============================================================================
# GET /api/admin/billing/suspensions
# =============================================================================

@billing_admin_bp.route('/suspensions', methods=['GET'])
def list_suspensions():
    """List active (unreactivated) suspensions."""
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        supabase = _get_supabase()

        active_only = request.args.get('active_only', 'true') == 'true'
        limit = min(int(request.args.get('limit', 50)), 200)

        query = supabase.table('account_suspensions').select('*', count='exact')
        if active_only:
            query = query.is_('reactivated_at', 'null')

        result = query.order('suspended_at', desc=True).limit(limit).execute()

        return _success({
            'suspensions': result.data or [],
            'total': result.count or 0,
        })

    except Exception as e:
        logger.error(f"list_suspensions_error: {e}", exc_info=True)
        return _error('Failed to list suspensions', 'INTERNAL_ERROR', 500)


# =============================================================================
# GET /api/admin/billing/mrr
# =============================================================================

@billing_admin_bp.route('/mrr', methods=['GET'])
def get_mrr():
    """Get MRR breakdown by plan and domain."""
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        from tasks.billing_monitor import generate_mrr_report
        report = generate_mrr_report.apply().get(timeout=30)
        return _success({'report': report})
    except Exception as e:
        logger.error(f"mrr_report_error: {e}", exc_info=True)
        return _error('Failed to generate report', 'INTERNAL_ERROR', 500)


# =============================================================================
# POST /api/admin/billing/reactivate
# =============================================================================

@billing_admin_bp.route('/reactivate', methods=['POST'])
def admin_reactivate():
    """
    Manually reactivate a subscription.

    Request: { "subscription_id": "uuid" }
    """
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        data = request.get_json() or {}
        sub_id = data.get('subscription_id')
        if not sub_id:
            return _error('subscription_id required', 'MISSING_FIELD', 400)

        from services.subscription_lifecycle import get_lifecycle_engine
        engine = get_lifecycle_engine()

        success = engine.reactivate_subscription(
            subscription_id=sub_id,
            reason='Manual admin reactivation',
            reactivated_by='admin_action',
        )

        if success:
            return _success({'reactivated': True, 'subscription_id': sub_id})
        else:
            return _error(
                'Could not reactivate (subscription may already be active or not found)',
                'REACTIVATION_FAILED', 400
            )

    except Exception as e:
        logger.error(f"admin_reactivate_error: {e}", exc_info=True)
        return _error('Reactivation failed', 'INTERNAL_ERROR', 500)


# =============================================================================
# POST /api/admin/billing/suspend
# =============================================================================

@billing_admin_bp.route('/suspend', methods=['POST'])
def admin_suspend():
    """
    Manually suspend a subscription.

    Request: { "subscription_id": "uuid", "reason": "..." }
    """
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        data = request.get_json() or {}
        sub_id = data.get('subscription_id')
        reason = data.get('reason', 'Admin-initiated suspension')

        if not sub_id:
            return _error('subscription_id required', 'MISSING_FIELD', 400)

        from services.subscription_lifecycle import get_lifecycle_engine
        engine = get_lifecycle_engine()

        success = engine.suspend_subscription(
            subscription_id=sub_id,
            reason=reason,
            triggered_by='admin_action',
        )

        if success:
            return _success({'suspended': True, 'subscription_id': sub_id})
        else:
            return _error(
                'Could not suspend (subscription may already be suspended or not found)',
                'SUSPENSION_FAILED', 400
            )

    except Exception as e:
        logger.error(f"admin_suspend_error: {e}", exc_info=True)
        return _error('Suspension failed', 'INTERNAL_ERROR', 500)


# =============================================================================
# POST /api/admin/billing/run-monitor
# =============================================================================

@billing_admin_bp.route('/run-monitor', methods=['POST'])
def trigger_monitor():
    """
    Manually trigger a billing monitor cycle.

    Tries to queue via Celery first. Falls back to running synchronously
    if Celery is not available (useful for local testing without a worker).
    """
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        from tasks.billing_monitor import run_billing_cycle

        # Try async via Celery first
        try:
            task = run_billing_cycle.delay()
            return _success({
                'triggered': True,
                'mode': 'async',
                'task_id': task.id,
                'message': 'Billing monitor cycle queued in Celery',
            })
        except Exception:
            # Celery not running — run synchronously (local dev / test)
            logger.info("Celery unavailable, running billing cycle synchronously")
            result = run_billing_cycle()
            return _success({
                'triggered': True,
                'mode': 'sync',
                'result': result,
                'message': 'Billing monitor cycle completed synchronously',
            })

    except Exception as e:
        logger.error(f"trigger_monitor_error: {e}", exc_info=True)
        return _error('Failed to trigger monitor', 'INTERNAL_ERROR', 500)


# =============================================================================
# GET /api/admin/billing/subscription/:id/history
# =============================================================================

@billing_admin_bp.route('/subscription/<subscription_id>/history', methods=['GET'])
def subscription_history(subscription_id):
    """Get full state transition history for a subscription."""
    if not _require_admin():
        return _error('Unauthorized', 'UNAUTHORIZED', 401)

    try:
        supabase = _get_supabase()

        # Get status history
        history = supabase.table('subscription_status_history').select('*').eq(
            'subscription_id', subscription_id
        ).order('created_at', desc=True).limit(100).execute()

        # Get billing events
        events = supabase.table('billing_events').select('*').eq(
            'subscription_id', subscription_id
        ).order('created_at', desc=True).limit(100).execute()

        # Get retry history
        retries = supabase.table('payment_retries').select('*').eq(
            'subscription_id', subscription_id
        ).order('created_at', desc=True).limit(50).execute()

        return _success({
            'status_history': history.data or [],
            'billing_events': events.data or [],
            'payment_retries': retries.data or [],
        })

    except Exception as e:
        logger.error(f"subscription_history_error: {e}", exc_info=True)
        return _error('Failed to load history', 'INTERNAL_ERROR', 500)
