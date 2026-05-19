"""Celery tasks for File Tools video ingestion and conversion."""

from __future__ import annotations

from celery.exceptions import SoftTimeLimitExceeded

from celery_app import celery_app
from domains.file_tools.application.video_assembly_service import VideoAssemblyService
from domains.file_tools.application.video_conversion_service import VideoConversionService
from domains.file_tools.infrastructure.repositories import FileToolsRepository
from domains.file_tools.infrastructure.storage.factory import create_artifact_storage


def _services():
    repository = FileToolsRepository()
    storage = create_artifact_storage()
    return repository, storage


@celery_app.task(
    name="file_tools.video.assemble_upload",
    bind=True,
    queue="video_ingest",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=3,
    soft_time_limit=1800,
    time_limit=2100,
)
def assemble_video_upload(self, upload_session_id: str):
    repository, storage = _services()
    try:
        return VideoAssemblyService(repository, storage).assemble(upload_session_id)
    except SoftTimeLimitExceeded:
        repository.update_upload_session(upload_session_id, {"status": "failed"})
        raise
    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=min(300, 30 * (2 ** self.request.retries)))
        repository.update_upload_session(upload_session_id, {"status": "failed"})
        raise


@celery_app.task(
    name="file_tools.video.convert",
    bind=True,
    queue="video",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=3,
    soft_time_limit=5400,
    time_limit=5700,
)
def convert_video_job(self, job_id: str):
    repository, storage = _services()
    try:
        return VideoConversionService(repository, storage).convert(job_id)
    except SoftTimeLimitExceeded:
        repository.update_job(job_id, status="failed", error_code="VIDEO_CONVERSION_TIMEOUT", error_message="Video conversion timed out.")
        raise
    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=min(600, 60 * (2 ** self.request.retries)))
        repository.update_job(job_id, status="dead_letter", error_code="VIDEO_DEAD_LETTER", error_message="Video conversion failed after retries.")
        raise
