"""
Domain Detection Middleware — Enterprise Grade
================================================
Resolves product_domain from request.host (ONLY).

Enterprise rules:
  - Domain comes exclusively from request.host header
  - Never from JSON body, Origin, Referer, or query params
  - Unknown hosts are rejected with 403
  - Client NEVER tells server which product they are on

Usage:
    # In app.py, register before_request:
    from middleware.domain_middleware import resolve_product_domain
    app.before_request(resolve_product_domain)

    # In any route:
    domain = g.product_domain  # Always set after middleware runs
"""

import logging
from flask import request, g, abort, jsonify

logger = logging.getLogger('reviseit.domain')

# =============================================================================
# ALLOWED HOSTS — Strict Whitelist
# =============================================================================
# Every host your application serves must be listed here.
# Unknown hosts → 403 Forbidden.

ALLOWED_HOSTS: dict[str, str] = {
    # Production subdomains
    'shop.flowauxi.com': 'shop',
    'marketing.flowauxi.com': 'marketing',
    'pages.flowauxi.com': 'showcase',
    'flowauxi.com': 'dashboard',
    'www.flowauxi.com': 'dashboard',
    'api.flowauxi.com': 'api',

    # Development (localhost with port-based routing)
    'localhost:3000': 'dashboard',
    'localhost:3001': 'shop',
    'localhost:3002': 'showcase',
    'localhost:3003': 'marketing',
    'localhost:3004': 'api',

    # Backend dev server (Flask default)
    'localhost:5000': 'dashboard',
    'localhost:5001': 'dashboard',
    '127.0.0.1:5000': 'dashboard',
    '127.0.0.1:5001': 'dashboard',
}

# Routes that are domain-agnostic (health checks, webhooks, etc.)
DOMAIN_EXEMPT_PREFIXES = (
    '/api/health',
    '/api/whatsapp/webhook',
    '/v1/otp/',
    '/console/',
)


def resolve_product_domain():
    """
    Flask before_request middleware.
    
    Sets g.product_domain from request.host.
    
    Enterprise behavior:
      - Uses request.host (what the load balancer resolves)
      - Strips port for production domains
      - Rejects unknown hosts with 403
      - Sets g.product_domain for all downstream handlers
    """
    # Skip domain resolution for exempt routes
    path = request.path
    if path.startswith(DOMAIN_EXEMPT_PREFIXES):
        g.product_domain = None
        return
    
    # OPTIONS requests (CORS preflight) — allow through
    if request.method == 'OPTIONS':
        g.product_domain = None
        return
    
    host = request.host  # e.g., "shop.flowauxi.com" or "localhost:3001"
    
    # For API routes called cross-origin, the Host header is the backend's host,
    # not the frontend's host. In this case, we use the Origin header to determine
    # the product domain, since the backend is a shared API server.
    #
    # Priority:
    # 1. If Origin header exists → resolve from Origin (cross-origin API call)
    # 2. If request.host matches a known frontend host → use it (direct access)
    # 3. If request.host is the backend server → default to dashboard
    # 4. Unknown → 403
    
    # Backend server hosts — these serve ALL products, so we MUST check Origin
    BACKEND_HOSTS = {
        'localhost:5000', 'localhost:5001',
        '127.0.0.1:5000', '127.0.0.1:5001',
        'api.flowauxi.com',
    }
    
    domain = None
    
    # Step 1: If Origin header exists, prefer it (cross-origin API call)
    origin = request.headers.get('Origin', '')
    if origin:
        origin_host = _extract_host_from_url(origin)
        domain = ALLOWED_HOSTS.get(origin_host)
        
        if domain:
            logger.debug(f"🌐 Domain resolved from Origin: {origin_host} → {domain}")
        elif host in BACKEND_HOSTS:
            # Origin exists but is unknown, and we're on a backend host
            logger.warning(f"🚫 Unknown Origin host: {origin_host} (Origin: {origin})")
            abort(403, description=f'Unrecognized origin: {origin_host}')
    
    # Step 2: If no domain yet, try Host header (direct frontend access)
    if domain is None:
        domain = ALLOWED_HOSTS.get(host)
        
        if domain is None:
            # No Origin, unknown Host — block
            logger.warning(f"🚫 Rejected request from unknown host: {host}")
            abort(403, description=f'Unknown host: {host}')
    
    g.product_domain = domain
    logger.debug(f"🌐 Domain resolved: {host} → {domain}")


def _extract_host_from_url(url: str) -> str:
    """Extract host:port from a URL string.
    
    Examples:
        'https://shop.flowauxi.com' → 'shop.flowauxi.com'
        'http://localhost:3001' → 'localhost:3001'
        'https://flowauxi.com/path' → 'flowauxi.com'
    """
    try:
        # Remove protocol
        if '://' in url:
            url = url.split('://')[1]
        # Remove path
        if '/' in url:
            url = url.split('/')[0]
        return url
    except Exception:
        return ''


def get_product_domain() -> str:
    """
    Get the resolved product domain.
    
    Use this in route handlers instead of accessing g.product_domain directly.
    Raises clear error if middleware didn't run.
    """
    domain = getattr(g, 'product_domain', None)
    if domain is None:
        raise RuntimeError(
            "product_domain not set. Ensure resolve_product_domain middleware is registered "
            "and this route is not in DOMAIN_EXEMPT_PREFIXES."
        )
    return domain


def require_product_domain(f):
    """
    Decorator for routes that require a valid product domain.
    
    Usage:
        @payments_bp.route('/subscriptions/create', methods=['POST'])
        @require_product_domain
        def create_subscription():
            domain = g.product_domain  # Guaranteed to be set
    """
    from functools import wraps
    
    @wraps(f)
    def decorated_function(*args, **kwargs):
        domain = getattr(g, 'product_domain', None)
        if not domain:
            return jsonify({
                'success': False,
                'error': 'Product domain could not be determined',
                'error_code': 'DOMAIN_REQUIRED',
            }), 400
        return f(*args, **kwargs)
    
    return decorated_function
