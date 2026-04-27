"""
Subscription Lifecycle Engine — Production-Grade State Machine
===============================================================

Core billing infrastructure that manages subscription state transitions,
payment failure recovery, grace periods, and account suspension.

Design Principles:
  - Explicit state machine with validated transitions
  - Every transition is atomic (DB function) + audited (billing_events)
  - Idempotent operations (safe for webhook replays)
  - Multi-tenant isolation (user_id scoped)
  - Zero manual intervention for standard lifecycle events

State Machine:
  ACTIVE ──payment_failed──► PAST_DUE
  ACTIVE ──period_expired──► PAST_DUE
  ACTIVE ──user_cancelled──► CANCELLED
  ACTIVE ──admin_suspend───► SUSPENDED

  PAST_DUE ──retry_success──► ACTIVE
  PAST_DUE ──grace_started──► GRACE_PERIOD
  PAST_DUE ──max_retries────► SUSPENDED

  GRACE_PERIOD ──payment_received──► ACTIVE
  GRACE_PERIOD ──grace_expired─────► SUSPENDED

  SUSPENDED ──payment_received──► ACTIVE
  SUSPENDED ──admin_reactivate──► ACTIVE

  CANCELLED ──resubscribed──► ACTIVE

  HALTED ──payment_received──► ACTIVE (Razorpay-specific)
  PAUSED ──resumed───────────► ACTIVE

Usage:
    from services.subscription_lifecycle import get_lifecycle_engine

    engine = get_lifecycle_engine()

    # Handle payment failure
    engine.handle_payment_failure(subscription_id, failure_reason, razorpay_payment_id)

    # Handle successful payment (auto-reactivation)
    engine.handle_payment_success(subscription_id, razorpay_payment_id)

    # Suspend account after retries exhausted
    engine.suspend_subscription(subscription_id, reason)

    # Reactivate after payment recovery
    engine.reactivate_subscription(subscription_id, reason)
"""

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Optional, Dict, Any, List, Set, Tuple

logger = logging.getLogger('reviseit.subscription_lifecycle')


# =============================================================================
# SUBSCRIPTION STATES
# =============================================================================

class SubscriptionState(str, Enum):
    """All valid subscription states."""
    PENDING = 'pending'
    PENDING_UPGRADE = 'pending_upgrade'
    ACTIVE = 'active'
    UPGRADE_FAILED = 'upgrade_failed'
    TRIALING = 'trialing'
    PAST_DUE = 'past_due'
    GRACE_PERIOD = 'grace_period'
    SUSPENDED = 'suspended'
    CANCELLED = 'cancelled'
    HALTED = 'halted'
    PAUSED = 'paused'
    EXPIRED = 'expired'


# States that allow feature access
ACTIVE_STATES = frozenset({
    SubscriptionState.ACTIVE,
    SubscriptionState.TRIALING,
    SubscriptionState.GRACE_PERIOD,
})

# States that warn but still allow access
WARN_STATES = frozenset({
    SubscriptionState.PAST_DUE,
})

# States that block feature access
BLOCKED_STATES = frozenset({
    SubscriptionState.SUSPENDED,
    SubscriptionState.CANCELLED,
    SubscriptionState.HALTED,
    SubscriptionState.PAUSED,
    SubscriptionState.EXPIRED,
})


# =============================================================================
# VALID STATE TRANSITIONS
# =============================================================================

# Map of (from_state) → set of valid (to_states)
VALID_TRANSITIONS: Dict[SubscriptionState, Set[SubscriptionState]] = {
    SubscriptionState.PENDING: {
        SubscriptionState.ACTIVE,
        SubscriptionState.PENDING_UPGRADE,
        SubscriptionState.CANCELLED,
    },
    SubscriptionState.PENDING_UPGRADE: {
        SubscriptionState.ACTIVE,
        SubscriptionState.UPGRADE_FAILED,
    },
    SubscriptionState.ACTIVE: {
        SubscriptionState.PAST_DUE,
        SubscriptionState.GRACE_PERIOD,
        SubscriptionState.CANCELLED,
        SubscriptionState.HALTED,
        SubscriptionState.PAUSED,
        SubscriptionState.EXPIRED,
        SubscriptionState.SUSPENDED,
        SubscriptionState.PENDING_UPGRADE,
    },
    SubscriptionState.UPGRADE_FAILED: {
        SubscriptionState.ACTIVE,
        SubscriptionState.PENDING_UPGRADE,
    },
    SubscriptionState.TRIALING: {
        SubscriptionState.ACTIVE,
        SubscriptionState.PAST_DUE,
        SubscriptionState.CANCELLED,
        SubscriptionState.EXPIRED,
    },
    SubscriptionState.PAST_DUE: {
        SubscriptionState.ACTIVE,
        SubscriptionState.GRACE_PERIOD,
        SubscriptionState.SUSPENDED,
        SubscriptionState.CANCELLED,
        SubscriptionState.HALTED,
    },
    SubscriptionState.GRACE_PERIOD: {
        SubscriptionState.ACTIVE,
        SubscriptionState.SUSPENDED,
        SubscriptionState.CANCELLED,
    },
    SubscriptionState.SUSPENDED: {
        SubscriptionState.ACTIVE,
        SubscriptionState.CANCELLED,
    },
    SubscriptionState.CANCELLED: {
        SubscriptionState.ACTIVE,  # Resubscription
    },
    SubscriptionState.HALTED: {
        SubscriptionState.ACTIVE,
        SubscriptionState.CANCELLED,
        SubscriptionState.SUSPENDED,
    },
    SubscriptionState.PAUSED: {
        SubscriptionState.ACTIVE,
        SubscriptionState.CANCELLED,
    },
    SubscriptionState.EXPIRED: {
        SubscriptionState.ACTIVE,  # Resubscription
    },
}


# =============================================================================
# LIFECYCLE CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class LifecycleConfig:
    """Configuration for subscription lifecycle behavior."""
    # Grace period: how long after payment failure before suspension
    grace_period_days: int = 3

    # Retry schedule (days after initial failure)
    retry_day_1: int = 1   # Auto-retry payment
    retry_day_2: int = 2   # Send warning
    retry_day_3: int = 3   # Suspend account

    # Overdue detection: how many minutes past period_end before flagging
    overdue_threshold_minutes: int = 60

    # Stale subscription check: subscriptions not heard from Razorpay
    stale_subscription_days: int = 7


DEFAULT_CONFIG = LifecycleConfig()


# =============================================================================
# BILLING EVENT TYPES
# =============================================================================

class BillingEventType(str, Enum):
    # State changes
    STATE_CHANGE = 'subscription.state_change'

    # Payment events
    PAYMENT_FAILED = 'payment.failed'
    PAYMENT_CAPTURED = 'payment.captured'
    PAYMENT_RETRY_SCHEDULED = 'payment.retry_scheduled'
    PAYMENT_RETRY_ATTEMPTED = 'payment.retry_attempted'
    PAYMENT_RETRY_SUCCESS = 'payment.retry_success'
    PAYMENT_RETRY_FAILED = 'payment.retry_failed'

    # Webhook events
    WEBHOOK_RECEIVED = 'webhook.received'
    WEBHOOK_PROCESSED = 'webhook.processed'
    WEBHOOK_DUPLICATE = 'webhook.duplicate'

    # Account events
    ACCOUNT_SUSPENDED = 'account.suspended'
    ACCOUNT_REACTIVATED = 'account.reactivated'

    # Grace period
    GRACE_PERIOD_STARTED = 'grace_period.started'
    GRACE_PERIOD_EXPIRED = 'grace_period.expired'

    # Monitor events
    OVERDUE_DETECTED = 'monitor.overdue_detected'
    EXPIRY_DETECTED = 'monitor.expiry_detected'
    STALE_DETECTED = 'monitor.stale_detected'

    # Warning
    WARNING_SENT = 'notification.warning_sent'


# =============================================================================
# SUBSCRIPTION LIFECYCLE ENGINE
# =============================================================================

class SubscriptionLifecycleEngine:
    """
    Production-grade subscription lifecycle state machine.

    Manages all subscription state transitions with:
    - Atomic DB transitions (optimistic locking)
    - Full audit trail (billing_events + status_history)
    - Idempotent operations
    - Multi-tenant isolation
    - Cache invalidation on state change
    """

    def __init__(self, supabase, redis_client, config: LifecycleConfig = None):
        self._supabase = supabase
        self._redis = redis_client
        self._config = config or DEFAULT_CONFIG
        self.logger = logger

    # =========================================================================
    # Core State Transition
    # =========================================================================

    def transition_state(
        self,
        subscription_id: str,
        expected_state: str,
        new_state: str,
        reason: str,
        triggered_by: str,
        grace_period_end: Optional[datetime] = None,
        suspension_reason: Optional[str] = None,
        payload: Optional[Dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> bool:
        """
        Atomically transition a subscription from one state to another.

        Uses optimistic locking: only succeeds if current state matches expected_state.
        Records the transition in both billing_events and subscription_status_history.

        Returns True if transition succeeded, False if state already changed (idempotent).
        """
        # Validate transition
        try:
            from_state = SubscriptionState(expected_state)
            to_state = SubscriptionState(new_state)
        except ValueError:
            self.logger.error(f"Invalid state: {expected_state} → {new_state}")
            return False

        valid_targets = VALID_TRANSITIONS.get(from_state, set())
        if to_state not in valid_targets:
            self.logger.warning(
                f"Invalid transition: {from_state.value} → {to_state.value} "
                f"(valid targets: {[s.value for s in valid_targets]})"
            )
            return False

        # Execute atomic transition via DB function
        try:
            result = self._supabase.rpc('transition_subscription_status', {
                'p_subscription_id': subscription_id,
                'p_expected_status': expected_state,
                'p_new_status': new_state,
                'p_reason': reason,
                'p_triggered_by': triggered_by,
                'p_grace_period_end': grace_period_end.isoformat() if grace_period_end else None,
                'p_suspension_reason': suspension_reason,
            }).execute()

            success = result.data is True if result.data is not None else False

            if success:
                # Record billing event
                self._record_event(
                    subscription_id=subscription_id,
                    event_type=BillingEventType.STATE_CHANGE,
                    event_source=triggered_by,
                    previous_state=expected_state,
                    new_state=new_state,
                    payload=payload or {'reason': reason},
                    idempotency_key=idempotency_key,
                )

                # Invalidate caches
                self._invalidate_caches_for_subscription(subscription_id)

                # ============================================================
                # POST-TRANSITION HOOKS
                # ============================================================
                # Hook 1: When billing monitor detects expiry and transitions
                # active/trialing → past_due, schedule the 3-day retry
                # sequence so Day 3 suspend_account actually fires.
                # Without this, the billing monitor leaves subs stuck at
                # past_due forever with no suspension ever scheduled.
                # ============================================================
                if new_state == SubscriptionState.PAST_DUE.value and \
                        expected_state in ('active', 'trialing'):
                    try:
                        sub_for_retry = self._get_subscription(subscription_id)
                        if sub_for_retry:
                            self._schedule_retry_sequence(
                                subscription=sub_for_retry,
                                failure_reason=reason,
                                razorpay_payment_id=(payload or {}).get(
                                    'razorpay_payment_id'
                                ),
                            )
                            self.logger.info(
                                f"retry_sequence_scheduled sub={subscription_id} "
                                f"reason=billing_monitor_expiry"
                            )
                    except Exception as e:
                        # Fire-and-forget — never block the transition
                        self.logger.error(
                            f"retry_schedule_error sub={subscription_id}: {e}"
                        )

                # ============================================================
                # Hook 2: Sync otp_console_subscriptions.billing_status so the
                # console frontend guard reads the correct state immediately.
                # The console guard reads this separate table, NOT subscriptions.
                # Without this sync, the UI never shows suspension.
                # ============================================================
                self._sync_console_subscription_status(
                    subscription_id=subscription_id,
                    new_status=new_state,
                )

                self.logger.info(
                    f"subscription_state_transition sub={subscription_id} "
                    f"{expected_state} → {new_state} reason={reason} by={triggered_by}"
                )
            else:
                self.logger.info(
                    f"subscription_transition_noop sub={subscription_id} "
                    f"expected={expected_state} (already transitioned)"
                )

            return success

        except Exception as e:
            self.logger.error(
                f"subscription_transition_error sub={subscription_id} "
                f"{expected_state} → {new_state} error={e}",
                exc_info=True
            )
            return False

    # =========================================================================
    # Payment Failure Handling
    # =========================================================================

    def handle_payment_failure(
        self,
        subscription_id: str,
        failure_reason: str,
        razorpay_payment_id: Optional[str] = None,
        razorpay_event_id: Optional[str] = None,
    ) -> bool:
        """
        Handle a payment failure event.

        Flow:
        1. Transition subscription to PAST_DUE
        2. Record failure in billing_events
        3. Schedule retry sequence (Day 1: retry, Day 2: warn, Day 3: suspend)
        4. Update last_payment_failure_at

        Idempotent: safe to call multiple times for same payment.
        """
        idem_key = f"payment_failed:{razorpay_payment_id or subscription_id}"

        # Get current subscription
        sub = self._get_subscription(subscription_id)
        if not sub:
            self.logger.error(f"payment_failure_sub_not_found sub={subscription_id}")
            return False

        current_status = sub['status']
        user_id = sub['user_id']
        domain = sub.get('product_domain', 'shop')

        # Only transition from active/trialing states
        if current_status in ('active', 'trialing'):
            # Start grace period with PAST_DUE status
            grace_end = datetime.now(timezone.utc) + timedelta(
                days=self._config.grace_period_days
            )

            transitioned = self.transition_state(
                subscription_id=subscription_id,
                expected_state=current_status,
                new_state=SubscriptionState.PAST_DUE.value,
                reason=f'Payment failed: {failure_reason}',
                triggered_by='razorpay_webhook',
                grace_period_end=grace_end,
                payload={
                    'failure_reason': failure_reason,
                    'razorpay_payment_id': razorpay_payment_id,
                    'grace_period_end': grace_end.isoformat(),
                },
                idempotency_key=idem_key,
            )

            if not transitioned:
                return False

        # Update failure tracking columns
        now = datetime.now(timezone.utc)
        retry_count = (sub.get('payment_retry_count') or 0) + 1
        self._supabase.table('subscriptions').update({
            'last_payment_failure_at': now.isoformat(),
            'payment_retry_count': retry_count,
            'updated_at': now.isoformat(),
        }).eq('id', subscription_id).execute()

        # Record payment failure event
        self._record_event(
            subscription_id=subscription_id,
            event_type=BillingEventType.PAYMENT_FAILED,
            event_source='razorpay_webhook',
            payload={
                'failure_reason': failure_reason,
                'razorpay_payment_id': razorpay_payment_id,
                'retry_count': retry_count,
            },
            razorpay_event_id=razorpay_event_id,
            razorpay_payment_id=razorpay_payment_id,
        )

        # NOTE: Retry scheduling is handled by the post-transition hook in
        # transition_state() (line ~338). Do NOT schedule retries here — that
        # would create duplicates. The hook fires when active/trialing → past_due.

        self.logger.warning(
            f"payment_failure_handled sub={subscription_id} user={user_id} "
            f"domain={domain} reason={failure_reason} retry_count={retry_count}"
        )

        return True

    # =========================================================================
    # Payment Success Handling (Auto-Reactivation)
    # =========================================================================

    def handle_payment_success(
        self,
        subscription_id: str,
        razorpay_payment_id: Optional[str] = None,
        razorpay_event_id: Optional[str] = None,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> bool:
        """
        Handle a successful payment event.

        If subscription is in a degraded state (past_due, grace_period, suspended, halted),
        automatically reactivate it. This is the payment recovery path.

        Also updates the billing period if provided by Razorpay.
        """
        idem_key = f"payment_success:{razorpay_payment_id or subscription_id}"

        sub = self._get_subscription(subscription_id)
        if not sub:
            return False

        current_status = sub['status']
        user_id = sub['user_id']
        domain = sub.get('product_domain', 'shop')

        # Record payment success event (idempotent across verify + webhook)
        self._record_event(
            subscription_id=subscription_id,
            event_type=BillingEventType.PAYMENT_CAPTURED,
            event_source='razorpay_webhook',
            payload={
                'razorpay_payment_id': razorpay_payment_id,
                'previous_status': current_status,
            },
            idempotency_key=idem_key,
            razorpay_event_id=razorpay_event_id,
            razorpay_payment_id=razorpay_payment_id,
        )

        # Activate or reactivate based on current state
        first_activation_states = {'pending', 'created'}
        reactivation_states = {'past_due', 'grace_period', 'suspended', 'halted'}

        if current_status in first_activation_states:
            # First-time activation from pending/created states
            success = self.transition_state(
                subscription_id=subscription_id,
                expected_state=current_status,
                new_state=SubscriptionState.ACTIVE.value,
                reason=f'First payment captured (payment_id={razorpay_payment_id})',
                triggered_by='payment_verification',
                payload={'razorpay_payment_id': razorpay_payment_id},
                idempotency_key=f"activate:{razorpay_payment_id or subscription_id}",
            )
            if not success:
                self.logger.warning(
                    f"payment_success_activation_failed sub={subscription_id} "
                    f"from={current_status}"
                )

        elif current_status in reactivation_states:
            # Auto-reactivate from degraded states
            success = self.reactivate_subscription(
                subscription_id=subscription_id,
                reason=f'Payment received (payment_id={razorpay_payment_id})',
                reactivated_by='payment_recovery',
                razorpay_payment_id=razorpay_payment_id,
            )
            if not success:
                self.logger.warning(
                    f"payment_success_reactivation_failed sub={subscription_id}"
                )

        # Update billing period
        update_data = {
            'payment_retry_count': 0,
            'last_payment_failure_at': None,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }
        if period_start:
            update_data['current_period_start'] = period_start
        if period_end:
            update_data['current_period_end'] = period_end

        self._supabase.table('subscriptions').update(
            update_data
        ).eq('id', subscription_id).execute()

        # Cancel any pending retries
        self._cancel_pending_retries(subscription_id)

        # Ensure user_products membership exists (auth sync gates on this)
        if domain and domain != 'dashboard':
            try:
                self._supabase.table('user_products').upsert({
                    'user_id': user_id,
                    'product': domain,
                    'status': 'active',
                    'activated_by': 'system',
                }, on_conflict='user_id,product').execute()
                self.logger.info(
                    f"user_products_upserted sub={subscription_id} "
                    f"user={user_id} product={domain}"
                )
            except Exception as e:
                # Non-fatal: auth sync has a fallback check on subscriptions
                self.logger.warning(
                    f"user_products_upsert_failed sub={subscription_id}: {e}"
                )

        self.logger.info(
            f"payment_success_handled sub={subscription_id} user={user_id} "
            f"domain={domain} previous_status={current_status}"
        )

        # Always invalidate caches so the UI unlocks immediately even if the
        # subscription was already active (verify/webhook race).
        self._invalidate_caches_for_subscription(subscription_id)

        return True

    # =========================================================================
    # Subscription Cancellation
    # =========================================================================

    def handle_cancellation(
        self,
        subscription_id: str,
        razorpay_event_id: Optional[str] = None,
    ) -> bool:
        """Handle subscription.cancelled webhook."""
        sub = self._get_subscription(subscription_id)
        if not sub:
            return False

        current_status = sub['status']
        if current_status == 'cancelled':
            return True  # Already cancelled, idempotent

        valid_from = {'active', 'past_due', 'grace_period', 'halted', 'paused', 'suspended'}
        if current_status not in valid_from:
            self.logger.warning(
                f"cancellation_invalid_state sub={subscription_id} status={current_status}"
            )
            return False

        return self.transition_state(
            subscription_id=subscription_id,
            expected_state=current_status,
            new_state=SubscriptionState.CANCELLED.value,
            reason='Subscription cancelled via Razorpay',
            triggered_by='razorpay_webhook',
            payload={'razorpay_event_id': razorpay_event_id},
            idempotency_key=f"cancelled:{razorpay_event_id or subscription_id}",
        )

    # =========================================================================
    # Subscription Halt (Razorpay-specific)
    # =========================================================================

    def handle_halt(
        self,
        subscription_id: str,
        razorpay_event_id: Optional[str] = None,
    ) -> bool:
        """Handle subscription.halted webhook (Razorpay halts after max retries)."""
        sub = self._get_subscription(subscription_id)
        if not sub:
            return False

        current_status = sub['status']
        if current_status == 'halted':
            return True

        valid_from = {'active', 'past_due', 'grace_period'}
        if current_status not in valid_from:
            return False

        return self.transition_state(
            subscription_id=subscription_id,
            expected_state=current_status,
            new_state=SubscriptionState.HALTED.value,
            reason='Subscription halted by Razorpay (payment failures)',
            triggered_by='razorpay_webhook',
            payload={'razorpay_event_id': razorpay_event_id},
            idempotency_key=f"halted:{razorpay_event_id or subscription_id}",
        )

    # =========================================================================
    # Subscription Pause/Resume
    # =========================================================================

    def handle_pause(self, subscription_id: str, razorpay_event_id: Optional[str] = None) -> bool:
        sub = self._get_subscription(subscription_id)
        if not sub or sub['status'] == 'paused':
            return sub is not None

        return self.transition_state(
            subscription_id=subscription_id,
            expected_state=sub['status'],
            new_state=SubscriptionState.PAUSED.value,
            reason='Subscription paused',
            triggered_by='razorpay_webhook',
            idempotency_key=f"paused:{razorpay_event_id or subscription_id}",
        )

    def handle_resume(self, subscription_id: str, razorpay_event_id: Optional[str] = None) -> bool:
        sub = self._get_subscription(subscription_id)
        if not sub or sub['status'] != 'paused':
            return False

        return self.transition_state(
            subscription_id=subscription_id,
            expected_state='paused',
            new_state=SubscriptionState.ACTIVE.value,
            reason='Subscription resumed',
            triggered_by='razorpay_webhook',
            idempotency_key=f"resumed:{razorpay_event_id or subscription_id}",
        )

    # =========================================================================
    # Suspension
    # =========================================================================

    def suspend_subscription(
        self,
        subscription_id: str,
        reason: str,
        triggered_by: str = 'system',
    ) -> bool:
        """
        Suspend a subscription (disable all features, preserve data).

        Called by:
        - Retry engine after max retries exhausted
        - Billing monitor after grace period expired
        - Admin action
        """
        sub = self._get_subscription(subscription_id)
        if not sub:
            return False

        current_status = sub['status']
        if current_status == 'suspended':
            return True  # Already suspended

        suspendable = {'active', 'past_due', 'grace_period', 'halted'}
        if current_status not in suspendable:
            self.logger.warning(
                f"suspend_invalid_state sub={subscription_id} status={current_status}"
            )
            return False

        success = self.transition_state(
            subscription_id=subscription_id,
            expected_state=current_status,
            new_state=SubscriptionState.SUSPENDED.value,
            reason=reason,
            triggered_by=triggered_by,
            suspension_reason=reason,
            payload={'previous_state': current_status},
            # Use date-based key (not timestamp) so suspension is idempotent
            # within the same day — prevents duplicate suspensions from
            # concurrent billing monitor runs or webhook replays
            idempotency_key=f"suspended:{subscription_id}:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
        )

        if success:
            # Record suspension
            self._record_suspension(sub, reason)

            # Record account suspended event
            self._record_event(
                subscription_id=subscription_id,
                event_type=BillingEventType.ACCOUNT_SUSPENDED,
                event_source=triggered_by,
                payload={
                    'reason': reason,
                    'user_id': sub['user_id'],
                    'domain': sub.get('product_domain'),
                    'plan': sub.get('plan_name'),
                },
            )

            self.logger.warning(
                f"subscription_suspended sub={subscription_id} "
                f"user={sub['user_id']} reason={reason}"
            )

        return success

    # =========================================================================
    # Reactivation
    # =========================================================================

    def reactivate_subscription(
        self,
        subscription_id: str,
        reason: str,
        reactivated_by: str = 'system',
        razorpay_payment_id: Optional[str] = None,
    ) -> bool:
        """
        Reactivate a suspended/degraded subscription.

        Restores full feature access. Called automatically on payment recovery
        or manually by admin.
        """
        sub = self._get_subscription(subscription_id)
        if not sub:
            return False

        current_status = sub['status']
        if current_status == 'active':
            return True  # Already active

        reactivatable = {'suspended', 'past_due', 'grace_period', 'halted', 'cancelled', 'expired'}
        if current_status not in reactivatable:
            return False

        success = self.transition_state(
            subscription_id=subscription_id,
            expected_state=current_status,
            new_state=SubscriptionState.ACTIVE.value,
            reason=reason,
            triggered_by=reactivated_by,
            payload={
                'reactivated_from': current_status,
                'razorpay_payment_id': razorpay_payment_id,
            },
        )

        if success:
            # Clear suspension fields
            self._supabase.table('subscriptions').update({
                'suspended_at': None,
                'suspension_reason': None,
                'grace_period_end': None,
                'payment_retry_count': 0,
                'last_payment_failure_at': None,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('id', subscription_id).execute()

            # Close open suspension record
            self._close_suspension(sub['user_id'], subscription_id, reason, reactivated_by)

            # Record reactivation event
            self._record_event(
                subscription_id=subscription_id,
                event_type=BillingEventType.ACCOUNT_REACTIVATED,
                event_source=reactivated_by,
                payload={
                    'reason': reason,
                    'reactivated_from': current_status,
                    'razorpay_payment_id': razorpay_payment_id,
                },
            )

            # Cancel pending retries
            self._cancel_pending_retries(subscription_id)

            self.logger.info(
                f"subscription_reactivated sub={subscription_id} "
                f"user={sub['user_id']} from={current_status} reason={reason}"
            )

        return success

    # =========================================================================
    # Grace Period Management
    # =========================================================================

    def start_grace_period(self, subscription_id: str) -> bool:
        """Transition from PAST_DUE to GRACE_PERIOD."""
        grace_end = datetime.now(timezone.utc) + timedelta(
            days=self._config.grace_period_days
        )

        success = self.transition_state(
            subscription_id=subscription_id,
            expected_state=SubscriptionState.PAST_DUE.value,
            new_state=SubscriptionState.GRACE_PERIOD.value,
            reason=f'Grace period started (expires {grace_end.isoformat()})',
            triggered_by='billing_monitor',
            grace_period_end=grace_end,
        )

        if success:
            self._record_event(
                subscription_id=subscription_id,
                event_type=BillingEventType.GRACE_PERIOD_STARTED,
                event_source='billing_monitor',
                payload={'grace_period_end': grace_end.isoformat()},
            )

        return success

    def expire_grace_period(self, subscription_id: str) -> bool:
        """Grace period expired → suspend the subscription."""
        self._record_event(
            subscription_id=subscription_id,
            event_type=BillingEventType.GRACE_PERIOD_EXPIRED,
            event_source='billing_monitor',
        )

        return self.suspend_subscription(
            subscription_id=subscription_id,
            reason='Grace period expired without payment',
            triggered_by='billing_monitor',
        )

    # =========================================================================
    # Query Methods
    # =========================================================================

    def get_subscription_state(self, subscription_id: str) -> Optional[Dict]:
        """Get full subscription state with lifecycle metadata."""
        sub = self._get_subscription(subscription_id)
        if not sub:
            return None

        return {
            'id': sub['id'],
            'user_id': sub['user_id'],
            'status': sub['status'],
            'domain': sub.get('product_domain'),
            'plan_name': sub.get('plan_name'),
            'current_period_start': sub.get('current_period_start'),
            'current_period_end': sub.get('current_period_end'),
            'grace_period_end': sub.get('grace_period_end'),
            'last_payment_failure_at': sub.get('last_payment_failure_at'),
            'payment_retry_count': sub.get('payment_retry_count', 0),
            'suspended_at': sub.get('suspended_at'),
            'suspension_reason': sub.get('suspension_reason'),
            'is_active': sub['status'] in {s.value for s in ACTIVE_STATES},
            'is_degraded': sub['status'] in {'past_due', 'grace_period'},
            'is_blocked': sub['status'] in {s.value for s in BLOCKED_STATES},
        }

    def get_overdue_subscriptions(self) -> List[Dict]:
        """Find active subscriptions past their period_end."""
        threshold = datetime.now(timezone.utc) - timedelta(
            minutes=self._config.overdue_threshold_minutes
        )

        result = self._supabase.table('subscriptions').select(
            'id, user_id, product_domain, status, current_period_end, plan_name'
        ).in_(
            'status', ['active', 'trialing']
        ).lt(
            'current_period_end', threshold.isoformat()
        ).not_.is_(
            'current_period_end', 'null'
        ).execute()

        return result.data or []

    def get_expired_grace_periods(self) -> List[Dict]:
        """Find subscriptions whose grace period has expired."""
        now = datetime.now(timezone.utc).isoformat()

        result = self._supabase.table('subscriptions').select(
            'id, user_id, product_domain, status, grace_period_end, plan_name'
        ).eq(
            'status', 'grace_period'
        ).lt(
            'grace_period_end', now
        ).not_.is_(
            'grace_period_end', 'null'
        ).execute()

        return result.data or []

    def get_past_due_subscriptions(self) -> List[Dict]:
        """Find all subscriptions in past_due state."""
        result = self._supabase.table('subscriptions').select(
            'id, user_id, product_domain, status, last_payment_failure_at, '
            'payment_retry_count, plan_name, grace_period_end'
        ).eq('status', 'past_due').execute()

        return result.data or []

    # =========================================================================
    # Private Helpers
    # =========================================================================

    def _get_subscription(self, subscription_id: str) -> Optional[Dict]:
        """Fetch subscription by ID."""
        try:
            result = self._supabase.table('subscriptions').select('*').eq(
                'id', subscription_id
            ).single().execute()
            return result.data
        except Exception:
            return None

    def _record_event(
        self,
        subscription_id: Optional[str] = None,
        event_type: BillingEventType = None,
        event_source: str = 'system',
        previous_state: Optional[str] = None,
        new_state: Optional[str] = None,
        payload: Optional[Dict] = None,
        idempotency_key: Optional[str] = None,
        razorpay_event_id: Optional[str] = None,
        razorpay_payment_id: Optional[str] = None,
    ):
        """Record a billing event (fire-and-forget, never fails the caller)."""
        try:
            # Idempotency guard: avoid duplicate events when verify and webhook
            # both process the same payment.
            if idempotency_key:
                try:
                    existing = self._supabase.table('billing_events').select('id').eq(
                        'idempotency_key', idempotency_key
                    ).limit(1).execute()
                    if existing.data:
                        return
                except Exception:
                    # Fail open: event insert will still be best-effort below
                    pass

            # Get user_id from subscription if not in payload
            user_id = (payload or {}).get('user_id')
            domain = (payload or {}).get('domain')

            if not user_id and subscription_id:
                sub = self._get_subscription(subscription_id)
                if sub:
                    user_id = sub['user_id']
                    domain = domain or sub.get('product_domain')

            event_row = {
                'user_id': user_id,
                'subscription_id': subscription_id,
                'product_domain': domain,
                'event_type': event_type.value if event_type else 'unknown',
                'event_source': event_source,
                'previous_state': previous_state,
                'new_state': new_state,
                'payload': payload or {},
                'idempotency_key': idempotency_key,
                'razorpay_event_id': razorpay_event_id,
                'razorpay_payment_id': razorpay_payment_id,
                'processed_by': 'subscription_lifecycle_engine',
            }

            if idempotency_key:
                self._supabase.table('billing_events').upsert(
                    event_row,
                    on_conflict='idempotency_key',
                ).execute()
            else:
                self._supabase.table('billing_events').insert(event_row).execute()
        except Exception as e:
            # Never fail the caller — billing events are best-effort.
            # Suppress duplicate key errors if verify/webhook races still happen.
            try:
                if isinstance(e, dict) and e.get('code') == '23505':
                    return
                args = getattr(e, 'args', None)
                if args and isinstance(args, (list, tuple)) and args:
                    first = args[0]
                    if isinstance(first, dict) and first.get('code') == '23505':
                        return
            except Exception:
                pass
            self.logger.error(f"billing_event_record_error: {e}")

    def _schedule_retry_sequence(
        self,
        subscription: Dict,
        failure_reason: str,
        razorpay_payment_id: Optional[str],
    ):
        """Schedule the 3-day retry sequence after payment failure."""
        now = datetime.now(timezone.utc)
        sub_id = subscription['id']
        user_id = subscription['user_id']
        domain = subscription.get('product_domain')
        rzp_sub_id = subscription.get('razorpay_subscription_id')

        # Check if retries already scheduled
        existing = self._supabase.table('payment_retries').select('id').eq(
            'subscription_id', sub_id
        ).eq('status', 'pending').execute()

        if existing.data:
            self.logger.info(f"retry_already_scheduled sub={sub_id}")
            return

        retries = [
            {
                'subscription_id': sub_id,
                'user_id': user_id,
                'product_domain': domain,
                'retry_number': 1,
                'max_retries': 3,
                'scheduled_at': (now + timedelta(days=self._config.retry_day_1)).isoformat(),
                'next_action': 'retry_payment',
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_subscription_id': rzp_sub_id,
                'failure_reason': failure_reason,
                'status': 'pending',
                'created_at': now.isoformat(),
                'updated_at': now.isoformat(),
            },
            {
                'subscription_id': sub_id,
                'user_id': user_id,
                'product_domain': domain,
                'retry_number': 2,
                'max_retries': 3,
                'scheduled_at': (now + timedelta(days=self._config.retry_day_2)).isoformat(),
                'next_action': 'send_warning',
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_subscription_id': rzp_sub_id,
                'failure_reason': failure_reason,
                'status': 'pending',
                'created_at': now.isoformat(),
                'updated_at': now.isoformat(),
            },
            {
                'subscription_id': sub_id,
                'user_id': user_id,
                'product_domain': domain,
                'retry_number': 3,
                'max_retries': 3,
                'scheduled_at': (now + timedelta(days=self._config.retry_day_3)).isoformat(),
                'next_action': 'suspend_account',
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_subscription_id': rzp_sub_id,
                'failure_reason': failure_reason,
                'status': 'pending',
                'created_at': now.isoformat(),
                'updated_at': now.isoformat(),
            },
        ]

        try:
            self._supabase.table('payment_retries').insert(retries).execute()

            self._record_event(
                subscription_id=sub_id,
                event_type=BillingEventType.PAYMENT_RETRY_SCHEDULED,
                event_source='retry_engine',
                payload={
                    'retry_count': 3,
                    'schedule': [r['scheduled_at'] for r in retries],
                    'actions': [r['next_action'] for r in retries],
                },
            )

            self.logger.info(f"retry_sequence_scheduled sub={sub_id} retries=3")
        except Exception as e:
            self.logger.error(f"retry_schedule_error sub={sub_id}: {e}")

    def _cancel_pending_retries(self, subscription_id: str):
        """Cancel all pending retries for a subscription (payment recovered)."""
        try:
            self._supabase.table('payment_retries').update({
                'status': 'cancelled',
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('subscription_id', subscription_id).eq('status', 'pending').execute()
        except Exception as e:
            self.logger.error(f"cancel_retries_error sub={subscription_id}: {e}")

    def _record_suspension(self, subscription: Dict, reason: str):
        """Create a suspension record."""
        try:
            self._supabase.table('account_suspensions').insert({
                'user_id': subscription['user_id'],
                'subscription_id': subscription['id'],
                'product_domain': subscription.get('product_domain'),
                'suspension_reason': reason,
                'disabled_features': ['ai_features', 'api_access', 'dashboard', 'store'],
            }).execute()
        except Exception as e:
            self.logger.error(f"record_suspension_error: {e}")

    def _close_suspension(
        self, user_id: str, subscription_id: str,
        reason: str, reactivated_by: str
    ):
        """Close the most recent open suspension for this subscription."""
        try:
            self._supabase.table('account_suspensions').update({
                'reactivated_at': datetime.now(timezone.utc).isoformat(),
                'reactivation_reason': reason,
                'reactivated_by': reactivated_by,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('subscription_id', subscription_id).is_(
                'reactivated_at', 'null'
            ).execute()
        except Exception as e:
            self.logger.error(f"close_suspension_error: {e}")

    def _invalidate_caches_for_subscription(self, subscription_id: str):
        """Invalidate all caches after a state change."""
        try:
            sub = self._get_subscription(subscription_id)
            if not sub:
                return

            user_id = str(sub['user_id'])
            domain = sub.get('product_domain', 'shop')

            # Increment version key (invalidates all versioned cache entries)
            version_key = f"subscription_version:{user_id}:{domain}"
            self._redis.incr(version_key)
            self._redis.expire(version_key, 86400)

            # Also delete the status endpoint cache so polling sees fresh data
            self._redis.delete(f"subscription_status:{user_id}")

        except Exception as e:
            self.logger.error(f"cache_invalidation_error sub={subscription_id}: {e}")

    def _sync_console_subscription_status(
        self,
        subscription_id: str,
        new_status: str,
    ):
        """
        Sync otp_console_subscriptions.billing_status when subscriptions.status
        changes. Called after every successful transition_state.

        WHY THIS EXISTS:
        The console frontend (subscription_guard.py) reads from
        otp_console_subscriptions, NOT from subscriptions. These are two
        separate tables. Without this sync, billing status changes (e.g.
        active → past_due → suspended) are never reflected in the UI.

        This is fire-and-forget — failures are logged but never block
        the primary transition.
        """
        # Map internal subscription status → console billing_status values
        STATUS_MAP = {
            'active':           'active',
            'trialing':         'active',         # treat trialing as active in console
            'past_due':         'past_due',
            'grace_period':     'grace_period',
            'suspended':        'suspended',
            'halted':           'halted',
            'cancelled':        'cancelled',
            'expired':          'expired',
            'paused':           'paused',
            'pending_upgrade':  'active',         # mid-upgrade: keep active
            'upgrade_failed':   'active',         # rollback: keep active
        }

        console_status = STATUS_MAP.get(new_status)
        if not console_status:
            return  # Unknown status, don't touch console table

        try:
            # Fetch the subscription to get the user_id for linking
            sub = self._get_subscription(subscription_id)
            if not sub:
                return

            user_id = sub['user_id']

            # Find the console subscription linked to this user.
            # otp_console_subscriptions is org-based; user_id ≈ org_id here
            # (or linked via razorpay_subscription_id).
            rzp_sub_id = sub.get('razorpay_subscription_id')

            # Try matching by razorpay_subscription_id first (most precise)
            updated = False
            if rzp_sub_id:
                result = self._supabase.table('otp_console_subscriptions').update({
                    'billing_status': console_status,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }).eq('razorpay_subscription_id', rzp_sub_id).execute()
                updated = bool(result.data)

            # Fallback: match by org_id = user_id
            if not updated:
                result = self._supabase.table('otp_console_subscriptions').update({
                    'billing_status': console_status,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }).eq('org_id', user_id).execute()
                updated = bool(result.data)

            if updated:
                self.logger.info(
                    f"console_sub_synced sub={subscription_id} "
                    f"status={new_status} → console_billing_status={console_status}"
                )
            else:
                self.logger.debug(
                    f"console_sub_sync_noop sub={subscription_id} "
                    f"(no matching otp_console_subscriptions row)"
                )

        except Exception as e:
            # Fire-and-forget: never fail the primary transition
            self.logger.error(
                f"console_sub_sync_error sub={subscription_id} status={new_status}: {e}"
            )


# =============================================================================
# SINGLETON
# =============================================================================

_lifecycle_engine: Optional[SubscriptionLifecycleEngine] = None


def get_lifecycle_engine() -> SubscriptionLifecycleEngine:
    """Get singleton SubscriptionLifecycleEngine instance."""
    global _lifecycle_engine
    if _lifecycle_engine is None:
        import redis as redis_lib
        from supabase_client import get_supabase_client

        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        redis_client = redis_lib.from_url(redis_url, decode_responses=True)

        _lifecycle_engine = SubscriptionLifecycleEngine(
            supabase=get_supabase_client(),
            redis_client=redis_client,
        )
        logger.info("SubscriptionLifecycleEngine initialized")

    return _lifecycle_engine
