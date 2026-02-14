"""
Plan Change Service — Enterprise Grade
=========================================
Handles upgrade/downgrade logic for subscriptions.

Enterprise rules:
  - Proration calculated in SECONDS (not days) for precision
  - All amounts in PAISE (integer, no floats)
  - subscription.update() called ONLY from webhook (never frontend)
  - Atomic plan application via DB function
  - Full audit trail in plan_change_history

State machine:
  ACTIVE → ACTIVE_WITH_PENDING_UPGRADE (proration order created)
  ACTIVE → ACTIVE_WITH_PENDING_DOWNGRADE (schedule_change_at cycle_end)
  ACTIVE_WITH_PENDING_* → ACTIVE (webhook applies or user cancels)

Usage:
    from services.plan_change_service import get_plan_change_service

    service = get_plan_change_service()
    result = service.request_plan_change(subscription_id, 'business')
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple

logger = logging.getLogger('reviseit.plan_change')


# =============================================================================
# EXCEPTIONS
# =============================================================================

class PlanChangeError(Exception):
    """Base exception for plan change errors."""
    def __init__(self, message: str, error_code: str, status_code: int = 400):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(message)


class PlanChangePendingError(PlanChangeError):
    """A plan change is already pending."""
    def __init__(self):
        super().__init__(
            'A plan change is already pending. Complete or cancel it first.',
            'CHANGE_ALREADY_PENDING',
            409
        )


class PlanChangeLockedError(PlanChangeError):
    """Plan change is locked (subscription.update in flight)."""
    def __init__(self):
        super().__init__(
            'Plan change is being processed. Please wait.',
            'CHANGE_LOCKED',
            409
        )


class PaymentPendingError(PlanChangeError):
    """Proration payment is still pending."""
    def __init__(self):
        super().__init__(
            'Proration payment is still processing. Please wait.',
            'PAYMENT_PENDING',
            409
        )


class UsageExceedsLimitError(PlanChangeError):
    """Current usage exceeds the target plan's limits."""
    def __init__(self, current_usage: int, new_limit: int, resource: str = 'AI responses'):
        super().__init__(
            f'Cannot downgrade: current {resource} usage ({current_usage:,}) '
            f'exceeds target plan limit ({new_limit:,})',
            'USAGE_EXCEEDS_LIMIT',
            400
        )
        self.current_usage = current_usage
        self.new_limit = new_limit


class SamePlanError(PlanChangeError):
    """User is already on this plan."""
    def __init__(self, plan_slug: str):
        super().__init__(
            f'You are already on the {plan_slug} plan.',
            'SAME_PLAN',
            400
        )


class SubscriptionNotActiveError(PlanChangeError):
    """Subscription is not in active state."""
    def __init__(self, status: str):
        super().__init__(
            f'Plan changes require an active subscription. Current status: {status}',
            'NOT_ACTIVE',
            400
        )


# =============================================================================
# PRORATION ENGINE (seconds-based, integer-only)
# =============================================================================

def calculate_proration(
    current_amount_paise: int,
    new_amount_paise: int,
    period_start: datetime,
    period_end: datetime,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Calculate prorated charge for a plan change.

    Enterprise rules:
    - Uses SECONDS for precision (not days)
    - All amounts in PAISE (integer, no floats)
    - Positive result = charge (upgrade)
    - Zero result = no charge (downgrade)
    - Minimum charge: ₹1 (100 paise) to avoid Razorpay rejection

    Args:
        current_amount_paise: Current plan amount in paise
        new_amount_paise: New plan amount in paise
        period_start: Current billing period start (UTC)
        period_end: Current billing period end (UTC)
        now: Current time (default: utcnow). Injectable for testing.

    Returns:
        Dict with proration details:
        {
            'proration_amount_paise': int,
            'unused_value_paise': int,
            'new_cost_remaining_paise': int,
            'total_seconds': float,
            'remaining_seconds': float,
            'ratio': float,
            'is_upgrade': bool,
        }
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # Ensure timezone-aware
    if period_start.tzinfo is None:
        period_start = period_start.replace(tzinfo=timezone.utc)
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    total_seconds = (period_end - period_start).total_seconds()
    remaining_seconds = (period_end - now).total_seconds()

    # Guard: period must be valid
    if total_seconds <= 0:
        logger.error(
            f"Invalid billing period: start={period_start}, end={period_end}, "
            f"total_seconds={total_seconds}"
        )
        raise PlanChangeError(
            'Invalid billing period for proration calculation',
            'INVALID_PERIOD',
            500
        )

    # Guard: must be within the billing period
    if remaining_seconds <= 0:
        logger.warning(
            f"Billing period already ended: end={period_end}, now={now}"
        )
        remaining_seconds = 0

    ratio = remaining_seconds / total_seconds
    difference = new_amount_paise - current_amount_paise
    is_upgrade = difference > 0

    if is_upgrade:
        # Charge = prorated difference for remaining time
        proration_charge = int(difference * ratio)

        # Razorpay minimum order: ₹1 (100 paise)
        if 0 < proration_charge < 100:
            proration_charge = 100

        # Calculate components for transparency
        unused_value = int(current_amount_paise * ratio)
        new_cost_remaining = int(new_amount_paise * ratio)
    else:
        # Downgrade: no charge
        proration_charge = 0
        unused_value = int(current_amount_paise * ratio)
        new_cost_remaining = int(new_amount_paise * ratio)

    result = {
        'proration_amount_paise': proration_charge,
        'unused_value_paise': unused_value,
        'new_cost_remaining_paise': new_cost_remaining,
        'total_seconds': total_seconds,
        'remaining_seconds': remaining_seconds,
        'ratio': round(ratio, 6),
        'is_upgrade': is_upgrade,
        'current_amount_paise': current_amount_paise,
        'new_amount_paise': new_amount_paise,
    }

    logger.info(
        f"💱 Proration: ₹{current_amount_paise/100:,.0f} → ₹{new_amount_paise/100:,.0f}, "
        f"ratio={ratio:.4f}, charge=₹{proration_charge/100:,.2f} "
        f"({'upgrade' if is_upgrade else 'downgrade'})"
    )

    return result


# =============================================================================
# PLAN CHANGE SERVICE
# =============================================================================

class PlanChangeService:
    """
    Enterprise plan change orchestrator.

    Handles upgrade (one-time proration charge) and downgrade
    (scheduled at cycle end, no charge).
    """

    def __init__(self):
        self._supabase = None
        self._razorpay = None
        self._pricing_service = None

    @property
    def supabase(self):
        if self._supabase is None:
            from supabase_client import get_supabase_client
            self._supabase = get_supabase_client()
        return self._supabase

    @property
    def razorpay_client(self):
        if self._razorpay is None:
            import razorpay
            import os
            key_id = os.getenv('RAZORPAY_KEY_ID')
            key_secret = os.getenv('RAZORPAY_KEY_SECRET')
            self._razorpay = razorpay.Client(auth=(key_id, key_secret))
        return self._razorpay

    @property
    def pricing_service(self):
        if self._pricing_service is None:
            from services.pricing_service import get_pricing_service
            self._pricing_service = get_pricing_service()
        return self._pricing_service

    # -------------------------------------------------------------------------
    # GET ACTIVE SUBSCRIPTION
    # -------------------------------------------------------------------------

    def get_active_subscription(self, user_id: str, product_domain: str) -> Dict[str, Any]:
        """
        Get the user's active subscription for a domain.

        Raises PlanChangeError if not found or not active.
        """
        result = self.supabase.table('subscriptions').select(
            'id, user_id, plan_name, status, '
            'razorpay_subscription_id, razorpay_customer_id, '
            'current_period_start, current_period_end, '
            'amount_paise, currency, pricing_version, pricing_plan_id, '
            'product_domain, ai_responses_limit, ai_responses_used, '
            'pending_plan_slug, pending_amount_paise, pending_pricing_version, '
            'proration_order_id, proration_payment_status, '
            'plan_change_locked, change_direction'
        ).match({
            'user_id': user_id,
            'product_domain': product_domain,
        }).in_('status', ['active', 'completed']).limit(1).execute()

        if not result.data:
            raise PlanChangeError(
                'No active subscription found for this product',
                'NO_ACTIVE_SUBSCRIPTION',
                404
            )

        return result.data[0]

    # -------------------------------------------------------------------------
    # SAFETY VALIDATORS
    # -------------------------------------------------------------------------

    def _validate_change_allowed(self, subscription: Dict, new_plan_slug: str) -> None:
        """
        Run all safety checks before allowing a plan change.

        Raises appropriate PlanChangeError subclass if blocked.
        """
        # 1. Must be active
        status = subscription.get('status', '')
        if status not in ('active', 'completed'):
            raise SubscriptionNotActiveError(status)

        # 2. Not the same plan
        if subscription['plan_name'] == new_plan_slug:
            raise SamePlanError(new_plan_slug)

        # 3. No existing pending change
        if subscription.get('pending_plan_slug'):
            raise PlanChangePendingError()

        # 4. Not locked (subscription.update in flight)
        if subscription.get('plan_change_locked'):
            raise PlanChangeLockedError()

        # 5. No pending proration payment
        if subscription.get('proration_payment_status') == 'pending':
            raise PaymentPendingError()

    def _validate_usage_limits(
        self,
        subscription: Dict,
        new_plan_limits: Dict,
        change_direction: str
    ) -> None:
        """
        Check that downgrade doesn't violate usage limits.

        Only enforced for downgrades. Upgrades always allowed.
        """
        if change_direction != 'downgrade':
            return

        current_usage = subscription.get('ai_responses_used', 0)
        new_limit = new_plan_limits.get('ai_responses', 0)

        if new_limit > 0 and current_usage > new_limit:
            raise UsageExceedsLimitError(current_usage, new_limit)

    # -------------------------------------------------------------------------
    # REQUEST PLAN CHANGE (main orchestrator)
    # -------------------------------------------------------------------------

    def request_plan_change(
        self,
        user_id: str,
        product_domain: str,
        new_plan_slug: str,
        request_id: str = '',
        client_ip: str = '',
    ) -> Dict[str, Any]:
        """
        Orchestrate a plan change request.

        For UPGRADES:
          1. Calculate proration
          2. Create Razorpay one-time order
          3. Store pending state
          4. Return order details for frontend checkout

        For DOWNGRADES:
          1. Validate usage limits
          2. Call Razorpay subscription.update(schedule_change_at='cycle_end')
          3. Store pending state
          4. Return confirmation

        Args:
            user_id: Supabase user ID
            product_domain: Resolved from g.product_domain
            new_plan_slug: Target plan ('starter', 'business', 'pro')
            request_id: Request trace ID
            client_ip: Client IP for audit

        Returns:
            Dict with change details (order info for upgrades, confirmation for downgrades)
        """
        logger.info(
            f"[{request_id}] Plan change request: "
            f"user={user_id}, domain={product_domain}, target={new_plan_slug}"
        )

        # Step 1: Get active subscription
        subscription = self.get_active_subscription(user_id, product_domain)

        # Step 2: Run safety validators
        self._validate_change_allowed(subscription, new_plan_slug)

        # Step 3: Resolve new plan pricing from DB
        new_plan = self.pricing_service.get_plan(
            product_domain=product_domain,
            plan_slug=new_plan_slug,
            billing_cycle='monthly',
        )

        # Step 4: Determine direction
        current_amount = subscription['amount_paise']
        new_amount = new_plan['amount_paise']
        change_direction = 'upgrade' if new_amount > current_amount else 'downgrade'

        # Step 5: Validate usage limits (downgrades only)
        new_limits = new_plan.get('limits_json') or {}
        self._validate_usage_limits(subscription, new_limits, change_direction)

        # Step 6: Parse period timestamps
        period_start = _parse_timestamp(subscription.get('current_period_start'))
        period_end = _parse_timestamp(subscription.get('current_period_end'))

        if not period_start or not period_end:
            raise PlanChangeError(
                'Billing period not set on subscription. Contact support.',
                'MISSING_PERIOD',
                500
            )

        # Step 7: Route to upgrade or downgrade handler
        if change_direction == 'upgrade':
            return self._handle_upgrade(
                subscription=subscription,
                new_plan=new_plan,
                new_plan_slug=new_plan_slug,
                period_start=period_start,
                period_end=period_end,
                change_direction=change_direction,
                request_id=request_id,
                client_ip=client_ip,
            )
        else:
            return self._handle_downgrade(
                subscription=subscription,
                new_plan=new_plan,
                new_plan_slug=new_plan_slug,
                period_end=period_end,
                change_direction=change_direction,
                request_id=request_id,
                client_ip=client_ip,
            )

    # -------------------------------------------------------------------------
    # UPGRADE HANDLER
    # -------------------------------------------------------------------------

    def _handle_upgrade(
        self,
        subscription: Dict,
        new_plan: Dict,
        new_plan_slug: str,
        period_start: datetime,
        period_end: datetime,
        change_direction: str,
        request_id: str,
        client_ip: str,
    ) -> Dict[str, Any]:
        """
        Handle upgrade: calculate proration, create Razorpay order, store pending.

        Does NOT call subscription.update() — that happens in webhook after payment.captured.
        """
        current_amount = subscription['amount_paise']
        new_amount = new_plan['amount_paise']

        # Calculate proration (seconds-based)
        proration = calculate_proration(
            current_amount_paise=current_amount,
            new_amount_paise=new_amount,
            period_start=period_start,
            period_end=period_end,
        )

        proration_charge = proration['proration_amount_paise']

        if proration_charge <= 0:
            # Edge case: upgrade but remaining time is 0 or negligible
            # Treat as free upgrade scheduled at cycle end
            proration_charge = 0

        # Create Razorpay one-time order for proration
        order_id = None
        import os
        razorpay_key_id = os.getenv('RAZORPAY_KEY_ID', '')

        if proration_charge > 0:
            order_data = {
                'amount': proration_charge,
                'currency': subscription.get('currency', 'INR'),
                'receipt': f"proration_{subscription['id'][:8]}_{new_plan_slug}",
                'notes': {
                    'type': 'plan_upgrade_proration',
                    'subscription_id': str(subscription['id']),
                    'user_id': str(subscription['user_id']),
                    'from_plan': subscription['plan_name'],
                    'to_plan': new_plan_slug,
                    'proration_ratio': str(proration['ratio']),
                    'request_id': request_id,
                },
            }

            try:
                order = self.razorpay_client.order.create(data=order_data)
                order_id = order['id']
                logger.info(
                    f"[{request_id}] Created proration order {order_id} "
                    f"for ₹{proration_charge/100:,.2f}"
                )
            except Exception as e:
                logger.error(f"[{request_id}] Failed to create proration order: {e}")
                raise PlanChangeError(
                    'Failed to create payment order. Please try again.',
                    'ORDER_CREATION_FAILED',
                    503
                )

        # Store pending state in DB
        pending_data = {
            'pending_plan_slug': new_plan_slug,
            'pending_pricing_plan_id': new_plan.get('id'),
            'pending_amount_paise': new_amount,
            'pending_pricing_version': new_plan.get('pricing_version', 1),
            'change_scheduled_at': period_end.isoformat(),
            'change_direction': change_direction,
            'proration_order_id': order_id,
            'proration_payment_status': 'pending' if order_id else None,
            'plan_change_locked': False,
        }

        self.supabase.table('subscriptions').update(
            pending_data
        ).eq('id', subscription['id']).execute()

        # Audit trail
        self._record_change_history(
            subscription=subscription,
            new_plan=new_plan,
            new_plan_slug=new_plan_slug,
            change_direction=change_direction,
            proration_amount=proration_charge,
            order_id=order_id,
            period_end=period_end,
            status='payment_pending' if order_id else 'scheduled',
            request_id=request_id,
            client_ip=client_ip,
        )

        logger.info(
            f"[{request_id}] ✅ Upgrade pending: "
            f"{subscription['plan_name']}→{new_plan_slug}, "
            f"proration=₹{proration_charge/100:,.2f}, "
            f"order={order_id}"
        )

        result = {
            'change_direction': 'upgrade',
            'from_plan': subscription['plan_name'],
            'to_plan': new_plan_slug,
            'proration': proration,
            'scheduled_at': period_end.isoformat(),
        }

        if order_id:
            result['order_id'] = order_id
            result['key_id'] = razorpay_key_id
            result['amount'] = proration_charge
            result['currency'] = subscription.get('currency', 'INR')
            result['requires_payment'] = True
        else:
            result['requires_payment'] = False

        return result

    # -------------------------------------------------------------------------
    # DOWNGRADE HANDLER
    # -------------------------------------------------------------------------

    def _handle_downgrade(
        self,
        subscription: Dict,
        new_plan: Dict,
        new_plan_slug: str,
        period_end: datetime,
        change_direction: str,
        request_id: str,
        client_ip: str,
    ) -> Dict[str, Any]:
        """
        Handle downgrade: schedule at cycle end via Razorpay, store pending.

        No charge. No refund. Current features until period ends.
        """
        razorpay_sub_id = subscription['razorpay_subscription_id']
        new_razorpay_plan_id = new_plan['razorpay_plan_id']

        # Call Razorpay: schedule plan change at cycle end
        try:
            self.razorpay_client.subscription.update(
                razorpay_sub_id,
                {
                    'plan_id': new_razorpay_plan_id,
                    'schedule_change_at': 'cycle_end',
                }
            )
            logger.info(
                f"[{request_id}] Razorpay subscription.update called: "
                f"{razorpay_sub_id} → plan {new_razorpay_plan_id} at cycle_end"
            )
        except Exception as e:
            logger.error(
                f"[{request_id}] Razorpay subscription.update failed: {e}"
            )
            raise PlanChangeError(
                'Failed to schedule plan change with payment provider.',
                'RAZORPAY_UPDATE_FAILED',
                503
            )

        # Store pending state
        pending_data = {
            'pending_plan_slug': new_plan_slug,
            'pending_pricing_plan_id': new_plan.get('id'),
            'pending_amount_paise': new_plan['amount_paise'],
            'pending_pricing_version': new_plan.get('pricing_version', 1),
            'change_scheduled_at': period_end.isoformat(),
            'change_direction': change_direction,
            'proration_order_id': None,
            'proration_payment_status': None,
            'plan_change_locked': False,
        }

        self.supabase.table('subscriptions').update(
            pending_data
        ).eq('id', subscription['id']).execute()

        # Audit trail
        self._record_change_history(
            subscription=subscription,
            new_plan=new_plan,
            new_plan_slug=new_plan_slug,
            change_direction=change_direction,
            proration_amount=0,
            order_id=None,
            period_end=period_end,
            status='scheduled',
            request_id=request_id,
            client_ip=client_ip,
        )

        logger.info(
            f"[{request_id}] ✅ Downgrade scheduled: "
            f"{subscription['plan_name']}→{new_plan_slug} "
            f"at {period_end.isoformat()}"
        )

        return {
            'change_direction': 'downgrade',
            'from_plan': subscription['plan_name'],
            'to_plan': new_plan_slug,
            'scheduled_at': period_end.isoformat(),
            'requires_payment': False,
            'message': (
                f'Your plan will change to {new_plan["display_name"]} '
                f'at the end of your current billing cycle.'
            ),
        }

    # -------------------------------------------------------------------------
    # WEBHOOK: HANDLE PRORATION PAYMENT CAPTURED
    # -------------------------------------------------------------------------

    def handle_proration_payment_captured(
        self,
        order_id: str,
        payment_id: str,
        event_id: str,
        request_id: str = '',
    ) -> Dict[str, Any]:
        """
        Called from payment.captured webhook when the proration order is paid.

        Flow:
        1. Find subscription by proration_order_id
        2. Verify order_id matches
        3. Mark proration_payment_status = 'captured'
        4. Call Razorpay subscription.update(schedule_change_at='cycle_end')
        5. Set plan_change_locked = TRUE
        6. Record payment in audit trail

        CRITICAL: This is the ONLY place subscription.update is called for upgrades.
        """
        # Find subscription with this proration order
        result = self.supabase.table('subscriptions').select(
            'id, razorpay_subscription_id, pending_plan_slug, '
            'pending_pricing_plan_id, pending_amount_paise, '
            'current_period_end, last_processed_event_id, '
            'plan_change_locked, proration_payment_status'
        ).eq('proration_order_id', order_id).limit(1).execute()

        if not result.data:
            logger.warning(
                f"[{request_id}] payment.captured for order {order_id} "
                f"— no matching proration subscription"
            )
            return {'handled': False, 'reason': 'not_proration_order'}

        subscription = result.data[0]

        # Idempotency: already processed this event
        if subscription.get('last_processed_event_id') == event_id:
            logger.info(f"[{request_id}] Event {event_id} already processed (idempotent)")
            return {'handled': True, 'reason': 'already_processed'}

        # Already captured
        if subscription.get('proration_payment_status') == 'captured':
            logger.info(f"[{request_id}] Proration already captured for order {order_id}")
            return {'handled': True, 'reason': 'already_captured'}

        # Already locked
        if subscription.get('plan_change_locked'):
            logger.info(f"[{request_id}] Plan change already locked for order {order_id}")
            return {'handled': True, 'reason': 'already_locked'}

        pending_slug = subscription.get('pending_plan_slug')
        if not pending_slug:
            logger.warning(f"[{request_id}] No pending plan for order {order_id}")
            return {'handled': False, 'reason': 'no_pending_plan'}

        # Resolve the new plan's Razorpay plan ID
        from services.pricing_service import get_pricing_service
        pricing_service = get_pricing_service()

        # We need the Razorpay plan_id - resolve via PricingService (environment-aware)
        pending_pricing_plan_id = subscription.get('pending_pricing_plan_id')
        try:
            resolved_plan = pricing_service.get_plan_by_id(pending_pricing_plan_id)
            new_razorpay_plan_id = resolved_plan['razorpay_plan_id']
        except Exception as e:
            logger.error(f"[{request_id}] Failed to resolve Razorpay plan ID: {e}")
            return {'handled': False, 'reason': 'plan_resolution_failed'}

        # Call Razorpay subscription.update — schedule at cycle end
        razorpay_sub_id = subscription['razorpay_subscription_id']
        try:
            self.razorpay_client.subscription.update(
                razorpay_sub_id,
                {
                    'plan_id': new_razorpay_plan_id,
                    'schedule_change_at': 'cycle_end',
                }
            )
            logger.info(
                f"[{request_id}] ✅ Razorpay subscription.update: "
                f"{razorpay_sub_id} → {new_razorpay_plan_id} at cycle_end"
            )
        except Exception as e:
            logger.error(
                f"[{request_id}] ❌ Razorpay subscription.update FAILED: {e}"
            )
            # Mark payment as captured but flag the error
            self.supabase.table('subscriptions').update({
                'proration_payment_status': 'captured',
                'last_processed_event_id': event_id,
                # Don't lock — update failed, needs retry
            }).eq('id', subscription['id']).execute()

            return {'handled': False, 'reason': 'razorpay_update_failed'}

        # Update DB: mark captured, lock
        period_end = _parse_timestamp(subscription.get('current_period_end'))
        self.supabase.table('subscriptions').update({
            'proration_payment_status': 'captured',
            'plan_change_locked': True,
            'change_scheduled_at': period_end.isoformat() if period_end else None,
            'last_processed_event_id': event_id,
        }).eq('id', subscription['id']).execute()

        # Update audit trail
        self.supabase.table('plan_change_history').update({
            'status': 'scheduled',
            'proration_payment_id': payment_id,
        }).eq('proration_order_id', order_id).eq(
            'status', 'payment_pending'
        ).execute()

        logger.info(
            f"[{request_id}] ✅ Proration captured, upgrade scheduled: "
            f"order={order_id}, payment={payment_id}"
        )

        return {'handled': True, 'reason': 'upgrade_scheduled'}

    # -------------------------------------------------------------------------
    # WEBHOOK: HANDLE PRORATION PAYMENT FAILED
    # -------------------------------------------------------------------------

    def handle_proration_payment_failed(
        self,
        order_id: str,
        payment_id: str,
        event_id: str,
        request_id: str = '',
    ) -> Dict[str, Any]:
        """
        Called from payment.failed webhook for a proration order.

        Clears all pending state — user must re-request the upgrade.
        """
        result = self.supabase.table('subscriptions').select(
            'id, pending_plan_slug, last_processed_event_id'
        ).eq('proration_order_id', order_id).limit(1).execute()

        if not result.data:
            return {'handled': False, 'reason': 'not_proration_order'}

        subscription = result.data[0]

        # Idempotency
        if subscription.get('last_processed_event_id') == event_id:
            return {'handled': True, 'reason': 'already_processed'}

        # Clear all pending state
        self.supabase.table('subscriptions').update({
            'pending_plan_slug': None,
            'pending_pricing_plan_id': None,
            'pending_amount_paise': None,
            'pending_pricing_version': None,
            'change_scheduled_at': None,
            'change_direction': None,
            'proration_order_id': None,
            'proration_payment_status': 'failed',
            'plan_change_locked': False,
            'last_processed_event_id': event_id,
        }).eq('id', subscription['id']).execute()

        # Update audit trail
        self.supabase.table('plan_change_history').update({
            'status': 'failed',
            'cancelled_at': datetime.now(timezone.utc).isoformat(),
        }).eq('proration_order_id', order_id).eq(
            'status', 'payment_pending'
        ).execute()

        logger.info(
            f"[{request_id}] ❌ Proration payment failed: "
            f"order={order_id}, pending cleared"
        )

        return {'handled': True, 'reason': 'pending_cleared'}

    # -------------------------------------------------------------------------
    # WEBHOOK: APPLY PENDING PLAN CHANGE (atomic)
    # -------------------------------------------------------------------------

    def apply_pending_plan_change(
        self,
        razorpay_subscription_id: str,
        event_id: str,
        period_start: datetime = None,
        period_end: datetime = None,
        request_id: str = '',
    ) -> Dict[str, Any]:
        """
        Atomically apply a pending plan change.

        Called from subscription.charged webhook on new cycle.
        Uses the DB function apply_plan_change() for atomicity
        (SELECT FOR UPDATE prevents concurrent webhook race).

        Returns the result from the DB function.
        """
        # First, get the pending slug for the expected_pending_slug param
        sub_result = self.supabase.table('subscriptions').select(
            'pending_plan_slug'
        ).eq(
            'razorpay_subscription_id', razorpay_subscription_id
        ).limit(1).execute()

        if not sub_result.data:
            return {'success': True, 'reason': 'subscription_not_found'}

        pending_slug = sub_result.data[0].get('pending_plan_slug')
        if not pending_slug:
            return {'success': True, 'reason': 'no_pending_change'}

        # Call atomic DB function
        try:
            result = self.supabase.rpc('apply_plan_change', {
                'p_razorpay_subscription_id': razorpay_subscription_id,
                'p_expected_pending_slug': pending_slug,
                'p_event_id': event_id,
                'p_period_start': period_start.isoformat() if period_start else None,
                'p_period_end': period_end.isoformat() if period_end else None,
            }).execute()

            if result.data:
                change_result = result.data
                logger.info(
                    f"[{request_id}] 🔄 Plan change applied atomically: "
                    f"{change_result}"
                )
                return change_result
            else:
                logger.warning(
                    f"[{request_id}] apply_plan_change returned no data"
                )
                return {'success': False, 'reason': 'no_result'}

        except Exception as e:
            logger.error(
                f"[{request_id}] ❌ Atomic plan change failed: {e}"
            )
            return {'success': False, 'reason': str(e)}

    # -------------------------------------------------------------------------
    # CANCEL PENDING CHANGE
    # -------------------------------------------------------------------------

    def cancel_pending_change(
        self,
        user_id: str,
        product_domain: str,
        request_id: str = '',
    ) -> Dict[str, Any]:
        """
        Cancel a pending plan change.

        Only allowed if:
        - Change is pending (pending_plan_slug IS NOT NULL)
        - Not locked (plan_change_locked = FALSE)
        - Proration not yet captured

        For downgrades: also calls Razorpay to revert schedule.
        """
        subscription = self.get_active_subscription(user_id, product_domain)

        if not subscription.get('pending_plan_slug'):
            raise PlanChangeError(
                'No pending plan change to cancel.',
                'NO_PENDING_CHANGE',
                400
            )

        if subscription.get('plan_change_locked'):
            raise PlanChangeLockedError()

        if subscription.get('proration_payment_status') == 'captured':
            raise PlanChangeError(
                'Cannot cancel: proration payment already captured. Contact support.',
                'PAYMENT_ALREADY_CAPTURED',
                400
            )

        # If downgrade was scheduled in Razorpay, revert it
        if subscription.get('change_direction') == 'downgrade':
            razorpay_sub_id = subscription['razorpay_subscription_id']
            try:
                # Revert by setting plan_id back to current
                current_plan = self.pricing_service.get_plan(
                    product_domain, subscription['plan_name'], 'monthly'
                )
                self.razorpay_client.subscription.update(
                    razorpay_sub_id,
                    {'plan_id': current_plan['razorpay_plan_id']}
                )
                logger.info(f"[{request_id}] Reverted Razorpay schedule for {razorpay_sub_id}")
            except Exception as e:
                logger.error(f"[{request_id}] Failed to revert Razorpay schedule: {e}")
                # Continue clearing local state

        # Clear all pending state
        self.supabase.table('subscriptions').update({
            'pending_plan_slug': None,
            'pending_pricing_plan_id': None,
            'pending_amount_paise': None,
            'pending_pricing_version': None,
            'change_scheduled_at': None,
            'change_direction': None,
            'proration_order_id': None,
            'proration_payment_status': None,
            'plan_change_locked': False,
        }).eq('id', subscription['id']).execute()

        # Update audit trail
        self.supabase.table('plan_change_history').update({
            'status': 'cancelled',
            'cancelled_at': datetime.now(timezone.utc).isoformat(),
        }).eq('subscription_id', subscription['id']).in_(
            'status', ['payment_pending', 'scheduled']
        ).execute()

        logger.info(
            f"[{request_id}] ✅ Pending change cancelled for {subscription['id']}"
        )

        return {
            'cancelled': True,
            'was_direction': subscription.get('change_direction'),
            'was_target': subscription.get('pending_plan_slug'),
        }

    # -------------------------------------------------------------------------
    # HELPERS
    # -------------------------------------------------------------------------

    def _record_change_history(
        self,
        subscription: Dict,
        new_plan: Dict,
        new_plan_slug: str,
        change_direction: str,
        proration_amount: int,
        order_id: Optional[str],
        period_end: datetime,
        status: str,
        request_id: str,
        client_ip: str,
    ) -> None:
        """Insert a row into plan_change_history for audit."""
        try:
            self.supabase.table('plan_change_history').insert({
                'subscription_id': subscription['id'],
                'user_id': subscription['user_id'],
                'change_direction': change_direction,
                'from_plan_slug': subscription['plan_name'],
                'to_plan_slug': new_plan_slug,
                'from_amount_paise': subscription['amount_paise'],
                'to_amount_paise': new_plan['amount_paise'],
                'from_pricing_version': subscription.get('pricing_version', 1),
                'to_pricing_version': new_plan.get('pricing_version', 1),
                'product_domain': subscription.get('product_domain', ''),
                'proration_amount_paise': proration_amount,
                'proration_order_id': order_id,
                'scheduled_for': period_end.isoformat(),
                'status': status,
                'request_id': request_id,
                'client_ip': client_ip,
            }).execute()
        except Exception as e:
            # Audit failure is non-fatal — log but don't block
            logger.error(f"[{request_id}] Failed to record change history: {e}")


# =============================================================================
# HELPERS
# =============================================================================

def _parse_timestamp(value) -> Optional[datetime]:
    """Parse a timestamp string or datetime to timezone-aware datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, TypeError):
            return None
    return None


# =============================================================================
# MODULE SINGLETON
# =============================================================================

_plan_change_service: Optional[PlanChangeService] = None


def get_plan_change_service() -> PlanChangeService:
    """Get the singleton PlanChangeService instance."""
    global _plan_change_service
    if _plan_change_service is None:
        _plan_change_service = PlanChangeService()
    return _plan_change_service
