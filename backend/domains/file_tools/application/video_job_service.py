"""Job orchestration for WhatsApp-friendly video conversion."""

from __future__ import annotations

from typing import Any

from ..contracts.common import RequestContext
from ..contracts.video_converter import TOOL_KEY, VideoJobCreateRequest
from ..domain.entities import FileToolArtifact
from ..domain.enums import FileToolStatus
from ..domain.errors import ConflictError, FileToolError, NotFoundError, PermissionDeniedError, ValidationError
from ..domain.events import FILE_TOOL_JOB_CREATED
from ..infrastructure.observability import hash_identifier, increment_video_counter, log_event
from ..infrastructure.repositories import FileToolsRepository
from ..infrastructure.security.signed_downloads import create_download_token
from ..validators.video_converter_validator import VideoConverterValidator
from .video_backpressure_service import VideoBackpressureService


class VideoJobService:
    def __init__(
        self,
        repository: FileToolsRepository,
        validator: VideoConverterValidator,
        backpressure: VideoBackpressureService,
        queue,
    ):
        self.repository = repository
        self.validator = validator
        self.backpressure = backpressure
        self.queue = queue

    def create_job(self, payload: dict[str, Any], context: RequestContext) -> dict[str, Any]:
        self.backpressure.assert_allowed(context.owner.token_subject, "job_create")
        self.backpressure.assert_queue_open("video")
        request = VideoJobCreateRequest.parse_or_raise(payload)
        self.validator.validate_options(request.options)

        session = self.repository.get_upload_session(request.upload_session_id)
        if not session:
            raise NotFoundError("Upload session not found.")
        self._assert_session_owner(session, context)
        if session.get("status") != "assembled" or not session.get("source_storage_key"):
            raise ConflictError("VIDEO_SOURCE_NOT_READY", "Video upload is not assembled yet.")

        cached = self.repository.find_succeeded_by_idempotency(context.owner, TOOL_KEY, request.idempotency_key)
        if cached:
            job, artifact = cached
            return self._job_payload(job.id, job.status.value, artifact, context)

        job = self.repository.create_async_job(
            context.owner,
            TOOL_KEY,
            {
                "uploadSessionId": session["id"],
                "batchId": session.get("batch_id"),
                "filename": session["filename"],
                "declaredMimeType": session.get("declared_mime_type"),
                "sourceStorageProvider": session.get("source_storage_provider"),
                "sourceStorageKey": session["source_storage_key"],
                "sourceSha256": session.get("source_sha256"),
                "sourceSizeBytes": session["total_size_bytes"],
                "options": request.options.to_payload(),
            },
            request.idempotency_key,
            max_retries=3,
        )
        self.repository.record_event(context.owner, FILE_TOOL_JOB_CREATED, TOOL_KEY, {"job_id": job.id})
        self.repository.record_progress_event(job.id, stage="queued", percent=0, event_type="stage")
        try:
            task = self.queue.enqueue_conversion(job.id)
        except FileToolError as exc:
            self.repository.mark_job_failed(job.id, exc.code, exc.message)
            self.repository.record_progress_event(job.id, stage="queue_failed", event_type="failed", message=exc.message)
            raise
        increment_video_counter("file_tools_video_jobs_total", status="queued", preset=request.options.quality_preset)
        log_event(
            "video_job_queued",
            request_id=context.request_id,
            job_id=job.id,
            upload_session_id=session["id"],
            batch_id=session.get("batch_id"),
            user_id_hash=hash_identifier(context.owner.owner_id),
            preset=request.options.quality_preset,
            task_id=task.task_id,
        )
        return {"success": True, "job": _job_response(job), "taskId": task.task_id}

    def get_job(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self.repository.get_job(job_id)
        if not job:
            raise NotFoundError("Job not found.")
        if job.owner.owner_type != context.owner.owner_type or job.owner.owner_id != context.owner.owner_id:
            raise PermissionDeniedError("You do not have access to this job.")
        artifact = self.repository.get_artifact_for_job(job.id)
        return self._job_payload(job.id, job.status.value, artifact, context, error_code=job.error_code, error_message=job.error_message)

    def cancel_job(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self.repository.get_job(job_id)
        if not job:
            raise NotFoundError("Job not found.")
        if job.owner.owner_type != context.owner.owner_type or job.owner.owner_id != context.owner.owner_id:
            raise PermissionDeniedError("You do not have access to this job.")
        if job.status.value in {FileToolStatus.SUCCEEDED.value, FileToolStatus.FAILED.value, FileToolStatus.CANCELLED.value}:
            return {"success": True, "job": _job_response(job)}
        self.repository.request_job_cancellation(job.id)
        self.repository.record_progress_event(job.id, stage="cancelling", percent=None, event_type="stage")
        increment_video_counter("file_tools_video_cancellations_total", stage=job.status.value)
        return {"success": True, "job": {**_job_response(job), "cancelRequested": True}}

    def retry_job(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self.repository.get_job(job_id)
        if not job:
            raise NotFoundError("Job not found.")
        if job.owner.owner_type != context.owner.owner_type or job.owner.owner_id != context.owner.owner_id:
            raise PermissionDeniedError("You do not have access to this job.")
        if job.status.value not in {FileToolStatus.FAILED.value, FileToolStatus.DEAD_LETTER.value, FileToolStatus.CANCELLED.value}:
            raise ConflictError("VIDEO_JOB_NOT_RETRYABLE", "Only failed or cancelled jobs can be retried.")
        self.backpressure.assert_allowed(context.owner.token_subject, "retry")
        self.repository.update_job(job.id, status=FileToolStatus.QUEUED, error_code="", error_message="", extra={"request_json": {**job.request_payload, "cancelRequestedAt": None}})
        try:
            task = self.queue.enqueue_conversion(job.id)
        except FileToolError as exc:
            self.repository.mark_job_failed(job.id, exc.code, exc.message)
            self.repository.record_progress_event(job.id, stage="queue_failed", event_type="failed", message=exc.message)
            raise
        return {"success": True, "job": {**_job_response(job), "status": FileToolStatus.QUEUED.value}, "taskId": task.task_id}

    def _job_payload(
        self,
        job_id: str,
        status: str,
        artifact: FileToolArtifact | None,
        context: RequestContext,
        *,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "success": True,
            "job": {
                "id": job_id,
                "status": status,
                "toolKey": TOOL_KEY,
                "errorCode": error_code,
                "errorMessage": error_message,
            },
            "artifact": None,
            "downloadUrl": None,
        }
        if artifact:
            token = create_download_token(artifact.id, context.owner.token_subject)
            payload["artifact"] = {
                "id": artifact.id,
                "filename": artifact.filename,
                "sizeBytes": artifact.size_bytes,
                "expiresAt": artifact.expires_at.isoformat(),
            }
            payload["downloadUrl"] = f"/api/file-tools/artifacts/{artifact.id}/download?token={token}"
        return payload

    def _assert_session_owner(self, session: dict[str, Any], context: RequestContext) -> None:
        if context.owner.is_authenticated:
            allowed = session.get("user_id") == context.owner.owner_id
        else:
            allowed = session.get("guest_id_hash") == context.owner.owner_id
        if not allowed:
            raise PermissionDeniedError("You do not have access to this upload session.")


def _job_response(job) -> dict[str, Any]:
    return {"id": job.id, "status": job.status.value, "toolKey": TOOL_KEY}
