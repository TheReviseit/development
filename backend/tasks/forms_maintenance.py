"""
tasks/forms_maintenance.py

Celery task: Enterprise Two-Phase Hard-Delete Purge for Forms.

Triggered by: Celery Beat daily at 3:00 AM UTC (see celery_app.py).
Manual trigger: POST /api/forms/admin/purge

Flow:
  Phase 1 (immediate, user-facing): delete_form() soft-deletes the forms row.
  Phase 2 (this task): hard-deletes rows older than the grace period.
  DB ON DELETE CASCADE handles form_fields, form_responses, response_values.
  form_deletions audit table is stamped with hard_purged_at.
"""

import logging
from celery_app import celery_app

logger = logging.getLogger("reviseit.tasks.forms_maintenance")


@celery_app.task(
    name="tasks.forms_maintenance.purge_deleted_forms_task",
    bind=True,
    max_retries=3,
    default_retry_delay=300,  # 5 minutes between retries
    time_limit=300,            # 5-minute hard kill
    soft_time_limit=240,       # 4-minute soft warning
    acks_late=True,            # Acknowledge only after success (safe against worker crash)
    reject_on_worker_lost=True,
)
def purge_deleted_forms_task(self, grace_hours: int = 24):
    """
    Hard-delete all soft-deleted forms older than `grace_hours` (default 24).

    Enterprise behaviour:
    - Per-form DELETE with deleted_at IS NOT NULL safety guard
    - DB cascade cleans all child tables automatically
    - Stamps hard_purged_at on form_deletions audit record
    - Returns a structured report (visible in Celery task result backend)

    Args:
        grace_hours: Minimum age in hours before a soft-deleted form is hard-deleted.
                     Default 24 gives users a 1-day recovery window.
    """
    logger.info(f"🧹 [forms_maintenance] Starting purge_deleted_forms_task (grace={grace_hours}h)")

    try:
        from services.form_service import purge_deleted_forms
        report = purge_deleted_forms(older_than_hours=grace_hours)

        logger.info(
            f"🧹 [forms_maintenance] Purge complete: "
            f"{report['purged']} hard-deleted, "
            f"{report.get('error_count', 0)} errors"
        )
        return report

    except Exception as exc:
        logger.error(f"🔴 [forms_maintenance] purge_deleted_forms_task failed: {exc}")
        # Retry with exponential backoff (Celery built-in: 5m, 10m, 20m)
        raise self.retry(exc=exc)
