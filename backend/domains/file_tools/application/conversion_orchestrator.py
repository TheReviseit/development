"""Application orchestration for file conversion workflows."""

from __future__ import annotations

import re
import time
import uuid
from datetime import timedelta

from ..contracts.common import ArtifactResponse, GenerateResponse, JobResponse, RequestContext
from ..contracts.text_to_pdf import TextPdfGenerateRequest
from ..domain.entities import FileToolArtifact
from ..domain.errors import ConversionError, FileToolError, ValidationError
from ..domain.events import FILE_TOOL_FAILED, FILE_TOOL_JOB_CREATED, TEXT_PDF_GENERATED
from ..domain.policies import SAFE_FILENAME_FALLBACK, TEXT_TO_PDF_LIMITS
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

    def _generate_response(self, job_id: str, artifact: FileToolArtifact, subject: str) -> GenerateResponse:
        token = create_download_token(artifact.id, subject)
        return GenerateResponse(
            job=JobResponse(id=job_id, status="succeeded", toolKey="text_to_pdf"),
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
