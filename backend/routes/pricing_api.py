"""
Pricing API Routes
===================
Public endpoints for fetching domain-specific pricing.

Domain is resolved from request.host via domain middleware —
never from query params or request body.
"""

import logging
from flask import Blueprint, jsonify, g

logger = logging.getLogger('reviseit.pricing_api')

pricing_bp = Blueprint('pricing', __name__, url_prefix='/api/pricing')


@pricing_bp.route('/plans', methods=['GET'])
def list_plans():
    """
    List all active pricing plans for the current domain.
    
    Domain is resolved automatically from request.host
    via domain_middleware.resolve_product_domain().
    
    Response:
        {
            "success": true,
            "domain": "shop",
            "plans": [
                {
                    "plan_slug": "starter",
                    "display_name": "Starter",
                    "amount_paise": 199900,
                    "price_display": "₹1,999",
                    "currency": "INR",
                    "billing_cycle": "monthly",
                    "features": [...],
                    "limits": {...}
                },
                ...
            ]
        }
    """
    product_domain = getattr(g, 'product_domain', None)
    
    if not product_domain:
        return jsonify({
            'success': False,
            'error': 'Product domain could not be determined',
            'error_code': 'DOMAIN_REQUIRED',
        }), 400
    
    try:
        from services.pricing_service import get_pricing_service
        service = get_pricing_service()
        plans = service.get_all_plans(product_domain)
        
        # Transform for frontend consumption
        response_plans = []
        for plan in plans:
            amount_paise = plan.get('amount_paise', 0)
            currency = plan.get('currency', 'INR')
            
            response_plans.append({
                'plan_slug': plan.get('plan_slug'),
                'display_name': plan.get('display_name'),
                'description': plan.get('description', ''),
                'amount_paise': amount_paise,
                'price_display': _format_price(amount_paise, currency),
                'currency': currency,
                'billing_cycle': plan.get('billing_cycle', 'monthly'),
                'features': plan.get('features_json', []),
                'limits': plan.get('limits_json', {}),
            })
        
        return jsonify({
            'success': True,
            'domain': product_domain,
            'plans': response_plans,
        })
    
    except Exception as e:
        logger.error(f"Failed to fetch plans for {product_domain}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to load pricing',
            'error_code': 'PRICING_ERROR',
        }), 500


@pricing_bp.route('/plans/<plan_slug>', methods=['GET'])
def get_plan(plan_slug: str):
    """
    Get a specific plan's pricing for the current domain.
    
    Response:
        {
            "success": true,
            "plan": { ... }
        }
    """
    product_domain = getattr(g, 'product_domain', None)
    
    if not product_domain:
        return jsonify({
            'success': False,
            'error': 'Product domain could not be determined',
            'error_code': 'DOMAIN_REQUIRED',
        }), 400
    
    try:
        from services.pricing_service import get_pricing_service, PricingNotFoundError
        service = get_pricing_service()
        plan = service.get_plan(product_domain, plan_slug)
        
        amount_paise = plan.get('amount_paise', 0)
        currency = plan.get('currency', 'INR')
        
        return jsonify({
            'success': True,
            'plan': {
                'plan_slug': plan.get('plan_slug'),
                'display_name': plan.get('display_name'),
                'description': plan.get('description', ''),
                'amount_paise': amount_paise,
                'price_display': _format_price(amount_paise, currency),
                'currency': currency,
                'billing_cycle': plan.get('billing_cycle', 'monthly'),
                'features': plan.get('features_json', []),
                'limits': plan.get('limits_json', {}),
                'pricing_version': plan.get('pricing_version', 1),
            },
        })
    
    except Exception as e:
        error_name = type(e).__name__
        if error_name == 'PricingNotFoundError':
            return jsonify({
                'success': False,
                'error': f'Plan "{plan_slug}" not found for this domain',
                'error_code': 'PLAN_NOT_FOUND',
            }), 404
        
        logger.error(f"Failed to fetch plan {product_domain}/{plan_slug}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to load plan',
            'error_code': 'PRICING_ERROR',
        }), 500


@pricing_bp.route('/cache/stats', methods=['GET'])
def cache_stats():
    """Get pricing cache statistics (internal/admin only)."""
    try:
        from services.pricing_service import get_pricing_service
        service = get_pricing_service()
        stats = service.get_cache_stats()
        return jsonify({'success': True, 'cache': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@pricing_bp.route('/cache/invalidate', methods=['POST'])
def invalidate_cache():
    """Invalidate pricing cache (internal/admin only)."""
    try:
        from services.pricing_service import invalidate_cache as _invalidate
        count = _invalidate()
        return jsonify({'success': True, 'invalidated': count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _format_price(amount_paise: int, currency: str = 'INR') -> str:
    """Format price for display.
    
    Examples:
        399900 → "₹3,999"
        100    → "₹1"
    """
    symbols = {'INR': '₹', 'USD': '$', 'EUR': '€'}
    symbol = symbols.get(currency, currency + ' ')
    
    rupees = amount_paise // 100
    return f"{symbol}{rupees:,}"
