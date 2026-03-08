"""
Subscription Webhook Route — Backend Razorpay Webhook Endpoint
===============================================================

Unified webhook endpoint for ALL Razorpay subscription lifecycle events.
Delegates to WebhookProcessor for processing.

This endpoint:
  1. Verifies HMAC-SHA256 signature on raw body
  2. Delegates to WebhookProcessor for idempotent processing
  3. Always returns 200 (Razorpay retries on non-2xx)
  4. Logs everything for observability

Endpoint: POST /api/webhooks/subscription
"""

import logging
from flask import Blueprint, request, jsonify

logger = logging.getLogger('reviseit.subscription_webhooks')

subscription_webhooks_bp = Blueprint(
    'subscription_webhooks', __name__,
    url_prefix='/api/webhooks'
)


@subscription_webhooks_bp.route('/subscription', methods=['POST'])
def handle_subscription_webhook():
    """
    Handle Razorpay subscription lifecycle webhooks.

    Security: HMAC-SHA256 signature verification.
    Idempotency: Duplicate events are detected and skipped.
    Safety: Always returns 200 to prevent Razorpay retries on processed events.
    """
    try:
        from services.webhook_processor import (
            get_webhook_processor,
            WebhookSignatureError,
        )

        processor = get_webhook_processor()

        # 1. Get raw body and signature
        raw_body = request.get_data()
        signature = request.headers.get('X-Razorpay-Signature', '')

        # 2. Verify signature
        try:
            processor.verify_signature(raw_body, signature)
        except WebhookSignatureError as e:
            logger.warning(f"webhook_signature_failed: {e}")
            return jsonify({'status': 'error', 'message': 'Invalid signature'}), 401

        # 3. Parse payload
        try:
            payload = request.get_json()
        except Exception:
            logger.error("webhook_invalid_json")
            return jsonify({'status': 'error', 'message': 'Invalid JSON'}), 400

        if not payload:
            return jsonify({'status': 'error', 'message': 'Empty payload'}), 400

        # 4. Process event
        result = processor.process_event(payload)

        # 5. Always return 200 for processed/duplicate events
        # Razorpay will retry on non-2xx, which we don't want for already-processed events
        status_code = 200 if result.get('processed') else 200

        logger.info(
            f"webhook_response event={result.get('event_type')} "
            f"action={result.get('action')} duplicate={result.get('duplicate')}"
        )

        return jsonify({
            'status': 'processed' if result.get('processed') else 'accepted',
            **result,
        }), status_code

    except Exception as e:
        logger.error(f"webhook_unhandled_error: {e}", exc_info=True)
        # Return 200 even on errors to prevent infinite Razorpay retries.
        # The billing monitor will catch any missed state transitions.
        return jsonify({'status': 'error', 'message': 'Internal error'}), 200
