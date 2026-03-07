"""
Platform Monitoring API
========================
Admin-only endpoints for observing AI usage, costs, and tenant metrics.

Endpoints:
  GET /api/monitor/ai              - Full monitoring dashboard data
  GET /api/monitor/ai/overview     - Platform-wide stats
  GET /api/monitor/ai/tenants      - Per-tenant breakdown (paginated)
  GET /api/monitor/ai/trends       - Daily usage trends
  GET /api/monitor/ai/models       - Cost breakdown by AI model
  GET /api/monitor/ai/top          - Top consumers by cost/tokens

Security:
  All endpoints require admin authentication via MONITOR_ADMIN_KEY env var.
  Set this in your .env file to a long, random secret string.

Author: Flowauxi Engineering
"""

import os
import logging
from functools import wraps
from flask import Blueprint, request, jsonify

logger = logging.getLogger('flowauxi.monitor')

monitor_bp = Blueprint('monitor', __name__, url_prefix='/api/monitor')


# =============================================================================
# Admin Authentication
# =============================================================================

def require_monitor_admin(f):
    """
    Require admin authentication for monitoring endpoints.

    Validates against MONITOR_ADMIN_KEY environment variable.
    Accepts via:
      - Header: X-Monitor-Key: <key>
      - Query param: ?admin_key=<key> (for browser testing only)
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        admin_key = os.getenv('MONITOR_ADMIN_KEY')
        if not admin_key:
            logger.error("MONITOR_ADMIN_KEY not configured")
            return jsonify({
                'success': False,
                'error': 'Monitoring not configured. Set MONITOR_ADMIN_KEY env var.'
            }), 503

        # Check header first, then query param
        provided_key = (
            request.headers.get('X-Monitor-Key') or
            request.args.get('admin_key')
        )

        if not provided_key or provided_key != admin_key:
            return jsonify({
                'success': False,
                'error': 'Admin authentication required'
            }), 401

        return f(*args, **kwargs)
    return decorated


# =============================================================================
# Monitoring Service (lazy import to avoid circular deps)
# =============================================================================

def _get_service():
    from services.monitoring_service import get_monitoring_service
    return get_monitoring_service()


# =============================================================================
# Endpoints
# =============================================================================

@monitor_bp.route('/ai', methods=['GET'])
@require_monitor_admin
def monitor_dashboard():
    """
    Full monitoring dashboard data - combines overview + tenants + trends.

    Response:
    {
      "success": true,
      "platform": { ... global stats ... },
      "tenants": [ ... per-tenant breakdown ... ],
      "trends": { ... daily trends ... },
      "models": { ... model cost breakdown ... }
    }
    """
    try:
        service = _get_service()
        overview = service.get_platform_overview()
        tenants = service.get_tenant_usage(page=1, per_page=50)
        trends = service.get_daily_trends(days=30)
        models = service.get_model_breakdown()

        return jsonify({
            'success': True,
            'platform': overview,
            'tenants': tenants.get('tenants', []),
            'tenants_total': tenants.get('total', 0),
            'trends': trends.get('daily', []),
            'models': models.get('models', []),
        })

    except Exception as e:
        logger.error(f"Monitor dashboard error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@monitor_bp.route('/ai/overview', methods=['GET'])
@require_monitor_admin
def monitor_overview():
    """Platform-wide aggregated stats."""
    try:
        service = _get_service()
        overview = service.get_platform_overview()
        return jsonify({'success': True, 'data': overview})
    except Exception as e:
        logger.error(f"Monitor overview error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@monitor_bp.route('/ai/tenants', methods=['GET'])
@require_monitor_admin
def monitor_tenants():
    """
    Per-tenant usage breakdown.

    Query params:
      - page: int (default 1)
      - per_page: int (default 50, max 200)
      - sort_by: ai_cost|tokens|replies|name (default ai_cost)
      - order: asc|desc (default desc)
    """
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(200, max(1, int(request.args.get('per_page', 50))))
        sort_by = request.args.get('sort_by', 'ai_cost')
        order = request.args.get('order', 'desc')

        service = _get_service()
        data = service.get_tenant_usage(
            page=page, per_page=per_page,
            sort_by=sort_by, order=order
        )
        return jsonify({'success': True, **data})

    except Exception as e:
        logger.error(f"Monitor tenants error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@monitor_bp.route('/ai/trends', methods=['GET'])
@require_monitor_admin
def monitor_trends():
    """
    Daily usage trends.

    Query params:
      - days: int (default 30, max 90)
    """
    try:
        days = min(90, max(1, int(request.args.get('days', 30))))
        service = _get_service()
        data = service.get_daily_trends(days=days)
        return jsonify({'success': True, **data})
    except Exception as e:
        logger.error(f"Monitor trends error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@monitor_bp.route('/ai/models', methods=['GET'])
@require_monitor_admin
def monitor_models():
    """AI model cost breakdown."""
    try:
        service = _get_service()
        data = service.get_model_breakdown()
        return jsonify({'success': True, **data})
    except Exception as e:
        logger.error(f"Monitor models error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@monitor_bp.route('/ai/top', methods=['GET'])
@require_monitor_admin
def monitor_top_consumers():
    """
    Top consumers by cost or tokens.

    Query params:
      - limit: int (default 10, max 50)
      - metric: cost|tokens (default cost)
    """
    try:
        limit = min(50, max(1, int(request.args.get('limit', 10))))
        metric = request.args.get('metric', 'cost')
        service = _get_service()
        data = service.get_top_consumers(limit=limit, metric=metric)
        return jsonify({'success': True, **data})
    except Exception as e:
        logger.error(f"Monitor top error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
