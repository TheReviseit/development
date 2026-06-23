"""
Checkout processor daemon — Postgres lease-based job queue worker.

Run as Render background worker:
  python -m workers.checkout_processor_daemon --loop
"""

import logging
import os
import time
import argparse

logger = logging.getLogger("reviseit.checkout_processor")

LEASE_SECONDS = int(os.getenv("CHECKOUT_LEASE_SECONDS", "600"))
WORKER_ID = os.getenv("CHECKOUT_WORKER_ID", f"render-bg-{os.getpid()}")
POLL_INTERVAL = float(os.getenv("CHECKOUT_POLL_INTERVAL", "2"))


def process_one_job() -> bool:
    from supabase_client import get_supabase_client

    db = get_supabase_client()

    try:
        result = db.rpc(
            "claim_checkout_with_lease",
            {"p_worker_id": WORKER_ID, "p_lease_seconds": LEASE_SECONDS},
        ).execute()
    except Exception as e:
        logger.warning(f"claim_checkout_rpc_unavailable fallback: {e}")
        return _process_one_job_fallback(db)

    if not result.data:
        return False

    row = result.data[0]
    checkout_token = row.get("checkout_token")
    if not checkout_token:
        return False

    from tasks.subscription_worker import execute

    outcome = execute(checkout_token)
    logger.info(f"checkout_job_done token={checkout_token[:16]} outcome={outcome.get('status')}")
    return True


def _process_one_job_fallback(db) -> bool:
    """Fallback when Migration H RPC not yet applied."""
    pending = (
        db.table("checkout_requests")
        .select("checkout_token")
        .eq("status", "initiated")
        .order("created_at")
        .limit(1)
        .execute()
    )
    if not pending.data:
        return False
    token = pending.data[0]["checkout_token"]
    from tasks.subscription_worker import execute

    execute(token)
    return True


def run_loop():
    logging.basicConfig(level=logging.INFO)
    logger.info(f"checkout_processor_start worker_id={WORKER_ID}")
    while True:
        try:
            processed = process_one_job()
            if not processed:
                time.sleep(POLL_INTERVAL)
        except Exception as e:
            logger.error(f"checkout_processor_loop_error: {e}", exc_info=True)
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if args.once:
        ok = process_one_job()
        print({"processed": ok})
    elif args.loop:
        run_loop()
    else:
        ok = process_one_job()
        print({"processed": ok})
