"""
Bounded checkout dispatch pool — async Razorpay without blocking HTTP workers.

Uses a process-singleton ThreadPoolExecutor (non-daemon workers) with an
explicit in-flight cap. Returns False when saturated so callers can 429.
"""

import atexit
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional, Set

logger = logging.getLogger('reviseit.billing.checkout_dispatch')

_pool_lock = threading.Lock()
_pool_instance: Optional['CheckoutDispatchPool'] = None

# Optional Prometheus histogram
_checkout_dispatch_duration = None
try:
    from prometheus_client import Histogram
    _checkout_dispatch_duration = Histogram(
        'checkout_dispatch_duration_seconds',
        'Background checkout dispatch job duration (Razorpay path)',
        buckets=(0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0, 60.0),
    )
except Exception:
    pass


def _run_checkout_job(
    checkout_token: str,
    idempotency_key: Optional[str],
    claim_token: Optional[str],
    request_id: Optional[str] = None,
) -> None:
    """Execute Razorpay checkout and finalize idempotency with claim_token fencing."""
    start = time.time()
    try:
        from app import app
        from flask import g

        with app.app_context():
            g.request_id = request_id or f"checkout_{checkout_token[:12]}"
            from tasks.subscription_worker import execute
            result = execute(checkout_token)

            from config.billing_flags import get_bool_flag
            if not get_bool_flag('fix_server_idempotency', True) or not claim_token or not idempotency_key:
                return

            from supabase_client import get_supabase_client
            from services.billing_checkout_idempotency import complete_claim, fail_claim

            db = get_supabase_client()
            status = result.get('status')

            if status == 'completed':
                checkout_row = (
                    db.table('checkout_requests')
                    .select('amount_paise, currency, target_plan_slug')
                    .eq('checkout_token', checkout_token)
                    .limit(1)
                    .execute()
                )
                row = (checkout_row.data or [{}])[0]
                success_payload = {
                    'success': True,
                    'subscription_id': result.get('razorpay_subscription_id'),
                    'key_id': os.getenv('RAZORPAY_KEY_ID'),
                    'amount': row.get('amount_paise'),
                    'currency': row.get('currency', 'INR'),
                    'plan_name': row.get('target_plan_slug'),
                }
                complete_claim(db, idempotency_key, claim_token, success_payload)
            elif status == 'skipped':
                logger.info(
                    f"checkout_dispatch_skipped token={checkout_token[:12]}... "
                    f"reason={result.get('reason')}"
                )
            else:
                fail_claim(db, idempotency_key, claim_token, 'CHECKOUT_INCOMPLETE')
    except Exception as exc:
        logger.error(
            f"checkout_dispatch_failed token={checkout_token[:12]}...: {exc}",
            exc_info=True,
        )
        try:
            from config.billing_flags import get_bool_flag
            if get_bool_flag('fix_server_idempotency', True) and claim_token and idempotency_key:
                from supabase_client import get_supabase_client
                from services.billing_checkout_idempotency import fail_claim
                fail_claim(
                    get_supabase_client(),
                    idempotency_key,
                    claim_token,
                    str(exc)[:500],
                )
        except Exception as fail_exc:
            logger.error(f"checkout_dispatch_fail_claim_error: {fail_exc}")
        raise
    finally:
        elapsed = time.time() - start
        if _checkout_dispatch_duration is not None:
            try:
                _checkout_dispatch_duration.observe(elapsed)
            except Exception:
                pass
        logger.info(
            f"checkout_dispatch_finished token={checkout_token[:12]}... "
            f"duration_s={elapsed:.2f}"
        )


class CheckoutDispatchPool:
    """Bounded executor for background checkout jobs."""

    def __init__(self, max_workers: int):
        self._max_workers = max(1, int(max_workers))
        self._executor = ThreadPoolExecutor(
            max_workers=self._max_workers,
            thread_name_prefix='checkout-dispatch',
        )
        self._lock = threading.Lock()
        self._in_flight = 0
        self._in_flight_tokens: Set[str] = set()

    @property
    def max_workers(self) -> int:
        return self._max_workers

    @property
    def in_flight(self) -> int:
        with self._lock:
            return self._in_flight

    def try_submit(
        self,
        checkout_token: str,
        idempotency_key: Optional[str] = None,
        claim_token: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> bool:
        """Submit job if under capacity. Returns False when pool is saturated."""
        with self._lock:
            if self._in_flight >= self._max_workers:
                logger.warning(
                    f"checkout_dispatch_pool_full in_flight={self._in_flight} "
                    f"max={self._max_workers}"
                )
                return False
            self._in_flight += 1
            self._in_flight_tokens.add(checkout_token)

        def _on_done(_future):
            with self._lock:
                self._in_flight = max(0, self._in_flight - 1)
                self._in_flight_tokens.discard(checkout_token)

        future = self._executor.submit(
            _run_checkout_job,
            checkout_token,
            idempotency_key,
            claim_token,
            request_id,
        )
        future.add_done_callback(_on_done)
        logger.info(
            f"checkout_dispatch_submitted token={checkout_token[:12]}... "
            f"in_flight={self.in_flight}/{self._max_workers}"
        )
        return True

    def shutdown(self, wait: bool = True) -> None:
        tokens = []
        with self._lock:
            tokens = list(self._in_flight_tokens)[:20]
        logger.info(
            f"checkout_dispatch_pool_shutdown in_flight={self.in_flight} "
            f"tokens={tokens}"
        )
        self._executor.shutdown(wait=wait, cancel_futures=False)


def _resolve_max_workers() -> int:
    try:
        from config.billing_flags import get_int_flag
        return max(1, get_int_flag('checkout_bg_max_workers', 3))
    except Exception:
        return max(1, int(os.getenv('CHECKOUT_BG_MAX_WORKERS', '3')))


def get_checkout_dispatch_pool(force_refresh: bool = False) -> CheckoutDispatchPool:
    """Process-singleton pool sized from runtime flag checkout_bg_max_workers."""
    global _pool_instance
    max_workers = _resolve_max_workers()
    with _pool_lock:
        if _pool_instance is None or force_refresh:
            if _pool_instance is not None:
                try:
                    _pool_instance.shutdown(wait=False)
                except Exception:
                    pass
            _pool_instance = CheckoutDispatchPool(max_workers=max_workers)
        elif _pool_instance.max_workers != max_workers:
            _pool_instance.shutdown(wait=False)
            _pool_instance = CheckoutDispatchPool(max_workers=max_workers)
        return _pool_instance


def shutdown_checkout_dispatch_pool(wait: bool = True) -> None:
    global _pool_instance
    with _pool_lock:
        if _pool_instance is not None:
            _pool_instance.shutdown(wait=wait)
            _pool_instance = None


def complete_checkout_from_webhook(
    db,
    razorpay_subscription_id: str,
    checkout_token: Optional[str] = None,
) -> bool:
    """
    Webhook backstop: mark checkout_requests completed when worker died mid-flight.
    """
    from tasks.subscription_worker import complete_checkout_request

    try:
        if checkout_token:
            result = (
                db.table('checkout_requests')
                .select('status, checkout_token')
                .eq('checkout_token', checkout_token)
                .in_('status', ['initiated', 'processing'])
                .limit(1)
                .execute()
            )
            if result.data:
                complete_checkout_request(db, checkout_token, razorpay_subscription_id)
                logger.info(
                    f"webhook_completed_checkout token={checkout_token[:12]}... "
                    f"sub={razorpay_subscription_id}"
                )
                return True

        if razorpay_subscription_id:
            by_sub = (
                db.table('checkout_requests')
                .select('checkout_token, status')
                .eq('razorpay_subscription_id', razorpay_subscription_id)
                .in_('status', ['initiated', 'processing'])
                .limit(1)
                .execute()
            )
            if by_sub.data:
                token = by_sub.data[0]['checkout_token']
                complete_checkout_request(db, token, razorpay_subscription_id)
                return True
    except Exception as e:
        logger.warning(f"webhook_complete_checkout_failed sub={razorpay_subscription_id}: {e}")
    return False


atexit.register(lambda: shutdown_checkout_dispatch_pool(wait=True))
