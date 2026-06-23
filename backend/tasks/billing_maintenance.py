"""
Billing maintenance Celery tasks — runs on Render beat, not Vercel.

Vercel Hobby allows cron at most once per day; checkout drain and orphan
reconciliation need sub-minute / few-minute intervals, so they live here.
"""

import logging

logger = logging.getLogger("reviseit.tasks.billing_maintenance")


def process_checkout_queue_task():
    from services.billing_maintenance_service import process_checkout_queue

    result = process_checkout_queue(max_jobs=3)
    if result.get("processed"):
        logger.info(f"billing_checkout_queue processed={result['processed']}")
    return result


def reconcile_orphans_task():
    from services.billing_maintenance_service import reconcile_orphans

    result = reconcile_orphans()
    logger.info(
        "billing_orphan_reconcile "
        f"stuck={result.get('stuck_checkouts_failed')} "
        f"healed={result.get('subscriptions_reconciled')}"
    )
    return result


try:
    from celery_app import celery_app

    if celery_app:

        @celery_app.task(name="billing_maintenance.process_checkout_queue")
        def process_checkout_queue_celery():
            return process_checkout_queue_task()

        @celery_app.task(name="billing_maintenance.reconcile_orphans")
        def reconcile_orphans_celery():
            return reconcile_orphans_task()

except Exception:
    pass
