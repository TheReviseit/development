"""
Billing Outbox Worker (Phase C)
================================
Celery Beat task that polls the billing_outbox table for pending entries
and triggers reconciliation via the reconciliation engine.

Polling interval: 10 seconds (configurable via OUTBOX_POLL_INTERVAL).
For lower latency, run the standalone daemon: python -m tasks.billing_outbox_worker --daemon

Design:
  - Uses dequeue_billing_outbox() PG function with FOR UPDATE SKIP LOCKED
  - Processes each row by calling billing_outbox_service.process_row()
  - Failed rows are retried with exponential backoff, then sent to DLQ
  - Logs structured stats on every cycle
"""

import logging
import os
import time
import signal
from typing import Dict, Any

logger = logging.getLogger('reviseit.tasks.billing_outbox_worker')

POLL_INTERVAL = int(os.getenv('OUTBOX_POLL_INTERVAL', '10'))


def process_outbox_batch() -> Dict[str, Any]:
    """
    Dequeue and process one batch of pending billing outbox rows.

    Called by the Celery Beat task every POLL_INTERVAL seconds.
    Safe to call concurrently — uses SELECT FOR UPDATE SKIP LOCKED.
    """
    try:
        from services.billing_outbox_service import process_pending_batch
        stats = process_pending_batch()

        if stats.get('dequeued', 0) > 0:
            logger.info(
                f"billing_outbox_batch dequeued={stats.get('dequeued')} "
                f"completed={stats.get('completed')} failed={stats.get('failed')}"
            )

        return stats

    except Exception as e:
        logger.error(f"billing_outbox_batch_error: {e}", exc_info=True)
        return {'dequeued': 0, 'completed': 0, 'failed': 0, 'error': str(e)}


def cleanup_outbox() -> int:
    """
    Clean up completed outbox entries older than 72 hours.
    Called periodically by a separate Beat task.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        result = db.rpc('cleanup_billing_outbox', {'retention_hours': 72}).execute()
        deleted = result.data if isinstance(result.data, int) else 0

        if deleted > 0:
            logger.info(f"billing_outbox_cleanup deleted={deleted}")

        return deleted

    except Exception as e:
        logger.error(f"billing_outbox_cleanup_error: {e}", exc_info=True)
        return 0


try:
    from celery_app import celery_app

    @celery_app.task(name='billing_outbox_worker.process_batch')
    def process_batch_task():
        """Celery task wrapper for process_outbox_batch."""
        return process_outbox_batch()

    @celery_app.task(name='billing_outbox_worker.cleanup')
    def cleanup_task():
        """Celery task wrapper for cleanup_outbox."""
        return cleanup_outbox()

    logger.info("Registered billing_outbox_worker tasks")

except ImportError:
    logger.warning("Celery not available, billing outbox worker not registered")
