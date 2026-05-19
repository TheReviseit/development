"""Upload-session service for the Video Converter for WhatsApp tool."""

from __future__ import annotations

import hashlib
import os
from datetime import timedelta
from typing import Any

from ..contracts.common import RequestContext
from ..contracts.video_converter import TOOL_KEY, VideoUploadSessionRequest
from ..domain.errors import ConflictError, GoneError, NotFoundError, PermissionDeniedError, ValidationError
from ..domain.policies import VIDEO_CONVERSION_LIMITS
from ..infrastructure.observability import (
    hash_identifier,
    increment_video_counter,
    log_event,
    observe_video_histogram,
)
from ..infrastructure.repositories import FileToolsRepository, utc_now
from ..infrastructure.storage.base import ArtifactStorage
from ..validators.video_converter_validator import VideoConverterValidator, sanitize_video_filename
from .video_backpressure_service import VideoBackpressureService


class VideoUploadService:
    def __init__(
        self,
        repository: FileToolsRepository,
        storage: ArtifactStorage,
        validator: VideoConverterValidator,
        backpressure: VideoBackpressureService,
    ):
        self.repository = repository
        self.storage = storage
        self.validator = validator
        self.backpressure = backpressure

    def create_session(self, payload: dict[str, Any], context: RequestContext) -> dict[str, Any]:
        self.backpressure.assert_allowed(context.owner.token_subject, "upload_session")
        request = VideoUploadSessionRequest.parse_or_raise(payload)
        self.validator.validate_upload_session(request, context.owner)
        expires_at = utc_now() + timedelta(seconds=_env_int("FILE_TOOLS_VIDEO_UPLOAD_TTL_SECONDS", VIDEO_CONVERSION_LIMITS.upload_session_ttl_seconds))
        session = self.repository.create_upload_session(
            context.owner,
            {
                "tool_key": TOOL_KEY,
                "batch_id": request.batch_id,
                "filename": sanitize_video_filename(request.filename),
                "declared_mime_type": request.declared_mime_type,
                "total_size_bytes": request.total_size_bytes,
                "chunk_size_bytes": request.chunk_size_bytes,
                "total_chunks": request.total_chunks,
                "expected_sha256": request.sha256,
                "expires_at": expires_at.isoformat(),
            },
        )
        increment_video_counter("file_tools_video_upload_sessions_total", status="created")
        log_event(
            "video_upload_session_created",
            request_id=context.request_id,
            upload_session_id=session["id"],
            batch_id=session.get("batch_id"),
            user_id_hash=hash_identifier(context.owner.owner_id),
            total_size_bytes=session["total_size_bytes"],
            total_chunks=session["total_chunks"],
        )
        return {"success": True, "uploadSession": _session_payload(session)}

    def get_session(self, session_id: str, context: RequestContext) -> dict[str, Any]:
        session = self._owned_session(session_id, context)
        chunks = self.repository.list_upload_chunks(session_id)
        return {
            "success": True,
            "uploadSession": _session_payload(session),
            "chunks": [
                {
                    "chunkIndex": chunk["chunk_index"],
                    "sizeBytes": chunk["size_bytes"],
                    "sha256": chunk["chunk_sha256"],
                    "status": chunk["status"],
                }
                for chunk in chunks
            ],
        }

    def store_chunk(
        self,
        session_id: str,
        chunk_index: int,
        *,
        content: bytes,
        content_range: str | None,
        chunk_sha256: str | None,
        idempotency_key: str | None,
        context: RequestContext,
    ) -> dict[str, Any]:
        self.backpressure.assert_allowed(context.owner.token_subject, "chunk_upload")
        started = utc_now()
        session = self._owned_session(session_id, context)
        if _is_expired(session):
            self.repository.update_upload_session(session_id, {"status": "expired"})
            raise GoneError("UPLOAD_SESSION_EXPIRED", "This upload session has expired.")

        start, end, _total = self.validator.validate_chunk(
            session=session,
            chunk_index=chunk_index,
            content_range=content_range,
            chunk_sha256=chunk_sha256,
            idempotency_key=idempotency_key,
            body_size=len(content),
        )
        digest = hashlib.sha256(content).hexdigest()
        expected_digest = (chunk_sha256 or "").lower()
        if digest != expected_digest:
            raise ValidationError("CHUNK_HASH_MISMATCH", "Chunk hash does not match the uploaded bytes.")

        existing_by_key = self.repository.get_upload_chunk_by_idempotency(session_id, idempotency_key or "")
        if existing_by_key:
            return {"success": True, "uploadSession": _session_payload(session), "chunk": _chunk_payload(existing_by_key)}

        existing = self.repository.get_upload_chunk_by_index(session_id, chunk_index)
        if existing:
            if existing.get("chunk_sha256") == digest:
                return {"success": True, "uploadSession": _session_payload(session), "chunk": _chunk_payload(existing)}
            raise ConflictError("CHUNK_CONFLICT", "A different chunk already exists at this index.")

        key = (
            f"file-tools/{context.owner.storage_partition}/{TOOL_KEY}/uploads/"
            f"{session_id}/chunks/{chunk_index:08d}.part"
        )
        storage_started = utc_now()
        stored = self.storage.put_bytes(
            key,
            content,
            "application/octet-stream",
            metadata={
                "tool_key": TOOL_KEY,
                "upload_session_id": session_id,
                "chunk_index": str(chunk_index),
                "sha256": digest,
            },
        )
        observe_video_histogram(
            "file_tools_video_upload_chunk_duration_seconds",
            max(0.0, (utc_now() - storage_started).total_seconds()),
            status="stored",
        )
        chunk = self.repository.create_upload_chunk(
            {
                "upload_session_id": session_id,
                "chunk_index": chunk_index,
                "byte_start": start,
                "byte_end": end,
                "chunk_sha256": digest,
                "size_bytes": stored.size_bytes,
                "storage_provider": stored.provider,
                "storage_key": stored.key,
                "idempotency_key": idempotency_key,
            }
        )
        received = int(session.get("received_bytes") or 0) + stored.size_bytes
        self.repository.update_upload_session(session_id, {"received_bytes": min(received, int(session["total_size_bytes"]))})
        increment_video_counter("file_tools_video_upload_chunks_total", status="stored")
        log_event(
            "video_chunk_stored",
            request_id=context.request_id,
            upload_session_id=session_id,
            chunk_index=chunk_index,
            duration_ms=int((utc_now() - started).total_seconds() * 1000),
        )
        updated = self.repository.get_upload_session(session_id) or session
        return {"success": True, "uploadSession": _session_payload(updated), "chunk": _chunk_payload(chunk)}

    def complete_session(self, session_id: str, context: RequestContext, queue) -> dict[str, Any]:
        session = self._owned_session(session_id, context)
        if _is_expired(session):
            self.repository.update_upload_session(session_id, {"status": "expired"})
            raise GoneError("UPLOAD_SESSION_EXPIRED", "This upload session has expired.")
        chunks = self.repository.list_upload_chunks(session_id)
        if len(chunks) != int(session["total_chunks"]):
            raise ValidationError("UPLOAD_INCOMPLETE", "Upload is missing one or more chunks.")
        chunk_indexes = {int(chunk["chunk_index"]) for chunk in chunks}
        expected = set(range(int(session["total_chunks"])))
        if chunk_indexes != expected:
            raise ValidationError("UPLOAD_INCOMPLETE", "Upload chunks are not contiguous.")

        self.backpressure.assert_queue_open("video_ingest")
        self.repository.update_upload_session(session_id, {"status": "assembly_queued", "completed_at": utc_now().isoformat()})
        try:
            task = queue.enqueue_assembly(session_id)
        except Exception:
            self.repository.update_upload_session(session_id, {"status": "receiving", "completed_at": None})
            raise
        increment_video_counter("file_tools_video_assembly_jobs_total", status="queued")
        return {
            "success": True,
            "uploadSession": _session_payload(self.repository.get_upload_session(session_id) or session),
            "taskId": task.task_id,
        }

    def _owned_session(self, session_id: str, context: RequestContext) -> dict[str, Any]:
        session = self.repository.get_upload_session(session_id)
        if not session:
            raise NotFoundError("Upload session not found.")
        if context.owner.is_authenticated:
            allowed = session.get("user_id") == context.owner.owner_id
        else:
            allowed = session.get("guest_id_hash") == context.owner.owner_id
        if not allowed:
            raise PermissionDeniedError("You do not have access to this upload session.")
        return session


def _session_payload(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": session["id"],
        "batchId": session.get("batch_id"),
        "filename": session["filename"],
        "declaredMimeType": session.get("declared_mime_type"),
        "totalSizeBytes": int(session["total_size_bytes"]),
        "chunkSizeBytes": int(session["chunk_size_bytes"]),
        "totalChunks": int(session["total_chunks"]),
        "receivedBytes": int(session.get("received_bytes") or 0),
        "status": session["status"],
        "expiresAt": session.get("expires_at"),
        "sourceReady": bool(session.get("source_storage_key")),
    }


def _chunk_payload(chunk: dict[str, Any]) -> dict[str, Any]:
    return {
        "chunkIndex": int(chunk["chunk_index"]),
        "byteStart": int(chunk["byte_start"]),
        "byteEnd": int(chunk["byte_end"]),
        "sha256": chunk["chunk_sha256"],
        "sizeBytes": int(chunk["size_bytes"]),
        "status": chunk["status"],
    }


def _is_expired(session: dict[str, Any]) -> bool:
    expires_at = str(session.get("expires_at") or "")
    if not expires_at:
        return False
    try:
        from datetime import datetime

        return datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < utc_now()
    except Exception:
        return False


def _env_int(key: str, fallback: int) -> int:
    value = os.getenv(key)
    if not value:
        return fallback
    try:
        parsed = int(value)
    except ValueError:
        return fallback
    return parsed if parsed > 0 else fallback
