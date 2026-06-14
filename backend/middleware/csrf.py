"""
CSRF Protection Middleware
==========================
FAANG-level CSRF protection for all payment/mutation endpoints.
Relies on Origin/Referer validation since we use Authorization: Bearer tokens
(not cookies) for API auth.

Reference: Stripe, GitHub, and Google all use Origin-based CSRF protection
for token-authenticated APIs.

Usage:
    from middleware.csrf import protect_mutations

    app.before_request(protect_mutations)
"""

import os
import logging
from flask import request, jsonify

logger = logging.getLogger('flowauxi.csrf')

ALLOWED_ORIGINS = frozenset({
    'https://flowauxi.com',
    'https://www.flowauxi.com',
    'https://app.flowauxi.com',
})

DEV_ALLOWED_ORIGIN_PREFIXES = frozenset({
    'http://localhost:',
    'http://127.0.0.1:',
})

ENV = os.getenv('FLASK_ENV', 'development')

# Mutation methods that modify state
MUTATION_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})


def protect_mutations():
    """
    Reject cross-origin mutation requests.

    For Authorization: Bearer authenticated APIs, Origin header validation
    is the standard CSRF defense (see GitHub, Stripe, Google APIs).
    Cookie-based CSRF tokens are NOT needed since we don't use session cookies
    for API auth.

    This runs as a before_request handler on all Flask blueprints.
    """
    if request.method not in MUTATION_METHODS:
        return

    # Skip webhook endpoints (called by Razorpay, not browser)
    if request.path.startswith('/api/webhooks') or request.path.startswith('/api/payments/webhook'):
        return

    origin = request.headers.get('Origin', '')
    referer = request.headers.get('Referer', '')

    # If both Origin and Referer are empty, it's a direct API call (not browser)
    # Allow through — the Authorization Bearer token will be validated separately
    if not origin and not referer:
        return

    # Check against allowed origins (production)
    if origin in ALLOWED_ORIGINS:
        return

    # In development, allow any localhost:* or 127.0.0.1:* origin
    if ENV != 'production':
        for prefix in DEV_ALLOWED_ORIGIN_PREFIXES:
            if origin.startswith(prefix):
                return
            if referer and referer.startswith(prefix):
                return

    # Check Referer as fallback against production origins
    if referer:
        for allowed in ALLOWED_ORIGINS:
            if referer.startswith(allowed):
                return

    logger.warning(
        f"CSRF blocked: method={request.method} path={request.path} "
        f"origin={origin} referer={referer}"
    )

    if ENV == 'production':
        return jsonify({
            'success': False,
            'error': 'Cross-origin request rejected',
            'error_code': 'CSRF_PROTECTED',
        }), 403
