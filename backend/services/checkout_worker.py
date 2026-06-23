import hashlib
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET')

_CHECKOUT_WORKER_INSTANCE = None


class RazorpayCircuitBreaker:
    """
    Thread-safe circuit breaker for Razorpay API calls.
    Prevents cascading failures when Razorpay is degraded.
    """
    def __init__(self, threshold: int = 5, recovery_timeout: float = 30.0):
        self._threshold = threshold
        self._recovery_timeout = recovery_timeout
        self._failures = 0
        self._last_failure_time = 0.0
        self._state = 'closed'  # closed, open, half-open
        self._lock = threading.Lock()

    def can_execute(self) -> bool:
        with self._lock:
            if self._state == 'closed':
                return True
            if self._state == 'open':
                if time.monotonic() - self._last_failure_time > self._recovery_timeout:
                    self._state = 'half-open'
                    return True
                return False
            return True

    def record_success(self):
        with self._lock:
            self._failures = 0
            self._state = 'closed'

    def record_failure(self):
        with self._lock:
            self._failures += 1
            self._last_failure_time = time.monotonic()
            if self._failures >= self._threshold:
                self._state = 'open'

    @property
    def state(self) -> str:
        with self._lock:
            return self._state


class CheckoutBackgroundWorker:
    MAX_QUEUED = 10
    MAX_WORKERS = 2
    RAZORPAY_TIMEOUT = (30, 25)
    MAX_RETRIES = 3
    ORPHAN_SWEEP_INTERVAL = 60
    ORPHAN_AGE_SECONDS = 180

    def __init__(self, supabase):
        self._supabase = supabase
        self._executor = ThreadPoolExecutor(
            max_workers=self.MAX_WORKERS,
            thread_name_prefix='checkout',
        )
        self._active_futures = []
        self._shutdown_event = threading.Event()
        self._sweep_thread = None
        self._lock = threading.Lock()
        self._circuit_breaker = RazorpayCircuitBreaker(
            threshold=5,
            recovery_timeout=30.0,
        )

    # =========================================================================
    # Public API
    # =========================================================================

    def try_enqueue(self, checkout_id: str) -> bool:
        with self._lock:
            pending = sum(
                1 for f in self._active_futures if not f.done()
            )
            if pending >= self.MAX_QUEUED:
                logger.warning(
                    "checkout_worker_queue_full",
                    extra={"checkout_id": checkout_id, "pending": pending}
                )
                return False
            future = self._executor.submit(self._claim_and_process, checkout_id)
            self._active_futures.append(future)
            return True

    def start(self):
        logger.info("checkout_worker_starting workers=%d max_queued=%d",
                     self.MAX_WORKERS, self.MAX_QUEUED)
        self._sweep_thread = threading.Thread(
            target=self._orphan_sweep_loop,
            daemon=True,
            name='checkout-orphan-sweep',
        )
        self._sweep_thread.start()
        # Recover stale 'initiated' jobs from previous process instance
        try:
            result = self._supabase.table('checkout_requests').select('id').eq(
                'status', 'initiated'
            ).execute()
            stale = result.data or []
            if stale:
                logger.info("checkout_worker_startup_recovering count=%d", len(stale))
                for row in stale:
                    self.try_enqueue(row['id'])
        except Exception as e:
            logger.warning("checkout_worker_startup_scan_error %s", e)

    def stop(self, timeout: float = 10.0):
        logger.info("checkout_worker_stopping")
        self._shutdown_event.set()
        self._executor.shutdown(wait=False)
        if self._sweep_thread and self._sweep_thread.is_alive():
            self._sweep_thread.join(timeout=timeout)

    @property
    def queue_depth(self) -> int:
        with self._lock:
            return sum(1 for f in self._active_futures if not f.done())

    # =========================================================================
    # Internal
    # =========================================================================

    def _claim_and_process(self, checkout_id: str):
        try:
            claimed = self._claim_job(checkout_id)
            if not claimed:
                return
            self._process_checkout(checkout_id)
        except Exception as e:
            logger.error(
                "checkout_worker_crash",
                extra={"checkout_id": checkout_id, "error": str(e)[:200]},
                exc_info=True,
            )

    def _claim_job(self, checkout_id: str) -> bool:
        result = self._supabase.table('checkout_requests').update({
            'status': 'processing',
            'worker_id': f'{os.getpid()}_{threading.get_ident()}',
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', checkout_id).eq('status', 'initiated').execute()
        return bool(result.data)

    def _process_checkout(self, checkout_id: str):
        import requests as _requests

        last_error = None
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                if not self._circuit_breaker.can_execute():
                    logger.error(
                        "checkout_worker_circuit_open",
                        extra={"checkout_id": checkout_id}
                    )
                    self._fail_checkout(
                        checkout_id,
                        'CIRCUIT_OPEN',
                        'Razorpay circuit breaker is open. Payment service degraded.',
                    )
                    return

                row = self._get_checkout(checkout_id)
                if not row:
                    logger.warning(
                        "checkout_worker_row_gone",
                        extra={"checkout_id": checkout_id}
                    )
                    return

                if row['status'] != 'processing':
                    return

                checkout_token = row['checkout_token']
                _idem_raw = f"checkout_{checkout_token}"
                _idem_hash = hashlib.sha256(_idem_raw.encode()).hexdigest()[:24]
                idempotency_key = f"ck_{_idem_hash}"

                subscription_data = {
                    'plan_id': row['razorpay_plan_id'],
                    'total_count': 12,
                    'quantity': 1,
                    'customer_notify': 0,
                    'notes': {
                        'user_id': row['user_id'],
                        'domain': row['domain'],
                        'plan_name': row.get('target_plan_slug', ''),
                        'checkout_id': checkout_id,
                    }
                }

                addon_data = row.get('addon_data', []) or []
                if isinstance(addon_data, str):
                    addon_data = json.loads(addon_data)
                if addon_data:
                    subscription_data['addons'] = [
                        {
                            'item': {
                                'name': a.get('display_name', a.get('addon_slug', '')),
                                'amount': a.get('amount_paise', 0),
                                'currency': 'INR',
                            }
                        }
                        for a in addon_data
                    ]

                rzp_customer_id = self._get_customer_id(row['user_id'])
                if rzp_customer_id:
                    subscription_data['customer_id'] = rzp_customer_id

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
                    timeout=self.RAZORPAY_TIMEOUT,
                )

                if _response.status_code == 409:
                    error_data = _response.json()
                    existing_id = (
                        error_data.get('error', {})
                        .get('metadata', {})
                        .get('resource_id', '')
                    )
                    if existing_id:
                        logger.info(
                            "checkout_worker_409_recovered checkout_id=%s existing_sub=%s",
                            checkout_id, existing_id,
                        )
                        self._complete_checkout_with_sub_id(checkout_id, existing_id)
                        self._circuit_breaker.record_success()
                        return

                    logger.error(
                        "checkout_worker_409_no_resource_id checkout_id=%s response=%s",
                        checkout_id, error_data,
                    )
                    self._fail_checkout(
                        checkout_id,
                        'RAZORPAY_CONFLICT_NO_ID',
                        'Razorpay returned 409 without a recoverable resource_id',
                    )
                    return

                _response.raise_for_status()
                razorpay_sub = _response.json()
                self._circuit_breaker.record_success()

                self._complete_checkout(checkout_id, razorpay_sub)
                return

            except Exception as e:
                last_error = e
                self._circuit_breaker.record_failure()
                logger.warning(
                    "checkout_worker_retry",
                    extra={
                        "checkout_id": checkout_id,
                        "attempt": attempt,
                        "max_retries": self.MAX_RETRIES,
                        "error": str(e)[:200],
                        "circuit_state": self._circuit_breaker.state,
                    }
                )
                self._update_retry_count(checkout_id, attempt)
                if attempt < self.MAX_RETRIES:
                    backoff = 2 ** attempt
                    time.sleep(backoff)

        self._fail_checkout(
            checkout_id,
            'ALL_RETRIES_EXHAUSTED',
            str(last_error)[:500] if last_error else 'Unknown error',
        )

    def _get_checkout(self, checkout_id: str) -> Optional[Dict[str, Any]]:
        result = self._supabase.table('checkout_requests').select('*').eq(
            'id', checkout_id
        ).limit(1).execute()
        return result.data[0] if result.data else None

    def _get_customer_id(self, user_id: str) -> Optional[str]:
        try:
            result = self._supabase.table('razorpay_customers').select(
                'razorpay_customer_id'
            ).eq('user_id', user_id).limit(1).execute()
            return result.data[0]['razorpay_customer_id'] if result.data else None
        except Exception:
            return None

    def _complete_checkout(self, checkout_id: str, razorpay_sub: Dict[str, Any]):
        now = datetime.now(timezone.utc).isoformat()

        # Create/update the pending subscription row so verify-payment can find it
        try:
            row = self._get_checkout(checkout_id)
            if row:
                existing = self._supabase.table('subscriptions').select('id').eq(
                    'user_id', row['user_id']
                ).eq('status', 'pending_upgrade').limit(1).execute()

                sub_data = {
                    'user_id': row['user_id'],
                    'product_domain': row['domain'],
                    'plan_name': row.get('target_plan_slug', ''),
                    'pricing_plan_id': row['target_plan_id'],
                    'plan_id': row['razorpay_plan_id'],
                    'razorpay_subscription_id': razorpay_sub['id'],
                    'pending_upgrade_to_plan_id': row['target_plan_id'],
                    'pending_upgrade_razorpay_subscription_id': razorpay_sub['id'],
                    'status': 'pending_upgrade',
                    'updated_at': now,
                }

                if existing.data:
                    self._supabase.table('subscriptions').update(sub_data).eq(
                        'id', existing.data[0]['id']
                    ).execute()
                    logger.info(
                        "checkout_worker_pending_sub_updated",
                        extra={"checkout_id": checkout_id, "sub_id": existing.data[0]['id']},
                    )
                else:
                    sub_data['created_at'] = now
                    self._supabase.table('subscriptions').insert(sub_data).execute()
                    logger.info(
                        "checkout_worker_pending_sub_created",
                        extra={"checkout_id": checkout_id, "user_id": row['user_id']},
                    )
        except Exception as sub_err:
            logger.error(
                "checkout_worker_pending_sub_error",
                extra={"checkout_id": checkout_id, "error": str(sub_err)[:200]},
                exc_info=True,
            )

        self._supabase.table('checkout_requests').update({
            'status': 'completed',
            'razorpay_subscription_id': razorpay_sub['id'],
            'razorpay_key_id': os.getenv('RAZORPAY_KEY_ID'),
            'amount_paise': razorpay_sub.get('amount', 0),
            'currency': razorpay_sub.get('currency', 'INR'),
            'completed_at': now,
            'updated_at': now,
            'worker_id': None,
        }).eq('id', checkout_id).eq('status', 'processing').execute()

        logger.info(
            "checkout_worker_completed",
            extra={
                "checkout_id": checkout_id,
                "razorpay_subscription_id": razorpay_sub['id'],
            }
        )

    def _complete_checkout_with_sub_id(self, checkout_id: str, razorpay_subscription_id: str):
        """Complete checkout when we already have a Razorpay subscription ID (409 recovery)."""
        now = datetime.now(timezone.utc).isoformat()
        row = self._get_checkout(checkout_id)
        if not row:
            return

        try:
            existing = self._supabase.table('subscriptions').select('id').eq(
                'user_id', row['user_id']
            ).eq('status', 'pending_upgrade').limit(1).execute()

            sub_data = {
                'user_id': row['user_id'],
                'product_domain': row['domain'],
                'plan_name': row.get('target_plan_slug', ''),
                'pricing_plan_id': row['target_plan_id'],
                'plan_id': row['razorpay_plan_id'],
                'razorpay_subscription_id': razorpay_subscription_id,
                'pending_upgrade_to_plan_id': row['target_plan_id'],
                'pending_upgrade_razorpay_subscription_id': razorpay_subscription_id,
                'status': 'pending_upgrade',
                'updated_at': now,
            }

            if existing.data:
                self._supabase.table('subscriptions').update(sub_data).eq(
                    'id', existing.data[0]['id']
                ).execute()
            else:
                sub_data['created_at'] = now
                self._supabase.table('subscriptions').insert(sub_data).execute()
        except Exception as sub_err:
            logger.error(
                "checkout_worker_409_pending_sub_error",
                extra={"checkout_id": checkout_id, "error": str(sub_err)[:200]},
                exc_info=True,
            )

        self._supabase.table('checkout_requests').update({
            'status': 'completed',
            'razorpay_subscription_id': razorpay_subscription_id,
            'razorpay_key_id': os.getenv('RAZORPAY_KEY_ID'),
            'completed_at': now,
            'updated_at': now,
            'worker_id': None,
        }).eq('id', checkout_id).in_('status', ['processing', 'initiated']).execute()

        logger.info(
            "checkout_worker_409_completed",
            extra={
                "checkout_id": checkout_id,
                "razorpay_subscription_id": razorpay_subscription_id,
            }
        )

    def _fail_checkout(self, checkout_id: str, error_code: str, error_message: str):
        now = datetime.now(timezone.utc).isoformat()
        self._supabase.table('checkout_requests').update({
            'status': 'failed',
            'error_message': f'[{error_code}] {error_message}',
            'updated_at': now,
            'worker_id': None,
        }).eq('id', checkout_id).in_('status', ['processing', 'initiated']).execute()

        logger.error(
            "checkout_worker_failed",
            extra={
                "checkout_id": checkout_id,
                "error_code": error_code,
                "error_message": error_message[:200],
            }
        )

    def _update_retry_count(self, checkout_id: str, attempt: int):
        now = datetime.now(timezone.utc).isoformat()
        next_retry = (
            datetime.now(timezone.utc) + timedelta(seconds=2 ** attempt)
        ).isoformat()
        self._supabase.table('checkout_requests').update({
            'retry_count': attempt,
            'next_retry_at': next_retry,
            'updated_at': now,
        }).eq('id', checkout_id).execute()

    def _orphan_sweep_loop(self):
        while not self._shutdown_event.is_set():
            try:
                self._sweep_orphans()
            except Exception as e:
                logger.error("checkout_orphan_sweep_error error=%s", e)
            self._shutdown_event.wait(self.ORPHAN_SWEEP_INTERVAL)

    def _sweep_orphans(self):
        cutoff = (
            datetime.now(timezone.utc) - timedelta(seconds=self.ORPHAN_AGE_SECONDS)
        ).isoformat()
        initiated_cutoff = (
            datetime.now(timezone.utc) - timedelta(seconds=30)
        ).isoformat()

        # 1. Reclaim abandoned 'processing' jobs (older than ORPHAN_AGE_SECONDS)
        orphans = self._supabase.table('checkout_requests').select('id').eq(
            'status', 'processing'
        ).lt('updated_at', cutoff).execute()

        for row in (orphans.data or []):
            result = self._supabase.table('checkout_requests').update({
                'status': 'initiated',
                'worker_id': None,
                'retry_count': 0,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('id', row['id']).eq('status', 'processing').execute()

            if result.data:
                orphan_id = row['id']
                logger.warning(
                    "checkout_orphan_reclaimed",
                    extra={"checkout_id": orphan_id}
                )
                self.try_enqueue(orphan_id)

        # 2. Pick up fresh 'initiated' items that Celery never delivered
        fresh = self._supabase.table('checkout_requests').select('id').eq(
            'status', 'initiated'
        ).lt('updated_at', initiated_cutoff).order('updated_at').limit(5).execute()

        for row in (fresh.data or []):
            self.try_enqueue(row['id'])


def get_checkout_worker():
    checkout_worker_enabled = os.getenv('CHECKOUT_WORKER_ENABLED', 'false').lower() == 'true'
    if not checkout_worker_enabled:
        return None
    global _CHECKOUT_WORKER_INSTANCE
    if _CHECKOUT_WORKER_INSTANCE is None:
        from supabase_client import get_supabase_client
        _CHECKOUT_WORKER_INSTANCE = CheckoutBackgroundWorker(
            supabase=get_supabase_client()
        )
    return _CHECKOUT_WORKER_INSTANCE
