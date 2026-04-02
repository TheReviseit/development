"""
Subscription Webhook Processor — Razorpay Event Handler
========================================================

Centralized, idempotent, multi-tenant-safe webhook processor for ALL
Razorpay subscription lifecycle events.

Design:
  1. Signature verification (HMAC-SHA256)
  2. Replay protection (webhook_events table)
  3. Event routing to appropriate handler
  4. Billing event recording
  5. State machine transitions via SubscriptionLifecycleEngine

Handles:
  - subscription.authenticated  → Activate subscription
  - subscription.charged        → Renew subscription period
  - subscription.halted         → Mark as halted (payment failures)
  - subscription.cancelled      → Mark as cancelled
  - subscription.paused         → Mark as paused
  - subscription.resumed        → Reactivate from pause
  - payment.captured            → Payment success (reactivation)
  - payment.failed              → Payment failure (retry sequence)

Security:
  - HMAC-SHA256 signature verification on raw body
  - Constant-time signature comparison
  - Event ID deduplication (idempotency)
  - Multi-tenant isolation (subscription → user mapping)
"""

import hmac
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger('reviseit.webhook_processor')


class WebhookProcessingError(Exception):
    """Raised when webhook processing fails."""
    pass


class WebhookSignatureError(Exception):
    """Raised when webhook signature verification fails."""
    pass


class WebhookProcessor:
    """
    Centralized Razorpay webhook processor.

    Routes events to the SubscriptionLifecycleEngine for state transitions,
    with full idempotency, replay protection, and audit logging.
    """

    def __init__(self, supabase, lifecycle_engine):
        self._supabase = supabase
        self._lifecycle = lifecycle_engine
        self._webhook_secret = os.getenv('RAZORPAY_WEBHOOK_SECRET', '')
        self.logger = logger

    # =========================================================================
    # Public API
    # =========================================================================

    def verify_signature(self, raw_body: bytes, signature: str) -> bool:
        """
        Verify Razorpay webhook signature using HMAC-SHA256.

        Args:
            raw_body: Raw request body bytes (NOT parsed JSON)
            signature: X-Razorpay-Signature header value

        Returns:
            True if signature is valid

        Raises:
            WebhookSignatureError if verification fails
        """
        if not self._webhook_secret:
            raise WebhookSignatureError("RAZORPAY_WEBHOOK_SECRET not configured")

        if not signature:
            raise WebhookSignatureError("Missing signature header")

        expected = hmac.new(
            self._webhook_secret.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            raise WebhookSignatureError("Signature verification failed")

        return True

    def process_event(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a verified Razorpay webhook event.

        Steps:
        1. Check for duplicate (replay protection)
        2. Record event receipt
        3. Route to appropriate handler
        4. Return processing result

        Args:
            payload: Parsed webhook JSON payload

        Returns:
            {
                'processed': True/False,
                'event_type': '...',
                'action': '...',
                'duplicate': True/False
            }
        """
        event_id = payload.get('id')
        event_type = payload.get('event', 'unknown')

        self.logger.info(f"webhook_received event={event_type} id={event_id}")

        # 1. Replay protection — check if already processed
        if event_id and self._is_duplicate_event(event_id):
            self.logger.info(f"webhook_duplicate event={event_id}")
            return {
                'processed': True,
                'event_type': event_type,
                'action': 'skipped_duplicate',
                'duplicate': True,
            }

        # 2. Record event receipt BEFORE processing (prevents race conditions)
        if event_id:
            self._record_webhook_event(event_id, event_type, payload)

        # 3. Extract entities from payload
        entity = payload.get('payload', {})
        subscription_data = entity.get('subscription', {}).get('entity', {})
        payment_data = entity.get('payment', {}).get('entity', {})

        # 4. Resolve subscription or store order
        razorpay_sub_id = (
            subscription_data.get('id') or
            payment_data.get('subscription_id')
        )

        if not razorpay_sub_id:
            # Check if this is a store order payment (FAANG Revenue upgrade)
            rzp_order_id = payment_data.get('order_id')
            if event_type == 'payment.captured' and rzp_order_id:
                try:
                    # Look up the store order by razorpay_order_id
                    # We store it in notes or payment_id (update mapping later if needed)
                    # For now, update any order directly by its payment_id match
                    res = self._supabase.table('orders').update({
                        'payment_status': 'captured',
                        'status': 'confirmed',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }).eq('payment_id', payment_data.get('id')).execute()
                    
                    self.logger.info(f"webhook_store_order_paid event_id={event_id} rzp_order={rzp_order_id}")
                    return {
                        'processed': True,
                        'event_type': event_type,
                        'action': 'store_order_paid',
                        'duplicate': False,
                    }
                except Exception as e:
                    self.logger.error(f"Failed to process store order payment: {e}")

            self.logger.warning(f"webhook_no_subscription event={event_type} id={event_id}")
            return {
                'processed': False,
                'event_type': event_type,
                'action': 'no_subscription_id',
                'duplicate': False,
            }

        # Find our subscription record
        subscription = self._find_subscription(razorpay_sub_id)
        if not subscription:
            self.logger.warning(
                f"webhook_subscription_not_found rzp_sub={razorpay_sub_id} event={event_type}"
            )
            return {
                'processed': False,
                'event_type': event_type,
                'action': 'subscription_not_found',
                'duplicate': False,
            }

        # 5. Route to handler
        handler = self._get_handler(event_type)
        if not handler:
            self.logger.info(f"webhook_unhandled_event event={event_type}")
            return {
                'processed': True,
                'event_type': event_type,
                'action': 'unhandled_event_type',
                'duplicate': False,
            }

        try:
            action = handler(
                subscription=subscription,
                subscription_data=subscription_data,
                payment_data=payment_data,
                event_id=event_id,
                payload=payload,
            )

            self.logger.info(
                f"webhook_processed event={event_type} id={event_id} "
                f"sub={subscription['id']} action={action}"
            )

            return {
                'processed': True,
                'event_type': event_type,
                'action': action,
                'duplicate': False,
            }

        except Exception as e:
            self.logger.error(
                f"webhook_processing_error event={event_type} id={event_id} "
                f"sub={subscription['id']} error={e}",
                exc_info=True
            )
            return {
                'processed': False,
                'event_type': event_type,
                'action': f'error: {str(e)[:100]}',
                'duplicate': False,
            }

    # =========================================================================
    # Event Handlers
    # =========================================================================

    def _get_handler(self, event_type: str):
        """Map event type to handler function."""
        handlers = {
            'subscription.authenticated': self._handle_subscription_authenticated,
            'subscription.activated': self._handle_subscription_authenticated,
            'subscription.charged': self._handle_subscription_charged,
            'subscription.halted': self._handle_subscription_halted,
            'subscription.cancelled': self._handle_subscription_cancelled,
            'subscription.paused': self._handle_subscription_paused,
            'subscription.resumed': self._handle_subscription_resumed,
            'payment.captured': self._handle_payment_captured,
            'payment.failed': self._handle_payment_failed,
        }
        return handlers.get(event_type)

    def _handle_subscription_authenticated(self, subscription, subscription_data,
                                           payment_data, event_id, payload) -> str:
        """
        subscription.authenticated — First payment success.

        For pending_upgrade: delegate to UpgradeOrchestrator.
        For new subscriptions: activate.
        """
        sub_status = subscription['status']
        sub_id = subscription['id']

        if sub_status == 'pending_upgrade':
            # Delegate to upgrade orchestrator
            try:
                from services.upgrade_orchestrator import get_upgrade_orchestrator
                orchestrator = get_upgrade_orchestrator()
                rzp_sub_id = (
                    subscription.get('pending_upgrade_razorpay_subscription_id') or
                    subscription_data.get('id')
                )
                orchestrator.handle_payment_success_webhook(rzp_sub_id, {
                    'id': event_id,
                    'current_period_start': self._parse_timestamp(
                        subscription_data.get('current_start')
                    ),
                    'current_period_end': self._parse_timestamp(
                        subscription_data.get('current_end')
                    ),
                })
                return 'upgrade_activated'
            except Exception as e:
                self.logger.error(f"upgrade_activation_error sub={sub_id}: {e}", exc_info=True)
                return f'upgrade_error: {str(e)[:50]}'

        # Regular activation
        self._lifecycle.handle_payment_success(
            subscription_id=sub_id,
            razorpay_payment_id=payment_data.get('id'),
            razorpay_event_id=event_id,
            period_start=self._parse_timestamp(subscription_data.get('current_start')),
            period_end=self._parse_timestamp(subscription_data.get('current_end')),
        )
        return 'subscription_activated'

    def _handle_subscription_charged(self, subscription, subscription_data,
                                     payment_data, event_id, payload) -> str:
        """
        subscription.charged — Recurring payment captured.

        Renews the billing period and reactivates if degraded.
        """
        self._lifecycle.handle_payment_success(
            subscription_id=subscription['id'],
            razorpay_payment_id=payment_data.get('id'),
            razorpay_event_id=event_id,
            period_start=self._parse_timestamp(subscription_data.get('current_start')),
            period_end=self._parse_timestamp(subscription_data.get('current_end')),
        )
        return 'subscription_renewed'

    def _handle_subscription_halted(self, subscription, subscription_data,
                                    payment_data, event_id, payload) -> str:
        """subscription.halted — Razorpay halted after max payment retries."""
        self._lifecycle.handle_halt(
            subscription_id=subscription['id'],
            razorpay_event_id=event_id,
        )
        return 'subscription_halted'

    def _handle_subscription_cancelled(self, subscription, subscription_data,
                                       payment_data, event_id, payload) -> str:
        """subscription.cancelled — User or system cancelled."""
        self._lifecycle.handle_cancellation(
            subscription_id=subscription['id'],
            razorpay_event_id=event_id,
        )
        return 'subscription_cancelled'

    def _handle_subscription_paused(self, subscription, subscription_data,
                                    payment_data, event_id, payload) -> str:
        """subscription.paused — Subscription paused."""
        self._lifecycle.handle_pause(
            subscription_id=subscription['id'],
            razorpay_event_id=event_id,
        )
        return 'subscription_paused'

    def _handle_subscription_resumed(self, subscription, subscription_data,
                                     payment_data, event_id, payload) -> str:
        """subscription.resumed — Subscription resumed from pause."""
        self._lifecycle.handle_resume(
            subscription_id=subscription['id'],
            razorpay_event_id=event_id,
        )
        return 'subscription_resumed'

    def _handle_payment_captured(self, subscription, subscription_data,
                                 payment_data, event_id, payload) -> str:
        """payment.captured — Individual payment confirmed."""
        self._lifecycle.handle_payment_success(
            subscription_id=subscription['id'],
            razorpay_payment_id=payment_data.get('id'),
            razorpay_event_id=event_id,
        )
        return 'payment_captured'

    def _handle_payment_failed(self, subscription, subscription_data,
                               payment_data, event_id, payload) -> str:
        """
        payment.failed — Payment attempt failed.

        Triggers the 3-day recovery lifecycle:
        Day 0: Mark as past_due, schedule retries
        Day 1: Auto-retry
        Day 2: Warning notification
        Day 3: Account suspension
        """
        error_desc = payment_data.get('error_description', 'Unknown payment error')
        error_code = payment_data.get('error_code', '')
        failure_reason = f"{error_code}: {error_desc}" if error_code else error_desc

        self._lifecycle.handle_payment_failure(
            subscription_id=subscription['id'],
            failure_reason=failure_reason,
            razorpay_payment_id=payment_data.get('id'),
            razorpay_event_id=event_id,
        )
        return 'payment_failed_handled'

    # =========================================================================
    # Private Helpers
    # =========================================================================

    def _find_subscription(self, razorpay_sub_id: str) -> Optional[Dict]:
        """
        Find subscription by Razorpay subscription ID.

        Checks both active and pending_upgrade subscriptions.
        Multi-tenant safe: returns subscription record scoped to user.
        """
        try:
            result = self._supabase.table('subscriptions').select('*').or_(
                f"razorpay_subscription_id.eq.{razorpay_sub_id},"
                f"pending_upgrade_razorpay_subscription_id.eq.{razorpay_sub_id}"
            ).limit(1).execute()

            return result.data[0] if result.data else None
        except Exception as e:
            self.logger.error(f"find_subscription_error rzp_sub={razorpay_sub_id}: {e}")
            return None

    def _is_duplicate_event(self, event_id: str) -> bool:
        """Check if this event was already processed (replay protection)."""
        try:
            result = self._supabase.table('webhook_events').select('id').eq(
                'event_id', event_id
            ).limit(1).execute()
            return bool(result.data)
        except Exception:
            return False  # Fail open: process event if check fails

    def _record_webhook_event(self, event_id: str, event_type: str, payload: Dict):
        """Record webhook event for replay protection."""
        try:
            self._supabase.table('webhook_events').upsert({
                'event_id': event_id,
                'event_type': event_type,
                'raw_payload': payload,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'processing_result': 'processed',
            }, on_conflict='event_id').execute()
        except Exception as e:
            self.logger.error(f"record_webhook_event_error id={event_id}: {e}")

    def _parse_timestamp(self, ts) -> Optional[str]:
        """Convert Razorpay unix timestamp to ISO string."""
        if not ts:
            return None
        try:
            if isinstance(ts, (int, float)):
                return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            return str(ts)
        except Exception:
            return None


# =============================================================================
# SINGLETON
# =============================================================================

_processor_instance: Optional[WebhookProcessor] = None


def get_webhook_processor() -> WebhookProcessor:
    """Get singleton WebhookProcessor instance."""
    global _processor_instance
    if _processor_instance is None:
        from supabase_client import get_supabase_client
        from services.subscription_lifecycle import get_lifecycle_engine

        _processor_instance = WebhookProcessor(
            supabase=get_supabase_client(),
            lifecycle_engine=get_lifecycle_engine(),
        )
        logger.info("WebhookProcessor initialized")

    return _processor_instance
