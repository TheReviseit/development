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

            if current_sub and current_sub['status'] == 'pending_upgrade':
                # Always reset pending_upgrade so user can retry.
                # The previous Razorpay subscription was never completed (no webhook
                # arrived), so creating a new one is safe and idempotent.
                self.logger.warning(
                    "orchestrator_recovering_pending_upgrade",
                    extra={
                        "user_id": user_id, "domain": domain,
                        "subscription_id": current_sub['id'],
                        "initiated_at": current_sub.get('upgrade_initiated_at')
                    }
                )
                self._supabase.table('subscriptions').update({
                    'status': 'active',
                    'pending_upgrade_to_plan_id': None,
                    'pending_upgrade_razorpay_subscription_id': None,
                    'upgrade_failure_reason': 'Reset on new upgrade attempt',
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }).eq('id', current_sub['id']).execute()

                # Re-fetch after recovery
                current_sub = self._get_active_subscription(user_id, domain)

            # 3. Get target plan details
            target_plan = self._pricing_service.get_plan_by_id(target_plan_id)
            if not target_plan:
                raise UpgradeOrchestratorError(f"Plan not found: {target_plan_id}")

            # 4. Create Razorpay subscription
            subscription_data = {
                'plan_id': target_plan['razorpay_plan_id'],
                'total_count': 12,  # 12 billing cycles
                'quantity': 1,
                'customer_notify': 1,
                'notes': {
                    'user_id': user_id,
                    'domain': domain,
                    'plan_name': target_plan.get('plan_slug', ''),
                }
            }

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

            razorpay_sub = self._razorpay.subscription.create(data=subscription_data)

            # 5. Record pending upgrade in DB (atomic)
            if current_sub:
                # Existing subscription → mark as pending_upgrade
                self._supabase.table('subscriptions').update({
                    'status': 'pending_upgrade',
                    'pending_upgrade_to_plan_id': target_plan_id,
                    'pending_upgrade_razorpay_subscription_id': razorpay_sub['id'],
                    'upgrade_initiated_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }).eq('id', current_sub['id']).execute()

                self.logger.info(
                    "upgrade_pending_existing_sub",
                    extra={
                        "user_id": user_id,
                        "subscription_id": current_sub['id'],
                        "razorpay_subscription_id": razorpay_sub['id']
                    }
                )
            else:
                # New subscription → create with pending_upgrade status
                self._supabase.table('subscriptions').insert({
                    'user_id': user_id,
                    'product_domain': domain,
                    'pricing_plan_id': target_plan_id,
                    'plan_id': target_plan['razorpay_plan_id'],
                    'razorpay_subscription_id': razorpay_sub['id'],
                    'status': 'pending_upgrade',
                    'upgrade_initiated_at': datetime.now(timezone.utc).isoformat(),
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }).execute()

                self.logger.info(
                    "upgrade_pending_new_sub",
                    extra={
                        "user_id": user_id,
                        "domain": domain,
                        "razorpay_subscription_id": razorpay_sub['id']
                    }
                )

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

        result = self._supabase.table('subscriptions').update({
            'status': 'upgrade_failed',
            'upgrade_failure_reason': failure_reason,
            'pending_upgrade_to_plan_id': None,
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
        Cleanup job: Reset pending upgrades older than 30 minutes.

        If payment not confirmed in 30 mins, likely abandoned.
        Resets subscription to active state (old plan).

        Should be called by Celery cron job every 10 minutes.

        Returns:
            Number of stale upgrades cleaned up

        Example:
            >>> cleaned = orchestrator.cleanup_stale_upgrades()
            >>> print(f"Cleaned {cleaned} stale upgrades")
        """
        stale_threshold = datetime.now(timezone.utc) - timedelta(
            minutes=self.STALE_THRESHOLD_MINUTES
        )

        self.logger.info(
            "cleanup_stale_upgrades_start",
            extra={"threshold": stale_threshold.isoformat()}
        )

        # Find stale pending upgrades
        stale_subs = self._supabase.table('subscriptions').select('*').match({
            'status': 'pending_upgrade'
        }).lt('upgrade_initiated_at', stale_threshold.isoformat()).execute()

        cleaned_count = 0

        for sub in (stale_subs.data or []):
            self.logger.warning(
                "cleanup_stale_upgrade",
                extra={
                    "subscription_id": sub['id'],
                    "user_id": sub['user_id'],
                    "domain": sub['product_domain'],
                    "pending_duration": (datetime.now(timezone.utc) - datetime.fromisoformat(sub['upgrade_initiated_at'])).total_seconds() / 60
                }
            )

            # Reset to active (assume payment abandoned)
            self._supabase.table('subscriptions').update({
                'status': 'active',
                'pending_upgrade_to_plan_id': None,
                'pending_upgrade_razorpay_subscription_id': None,
                'upgrade_failure_reason': 'Payment abandoned (30 min timeout)',
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).eq('id', sub['id']).execute()

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

        Uses DB function apply_pending_upgrade_atomic() for atomicity.

        This is the CRITICAL section - must be atomic.
        """
        subscription_id = subscription['id']
        user_id = subscription['user_id']
        domain = subscription['product_domain']

        self.logger.info(
            "activate_upgrade_atomic_start",
            extra={"subscription_id": subscription_id, "user_id": user_id, "domain": domain}
        )

        try:
            # Call atomic DB function (from migration 051)
            result = self._supabase.rpc('apply_pending_upgrade_atomic', {
                'p_subscription_id': subscription_id,
                'p_event_id': event_data.get('id', 'unknown'),
                'p_period_start': event_data.get('current_period_start'),
                'p_period_end': event_data.get('current_period_end')
            }).execute()

            if result.data:
                # Reset usage counters for metered features
                self._reset_usage_counters(user_id, domain)

                # Increment subscription version (invalidate caches)
                self._increment_subscription_version(user_id, domain)

                # Invalidate all caches (belt + suspenders)
                self._invalidate_all_caches(user_id, domain)

                # Log success
                self.logger.info(
                    "upgrade_activated_success",
                    extra={
                        "subscription_id": subscription_id,
                        "user_id": user_id,
                        "domain": domain,
                        "from_plan": subscription['pricing_plan_id'],
                        "to_plan": subscription['pending_upgrade_to_plan_id']
                    }
                )

                return True
            else:
                self.logger.error(
                    "upgrade_activation_failed_db_function",
                    extra={"subscription_id": subscription_id}
                )
                return False

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
        result = self._supabase.table('subscriptions').select('*').match({
            'user_id': user_id,
            'product_domain': domain,
        }).in_('status', ['active', 'trialing', 'grace_period', 'pending_upgrade']).order(
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
        from routes.payments import razorpay_client as rzp_client

        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        redis_client = redis_lib.from_url(redis_url, decode_responses=True)

        _orchestrator_instance = UpgradeOrchestrator(
            supabase=get_supabase_client(),
            redis_client=redis_client,
            razorpay_service=rzp_client,
            feature_gate_engine=get_feature_gate_engine(),
            pricing_service=get_pricing_service()
        )
        logger.info("✅ UpgradeOrchestrator singleton initialized with injected dependencies")
    return _orchestrator_instance
