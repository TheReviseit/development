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
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify

logger = logging.getLogger('reviseit.subscription_webhooks')

RAZORPAY_WEBHOOK_TOLERANCE_SECONDS = 300


def verify_webhook_timestamp(payload: dict) -> bool:
    """
    Verify webhook timestamp is within tolerance window.
    
    Razorpay sends 'created_at' as a Unix timestamp at the top level
    of the webhook event object. Reject events older than 5 minutes
    to prevent replay attacks.
    
    Fail CLOSED: missing or non-numeric timestamp = reject.
    """
    created_at_raw = payload.get('created_at')
    if created_at_raw is None or not isinstance(created_at_raw, (int, float)):
        logger.error(f"Webhook missing or invalid created_at field: {type(created_at_raw)}")
        return False
    event_time = datetime.fromtimestamp(created_at_raw, tz=timezone.utc)
    age = datetime.now(timezone.utc) - event_time
    if age > timedelta(seconds=RAZORPAY_WEBHOOK_TOLERANCE_SECONDS):
        logger.warning(f"Webhook event too old: age={age}")
        return False
    if age < timedelta(seconds=-60):
        logger.warning(f"Webhook event from the future: age={age}")
        return False
    return True

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

        # 0. Request size limit — reject oversized payloads (> 1MB)
        MAX_WEBHOOK_PAYLOAD = 1 * 1024 * 1024  # 1 MB
        content_length = request.content_length
        if content_length is not None and content_length > MAX_WEBHOOK_PAYLOAD:
            logger.error(
                f"webhook_payload_too_large content_length={content_length} "
                f"max={MAX_WEBHOOK_PAYLOAD}"
            )
            return jsonify({'status': 'error', 'message': 'Payload too large'}), 413

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

        # 3b. Verify webhook timestamp (replay protection, fail-closed)
        if not verify_webhook_timestamp(payload):
            event_id = payload.get('id', 'unknown')
            logger.warning(f"webhook_timestamp_rejected id={event_id}")
            return jsonify({'status': 'rejected', 'message': 'Event too old or invalid timestamp'}), 400

        # 4. Extract correlation ID from header (forwarded from checkout request)
        request_id = request.headers.get('X-Request-Id') or request.headers.get('X-Correlation-Id')

        # 5. Process event
        result = processor.process_event(payload, request_id=request_id)

        # 5. Return 200 for known retryable actions (lock contention, deferred) —
        #    Razorpay does NOT need to retry; the outbox worker or next webhook
        #    will resolve. Only return 500 for truly unexpected errors.
        status_code = 200 if (
            result.get('processed') or
            result.get('action') in ('lock_contention', 'subscription_not_found_deferred')
        ) else 500

        logger.info(
            f"webhook_response event={result.get('event_type')} "
            f"action={result.get('action')} duplicate={result.get('duplicate')} "
            f"status_code={status_code}"
        )

        return jsonify({
            'status': 'processed' if result.get('processed') else 'retry',
            **result,
        }), status_code

    except Exception as e:
        logger.error(f"webhook_unhandled_error: {e}", exc_info=True)
        # CRITICAL: Return 500 so Razorpay retries unprocessed events.
        # Previously returned 200 which caused SILENT EVENT LOSS.
        # If processing fails (DB down, Razorpay API error), Razorpay will retry
        # with exponential backoff up to 24 hours. Duplicate detection via
        # webhook_events table prevents double-processing on retry.
        return jsonify({'status': 'error', 'message': 'Internal error'}), 500
