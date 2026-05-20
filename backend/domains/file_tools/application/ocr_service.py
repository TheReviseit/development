"""Image OCR application service."""

from __future__ import annotations

import hashlib
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from ..contracts.common import RequestContext
from ..contracts.ocr import TOOL_KEY, OcrUploadRequest
from ..converters.ocr.preprocessor import OcrPreprocessor
from ..converters.ocr.tesseract_service import TesseractService
from ..domain.entities import FileToolArtifact, FileToolJob
from ..domain.enums import FileToolStatus
from ..domain.errors import ConflictError, ConversionError, FileToolError, NotFoundError, PermissionDeniedError
from ..domain.events import FILE_TOOL_FAILED, FILE_TOOL_JOB_CREATED
from ..domain.policies import OCR_LIMITS
from ..infrastructure.observability import hash_identifier, log_event, log_failure
from ..infrastructure.repositories import FileToolsRepository, utc_now
from ..infrastructure.storage.base import ArtifactStorage
from ..validators.ocr_validator import OcrValidator, sanitize_ocr_filename


class OcrService:
    def __init__(
        self,
        repository: FileToolsRepository,
        storage: ArtifactStorage,
        validator: OcrValidator | None = None,
        queue=None,
        preprocessor: OcrPreprocessor | None = None,
        engine: TesseractService | None = None,
    ):
        self.repository = repository
        self.storage = storage
        self.validator = validator or OcrValidator()
        self.queue = queue
        self.preprocessor = preprocessor or OcrPreprocessor()
        self.engine = engine or TesseractService()

    def upload(self, files, form, context: RequestContext) -> dict[str, Any]:
        started = time.perf_counter()
        request = OcrUploadRequest.parse_or_raise(files, form)
        inspection = self.validator.validate_upload(request, context.owner)

        cached = self.repository.find_job_by_idempotency(context.owner, TOOL_KEY, request.idempotency_key)
        if cached:
            return {"job": self._job_payload(cached), "idempotentReplay": True}

        job = self.repository.create_async_job(
            context.owner,
            TOOL_KEY,
            {
                **request.normalized_payload,
                "inspection": inspection,
            },
            request.idempotency_key,
            max_retries=3,
        )
        self.repository.record_event(context.owner, FILE_TOOL_JOB_CREATED, TOOL_KEY, {"job_id": job.id})
        try:
            artifact = self._store_source(job, request)
            self.repository.update_job(
                job.id,
                extra={
                    "request_json": {
                        **job.request_payload,
                        "sourceArtifactId": artifact.id,
                        "sourceStorageKey": artifact.storage_key,
                        "sourceStorageProvider": artifact.storage_provider,
                        "sourceSha256": artifact.sha256,
                    }
                },
            )
            if self.queue is None:
                raise ConversionError("OCR workers are not configured.", "OCR_QUEUE_UNAVAILABLE")
            task = self.queue.enqueue_extraction(job.id)
            log_event(
                "ocr_job_queued",
                request_id=context.request_id,
                job_id=job.id,
                user_id_hash=hash_identifier(context.owner.owner_id),
                task_id=task.task_id,
                input_format=inspection.get("format"),
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
            refreshed = self.repository.get_job(job.id) or job
            return {"job": self._job_payload(refreshed), "taskId": task.task_id}
        except FileToolError as exc:
            self.repository.mark_job_failed(job.id, exc.code, exc.message, int((time.perf_counter() - started) * 1000))
            self.repository.record_event(context.owner, FILE_TOOL_FAILED, TOOL_KEY, {"job_id": job.id, "code": exc.code, "message": exc.message})
            raise

    def extract(self, job_id: str) -> dict[str, Any]:
        job = self.repository.get_job(job_id)
        if not job:
            raise ConversionError("OCR job was not found.", "OCR_JOB_NOT_FOUND")
        if job.status in {FileToolStatus.SUCCEEDED, FileToolStatus.CANCELLED, FileToolStatus.EXPIRED}:
            return {"jobId": job.id, "status": job.status.value}

        started = time.perf_counter()
        stage = "starting"
        temp_root = Path(tempfile.mkdtemp(prefix=f"flowauxi-ocr-job-{job_id}-"))
        try:
            self.repository.update_job(job_id, status=FileToolStatus.RUNNING)
            source_key = job.request_payload.get("sourceStorageKey")
            if not source_key:
                raise ConversionError("OCR source image is missing.", "OCR_SOURCE_MISSING")
            content = self.storage.get_bytes(source_key)

            stage = "preprocessing"
            prepared = self.preprocessor.preprocess(content, temp_root)

            stage = "extracting"
            if not self.engine.is_available():
                raise ConversionError("Tesseract is not installed or not configured.", "OCR_ENGINE_UNAVAILABLE")
            result = self.engine.extract(prepared.path)

            stage = "storing_result"
            self.repository.upsert_ocr_result(
                job_id,
                {
                    "source_artifact_id": job.request_payload.get("sourceArtifactId"),
                    "text": result.text,
                    "blocks_json": result.blocks,
                    "confidence_json": result.confidence,
                    "language_json": result.language,
                    "engine_version": result.engine_version,
                    "preprocessing_json": prepared.metadata,
                },
            )
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_succeeded(job_id, 1, duration_ms)
            log_event(
                "ocr_completed",
                job_id=job_id,
                user_id_hash=hash_identifier(job.owner.owner_id),
                duration_ms=duration_ms,
                text_length=len(result.text),
                language=result.language.get("requested"),
            )
            return {"jobId": job_id, "status": "completed", "textLength": len(result.text)}
        except FileToolError as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job_id, exc.code, exc.message, duration_ms)
            self.repository.record_event(job.owner, FILE_TOOL_FAILED, TOOL_KEY, {"job_id": job.id, "code": exc.code, "stage": stage})
            log_failure("ocr_failed", job_id=job_id, code=exc.code, stage=stage, message=exc.message)
            raise
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job_id, "OCR_FAILED", "OCR extraction failed.", duration_ms)
            log_failure("ocr_failed", job_id=job_id, stage=stage, internal_error_type=exc.__class__.__name__, message=str(exc))
            raise ConversionError("OCR extraction failed.", "OCR_FAILED") from exc
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)

    def get_job(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self._owned_job(job_id, context)
        return self._job_payload(job)

    def get_text(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self._owned_job(job_id, context)
        result = self.repository.get_ocr_result(job.id)
        return {"id": job.id, "status": _ocr_status(job), "text": result.get("text", "") if result else ""}

    def get_json(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self._owned_job(job_id, context)
        result = self.repository.get_ocr_result(job.id) or {}
        return {
            **self._job_payload(job),
            "text": result.get("text", ""),
            "blocks": result.get("blocks_json") or [],
        }

    def retry(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self._owned_job(job_id, context)
        if job.status not in {FileToolStatus.FAILED, FileToolStatus.DEAD_LETTER, FileToolStatus.CANCELLED}:
            raise ConflictError("OCR_JOB_NOT_RETRYABLE", "Only failed or cancelled OCR jobs can be retried.")
        self.repository.update_job(job.id, status=FileToolStatus.QUEUED, error_code="", error_message="")
        if self.queue is None:
            raise ConversionError("OCR workers are not configured.", "OCR_QUEUE_UNAVAILABLE")
        self.queue.enqueue_extraction(job.id)
        refreshed = self.repository.get_job(job.id) or job
        return {"job": self._job_payload(refreshed)}

    def delete(self, job_id: str, context: RequestContext) -> dict[str, Any]:
        job = self._owned_job(job_id, context)
        source_key = job.request_payload.get("sourceStorageKey")
        if source_key:
            try:
                self.storage.delete(source_key)
            except Exception:
                pass
        self.repository.delete_ocr_result(job.id)
        self.repository.update_job(job.id, status=FileToolStatus.EXPIRED)
        return {**self._job_payload(job), "status": "deleted"}

    def health(self) -> dict[str, Any]:
        tesseract = self.engine.health()
        queue_health = self.queue.health() if hasattr(self.queue, "health") else {
            "available": False,
            "mode": "unconfigured",
            "queue": "ocr",
        }
        inline_mode = queue_health.get("mode") == "inline"
        return {
            "available": bool(tesseract.get("available")) if inline_mode else bool(queue_health.get("available")),
            "engine": "tesseract",
            "tesseract": tesseract,
            "queue": queue_health,
            "limits": {
                "guestMaxInputBytes": OCR_LIMITS.guest_max_input_bytes,
                "authenticatedMaxInputBytes": OCR_LIMITS.authenticated_max_input_bytes,
                "guestMaxMegapixels": OCR_LIMITS.guest_max_megapixels,
                "authenticatedMaxMegapixels": OCR_LIMITS.authenticated_max_megapixels,
            },
        }

    def _store_source(self, job: FileToolJob, request: OcrUploadRequest) -> FileToolArtifact:
        artifact_id = str(uuid.uuid4())
        filename = sanitize_ocr_filename(request.filename)
        digest = hashlib.sha256(request.file_bytes).hexdigest()
        extension = Path(filename).suffix.lower() or ".png"
        storage_key = f"file-tools/{job.owner.storage_partition}/{TOOL_KEY}/{job.id}/source-{artifact_id}{extension}"
        stored = self.storage.put_bytes(
            storage_key,
            request.file_bytes,
            request.declared_mime_type or "application/octet-stream",
            metadata={"tool_key": TOOL_KEY, "job_id": job.id, "artifact_id": artifact_id, "sha256": digest, "kind": "source"},
        )
        expires_at = utc_now() + (OCR_LIMITS.authenticated_retention if job.owner.is_authenticated else OCR_LIMITS.guest_retention)
        return self.repository.create_artifact(
            job,
            artifact_id,
            filename,
            request.declared_mime_type or "application/octet-stream",
            stored.size_bytes,
            digest,
            stored.provider,
            stored.key,
            expires_at,
            1,
        )

    def _owned_job(self, job_id: str, context: RequestContext) -> FileToolJob:
        job = self.repository.get_job(job_id)
        if not job or job.tool_key != TOOL_KEY:
            raise NotFoundError("OCR job not found.")
        if job.owner.owner_type != context.owner.owner_type or job.owner.owner_id != context.owner.owner_id:
            raise PermissionDeniedError("You do not have access to this OCR job.")
        return job

    def _job_payload(self, job: FileToolJob) -> dict[str, Any]:
        result = self.repository.get_ocr_result(job.id)
        confidence = result.get("confidence_json") if result else None
        return {
            "id": job.id,
            "status": _ocr_status(job),
            "fileName": job.request_payload.get("filename") or "image",
            "mimeType": job.request_payload.get("declaredMimeType") or "application/octet-stream",
            "pageCount": 1,
            "processedPageCount": 1 if job.status in {FileToolStatus.SUCCEEDED, FileToolStatus.FAILED} else 0,
            "confidence": confidence,
            "failure": _failure_payload(job),
        }


def _ocr_status(job: FileToolJob) -> str:
    if job.status == FileToolStatus.QUEUED:
        return "queued"
    if job.status == FileToolStatus.RUNNING:
        return "extracting"
    if job.status == FileToolStatus.SUCCEEDED:
        return "completed"
    if job.status == FileToolStatus.FAILED:
        return "failed"
    if job.status == FileToolStatus.EXPIRED:
        return "expired"
    if job.status == FileToolStatus.CANCELLED:
        return "deleted"
    return job.status.value


def _failure_payload(job: FileToolJob) -> dict[str, Any] | None:
    if job.status != FileToolStatus.FAILED:
        return None
    code = job.error_code or "OCR_FAILED"
    return {
        "code": code,
        "message": job.error_message or "OCR extraction failed.",
        "retryable": code not in {"OCR_UNSUPPORTED_INPUT", "OCR_MIME_MISMATCH", "OCR_FILE_TOO_LARGE", "OCR_IMAGE_TOO_LARGE"},
    }
