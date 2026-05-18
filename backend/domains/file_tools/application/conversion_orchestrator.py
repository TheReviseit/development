"""Application orchestration for file conversion workflows."""

from __future__ import annotations

import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

from ..contracts.common import ArtifactResponse, GenerateResponse, JobResponse, RequestContext
from ..contracts.image_converter import ImageConvertRequest
from ..contracts.text_to_pdf import TextPdfGenerateRequest
from ..domain.entities import FileToolArtifact
from ..domain.errors import ConversionError, FileToolError, ValidationError
from ..domain.events import FILE_TOOL_FAILED, FILE_TOOL_JOB_CREATED, IMAGE_CONVERTED, TEXT_PDF_GENERATED
from ..domain.policies import IMAGE_CONVERSION_LIMITS, SAFE_FILENAME_FALLBACK, TEXT_TO_PDF_LIMITS
from ..infrastructure.observability import hash_identifier, log_event, log_failure
from ..infrastructure.repositories import FileToolsRepository, utc_now
from ..infrastructure.security.content_hash import sha256_hex
from ..infrastructure.security.signed_downloads import create_download_token
from ..infrastructure.storage.base import ArtifactStorage
from .rate_limit_service import InMemoryRateLimitService
from .tool_registry import ToolRegistry


class ConversionOrchestrator:
    def __init__(
        self,
        registry: ToolRegistry,
        repository: FileToolsRepository,
        storage: ArtifactStorage,
        rate_limits: InMemoryRateLimitService,
    ):
        self.registry = registry
        self.repository = repository
        self.storage = storage
        self.rate_limits = rate_limits

    def generate_text_to_pdf(self, payload: dict, context: RequestContext) -> GenerateResponse:
        started = time.perf_counter()
        request = TextPdfGenerateRequest.parse_or_raise(payload)
        tool = self.registry.get("text_to_pdf")
        stage = "preflight"

        request.assert_has_renderable_content()
        self.rate_limits.assert_generate_allowed(context.owner, context.ip_address)
        tool.validator.validate(request, authenticated=context.owner.is_authenticated)

        cached = self.repository.find_succeeded_by_idempotency(
            context.owner,
            "text_to_pdf",
            request.idempotencyKey,
        )
        if cached:
            job, artifact = cached
            return self._generate_response(job.id, artifact, context.owner.token_subject)

        job = self.repository.create_job(
            context.owner,
            "text_to_pdf",
            request.model_dump(mode="json"),
            request.idempotencyKey,
        )
        self.repository.record_event(context.owner, FILE_TOOL_JOB_CREATED, "text_to_pdf", {"job_id": job.id})

        try:
            stage = "convert"
            result = tool.converter.convert(request)
            stage = "validate_output_limits"
            if result.page_count > TEXT_TO_PDF_LIMITS.max_pages:
                raise ValidationError(
                    "PAGE_LIMIT_EXCEEDED",
                    f"Generated PDF exceeds {TEXT_TO_PDF_LIMITS.max_pages} pages.",
                )
            if len(result.bytes) > TEXT_TO_PDF_LIMITS.max_pdf_size_bytes:
                raise ValidationError("PDF_SIZE_EXCEEDED", "Generated PDF is too large.")

            artifact_id = str(uuid.uuid4())
            filename = self._filename(request.document.title)
            storage_key = (
                f"file-tools/{context.owner.storage_partition}/text_to_pdf/"
                f"{job.id}/{artifact_id}.pdf"
            )
            digest = sha256_hex(result.bytes)
            stage = "storage_put"
            stored = self.storage.put_bytes(
                storage_key,
                result.bytes,
                result.mime_type,
                metadata={
                    "tool_key": "text_to_pdf",
                    "job_id": job.id,
                    "artifact_id": artifact_id,
                    "sha256": digest,
                },
            )

            stage = "artifact_create"
            expires_at = utc_now() + (
                TEXT_TO_PDF_LIMITS.authenticated_retention
                if context.owner.is_authenticated
                else TEXT_TO_PDF_LIMITS.guest_retention
            )
            artifact = self.repository.create_artifact(
                job=job,
                artifact_id=artifact_id,
                filename=filename,
                mime_type=result.mime_type,
                size_bytes=stored.size_bytes,
                sha256=digest,
                storage_provider=stored.provider,
                storage_key=stored.key,
                expires_at=expires_at,
                page_count=result.page_count,
            )
            duration_ms = int((time.perf_counter() - started) * 1000)
            stage = "job_succeeded"
            self.repository.mark_job_succeeded(job.id, result.page_count, duration_ms)
            self.repository.record_event(
                context.owner,
                TEXT_PDF_GENERATED,
                "text_to_pdf",
                {
                    "job_id": job.id,
                    "artifact_id": artifact.id,
                    "duration_ms": duration_ms,
                    "page_count": result.page_count,
                    "size_bytes": artifact.size_bytes,
                },
            )
            log_event(
                "text_pdf_generated",
                request_id=context.request_id,
                job_id=job.id,
                tool_key="text_to_pdf",
                user_id_hash=hash_identifier(context.owner.owner_id),
                duration_ms=duration_ms,
                page_count=result.page_count,
                pdf_size=artifact.size_bytes,
            )
            return self._generate_response(job.id, artifact, context.owner.token_subject)
        except FileToolError as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job.id, exc.code, exc.message, duration_ms)
            internal_cause = getattr(exc, "__cause__", None)
            internal_message = getattr(internal_cause, "message", None) or (
                str(internal_cause) if internal_cause else None
            )
            self.repository.record_event(
                context.owner,
                FILE_TOOL_FAILED,
                "text_to_pdf",
                {"job_id": job.id, "code": exc.code, "message": exc.message},
            )
            log_failure(
                "file_tool_failed",
                request_id=context.request_id,
                job_id=job.id,
                code=exc.code,
                stage=stage,
                message=exc.message,
                internal_error_type=internal_cause.__class__.__name__ if internal_cause else None,
                internal_message=internal_message if internal_message != exc.message else None,
            )
            raise
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job.id, "CONVERSION_FAILED", str(exc), duration_ms)
            self.repository.record_event(
                context.owner,
                FILE_TOOL_FAILED,
                "text_to_pdf",
                {
                    "job_id": job.id,
                    "code": "CONVERSION_FAILED",
                    "message": "PDF generation failed.",
                    "stage": stage,
                },
            )
            log_failure(
                "file_tool_failed",
                request_id=context.request_id,
                job_id=job.id,
                code="CONVERSION_FAILED",
                stage=stage,
                message="PDF generation failed.",
                internal_error_type=exc.__class__.__name__,
                internal_message=str(exc),
            )
            raise ConversionError() from exc

    def generate_image_conversion(self, request: ImageConvertRequest, context: RequestContext) -> GenerateResponse:
        started = time.perf_counter()
        tool = self.registry.get("image_converter")
        stage = "preflight"

        self.rate_limits.assert_generate_allowed(context.owner, context.ip_address)
        tool.validator.validate(request, authenticated=context.owner.is_authenticated)

        cached = self.repository.find_succeeded_by_idempotency(
            context.owner,
            "image_converter",
            request.idempotencyKey,
        )
        if cached:
            job, artifact = cached
            return self._generate_response(job.id, artifact, context.owner.token_subject)

        job = self.repository.create_job(
            context.owner,
            "image_converter",
            request.normalized_payload,
            request.idempotencyKey,
        )
        self.repository.record_event(context.owner, FILE_TOOL_JOB_CREATED, "image_converter", {"job_id": job.id})

        try:
            stage = "convert"
            result = self._convert_with_timeout(tool.converter, request)
            stage = "validate_output_limits"
            if len(result.bytes) > IMAGE_CONVERSION_LIMITS.max_output_bytes:
                raise ValidationError("IMAGE_OUTPUT_TOO_LARGE", "Converted image is too large.")

            artifact_id = str(uuid.uuid4())
            filename = self._image_filename(request.filename, result.extension)
            storage_key = (
                f"file-tools/{context.owner.storage_partition}/image_converter/"
                f"{job.id}/{artifact_id}.{result.extension}"
            )
            digest = sha256_hex(result.bytes)
            stage = "storage_put"
            stored = self.storage.put_bytes(
                storage_key,
                result.bytes,
                result.mime_type,
                metadata={
                    "tool_key": "image_converter",
                    "job_id": job.id,
                    "artifact_id": artifact_id,
                    "sha256": digest,
                    "output_format": request.output_format,
                },
            )

            stage = "artifact_create"
            expires_at = utc_now() + (
                IMAGE_CONVERSION_LIMITS.authenticated_retention
                if context.owner.is_authenticated
                else IMAGE_CONVERSION_LIMITS.guest_retention
            )
            artifact = self.repository.create_artifact(
                job=job,
                artifact_id=artifact_id,
                filename=filename,
                mime_type=result.mime_type,
                size_bytes=stored.size_bytes,
                sha256=digest,
                storage_provider=stored.provider,
                storage_key=stored.key,
                expires_at=expires_at,
                page_count=result.page_count,
            )
            duration_ms = int((time.perf_counter() - started) * 1000)
            stage = "job_succeeded"
            self.repository.mark_job_succeeded(job.id, result.page_count, duration_ms)
            self.repository.record_event(
                context.owner,
                IMAGE_CONVERTED,
                "image_converter",
                {
                    "job_id": job.id,
                    "artifact_id": artifact.id,
                    "duration_ms": duration_ms,
                    "size_bytes": artifact.size_bytes,
                    "output_format": request.output_format,
                },
            )
            log_event(
                "image_converted",
                request_id=context.request_id,
                job_id=job.id,
                tool_key="image_converter",
                user_id_hash=hash_identifier(context.owner.owner_id),
                duration_ms=duration_ms,
                output_format=request.output_format,
                image_size=artifact.size_bytes,
            )
            return self._generate_response(job.id, artifact, context.owner.token_subject)
        except FileToolError as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job.id, exc.code, exc.message, duration_ms)
            internal_cause = getattr(exc, "__cause__", None)
            internal_message = getattr(internal_cause, "message", None) or (
                str(internal_cause) if internal_cause else None
            )
            self.repository.record_event(
                context.owner,
                FILE_TOOL_FAILED,
                "image_converter",
                {"job_id": job.id, "code": exc.code, "message": exc.message, "stage": stage},
            )
            log_failure(
                "file_tool_failed",
                request_id=context.request_id,
                job_id=job.id,
                code=exc.code,
                stage=stage,
                message=exc.message,
                internal_error_type=internal_cause.__class__.__name__ if internal_cause else None,
                internal_message=internal_message if internal_message != exc.message else None,
            )
            raise
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job.id, "IMAGE_CONVERSION_FAILED", str(exc), duration_ms)
            self.repository.record_event(
                context.owner,
                FILE_TOOL_FAILED,
                "image_converter",
                {
                    "job_id": job.id,
                    "code": "IMAGE_CONVERSION_FAILED",
                    "message": "Image conversion failed.",
                    "stage": stage,
                },
            )
            log_failure(
                "file_tool_failed",
                request_id=context.request_id,
                job_id=job.id,
                code="IMAGE_CONVERSION_FAILED",
                stage=stage,
                message="Image conversion failed.",
                internal_error_type=exc.__class__.__name__,
                internal_message=str(exc),
            )
            raise ConversionError("Image conversion failed.", "IMAGE_CONVERSION_FAILED") from exc

    def _convert_with_timeout(self, converter, request: ImageConvertRequest):
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(converter.convert, request)
        try:
            result = future.result(timeout=IMAGE_CONVERSION_LIMITS.conversion_timeout_seconds)
            executor.shutdown(wait=True)
            return result
        except FutureTimeoutError as exc:
            future.cancel()
            executor.shutdown(wait=False, cancel_futures=True)
            raise ConversionError("Image conversion timed out.", "IMAGE_CONVERSION_TIMEOUT") from exc
        except Exception:
            executor.shutdown(wait=True)
            raise

    def _generate_response(self, job_id: str, artifact: FileToolArtifact, subject: str) -> GenerateResponse:
        token = create_download_token(artifact.id, subject)
        return GenerateResponse(
            job=JobResponse(id=job_id, status="succeeded", toolKey=artifact.tool_key),
            artifact=ArtifactResponse(
                id=artifact.id,
                filename=artifact.filename,
                sizeBytes=artifact.size_bytes,
                expiresAt=artifact.expires_at.isoformat(),
            ),
            downloadUrl=f"/api/file-tools/artifacts/{artifact.id}/download?token={token}",
        )

    def _filename(self, title: str | None) -> str:
        if not title:
            return SAFE_FILENAME_FALLBACK
        slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", title.strip()).strip("-._").lower()
        if not slug:
            return SAFE_FILENAME_FALLBACK
        return f"{slug[:80]}.pdf"

    def _image_filename(self, source_filename: str, extension: str) -> str:
        stem = re.sub(r"\.[^.]+$", "", source_filename.strip())
        slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-._").lower()
        if not slug:
            slug = "flowauxi-image"
        max_stem = max(1, IMAGE_CONVERSION_LIMITS.max_filename_length - len(extension) - 1)
        return f"{slug[:max_stem]}.{extension}"
