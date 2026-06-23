"""
Billing Admin API (Phase C)
============================
Admin endpoints for the webhook replay console, DLQ management,
reconciliation monitoring, and event sourcing observability.

Access Control:
  - All endpoints require: X-Admin-Key header matching MONITOR_ADMIN_KEY
  - Admin key validated inline (_require_admin helper)
  - No JWT/user session — admin endpoints use shared secret key

Endpoints:
  GET    /api/admin/billing/outbox/stats       — Outbox backlog & throughput
  GET    /api/admin/billing/dlq                — List DLQ entries
  GET    /api/admin/billing/dlq/<id>           — Single DLQ entry detail
  POST   /api/admin/billing/dlq/<id>/replay    — Replay DLQ entry
  POST   /api/admin/billing/dlq/<id>/resolve   — Resolve DLQ entry
  POST   /api/admin/billing/dlq/<id>/dismiss   — Dismiss DLQ entry
  GET    /api/admin/billing/reconciliation     — Reconciliation history
  GET    /api/admin/billing/projection/lag     — Projection worker lag
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from flask import Blueprint, request, jsonify

logger = logging.getLogger('reviseit.routes.billing_admin')

billing_admin_bp = Blueprint('billing_admin', __name__, url_prefix='/api/admin/billing')

ADMIN_KEY = os.getenv('MONITOR_ADMIN_KEY') or os.getenv('ADMIN_API_KEY', '')


def _require_admin() -> Optional[str]:
    """Validate admin key from header. Returns error message or None."""
    key = request.headers.get('X-Admin-Key', '')
    if not key or key != ADMIN_KEY:
        return 'Unauthorized: invalid or missing X-Admin-Key'
    return None


def _success(data: dict, status: int = 200):
    return jsonify({'success': True, **data}), status


def _error(message: str, code: str = 'ERROR', status: int = 400):
    return jsonify({'success': False, 'error': message, 'code': code}), status


# =============================================================================
# OUTBOX STATS
# =============================================================================

@billing_admin_bp.route('/outbox/stats', methods=['GET'])
def outbox_stats():
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    try:
        from services.billing_outbox_service import get_outbox_stats
        stats = get_outbox_stats()
        return _success({'stats': stats})
    except Exception as e:
        logger.error(f"admin_outbox_stats_error: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


# =============================================================================
# DLQ LIST & DETAIL
# =============================================================================

@billing_admin_bp.route('/dlq', methods=['GET'])
def dlq_list():
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    status_filter = request.args.get('status')
    source_filter = request.args.get('source')
    limit = min(int(request.args.get('limit', 50)), 200)
    offset = int(request.args.get('offset', 0))

    try:
        from services.webhook_dlq_service import get_dlq_entries
        result = get_dlq_entries(
            status=status_filter or None,
            source=source_filter or None,
            limit=limit,
            offset=offset,
        )
        return _success({
            'entries': result['entries'],
            'total': result['total'],
            'limit': result['limit'],
            'offset': result['offset'],
        })
    except Exception as e:
        logger.error(f"admin_dlq_list_error: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


@billing_admin_bp.route('/dlq/<dlq_id>', methods=['GET'])
def dlq_detail(dlq_id: str):
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    try:
        from services.webhook_dlq_service import get_dlq_entry
        entry = get_dlq_entry(dlq_id)
        if not entry:
            return _error('DLQ entry not found', 'NOT_FOUND', 404)
        return _success({'entry': entry})
    except Exception as e:
        logger.error(f"admin_dlq_detail_error dlq_id={dlq_id}: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


# =============================================================================
# DLQ ACTIONS: REPLAY / RESOLVE / DISMISS
# =============================================================================

@billing_admin_bp.route('/dlq/<dlq_id>/replay', methods=['POST'])
def dlq_replay(dlq_id: str):
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    reviewed_by = request.headers.get('X-Admin-User', 'admin')
    data = request.get_json(silent=True) or {}
    resolution_note = data.get('note', '')

    try:
        from services.webhook_dlq_service import replay_entry
        result = replay_entry(dlq_id, reviewed_by=reviewed_by)
        if result.get('success'):
            return _success({
                'message': 'DLQ entry replayed',
                'dlq_id': dlq_id,
                'reviewed_by': reviewed_by,
            })
        return _error(result.get('error', 'Replay failed'), 'REPLAY_FAILED', 500)
    except Exception as e:
        logger.error(f"admin_dlq_replay_error dlq_id={dlq_id}: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


@billing_admin_bp.route('/dlq/<dlq_id>/resolve', methods=['POST'])
def dlq_resolve(dlq_id: str):
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    reviewed_by = request.headers.get('X-Admin-User', 'admin')
    data = request.get_json(silent=True) or {}
    resolution_note = data.get('note', '')

    if not resolution_note:
        return _error('resolution note is required to resolve', 'VALIDATION_ERROR')

    try:
        from services.webhook_dlq_service import resolve_entry
        success = resolve_entry(dlq_id, reviewed_by, resolution_note)
        if success:
            return _success({'message': 'DLQ entry resolved', 'dlq_id': dlq_id})
        return _error('Failed to resolve DLQ entry', 'RESOLVE_FAILED', 500)
    except Exception as e:
        logger.error(f"admin_dlq_resolve_error dlq_id={dlq_id}: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


@billing_admin_bp.route('/dlq/<dlq_id>/dismiss', methods=['POST'])
def dlq_dismiss(dlq_id: str):
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    reviewed_by = request.headers.get('X-Admin-User', 'admin')
    data = request.get_json(silent=True) or {}
    resolution_note = data.get('note', '')

    try:
        from services.webhook_dlq_service import dismiss_entry
        success = dismiss_entry(dlq_id, reviewed_by, resolution_note)
        if success:
            return _success({'message': 'DLQ entry dismissed', 'dlq_id': dlq_id})
        return _error('Failed to dismiss DLQ entry', 'DISMISS_FAILED', 500)
    except Exception as e:
        logger.error(f"admin_dlq_dismiss_error dlq_id={dlq_id}: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


# =============================================================================
# DLQ STATS
# =============================================================================

@billing_admin_bp.route('/dlq/stats', methods=['GET'])
def dlq_stats():
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    try:
        from services.webhook_dlq_service import get_dlq_stats
        stats = get_dlq_stats()
        return _success({'stats': stats})
    except Exception as e:
        logger.error(f"admin_dlq_stats_error: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


# =============================================================================
# RECONCILIATION MONITORING
# =============================================================================

@billing_admin_bp.route('/reconciliation', methods=['GET'])
def reconciliation_status():
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    domain = request.args.get('domain')
    limit = min(int(request.args.get('limit', 20)), 100)

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        query = db.table('subscription_events') \
            .select('id, subscription_id, event_type, new_status, reason, actor, created_at') \
            .eq('actor', 'reconciliation_engine') \
            .order('id', desc=True) \
            .limit(limit)

        if domain:
            query = query.eq('product_domain', domain)

        result = query.execute()

        return _success({
            'reconciliation_events': result.data or [],
            'total': len(result.data or []),
        })

    except Exception as e:
        logger.error(f"admin_reconciliation_error: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


# =============================================================================
# PROJECTION LAG
# =============================================================================

@billing_admin_bp.route('/projection/lag', methods=['GET'])
def projection_lag():
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        result = db.table('projection_checkpoints') \
            .select('*') \
            .eq('projector_name', 'subscription_status') \
            .single() \
            .execute()

        return _success({'checkpoint': result.data})

    except Exception as e:
        logger.error(f"admin_projection_lag_error: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


# =============================================================================
# RUNTIME FLAGS ADMIN
# =============================================================================

@billing_admin_bp.route('/flags', methods=['GET'])
def list_runtime_flags():
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)
    try:
        from config.billing_flags import get_all_flags
        return _success({'flags': get_all_flags(force_refresh=True)})
    except Exception as e:
        logger.error(f"admin_flags_list_error: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


@billing_admin_bp.route('/flags/<flag_key>', methods=['PUT'])
def update_runtime_flag(flag_key: str):
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)
    body = request.get_json(silent=True) or {}
    value = body.get('value')
    reason = (body.get('reason') or '').strip()
    actor = request.headers.get('X-Admin-Actor', 'admin_api')
    if value is None:
        return _error('value is required', 'VALIDATION_ERROR', 400)
    if len(reason) < 5:
        return _error('reason required (min 5 chars)', 'VALIDATION_ERROR', 400)
    try:
        from supabase_client import get_supabase_client
        from config.billing_flags import invalidate_cache
        db = get_supabase_client()
        import json as json_lib
        flag_value = value if isinstance(value, (dict, list)) else json_lib.loads(json_lib.dumps(value))
        db.rpc('update_billing_runtime_flag', {
            'p_key': flag_key,
            'p_value': flag_value,
            'p_reason': reason,
            'p_actor': actor,
        }).execute()
        invalidate_cache()
        logger.warning(
            f"billing_flag_updated key={flag_key} actor={actor} reason={reason[:80]}"
        )
        return _success({'flag_key': flag_key, 'value': flag_value})
    except Exception as e:
        logger.error(f"admin_flag_update_error key={flag_key}: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)


@billing_admin_bp.route('/flags/audit', methods=['GET'])
def list_flag_audit():
    auth_error = _require_admin()
    if auth_error:
        return _error(auth_error, 'UNAUTHORIZED', 401)
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        limit = min(int(request.args.get('limit', 50)), 200)
        result = db.table('billing_runtime_flags_audit').select('*').order(
            'changed_at', desc=True
        ).limit(limit).execute()
        return _success({'audit': result.data or []})
    except Exception as e:
        logger.error(f"admin_flag_audit_error: {e}", exc_info=True)
        return _error(str(e), 'INTERNAL_ERROR', 500)
