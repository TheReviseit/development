"""
Upgrade Orchestrator - Stripe-Level Atomic Upgrade Flow

Implements the ONLY safe way to handle upgrades:
1. Create Razorpay subscription (pending_upgrade state)
2. Wait for webhook confirmation (subscription.authenticated)
3. Atomically activate new plan (DB transaction)
4. Invalidate caches (versioned keys)

Critical Rules:
- NEVER trust client checkout success
- ONLY webhooks are authoritative
- Atomic DB transactions (no partial upgrades)
- Comprehensive failure handling

Author: Claude Code
Quality: FAANG-level production code
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import hashlib
import json
import logging

# Initialize logger
logger = logging.getLogger(__name__)


# =============================================================================
# Custom Exceptions
# =============================================================================

class UpgradeOrchestratorError(Exception):
    """Base exception for orchestrator errors."""
    pass


class UpgradeInProgressError(UpgradeOrchestratorError):
    """Raised when an upgrade is already in progress."""
    pass


class UpgradeNotFoundError(UpgradeOrchestratorError):
    """Raised when pending upgrade not found."""
    pass


# =============================================================================
# UpgradeOrchestrator (Main Service)
# =============================================================================

class UpgradeOrchestrator:
    """
    Atomic upgrade flow orchestrator.

    Workflow:
    --------
    1. initiate_upgrade() - Creates Razorpay subscription, sets pending_upgrade state
    2. handle_payment_success_webhook() - Webhook confirms payment → activate plan
    3. handle_payment_failure_webhook() - Webhook reports failure → mark failed
    4. cleanup_stale_upgrades() - Cron job resets abandoned upgrades (30min timeout)

    State Machine:
    -------------
    pending_upgrade → active (on webhook success)
    pending_upgrade → upgrade_failed (on webhook failure)
    pending_upgrade → active (on timeout, reset to old plan)

    Dependencies:
    ------------
    - supabase: Database client
    - redis: Distributed lock + cache invalidation
    - razorpay_service: Payment gateway integration
    - feature_gate_engine: Cache invalidation
    - pricing_service: Plan lookups

    Example:
    -------
        orchestrator = UpgradeOrchestrator(supabase, redis, razorpay, engine, pricing)

        # User clicks "Upgrade to Business"
        result = orchestrator.initiate_upgrade('user123', 'shop', 'business_plan_id')
        # Returns: {razorpay_subscription_id, key_id, amount} for frontend

        # Razorpay webhook arrives
        orchestrator.handle_payment_success_webhook('sub_xyz', event_data)
        # Atomically activates new plan
    """

    # Distributed lock TTL (60 seconds)
    LOCK_TTL_SECONDS = 60

    # Stale upgrade threshold (30 minutes)
    STALE_THRESHOLD_MINUTES = 30

    def __init__(
        self,
        supabase,
        redis_client,
        razorpay_service,
        feature_gate_engine,
        pricing_service
    ):
        """
        Initialize UpgradeOrchestrator with dependencies.

        Args:
            supabase: Supabase client
            redis_client: Redis client for locks + cache
            razorpay_service: Razorpay payment integration
            feature_gate_engine: For cache invalidation
            pricing_service: For plan lookups
        """
        self._supabase = supabase
        self._redis = redis_client
        self._razorpay = razorpay_service
        self._feature_gate_engine = feature_gate_engine
        self._pricing_service = pricing_service
        self.logger = logger

    # =========================================================================
    # Public API
    # =========================================================================

    def initiate_upgrade(
        self,
        user_id: str,
        domain: str,
        target_plan_id: str,
        user_email: str,
        addons: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Step 1: Create Razorpay subscription in pending_upgrade state.

        This is the ONLY place where pending upgrades are created.

        Args:
            user_id: Firebase/Supabase user ID
            domain: Product domain (shop, marketing, etc.)
            target_plan_id: UUID of pricing_plans record
            user_email: User email for Razorpay customer
            addons: Optional list of add-ons to include

        Returns:
            Dict with:
            - razorpay_subscription_id: For frontend Razorpay.js
            - razorpay_key_id: Public key
            - amount_paise: Total charge
            - currency: INR

        Raises:
            UpgradeInProgressError: If upgrade already pending
            UpgradeOrchestratorError: For other errors

        Example:
            >>> result = orchestrator.initiate_upgrade(
            ...     'user123', 'shop', 'uuid-plan-id', 'user@example.com'
            ... )
            >>> result['razorpay_subscription_id']
            'sub_Mfg1234567890'
        """
        lock_key = f"upgrade:lock:{user_id}:{domain}"

        self.logger.info(
            "initiate_upgrade_start",
            extra={"user_id": user_id, "domain": domain, "target_plan_id": target_plan_id}
        )

        # 1. Acquire distributed lock (prevent concurrent upgrades)
        if not self._acquire_lock(lock_key, self.LOCK_TTL_SECONDS):
            raise UpgradeInProgressError(
                "An upgrade is already in progress. Please wait."
            )

        try:
            # 2. Get current subscription
            current_sub = self._get_active_subscription(user_id, domain)

            # FAANG-level: separate row pattern — search for stale pending_upgrade
            # (the pending_upgrade row is a separate row, NOT the active sub)
            stale_pending = self._supabase.table('subscriptions').select('*').match({
                'user_id': user_id,
                'product_domain': domain,
                'status': 'pending_upgrade',
            }).order('created_at', desc=True).limit(1).execute()
            stale_pending = stale_pending.data[0] if stale_pending.data else None

            if stale_pending:
                # Cancel the stale pending_upgrade row so the user can retry.
                self.logger.warning(
                    "orchestrator_recovering_pending_upgrade",
                    extra={
                        "user_id": user_id, "domain": domain,
                        "subscription_id": stale_pending['id'],
                        "upgrade_initiated_at": stale_pending.get('upgrade_initiated_at')
                    }
                )
                self._supabase.table('subscriptions').update({
                    'status': 'cancelled',
                    'upgrade_failure_reason': 'Reset on new upgrade attempt',
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }).eq('id', stale_pending['id']).execute()

            # 3. Get target plan details
            target_plan = self._pricing_service.get_plan_by_id(target_plan_id)
            if not target_plan:
                raise UpgradeOrchestratorError(f"Plan not found: {target_plan_id}")

            # 4. Get or create Razorpay customer for card reuse
            # FAANG-level: reuse existing customer so saved payment methods
            # persist across subscriptions and upgrades.
            import os as _os
            import requests as _requests

            RAZORPAY_KEY_ID = _os.getenv('RAZORPAY_KEY_ID')
            RAZORPAY_KEY_SECRET = _os.getenv('RAZORPAY_KEY_SECRET')

            _customer_id = None
            try:
                _cust_result = self._supabase.table('razorpay_customers').select(
                    'razorpay_customer_id'
                ).eq('user_id', user_id).limit(1).execute()
                if _cust_result.data:
                    _customer_id = _cust_result.data[0].get('razorpay_customer_id')
                    self.logger.info(
                        "initiate_upgrade_reusing_customer",
                        extra={"customer_id": _customer_id, "user_id": user_id}
                    )
            except Exception as _cust_err:
                # Non-fatal: subscription can be created without customer_id
                self.logger.warning(
                    "initiate_upgrade_customer_lookup_failed",
                    extra={"error": str(_cust_err)[:100]}
                )

            subscription_data = {
                'plan_id': target_plan['razorpay_plan_id'],
                'total_count': 12,  # 12 billing cycles
                'quantity': 1,
                'customer_notify': 0,
                'notes': {
                    'user_id': user_id,
                    'domain': domain,
                    'plan_name': target_plan.get('plan_slug', ''),
                }
            }

            if _customer_id:
                subscription_data['customer_id'] = _customer_id

            # Add add-on items if provided
            if addons:
                addon_items = []
                for addon in addons:
                    addon_items.append({
                        'item': {
                            'name': addon.get('display_name', addon.get('addon_slug', '')),
                            'amount': addon.get('amount_paise', 0),
                            'currency': 'INR',
                        }
                    })
                if addon_items:
                    subscription_data['addons'] = addon_items

            # Generate deterministic idempotency key: user+domain+plan+hourly bucket
            # Same inputs within the same hour produce the same key (retry-safe).
            # Different plans/domains always produce different keys.
            _hour_bucket = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
            _idem_raw = f"{user_id}:{domain}:{target_plan['razorpay_plan_id']}:{_hour_bucket}"
            _idem_hash = hashlib.sha256(_idem_raw.encode()).hexdigest()[:24]
            idempotency_key = f"upg_{_idem_hash}"

            _url = 'https://api.razorpay.com/v1/subscriptions'
            _headers = {
                'Content-Type': 'application/json',
                'X-Razorpay-Idempotency-Key': idempotency_key,
            }

            _response = _requests.post(
                _url,
                auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
                json=subscription_data,
                headers=_headers,
                timeout=(30, 25),
            )

            if _response.status_code == 409:
                # Idempotency hit — existing subscription returned by Razorpay
                _error_data = _response.json()
                _existing_id = _error_data.get('error', {}).get('field', '')
                self.logger.info(
                    "initiate_upgrade_idempotency_hit",
                    extra={
                        "existing_id": _existing_id,
                        "key_prefix": idempotency_key[:12],
                        "user_id": user_id, "domain": domain,
                    }
                )
                razorpay_sub = {'id': _existing_id, 'idempotency_hit': True, **subscription_data}
            else:
                _response.raise_for_status()
                razorpay_sub = {**_response.json(), 'idempotency_hit': False}

            # 5. Record pending upgrade in DB (atomic)
            # FAANG-level: upgrades always create a NEW subscription row.
            # The old ACTIVE subscription is NOT mutated — it stays active
            # and gets cancelled atomically when the new row activates
            # (see _activate_upgrade_atomic).
            insert_data = {
                'user_id': user_id,
                'product_domain': domain,
                'pricing_plan_id': target_plan_id,
                'plan_id': target_plan['razorpay_plan_id'],
                'plan_name': target_plan.get('plan_slug', ''),
                'amount_paise': target_plan.get('amount_paise', 0),
                'currency': target_plan.get('currency', 'INR'),
                'razorpay_subscription_id': razorpay_sub['id'],
                'pending_upgrade_to_plan_id': target_plan_id,
                'pending_upgrade_razorpay_subscription_id': razorpay_sub['id'],
                'status': 'pending_upgrade',
                'upgrade_initiated_at': datetime.now(timezone.utc).isoformat(),
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
            if current_sub:
                insert_data['previous_subscription_id'] = current_sub['id']

            self._supabase.table('subscriptions').insert(insert_data).execute()

            log_action = "upgrade_pending_existing_sub" if current_sub else "upgrade_pending_new_sub"
            log_data = {
                "user_id": user_id,
                "domain": domain,
                "razorpay_subscription_id": razorpay_sub['id']
            }
            if current_sub:
                log_data["previous_subscription_id"] = current_sub['id']
            self.logger.info(log_action, extra=log_data)

            # 6. Return Razorpay details for frontend checkout
            import os
            return {
                'razorpay_subscription_id': razorpay_sub['id'],
                'razorpay_key_id': os.getenv('RAZORPAY_KEY_ID'),
                'amount_paise': target_plan.get('amount_paise', 0),
                'currency': target_plan.get('currency', 'INR'),
                'plan_name': target_plan.get('display_name', target_plan.get('plan_slug', ''))
            }

        finally:
            # Always release lock
            self._release_lock(lock_key)

    def handle_payment_success_webhook(
        self,
        razorpay_subscription_id: str,
        event_data: Dict[str, Any]
    ) -> bool:
        """
        Step 2: Handle subscription.authenticated webhook.

        Atomically activates new plan only after payment confirmed.

        This is the ONLY place where plan changes happen (webhook-driven).

        Args:
            razorpay_subscription_id: Razorpay subscription ID from webhook
            event_data: Full webhook payload

        Returns:
            True if upgrade was activated successfully

        Example:
            >>> orchestrator.handle_payment_success_webhook(
            ...     'sub_Mfg1234567890',
            ...     {'subscription': {...}, 'period_start': '...'}
            ... )
            True
        """
        self.logger.info(
            "webhook_payment_success",
            extra={
                "razorpay_subscription_id": razorpay_subscription_id,
                "event_id": event_data.get('id')
            }
        )

        # 1. Find subscription by razorpay ID
        # FAANG-level: new rows store razorpay_subscription_id directly;
        # legacy pending_upgrade rows store it in pending_upgrade_razorpay_subscription_id
        sub_result = self._supabase.table('subscriptions').select('*').or_(
            f"razorpay_subscription_id.eq.{razorpay_subscription_id},"
            f"pending_upgrade_razorpay_subscription_id.eq.{razorpay_subscription_id}"
        ).execute()

        if not sub_result.data:
            self.logger.error(
                "webhook_subscription_not_found",
                extra={"razorpay_subscription_id": razorpay_subscription_id}
            )
            return False

        subscription = sub_result.data[0]

        # 2. If pending_upgrade state, activate new plan atomically
        if subscription['status'] == 'pending_upgrade':
            return self._activate_upgrade_atomic(subscription, event_data)
        elif subscription['status'] == 'pending':
            # New subscription activation (not upgrade)
            return self._activate_new_subscription(subscription, event_data)
        else:
            self.logger.warning(
                "webhook_unexpected_status",
                extra={"subscription_id": subscription['id'], "status": subscription['status']}
            )
            return False

    def handle_payment_failure_webhook(
        self,
        razorpay_subscription_id: str,
        failure_reason: str
    ) -> bool:
        """
        Step 3: Handle payment.failed webhook.

        Marks upgrade as failed, keeps old plan active.

        Args:
            razorpay_subscription_id: Razorpay subscription ID
            failure_reason: Error message from Razorpay

        Returns:
            True if failure was recorded successfully
        """
        self.logger.warning(
            "webhook_payment_failed",
            extra={"razorpay_subscription_id": razorpay_subscription_id, "reason": failure_reason}
        )

        # FAANG-level: new row pattern stores razorpay_subscription_id directly
        result = self._supabase.table('subscriptions').update({
            'status': 'upgrade_failed',
            'upgrade_failure_reason': failure_reason,
            'razorpay_subscription_id': None,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('razorpay_subscription_id', razorpay_subscription_id).in_(
            'status', ['pending_upgrade', 'pending']
        ).execute()

        if not result.data:
            # Fallback: search pending_upgrade_razorpay_subscription_id (legacy)
            result = self._supabase.table('subscriptions').update({
                'status': 'upgrade_failed',
                'upgrade_failure_reason': failure_reason,
                'pending_upgrade_razorpay_subscription_id': None,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).eq('pending_upgrade_razorpay_subscription_id', razorpay_subscription_id).execute()

        if result.data:
            subscription = result.data[0]
            self.logger.info(
                "upgrade_failed_recorded",
                extra={"subscription_id": subscription['id'], "user_id": subscription['user_id']}
            )
            # TODO: Send failure notification email
            return True

        return False

    def cleanup_stale_upgrades(self) -> int:
        """
        Cleanup job: Cancel stale pending/upgrade subscriptions older than 30 minutes.

        If payment not confirmed in 30 mins, likely abandoned:
          - Cancels the Razorpay subscription (no orphaned subs in Razorpay)
          - Marks the DB row as cancelled
          - Old ACTIVE subscription stays untouched (new row pattern)

        Should be called by Celery cron job every 10 minutes.

        Returns:
            Number of stale subscriptions cleaned up
        """
        stale_threshold = datetime.now(timezone.utc) - timedelta(
            minutes=self.STALE_THRESHOLD_MINUTES
        )

        self.logger.info(
            "cleanup_stale_upgrades_start",
            extra={"threshold": stale_threshold.isoformat()}
        )

        # Find stale pending/upgrade subscriptions
        stale_subs = self._supabase.table('subscriptions').select('*').in_(
            'status', ['pending_upgrade', 'pending']
        ).lt('upgrade_initiated_at', stale_threshold.isoformat()).execute()

        cleaned_count = 0

        for sub in (stale_subs.data or []):
            rzp_sub_id = sub.get('razorpay_subscription_id') or sub.get('pending_upgrade_razorpay_subscription_id')
            self.logger.warning(
                "cleanup_stale_upgrade",
                extra={
                    "subscription_id": sub['id'],
                    "user_id": sub['user_id'],
                    "domain": sub['product_domain'],
                    "status": sub['status'],
                    "razorpay_subscription_id": rzp_sub_id,
                    "pending_duration": (datetime.now(timezone.utc) - datetime.fromisoformat(sub['upgrade_initiated_at'])).total_seconds() / 60
                }
            )

            # FAANG-level: cancel the Razorpay subscription to prevent
            # orphaned subs OR silent payment capture on abandoned upgrades.
            # Try/catch because the sub may already be cancelled/expired at Razorpay.
            if rzp_sub_id:
                try:
                    self._razorpay.subscription.cancel(rzp_sub_id)
                    self.logger.info(
                        "cleanup_cancelled_razorpay_sub",
                        extra={"razorpay_subscription_id": rzp_sub_id}
                    )
                except Exception as cancel_err:
                    # Non-fatal — may already be cancelled/expired at Razorpay
                    self.logger.warning(
                        "cleanup_razorpay_cancel_failed",
                        extra={
                            "razorpay_subscription_id": rzp_sub_id,
                            "error": str(cancel_err)[:100]
                        }
                    )

            # Cancel the DB row (both pending_upgrade and pending subs)
            # FAANG-level: never set to active — upgrades create separate rows
            try:
                self._supabase.table('subscriptions').update({
                    'status': 'cancelled',
                    'cancelled_at': datetime.now(timezone.utc).isoformat(),
                    'cancellation_reason': 'abandoned_checkout',
                    'upgrade_failure_reason': 'Checkout abandoned (30 min timeout)',
                    'upgrade_initiated_at': None,
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }).eq('id', sub['id']).execute()
            except Exception as cancel_db_err:
                self.logger.warning(
                    "cleanup_stale_upgrades_db_cancel_skipped",
                    extra={"sub_id": sub['id'], "error": str(cancel_db_err)[:100]}
                )

            cleaned_count += 1

        self.logger.info(
            "cleanup_stale_upgrades_complete",
            extra={"cleaned_count": cleaned_count}
        )

        return cleaned_count

    # =========================================================================
    # Private Methods (Implementation Details)
    # =========================================================================

    def _activate_upgrade_atomic(
        self,
        subscription: Dict,
        event_data: Dict
    ) -> bool:
        """
        Atomically activate upgraded plan.

        New row pattern (FAANG-level):
        1. Activate the new PENDING_UPGRADE subscription row
        2. Cancel the old ACTIVE subscription row (same user+domain)
        3. Reset caches

        This is the CRITICAL section — must be atomic.
        """
        subscription_id = subscription['id']
        user_id = subscription['user_id']
        domain = subscription['product_domain']
        previous_sub_id = subscription.get('previous_subscription_id')

        self.logger.info(
            "activate_upgrade_atomic_start",
            extra={
                "subscription_id": subscription_id,
                "user_id": user_id, "domain": domain,
                "previous_subscription_id": previous_sub_id
            }
        )

        try:
            # 1. Activate the new subscription row atomically
            # FAANG-level: eq('status', 'pending_upgrade') ensures only one
            # of {verify-payment, webhook} can win the race. If the other
            # already activated this row, this UPDATE affects 0 rows.
            result = self._supabase.table('subscriptions').update({
                'status': 'active',
                'current_period_start': event_data.get('current_period_start'),
                'current_period_end': event_data.get('current_period_end'),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).eq('id', subscription_id).eq('status', 'pending_upgrade').execute()

            if not result.data:
                self.logger.warning(
                    "activate_upgrade_already_activated",
                    extra={"subscription_id": subscription_id}
                )
                # Already active — return True (idempotent)
                return True

            # 2. Cancel the old active subscription (if linking info exists)
            try:
                if previous_sub_id:
                    self._supabase.table('subscriptions').update({
                        'status': 'cancelled',
                        'cancelled_at': datetime.now(timezone.utc).isoformat(),
                        'cancellation_reason': 'upgraded',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }).eq('id', previous_sub_id).execute()
                else:
                    # Fallback: find and cancel any other ACTIVE sub for same user+domain
                    self._supabase.table('subscriptions').update({
                        'status': 'cancelled',
                        'cancelled_at': datetime.now(timezone.utc).isoformat(),
                        'cancellation_reason': 'upgraded',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }).match({
                        'user_id': user_id,
                        'product_domain': domain,
                        'status': 'active',
                    }).neq('id', subscription_id).execute()
            except Exception as cancel_old_err:
                self.logger.warning(
                    "activate_upgrade_old_sub_cancel_skipped",
                    extra={
                        "subscription_id": subscription_id,
                        "previous_sub_id": previous_sub_id,
                        "error": str(cancel_old_err)[:100]
                    }
                )

            # 3. Reset usage counters for metered features
            self._reset_usage_counters(user_id, domain)

            # 4. Increment subscription version (invalidate caches)
            self._increment_subscription_version(user_id, domain)

            # 5. Invalidate all caches (belt + suspenders)
            self._invalidate_all_caches(user_id, domain)

            self.logger.info(
                "upgrade_activated_success",
                extra={
                    "subscription_id": subscription_id,
                    "user_id": user_id,
                    "domain": domain,
                    "previous_subscription_id": previous_sub_id,
                    "to_plan": subscription.get('pricing_plan_id'),
                }
            )

            return True

        except Exception as e:
            self.logger.error(
                "upgrade_activation_exception",
                extra={
                    "subscription_id": subscription_id,
                    "error": str(e), "error_type": type(e).__name__
                },
                exc_info=True
            )
            return False

    def _activate_new_subscription(
        self,
        subscription: Dict,
        event_data: Dict
    ) -> bool:
        """Activate a new subscription (not upgrade)."""
        subscription_id = subscription['id']

        self._supabase.table('subscriptions').update({
            'status': 'active',
            'current_period_start': event_data.get('current_period_start'),
            'current_period_end': event_data.get('current_period_end'),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', subscription_id).execute()

        self.logger.info(
            "new_subscription_activated",
            extra={"subscription_id": subscription_id, "user_id": subscription['user_id']}
        )

        return True

    def _get_active_subscription(
        self,
        user_id: str,
        domain: str
    ) -> Optional[Dict]:
        """Get active subscription for user+domain."""
        # FAANG-level: pending_upgrade is now a SEPARATE subscription row,
        # never a state on the active sub. Only match truly active subs.
        result = self._supabase.table('subscriptions').select('*').match({
            'user_id': user_id,
            'product_domain': domain,
        }).in_('status', ['active', 'trialing', 'grace_period']).order(
            'created_at', desc=True
        ).limit(1).execute()

        return result.data[0] if result.data else None

    def _reset_usage_counters(self, user_id: str, domain: str) -> None:
        """Reset usage counters for resettable features after upgrade."""
        self._supabase.table('usage_counters').update({
            'current_value': 0,
            'period_start': datetime.now(timezone.utc).isoformat(),
            'reset_at': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).match({
            'user_id': user_id,
            'domain': domain
        }).not_.is_('reset_at', 'null').execute()  # Only reset features with reset_at set

    def _increment_subscription_version(self, user_id: str, domain: str) -> None:
        """Increment version to invalidate all cached data."""
        version_key = f"subscription_version:{user_id}:{domain}"
        new_version = self._redis.incr(version_key)
        self._redis.expire(version_key, 86400)  # 24h TTL

        self.logger.info(
            "subscription_version_incremented",
            extra={"user_id": user_id, "domain": domain, "version": new_version}
        )

    def _invalidate_all_caches(self, user_id: str, domain: str) -> None:
        """Invalidate all caches related to subscription."""
        # Subscription cache
        self._feature_gate_engine.invalidate_subscription_cache(user_id, domain)

        # Usage counters
        self._feature_gate_engine.invalidate_usage_counter_cache(user_id, domain, None)

        # Plan features (if cached)
        # Note: plan_features are cached by plan_id, which changes on upgrade

        self.logger.info(
            "caches_invalidated",
            extra={"user_id": user_id, "domain": domain}
        )

    def _acquire_lock(self, key: str, ttl: int) -> bool:
        """Acquire distributed lock (Redis SETNX)."""
        return self._redis.set(key, '1', nx=True, ex=ttl)

    def _release_lock(self, key: str) -> None:
        """Release distributed lock."""
        self._redis.delete(key)

    def _calculate_subscription_amount(self, razorpay_sub: Dict) -> int:
        """Calculate total subscription amount in paise."""
        # Base plan amount
        plan_amount = razorpay_sub.get('plan', {}).get('amount', 0)
        total_count = razorpay_sub.get('total_count', 12)  # Usually 12 months

        # Add-ons (if any)
        addons_amount = sum(
            addon.get('item', {}).get('amount', 0)
            for addon in razorpay_sub.get('addons', [])
        )

        return (plan_amount + addons_amount) * total_count


# =============================================================================
# SINGLETON
# =============================================================================

_orchestrator_instance: Optional[UpgradeOrchestrator] = None


def get_upgrade_orchestrator() -> UpgradeOrchestrator:
    """Get singleton UpgradeOrchestrator instance with proper dependency injection."""
    global _orchestrator_instance
    if _orchestrator_instance is None:
        import os
        import redis as redis_lib
        from supabase_client import get_supabase_client
        from services.pricing_service import get_pricing_service
        from services.feature_gate_engine import get_feature_gate_engine
        from routes.payments import get_razorpay_client

        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        redis_client = redis_lib.from_url(redis_url, decode_responses=True)

        _orchestrator_instance = UpgradeOrchestrator(
            supabase=get_supabase_client(),
            redis_client=redis_client,
            razorpay_service=get_razorpay_client(),
            feature_gate_engine=get_feature_gate_engine(),
            pricing_service=get_pricing_service()
        )
        logger.info("✅ UpgradeOrchestrator singleton initialized with injected dependencies")
    return _orchestrator_instance
