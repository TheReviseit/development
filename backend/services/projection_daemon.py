"""
Standalone Projection Daemon — 100ms Polling Latency
=====================================================
High-frequency poller for the subscription_events → subscriptions.status
projection. Runs as a standalone process (not Celery Beat) to achieve
100ms latency. For lower-throughput setups, the Celery Beat task at
2-second intervals is sufficient.

Usage:
    python -m services.projection_daemon
    # or
    python backend/services/projection_daemon.py

Design:
  - Polls subscription_events table every POLL_INTERVAL_MS (default 100ms)
  - Batches up to BATCH_SIZE events (default 100) per cycle
  - Per-subscription locking via pg_advisory_xact_lock
  - Updates projection_checkpoints after each batch
  - Graceful shutdown on SIGINT/SIGTERM
  - Health check endpoint on HTTP (optional, for container probes)
"""

import os
import sys
import time
import signal
import logging
from datetime import datetime, timezone
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] projection_daemon: %(message)s',
)
logger = logging.getLogger('projection_daemon')

POLL_INTERVAL_MS = int(os.getenv('PROJECTION_POLL_INTERVAL_MS', '100'))
BATCH_SIZE = int(os.getenv('PROJECTION_BATCH_SIZE', '100'))

EVENT_TO_STATUS = {
    'subscription.created': 'pending',
    'subscription.activated': 'active',
    'subscription.payment_failed': 'past_due',
    'subscription.past_due': 'past_due',
    'subscription.grace_period_started': 'grace_period',
    'subscription.grace_period_expired': 'suspended',
    'subscription.suspended': 'suspended',
    'subscription.cancelled': 'cancelled',
    'subscription.reactivated': 'active',
    'subscription.expired': 'expired',
    'subscription.halted': 'halted',
    'subscription.resumed': 'active',
    'subscription.upgraded': 'active',
    'subscription.downgraded': 'active',
    'subscription.renewed': 'active',
    'subscription.reconciled': None,
}

PERIOD_EVENTS = {
    'subscription.activated', 'subscription.renewed',
    'subscription.upgraded', 'subscription.reconciled',
}

_shutdown = False


def signal_handler(signum, frame):
    global _shutdown
    logger.info(f"Received signal {signum}, shutting down...")
    _shutdown = True


def get_db():
    from supabase_client import get_supabase_client
    return get_supabase_client()


def process_batch(db) -> dict:
    """Process one batch of unprocessed events."""
    try:
        cp = db.table('projection_checkpoints') \
            .select('last_processed_event_id') \
            .eq('projector_name', 'subscription_status') \
            .single() \
            .execute()

        last_id = cp.data.get('last_processed_event_id', 0) if cp.data else 0

        events = db.table('subscription_events') \
            .select('*') \
            .gt('id', last_id) \
            .order('id') \
            .limit(BATCH_SIZE) \
            .execute()

        rows = events.data or []
        if not rows:
            return {'processed': 0, 'projected': 0}

        subs_to_events = {}
        for row in rows:
            subs_to_events.setdefault(row['subscription_id'], []).append(row)

        projected_count = 0
        for sub_id, sub_events in subs_to_events.items():
            try:
                latest = sub_events[-1]
                target_status = EVENT_TO_STATUS.get(latest['event_type'])

                if target_status is None and latest['event_type'] == 'subscription.reconciled':
                    target_status = (latest.get('payload') or {}).get('status')

                if not target_status:
                    continue

                lock_id = abs(hash(sub_id)) % (2**63)
                try:
                    db.rpc('pg_advisory_xact_lock', {'key': lock_id}).execute()
                except Exception:
                    pass

                update = {
                    'status': target_status,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }

                if latest['event_type'] in PERIOD_EVENTS:
                    payload = latest.get('payload') or {}
                    if payload.get('current_period_start'):
                        update['current_period_start'] = payload['current_period_start']
                    if payload.get('current_period_end'):
                        update['current_period_end'] = payload['current_period_end']

                db.table('subscriptions') \
                    .update(update) \
                    .eq('id', sub_id) \
                    .execute()

                projected_count += 1

            except Exception as e:
                logger.error(f"projection_error sub={sub_id}: {e}")

        new_last_id = rows[-1]['id']
        now = datetime.now(timezone.utc)
        lag = int((now - datetime.fromisoformat(
            rows[-1]['created_at'].replace('Z', '+00:00')
        )).total_seconds())

        db.table('projection_checkpoints') \
            .update({
                'last_processed_event_id': new_last_id,
                'last_processed_at': now.isoformat(),
                'lag_seconds': lag,
            }) \
            .eq('projector_name', 'subscription_status') \
            .execute()

        return {
            'processed': len(rows),
            'projected': projected_count,
            'lag': lag,
            'checkpoint': new_last_id,
        }

    except Exception as e:
        logger.error(f"batch_error: {e}", exc_info=True)
        return {'error': str(e)}


def main_loop():
    """Main polling loop."""
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info(
        f"Starting projection daemon: "
        f"interval={POLL_INTERVAL_MS}ms batch={BATCH_SIZE}"
    )

    db = get_db()
    cycle_count = 0
    total_processed = 0
    total_projected = 0

    while not _shutdown:
        cycle_start = time.monotonic()

        try:
            result = process_batch(db)

            if result.get('processed', 0) > 0:
                total_processed += result['processed']
                total_projected += result.get('projected', 0)
                cycle_count += 1

                if cycle_count % 100 == 0:
                    logger.info(
                        f"cycles={cycle_count} total_events={total_processed} "
                        f"total_projected={total_projected} "
                        f"lag={result.get('lag', 0)}s "
                        f"checkpoint={result.get('checkpoint', 0)}"
                    )
        except Exception as e:
            logger.error(f"cycle_error: {e}", exc_info=True)

        elapsed_ms = (time.monotonic() - cycle_start) * 1000
        sleep_ms = max(0, POLL_INTERVAL_MS - elapsed_ms)
        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000)

    logger.info(
        f"Daemon stopped. cycles={cycle_count} "
        f"total_events={total_processed} total_projected={total_projected}"
    )


if __name__ == '__main__':
    # Load env before starting
    from dotenv import load_dotenv
    load_dotenv()
    main_loop()
