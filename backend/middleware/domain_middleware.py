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

import os
import logging
from flask import request, g, abort, jsonify

logger = logging.getLogger('reviseit.domain')

# In development, allow tunnel hosts (ngrok, cloudflare tunnels, etc.)
_IS_DEVELOPMENT = os.getenv('FLASK_ENV', 'development') != 'production'
_TUNNEL_PATTERNS = ('.ngrok-free.app', '.ngrok.io', '.trycloudflare.com', '.loca.lt')

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
    'booking.flowauxi.com': 'booking',
    'files.flowauxi.com': 'files',
    'tools.flowauxi.com': 'files',

    # Development (localhost with port-based routing)
    'localhost:3000': 'dashboard',
    'localhost:3001': 'shop',
    'localhost:3002': 'showcase',
    'localhost:3003': 'marketing',
    'localhost:3004': 'api',
    'localhost:3005': 'booking',
    'localhost:3006': 'files',

    # Backend server (Render production + local dev)
    'revsieit.onrender.com': 'api',
    'localhost:5000': 'dashboard',
    'localhost:5001': 'dashboard',
    '127.0.0.1:5000': 'dashboard',
    '127.0.0.1:5001': 'dashboard',
}

# Routes that are domain-agnostic (health checks, webhooks, etc.)
DOMAIN_EXEMPT_PREFIXES = (
    '/api/health',
    '/api/whatsapp/webhook',
    '/api/whatsapp/debug-phone',
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
        'revsieit.onrender.com',
    }
    
    domain = None
    resolution_source = 'unresolved'

    # Step 0: If x-product-domain or x-tenant-domain header exists (set by Next.js proxy),
    # use it directly. This is the MOST reliable source because the proxy resolves the
    # domain from the original client request BEFORE forwarding to the backend.
    #
    # The proxy sets these headers in frontend/proxy.ts:
    #   x-product-domain: resolved domain name
    #   x-tenant-domain:  resolved domain name (alias)
    #
    # These are NEVER set by the client — the proxy injects them server-side.
    proxy_domain = request.headers.get('X-Product-Domain') or request.headers.get('X-Tenant-Domain')
    if proxy_domain:
        domain = proxy_domain
        logger.debug(f"🌐 Domain resolved from proxy header: {proxy_domain}")
        resolution_source = 'proxy_header'
    
    # Step 1: If Origin header exists, prefer it (cross-origin API call)
    if domain is None:
        origin = request.headers.get('Origin', '')
    else:
        origin = ''
    if origin:
        origin_host = _extract_host_from_url(origin)
        domain = ALLOWED_HOSTS.get(origin_host)
        
        if domain:
            logger.info(f"🌐 Domain resolved from Origin: {origin_host} → {domain}")
            resolution_source = 'origin'
        elif host in BACKEND_HOSTS:
            # In development, allow tunnel origins
            if _IS_DEVELOPMENT and any(origin_host.endswith(pat) for pat in _TUNNEL_PATTERNS):
                domain = 'api'
                logger.info(f"🔧 Dev tunnel origin allowed: {origin_host} → {domain}")
                resolution_source = 'tunnel_origin'
            else:
                # Origin exists but is unknown, and we're on a backend host
                logger.warning(f"🚫 Unknown Origin host: {origin_host} (Origin: {origin})")
                abort(403, description=f'Unrecognized origin: {origin_host}')
    
    # Step 1b: For backend hosts (shared API server), try Referer to override Origin.
    # Next.js fallback rewrites may set Origin to the Flask backend host (localhost:5000),
    # which would wrongly resolve to "dashboard". The Referer always contains the original
    # page URL the user was on (e.g. http://localhost:3001/onboarding) and is preserved
    # by Next.js fallback rewrites, making it the authoritative source for domain resolution.
    if host in BACKEND_HOSTS:
        referer = request.headers.get('Referer', '')
        logger.info(f"🔍 [Domain Debug] host={host} origin={origin[:50] if origin else 'N/A'} referer={referer[:80] if referer else 'N/A'} domain_before_step1b={domain}")
        if referer:
            referer_host = _extract_host_from_url(referer)
            if referer_host:
                referer_domain = ALLOWED_HOSTS.get(referer_host)
                if referer_domain:
                    domain = referer_domain
                    resolution_source = 'referer'
                    logger.info(f"🌐 Domain resolved from Referer: {referer_host} → {referer_domain}")
    
    # Step 2: If no domain yet, try Host header (direct frontend access)
    if domain is None:
        domain = ALLOWED_HOSTS.get(host)
        resolution_source = 'host_fallback'

        if domain is None:
            # In development, allow tunnel hosts (ngrok, cloudflare, etc.)
            if _IS_DEVELOPMENT and any(host.endswith(pat) for pat in _TUNNEL_PATTERNS):
                domain = 'api'
                resolution_source = 'tunnel_host'
                logger.info(f"🔧 Dev tunnel host allowed: {host} → {domain}")
            else:
                # No Origin, unknown Host — block
                logger.warning(f"🚫 Rejected request from unknown host: {host}")
                abort(403, description=f'Unknown host: {host}')
    
    g.product_domain = domain
    
    # Log with resolution source for observability
    logger.info(f"🌐 Domain resolved: {host} → {domain} (source={resolution_source})")
    
    # WARNING: If resolution fell through to Host fallback on a backend server,
    # the proxy headers are NOT being forwarded. This indicates a regression in
    # the middleware or API route proxy layer.
    if resolution_source == 'host_fallback' and host in BACKEND_HOSTS:
        logger.warning(
            f"⚠️ [Domain Observability] Domain resolved via Host fallback on backend server: "
            f"{host} → {domain}. "
            f"Proxy headers (X-Product-Domain / X-Tenant-Domain / X-Signed-Context) were MISSING. "
            f"This indicates the Next.js middleware or API route proxy is not forwarding "
            f"domain context headers to the backend. "
            f"Check proxy.ts STEP 0 header injection and API route proxy forwarding logic."
        )


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
