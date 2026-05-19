"""Worker-side assembly for resumable video uploads."""

from __future__ import annotations

import hashlib
import shutil
import tempfile
from pathlib import Path

from ..contracts.video_converter import TOOL_KEY
from ..domain.errors import NotFoundError, ValidationError
from ..infrastructure.observability import (
    increment_video_counter,
    log_event,
    log_failure,
    observe_video_histogram,
    video_histogram_timer,
)
from ..infrastructure.repositories import FileToolsRepository
from ..infrastructure.security.video_scan import VideoScanService
from ..infrastructure.storage.base import ArtifactStorage
from ..validators.video_converter_validator import normalized_extension


class VideoAssemblyService:
    def __init__(
        self,
        repository: FileToolsRepository,
        storage: ArtifactStorage,
        scanner: VideoScanService | None = None,
    ):
        self.repository = repository
        self.storage = storage
        self.scanner = scanner or VideoScanService()

    def assemble(self, upload_session_id: str) -> dict[str, object]:
        session = self.repository.get_upload_session(upload_session_id)
        if not session:
            raise NotFoundError("Upload session not found.")
        chunks = self.repository.list_upload_chunks(upload_session_id)
        if len(chunks) != int(session["total_chunks"]):
            self.repository.update_upload_session(upload_session_id, {"status": "failed"})
            raise ValidationError("UPLOAD_INCOMPLETE", "Upload is missing one or more chunks.")

        temp_root = Path(tempfile.mkdtemp(prefix=f"flowauxi-video-assembly-{upload_session_id}-"))
        assembled_path = temp_root / session["filename"]
        try:
            self.repository.update_upload_session(upload_session_id, {"status": "assembling"})
            with video_histogram_timer("file_tools_video_assembly_duration_seconds", status="attempt"):
                digest = hashlib.sha256()
                total = 0
                with assembled_path.open("wb") as output:
                    for expected_index, chunk in enumerate(sorted(chunks, key=lambda item: int(item["chunk_index"]))):
                        if int(chunk["chunk_index"]) != expected_index:
                            raise ValidationError("UPLOAD_INCOMPLETE", "Upload chunks are not contiguous.")
                        chunk_path = temp_root / f"{expected_index:08d}.part"
                        self.storage.download_to_path(chunk["storage_key"], chunk_path)
                        body = chunk_path.read_bytes()
                        chunk_digest = hashlib.sha256(body).hexdigest()
                        if chunk_digest != chunk["chunk_sha256"]:
                            raise ValidationError("CHUNK_HASH_MISMATCH", "Stored chunk hash does not match its manifest.")
                        output.write(body)
                        digest.update(body)
                        total += len(body)

                expected_size = int(session["total_size_bytes"])
                source_sha = digest.hexdigest()
                if total != expected_size:
                    raise ValidationError("UPLOAD_SIZE_MISMATCH", "Assembled video size does not match its manifest.")
                expected_sha = session.get("expected_sha256")
                if expected_sha and expected_sha != source_sha:
                    raise ValidationError("VIDEO_HASH_MISMATCH", "Assembled video hash does not match its manifest.")

                self.scanner.scan_or_raise(assembled_path)
                extension = normalized_extension(session["filename"]) or ".mp4"
                source_key = (
                    f"file-tools/{_owner_partition(session)}/{TOOL_KEY}/sources/"
                    f"{upload_session_id}/source{extension}"
                )
                stored = self.storage.put_file(
                    source_key,
                    assembled_path,
                    session.get("declared_mime_type") or "application/octet-stream",
                    metadata={
                        "tool_key": TOOL_KEY,
                        "upload_session_id": upload_session_id,
                        "sha256": source_sha,
                        "kind": "source",
                    },
                )
                self.repository.update_upload_session(
                    upload_session_id,
                    {
                        "status": "assembled",
                        "source_sha256": source_sha,
                        "source_storage_provider": stored.provider,
                        "source_storage_key": stored.key,
                        "received_bytes": total,
                    },
                )

            for chunk in chunks:
                try:
                    self.storage.delete(chunk["storage_key"])
                except Exception:
                    pass
            observe_video_histogram("file_tools_video_assembly_bytes", float(total), status="assembled")
            increment_video_counter("file_tools_video_assembly_jobs_total", status="succeeded")
            log_event("video_upload_assembled", upload_session_id=upload_session_id, size_bytes=total)
            return {"uploadSessionId": upload_session_id, "sizeBytes": total, "sha256": source_sha}
        except Exception as exc:
            self.repository.update_upload_session(upload_session_id, {"status": "failed"})
            increment_video_counter("file_tools_video_assembly_jobs_total", status="failed")
            log_failure(
                "video_upload_assembly_failed",
                upload_session_id=upload_session_id,
                error_type=exc.__class__.__name__,
                message=str(exc),
            )
            raise
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)


def _owner_partition(session: dict[str, object]) -> str:
    if session.get("user_id"):
        return f"users/{str(session['user_id']).replace('/', '_')}"
    return f"guests/{str(session.get('guest_id_hash') or 'unknown').replace('/', '_')}"
