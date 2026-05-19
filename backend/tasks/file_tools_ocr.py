"""Celery tasks for File Tools OCR extraction."""

from __future__ import annotations

from celery.exceptions import SoftTimeLimitExceeded

from celery_app import celery_app
from domains.file_tools.application.ocr_service import OcrService
from domains.file_tools.infrastructure.repositories import FileToolsRepository
from domains.file_tools.infrastructure.storage.factory import create_artifact_storage


def _service() -> OcrService:
    return OcrService(FileToolsRepository(), create_artifact_storage())


@celery_app.task(
    name="file_tools.ocr.extract",
    bind=True,
    queue="ocr",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=3,
    soft_time_limit=180,
    time_limit=240,
)
def extract_ocr_job(self, job_id: str):
    repository = FileToolsRepository()
    try:
        return OcrService(repository, create_artifact_storage()).extract(job_id)
    except SoftTimeLimitExceeded:
        repository.update_job(job_id, status="failed", error_code="OCR_TIMEOUT", error_message="OCR extraction timed out.")
        raise
    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=min(300, 30 * (2 ** self.request.retries)))
        repository.update_job(job_id, status="dead_letter", error_code="OCR_DEAD_LETTER", error_message="OCR extraction failed after retries.")
        raise

