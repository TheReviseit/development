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
  6. Distributed tracing via OpenTelemetry spans per event

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
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger('reviseit.webhook_processor')

try:
    from prometheus_client import Counter  # type: ignore

    billing_webhook_events_total = Counter(
        "billing_webhook_events_total",
        "Total billing webhook events received (domain-scoped)",
        ["event_type", "domain"],
    )
    billing_outbox_write_failures_total = Counter(
        "billing_outbox_write_failures_total",
        "Total billing outbox write failures (by source)",
        ["source"],
    )
except Exception:
    billing_webhook_events_total = None
    billing_outbox_write_failures_total = None

# Distributed lock for activation race prevention
try:
    from services.redis_lock import acquire_lock, release_lock, is_redis_available
except ImportError:
    acquire_lock = None
    release_lock = None

    def is_redis_available() -> bool:
        return False

# Distributed tracing
try:
    from services.billing_tracing import traced, span_context, billing_attributes
    WEBHOOK_TRACING_AVAILABLE = True
except ImportError:
    WEBHOOK_TRACING_AVAILABLE = False

    def traced(span_name=None, **kwargs):
        def decorator(f):
            return f
        return decorator

    class span_context:
        def __init__(self, name, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    def billing_attributes(**kwargs):
        return {}


class WebhookProcessingError(Exception):
    """Raised when webhook processing fails."""
    pass


class WebhookSignatureError(Exception):
    """Raised when webhook signature verification fails."""
    pass


class WebhookLockContentionError(WebhookProcessingError):
    """Raised when activation lock is held — Razorpay should retry."""
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

    @traced("webhook_processor.process_event", attributes=lambda self, payload: billing_attributes(
        status=payload.get('event', 'unknown').replace('.', '_'),
    ))
    def process_event(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a verified Razorpay webhook event.

        FAANG-level: SINGLE ATOMIC INSERT for dedup + claim in one operation.
        No TOCTOU window. The `processing_result` column doubles as:
          - 'processing': claimed for processing (or stalled — retry allowed)
          - 'processed': completed, future duplicates are silently skipped

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

        # 1. ATOMIC DEDUP — single INSERT claims the event exclusively
        # If INSERT succeeds → this worker owns it (processing_result='processing').
        # If INSERT fails (duplicate) → another worker already claimed it.
        # The status tells us: 'processing' = previous worker failed, retry OK;
        # 'processed' = already done, skip.
        if event_id:
            claim_result = self._atomic_claim_event(event_id, event_type, payload)
            if claim_result == 'duplicate':
                self.logger.info(f"webhook_duplicate event={event_id}")
                return {
                    'processed': True,
                    'event_type': event_type,
                    'action': 'skipped_duplicate',
                    'duplicate': True,
                }
            elif claim_result in ('retry', 'reclaimed'):
                self.logger.info(f"webhook_retry event={event_id} reason={claim_result}")
                # Previous attempt crashed — this is a retry, proceed

        # 2. Extract entities from payload
        entity = payload.get('payload', {})
        subscription_data = entity.get('subscription', {}).get('entity', {})
        payment_data = entity.get('payment', {}).get('entity', {})

        # 3. Resolve subscription or store order
        razorpay_sub_id = (
            subscription_data.get('id') or
            payment_data.get('subscription_id')
        )

        if not razorpay_sub_id:
            # Check if this is a store order payment (FAANG Revenue upgrade)
            rzp_order_id = payment_data.get('order_id')
            if event_type == 'payment.captured' and rzp_order_id:
                try:
                    res = self._supabase.table('orders').update({
                        'payment_status': 'captured',
                        'status': 'confirmed',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }).eq('payment_id', payment_data.get('id')).execute()
                    
                    self.logger.info(f"webhook_store_order_paid event_id={event_id} rzp_order={rzp_order_id}")
                    self._record_event_processed(event_id, 'store_order_paid')
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

        # 4. Find our subscription record
        subscription = self._find_subscription(razorpay_sub_id)
        if not subscription:
            self.logger.warning(
                f"webhook_subscription_not_found rzp_sub={razorpay_sub_id} event={event_type}"
            )
            try:
                from services.billing_outbox_service import enqueue_deferred_webhook
                enqueue_deferred_webhook(
                    event_id=event_id,
                    event_type=event_type,
                    razorpay_subscription_id=razorpay_sub_id,
                    payload=payload,
                    retry_after_seconds=30,
                )
            except Exception as defer_err:
                self.logger.error(f"webhook_defer_failed: {defer_err}")
            return {
                'processed': True,
                'event_type': event_type,
                'action': 'subscription_not_found_deferred',
                'duplicate': False,
            }

        # 5. Observability: increment per-domain counter once tenant is known
        if billing_webhook_events_total:
            try:
                billing_webhook_events_total.labels(
                    event_type=event_type,
                    domain=subscription.get('product_domain', 'unknown') or 'unknown',
                ).inc()
            except Exception:
                pass
        try:
            from monitoring.billing_metrics import record_webhook_event
            record_webhook_event(event_type, subscription.get('product_domain', 'unknown') or 'unknown')
        except Exception:
            pass

        # 6. Route to handler
        handler = self._get_handler(event_type)
        if not handler:
            self.logger.info(f"webhook_unhandled_event event={event_type}")
            self._record_event_processed(event_id, 'unhandled_event_type')
            return {
                'processed': True,
                'event_type': event_type,
                'action': 'unhandled_event_type',
                'duplicate': False,
            }

        with span_context("webhook_processor.run_handler", attributes=billing_attributes(
            status=event_type.replace('.', '_'),
            subscription_id=subscription.get('razorpay_subscription_id'),
        )):
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

                # 7. Mark event processed AFTER successful handling
                self._record_event_processed(event_id, action)

                # 8. Write to billing outbox for audit trail
                self._write_outbox_entry(
                    event_id=event_id,
                    event_type=event_type,
                    subscription=subscription,
                    payment_data=payment_data,
                )

                # 9. Inline reconciliation: fire-and-forget, never fails the handler
                self._reconcile_inline(subscription)

                return {
                    'processed': True,
                    'event_type': event_type,
                    'action': action,
                    'duplicate': False,
                }

            except WebhookLockContentionError as e:
                self.logger.warning(
                    f"webhook_lock_contention event={event_type} id={event_id} error={e}"
                )
                self._record_event_error(event_id, str(e)[:500])
                self._maybe_send_webhook_dlq(event_id, event_type, payload, str(e))
                return {
                    'processed': False,
                    'event_type': event_type,
                    'action': 'lock_contention',
                    'duplicate': False,
                }

            except Exception as e:
                self.logger.error(
                    f"webhook_processing_error event={event_type} id={event_id} "
                    f"sub={subscription['id']} error={e}",
                    exc_info=True
                )
                # Leave as 'processing' — Razorpay retry will re-run
                self._record_event_error(event_id, str(e)[:500])
                self._maybe_send_webhook_dlq(event_id, event_type, payload, str(e))
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

        # Regular activation (with distributed lock to prevent verify race)
        rzp_sub_id = subscription.get('razorpay_subscription_id') or subscription_data.get('id')
        checkout_token = (subscription_data.get('notes') or {}).get('checkout_token')
        self._require_activation(
            subscription_id=sub_id,
            razorpay_payment_id=payment_data.get('id'),
            razorpay_event_id=event_id,
            razorpay_subscription_id=rzp_sub_id,
            domain=subscription.get('product_domain', 'shop'),
            period_start=self._parse_timestamp(subscription_data.get('current_start')),
            period_end=self._parse_timestamp(subscription_data.get('current_end')),
        )
        try:
            from services.checkout_dispatch_pool import complete_checkout_from_webhook
            complete_checkout_from_webhook(
                self._supabase,
                razorpay_subscription_id=rzp_sub_id,
                checkout_token=checkout_token,
            )
        except Exception as checkout_err:
            self.logger.warning(
                f"webhook_checkout_backstop_failed sub={rzp_sub_id}: {checkout_err}"
            )
        return 'subscription_activated'

    def _handle_subscription_charged(self, subscription, subscription_data,
                                     payment_data, event_id, payload) -> str:
        """
        subscription.charged — Recurring payment captured.

        Renews the billing period and reactivates if degraded.
        """
        self._require_activation(
            subscription_id=subscription['id'],
            razorpay_payment_id=payment_data.get('id'),
            razorpay_event_id=event_id,
            razorpay_subscription_id=subscription.get('razorpay_subscription_id') or subscription_data.get('id'),
            domain=subscription.get('product_domain', 'shop'),
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
        self._require_activation(
            subscription_id=subscription['id'],
            razorpay_payment_id=payment_data.get('id'),
            razorpay_event_id=event_id,
            razorpay_subscription_id=subscription.get('razorpay_subscription_id') or subscription_data.get('id'),
            domain=subscription.get('product_domain', 'shop'),
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

    def _atomic_claim_event(self, event_id: str, event_type: str, payload: Dict) -> str:
        """
        Atomically claim a webhook event for processing.

        Pure INSERT (no upsert/ON CONFLICT) to guarantee only one worker
        ever returns 'new'. If duplicate, checks existing row state:
          - 'processed': return 'duplicate' (already handled)
          - 'processing' + age > 5 min: reclaim & return 'reclaimed' (stale worker)
          - 'processing' + age <= 5 min: return 'duplicate' (live worker owns it)
          - 'failed': reclaim & return 'reclaimed' (permanent failure, retry)

        Fail CLOSED: raises on DB errors so Razorpay retries.
        """
        now = datetime.now(timezone.utc)
        try:
            self._supabase.table('webhook_events').insert({
                'event_id': event_id,
                'event_type': event_type,
                'raw_payload': payload,
                'created_at': now.isoformat(),
                'processing_result': 'processing',
            }).execute()
            return 'new'
        except Exception as e:
            error_str = str(e).lower()
            if 'duplicate key' in error_str or 'unique' in error_str or '23505' in error_str:
                try:
                    existing = self._supabase.table('webhook_events').select(
                        'processing_result, created_at, retry_count'
                    ).eq('event_id', event_id).limit(1).execute()
                    if not existing.data:
                        return 'duplicate'

                    prev_result = existing.data[0].get('processing_result')
                    created_at_raw = existing.data[0].get('created_at', now.isoformat())
                    if isinstance(created_at_raw, str):
                        created_at = datetime.fromisoformat(created_at_raw)
                    else:
                        created_at = now
                    age = now - created_at

                    if prev_result == 'processed':
                        return 'duplicate'

                    if prev_result == 'failed':
                        self._supabase.table('webhook_events').update({
                            'processing_result': 'processing',
                            'updated_at': now.isoformat(),
                            'retry_count': existing.data[0].get('retry_count', 0) + 1,
                        }).eq('event_id', event_id).eq('processing_result', 'failed').execute()
                        return 'reclaimed'

                    if prev_result == 'processing':
                        if age > timedelta(minutes=5):
                            reclaim = self._supabase.table('webhook_events').update({
                                'processing_result': 'processing',
                                'updated_at': now.isoformat(),
                                'retry_count': existing.data[0].get('retry_count', 0) + 1,
                            }).eq('event_id', event_id).eq('processing_result', 'processing').execute()
                            if reclaim.data:
                                return 'reclaimed'

                    return 'duplicate'
                except Exception as inner_e:
                    self.logger.error(f"atomic_claim_lookup_error id={event_id}: {inner_e}")
                    return 'duplicate'
            self.logger.error(f"atomic_claim_event_error id={event_id}: {e}")
            raise

    def _reconcile_inline(self, subscription: Dict):
        """
        Inline reconciliation after webhook processing.
        Calls Razorpay API to verify our state matches theirs.
        Fire-and-forget: never fails the webhook handler.
        Replaces the outbox-worker-driven reconciliation for free tier.
        """
        try:
            razorpay_sub_id = subscription.get('razorpay_subscription_id')
            if not razorpay_sub_id:
                return

            from services.reconciliation_engine import reconcile_subscription
            reconcile_subscription(
                subscription_id=subscription['id'],
                razorpay_subscription_id=razorpay_sub_id,
            )
        except Exception as e:
            self.logger.warning(
                f"webhook_inline_reconciliation_error sub={subscription.get('id')}: {e}",
                exc_info=True,
            )

    def _write_outbox_entry(
        self,
        event_id: str,
        event_type: str,
        subscription: Dict,
        payment_data: Optional[Dict],
    ):
        """
        Write a billing_outbox entry to trigger reconciliation after 60s.
        Fire-and-forget: never fails the webhook handler.
        """
        try:
            razorpay_sub_id = subscription.get('razorpay_subscription_id')
            razorpay_payment_id = None
            if payment_data:
                razorpay_payment_id = payment_data.get('razorpay_payment_id')

            from services.billing_outbox_service import write_outbox
            write_outbox(
                event_id=event_id,
                event_type=event_type,
                razorpay_subscription_id=razorpay_sub_id,
                razorpay_payment_id=razorpay_payment_id,
                subscription_id=subscription.get('id'),
                user_id=subscription.get('user_id'),
                product_domain=subscription.get('product_domain'),
                payload={
                    'event_type': event_type,
                    'subscription_status': subscription.get('status'),
                    'razorpay_subscription_id': razorpay_sub_id,
                },
            )
        except Exception as e:
            self.logger.error(
                f"webhook_outbox_write_error event_id={event_id}: {e}",
                exc_info=True
            )
            if billing_outbox_write_failures_total is not None:
                billing_outbox_write_failures_total.labels(source="webhook_processor").inc()

    def _record_event_processed(self, event_id: str, action: str):
        """Mark a webhook event as successfully processed."""
        if not event_id:
            return
        try:
            self._supabase.table('webhook_events').update({
                'processing_result': 'processed',
                'processed_at': datetime.now(timezone.utc).isoformat(),
                'action_taken': action,
            }).eq('event_id', event_id).execute()
        except Exception as e:
            self.logger.error(f"record_event_processed_error id={event_id}: {e}")

    def _record_event_error(self, event_id: str, error_message: str):
        """Record processing error for a webhook event (leaves as 'processing' for retry)."""
        if not event_id:
            return
        try:
            self._supabase.table('webhook_events').update({
                'last_error': error_message,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('event_id', event_id).execute()
        except Exception as e:
            self.logger.error(f"record_event_error id={event_id}: {e}")

    def _maybe_send_webhook_dlq(
        self,
        event_id: str,
        event_type: str,
        payload: Dict[str, Any],
        error_message: str,
    ) -> None:
        """Send to DLQ after repeated failures when flag enabled."""
        from config.billing_flags import get_bool_flag
        if not get_bool_flag('webhook_dlq_on_exhausted', True):
            return
        try:
            retry_count = 0
            row = self._supabase.table('webhook_events').select('retry_count').eq(
                'event_id', event_id
            ).maybe_single().execute()
            if row.data:
                retry_count = row.data.get('retry_count') or 0
            if retry_count >= 5:
                from services.webhook_dlq_service import send_to_dlq
                sub_entity = (payload.get('payload') or {}).get('subscription', {}).get('entity', {})
                pay_entity = (payload.get('payload') or {}).get('payment', {}).get('entity', {})
                send_to_dlq(
                    event_id=event_id,
                    event_type=event_type,
                    razorpay_subscription_id=sub_entity.get('id'),
                    razorpay_payment_id=pay_entity.get('id'),
                    raw_payload=payload,
                    error_message=error_message,
                    source='webhook_processor',
                )
        except Exception as e:
            self.logger.error(f"webhook_dlq_check_failed id={event_id}: {e}")

    def _require_activation(
        self,
        subscription_id: str,
        razorpay_payment_id: Optional[str],
        razorpay_event_id: Optional[str],
        razorpay_subscription_id: Optional[str],
        domain: str,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> None:
        """Run activation; raise WebhookLockContentionError if lock held (when flag enabled)."""
        from config.billing_flags import get_bool_flag
        result = self._activate_with_lock(
            subscription_id=subscription_id,
            razorpay_payment_id=razorpay_payment_id,
            razorpay_event_id=razorpay_event_id,
            razorpay_subscription_id=razorpay_subscription_id,
            domain=domain,
            period_start=period_start,
            period_end=period_end,
        )
        if result == 'lock_contention' and get_bool_flag('fix_webhook_lock_contention', True):
            raise WebhookLockContentionError(
                f"activation_lock_contention sub={subscription_id} rzp_sub={razorpay_subscription_id}"
            )

    def _activate_with_lock(
        self,
        subscription_id: str,
        razorpay_payment_id: Optional[str],
        razorpay_event_id: Optional[str],
        razorpay_subscription_id: Optional[str],
        domain: str,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> str:
        """
        Activate/renew subscription with distributed lock to prevent
        concurrent activation from verification endpoint.
        """
        if acquire_lock is None or not razorpay_subscription_id:
            self._lifecycle.handle_payment_success(
                subscription_id=subscription_id,
                razorpay_payment_id=razorpay_payment_id,
                razorpay_event_id=razorpay_event_id,
                period_start=period_start,
                period_end=period_end,
            )
            return 'activated'

        if not is_redis_available():
            self.logger.info(
                f"activation_no_redis_lock sub={subscription_id} lock_state=none_redis"
            )
            self._lifecycle.handle_payment_success(
                subscription_id=subscription_id,
                razorpay_payment_id=razorpay_payment_id,
                razorpay_event_id=razorpay_event_id,
                period_start=period_start,
                period_end=period_end,
            )
            return 'activated'

        lock_key = f"lock:billing:verify:{domain}:{razorpay_subscription_id}"
        token = acquire_lock(lock_key, ttl_seconds=30)
        if token is None:
            self.logger.info(
                f"activation_lock_contention sub={subscription_id} "
                f"rzp_sub={razorpay_subscription_id} lock_state=contention"
            )
            return 'lock_contention'

        try:
            self._lifecycle.handle_payment_success(
                subscription_id=subscription_id,
                razorpay_payment_id=razorpay_payment_id,
                razorpay_event_id=razorpay_event_id,
                period_start=period_start,
                period_end=period_end,
            )
            return 'activated'
        finally:
            release_lock(lock_key, token)

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
