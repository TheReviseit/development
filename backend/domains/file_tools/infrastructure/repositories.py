"""Repository layer for file tool jobs, artifacts, drafts, and events."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from ..domain.entities import FileToolArtifact, FileToolJob, FileToolOwner
from ..domain.enums import ExecutionMode, FileToolStatus, OwnerType


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return utc_now()
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class FileToolsRepository:
    """Supabase-backed repository with local in-memory fallback.

    The fallback keeps local development and unit tests usable before migrations
    are applied, while production uses the service-role Supabase client.
    """

    _memory_jobs: dict[str, dict[str, Any]] = {}
    _memory_artifacts: dict[str, dict[str, Any]] = {}
    _memory_drafts: dict[str, dict[str, Any]] = {}
    _memory_events: list[dict[str, Any]] = []
    _memory_upload_sessions: dict[str, dict[str, Any]] = {}
    _memory_upload_chunks: dict[str, dict[str, Any]] = {}
    _memory_progress_events: dict[str, list[dict[str, Any]]] = {}
    _memory_video_metadata: dict[str, dict[str, Any]] = {}
    _memory_video_outputs: dict[str, dict[str, Any]] = {}
    _memory_ocr_results: dict[str, dict[str, Any]] = {}

    def __init__(self, supabase_client: Any | None = None):
        self._supabase = supabase_client
        if self._supabase is None:
            try:
                from supabase_client import get_supabase_client

                self._supabase = get_supabase_client()
            except Exception:
                self._supabase = None

    def find_succeeded_by_idempotency(
        self,
        owner: FileToolOwner,
        tool_key: str,
        idempotency_key: str | None,
    ) -> tuple[FileToolJob, FileToolArtifact] | None:
        if not idempotency_key:
            return None

        if self._supabase is not None:
            try:
                query = (
                    self._supabase.table("file_tool_jobs")
                    .select("*")
                    .eq("tool_key", tool_key)
                    .eq("idempotency_key", idempotency_key)
                    .eq("status", FileToolStatus.SUCCEEDED.value)
                    .limit(1)
                )
                query = self._match_owner(query, owner)
                result = query.execute()
                if result.data:
                    job = self._row_to_job(result.data[0])
                    artifact = self.get_artifact_for_job(job.id)
                    if artifact:
                        return job, artifact
            except Exception:
                pass

        for row in self._memory_jobs.values():
            if (
                row.get("tool_key") == tool_key
                and row.get("idempotency_key") == idempotency_key
                and row.get("status") == FileToolStatus.SUCCEEDED.value
                and self._owner_matches_row(owner, row)
            ):
                job = self._row_to_job(row)
                artifact = self.get_artifact_for_job(job.id)
                if artifact:
                    return job, artifact
        return None

    def create_job(
        self,
        owner: FileToolOwner,
        tool_key: str,
        payload: dict[str, Any],
        idempotency_key: str | None,
    ) -> FileToolJob:
        now = utc_now()
        row = {
            "id": str(uuid.uuid4()),
            "tool_key": tool_key,
            "status": FileToolStatus.RUNNING.value,
            "execution_mode": ExecutionMode.SYNC.value,
            "tenant_id": owner.tenant_id,
            "user_id": owner.owner_id if owner.is_authenticated else None,
            "guest_id_hash": owner.owner_id if not owner.is_authenticated else None,
            "request_json": payload,
            "options_json": payload.get("options", {}),
            "idempotency_key": idempotency_key,
            "retry_count": 0,
            "max_retries": 0,
            "created_at": _iso(now),
            "updated_at": _iso(now),
            "started_at": _iso(now),
        }

        if self._insert("file_tool_jobs", row):
            return self._row_to_job(row)

        self._memory_jobs[row["id"]] = copy.deepcopy(row)
        return self._row_to_job(row)

    def create_async_job(
        self,
        owner: FileToolOwner,
        tool_key: str,
        payload: dict[str, Any],
        idempotency_key: str | None,
        *,
        max_retries: int = 3,
    ) -> FileToolJob:
        now = utc_now()
        row = {
            "id": str(uuid.uuid4()),
            "tool_key": tool_key,
            "status": FileToolStatus.QUEUED.value,
            "execution_mode": ExecutionMode.ASYNC.value,
            "tenant_id": owner.tenant_id,
            "user_id": owner.owner_id if owner.is_authenticated else None,
            "guest_id_hash": owner.owner_id if not owner.is_authenticated else None,
            "request_json": payload,
            "options_json": payload.get("options", {}),
            "idempotency_key": idempotency_key,
            "retry_count": 0,
            "max_retries": max_retries,
            "created_at": _iso(now),
            "updated_at": _iso(now),
        }

        if self._insert("file_tool_jobs", row):
            return self._row_to_job(row)

        self._memory_jobs[row["id"]] = copy.deepcopy(row)
        return self._row_to_job(row)

    def find_job_by_idempotency(
        self,
        owner: FileToolOwner,
        tool_key: str,
        idempotency_key: str | None,
    ) -> FileToolJob | None:
        if not idempotency_key:
            return None
        if self._supabase is not None:
            try:
                query = (
                    self._supabase.table("file_tool_jobs")
                    .select("*")
                    .eq("tool_key", tool_key)
                    .eq("idempotency_key", idempotency_key)
                    .limit(1)
                )
                query = self._match_owner(query, owner)
                result = query.execute()
                if result.data:
                    return self._row_to_job(result.data[0])
            except Exception:
                pass
        for row in self._memory_jobs.values():
            if (
                row.get("tool_key") == tool_key
                and row.get("idempotency_key") == idempotency_key
                and self._owner_matches_row(owner, row)
            ):
                return self._row_to_job(row)
        return None

    def update_job(
        self,
        job_id: str,
        *,
        status: FileToolStatus | str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        duration_ms: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        update = {"updated_at": _iso(utc_now())}
        if status is not None:
            update["status"] = status.value if isinstance(status, FileToolStatus) else status
            if update["status"] == FileToolStatus.RUNNING.value:
                update["started_at"] = _iso(utc_now())
            if update["status"] in {
                FileToolStatus.SUCCEEDED.value,
                FileToolStatus.FAILED.value,
                FileToolStatus.CANCELLED.value,
                FileToolStatus.DEAD_LETTER.value,
                FileToolStatus.EXPIRED.value,
            }:
                update["completed_at"] = _iso(utc_now())
        if error_code is not None:
            update["error_code"] = error_code
        if error_message is not None:
            update["error_message"] = error_message
        if duration_ms is not None:
            update["duration_ms"] = duration_ms
        if extra:
            update.update(extra)
        self._update_job(job_id, update)

    def request_job_cancellation(self, job_id: str) -> None:
        job = self.get_job(job_id)
        payload = copy.deepcopy(job.request_payload) if job else {}
        payload["cancelRequestedAt"] = _iso(utc_now())
        self._update_job(job_id, {"request_json": payload, "updated_at": _iso(utc_now())})

    def is_cancellation_requested(self, job_id: str) -> bool:
        job = self.get_job(job_id)
        return bool(job and job.request_payload.get("cancelRequestedAt"))

    def mark_job_succeeded(self, job_id: str, page_count: int, duration_ms: int) -> None:
        self._update_job(job_id, {
            "status": FileToolStatus.SUCCEEDED.value,
            "page_count": page_count,
            "duration_ms": duration_ms,
            "completed_at": _iso(utc_now()),
            "updated_at": _iso(utc_now()),
        })

    def mark_job_failed(self, job_id: str, code: str, message: str, duration_ms: int | None = None) -> None:
        update = {
            "status": FileToolStatus.FAILED.value,
            "error_code": code,
            "error_message": message,
            "completed_at": _iso(utc_now()),
            "updated_at": _iso(utc_now()),
        }
        if duration_ms is not None:
            update["duration_ms"] = duration_ms
        self._update_job(job_id, update)

    def create_artifact(
        self,
        job: FileToolJob,
        artifact_id: str,
        filename: str,
        mime_type: str,
        size_bytes: int,
        sha256: str,
        storage_provider: str,
        storage_key: str,
        expires_at: datetime,
        page_count: int,
    ) -> FileToolArtifact:
        now = utc_now()
        row = {
            "id": artifact_id,
            "job_id": job.id,
            "tool_key": job.tool_key,
            "tenant_id": job.owner.tenant_id,
            "user_id": job.owner.owner_id if job.owner.is_authenticated else None,
            "guest_id_hash": job.owner.owner_id if not job.owner.is_authenticated else None,
            "filename": filename,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "sha256": sha256,
            "storage_provider": storage_provider,
            "storage_key": storage_key,
            "retention_expires_at": _iso(expires_at),
            "page_count": page_count,
            "download_count": 0,
            "created_at": _iso(now),
            "updated_at": _iso(now),
        }

        if not self._insert("file_tool_artifacts", row):
            self._memory_artifacts[row["id"]] = copy.deepcopy(row)
        return self._row_to_artifact(row)

    def get_job(self, job_id: str) -> FileToolJob | None:
        row = self._select_one("file_tool_jobs", "id", job_id) or self._memory_jobs.get(job_id)
        return self._row_to_job(row) if row else None

    def get_artifact(self, artifact_id: str) -> FileToolArtifact | None:
        row = self._select_one("file_tool_artifacts", "id", artifact_id) or self._memory_artifacts.get(artifact_id)
        return self._row_to_artifact(row) if row else None

    def get_artifact_for_job(self, job_id: str) -> FileToolArtifact | None:
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("file_tool_artifacts")
                    .select("*")
                    .eq("job_id", job_id)
                    .limit(1)
                    .execute()
                )
                if result.data:
                    return self._row_to_artifact(result.data[0])
            except Exception:
                pass
        for row in self._memory_artifacts.values():
            if row.get("job_id") == job_id:
                return self._row_to_artifact(row)
        return None

    def increment_download_count(self, artifact_id: str) -> None:
        artifact = self.get_artifact(artifact_id)
        if not artifact:
            return
        new_count = artifact.download_count + 1
        if self._supabase is not None:
            try:
                self._supabase.table("file_tool_artifacts").update(
                    {"download_count": new_count, "last_downloaded_at": _iso(utc_now()), "updated_at": _iso(utc_now())}
                ).eq("id", artifact_id).execute()
                return
            except Exception:
                pass
        if artifact_id in self._memory_artifacts:
            self._memory_artifacts[artifact_id]["download_count"] = new_count
            self._memory_artifacts[artifact_id]["last_downloaded_at"] = _iso(utc_now())

    def list_history(self, owner: FileToolOwner, limit: int = 25) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        if self._supabase is not None:
            try:
                query = (
                    self._supabase.table("file_tool_artifacts")
                    .select("*")
                    .order("created_at", desc=True)
                    .limit(limit)
                )
                query = self._match_owner(query, owner)
                result = query.execute()
                rows = result.data or []
            except Exception:
                rows = []

        if not rows:
            rows = [
                row
                for row in self._memory_artifacts.values()
                if self._owner_matches_row(owner, row)
            ]
            rows.sort(key=lambda item: item.get("created_at") or "", reverse=True)
            rows = rows[:limit]

        return [
            {
                "id": row["id"],
                "jobId": row["job_id"],
                "toolKey": row["tool_key"],
                "filename": row["filename"],
                "sizeBytes": row["size_bytes"],
                "expiresAt": row.get("retention_expires_at"),
                "createdAt": row.get("created_at"),
                "downloadCount": row.get("download_count", 0),
            }
            for row in rows
        ]

    def get_draft(self, owner: FileToolOwner, tool_key: str) -> dict[str, Any] | None:
        draft_key = self._draft_key(owner, tool_key)
        if self._supabase is not None:
            try:
                query = self._supabase.table("file_tool_drafts").select("*").eq("tool_key", tool_key).limit(1)
                query = self._match_owner(query, owner)
                result = query.execute()
                if result.data:
                    return result.data[0].get("draft_json")
            except Exception:
                pass
        row = self._memory_drafts.get(draft_key)
        return copy.deepcopy(row.get("draft_json")) if row else None

    def upsert_draft(self, owner: FileToolOwner, tool_key: str, draft: dict[str, Any], expires_at: datetime) -> None:
        now = utc_now()
        row = {
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, self._draft_key(owner, tool_key))),
            "tool_key": tool_key,
            "tenant_id": owner.tenant_id,
            "user_id": owner.owner_id if owner.is_authenticated else None,
            "guest_id_hash": owner.owner_id if not owner.is_authenticated else None,
            "draft_json": draft,
            "version": 1,
            "expires_at": _iso(expires_at),
            "updated_at": _iso(now),
            "created_at": _iso(now),
        }
        if self._supabase is not None:
            try:
                self._supabase.table("file_tool_drafts").upsert(row, on_conflict="id").execute()
                return
            except Exception:
                pass
        self._memory_drafts[self._draft_key(owner, tool_key)] = copy.deepcopy(row)

    def delete_draft(self, owner: FileToolOwner, tool_key: str) -> None:
        draft_id = str(uuid.uuid5(uuid.NAMESPACE_URL, self._draft_key(owner, tool_key)))
        if self._supabase is not None:
            try:
                self._supabase.table("file_tool_drafts").delete().eq("id", draft_id).execute()
            except Exception:
                pass
        self._memory_drafts.pop(self._draft_key(owner, tool_key), None)

    def record_event(self, owner: FileToolOwner, event_type: str, tool_key: str, metadata: dict[str, Any] | None = None) -> None:
        row = {
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "tool_key": tool_key,
            "tenant_id": owner.tenant_id,
            "user_id": owner.owner_id if owner.is_authenticated else None,
            "guest_id_hash": owner.owner_id if not owner.is_authenticated else None,
            "metadata": metadata or {},
            "created_at": _iso(utc_now()),
        }
        if not self._insert("file_tool_events", row):
            self._memory_events.append(copy.deepcopy(row))

    def create_upload_session(self, owner: FileToolOwner, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        row = {
            "id": str(uuid.uuid4()),
            "tenant_id": owner.tenant_id,
            "user_id": owner.owner_id if owner.is_authenticated else None,
            "guest_id_hash": owner.owner_id if not owner.is_authenticated else None,
            "tool_key": payload["tool_key"],
            "batch_id": payload.get("batch_id"),
            "filename": payload["filename"],
            "declared_mime_type": payload.get("declared_mime_type"),
            "total_size_bytes": payload["total_size_bytes"],
            "chunk_size_bytes": payload["chunk_size_bytes"],
            "total_chunks": payload["total_chunks"],
            "received_bytes": 0,
            "expected_sha256": payload.get("expected_sha256"),
            "source_sha256": None,
            "source_storage_provider": None,
            "source_storage_key": None,
            "status": "receiving",
            "expires_at": payload["expires_at"],
            "completed_at": None,
            "created_at": _iso(now),
            "updated_at": _iso(now),
        }
        if not self._insert("file_tool_upload_sessions", row):
            self._memory_upload_sessions[row["id"]] = copy.deepcopy(row)
        return copy.deepcopy(row)

    def get_upload_session(self, session_id: str) -> dict[str, Any] | None:
        row = self._select_one("file_tool_upload_sessions", "id", session_id) or self._memory_upload_sessions.get(session_id)
        return copy.deepcopy(row) if row else None

    def update_upload_session(self, session_id: str, update: dict[str, Any]) -> None:
        normalized = copy.deepcopy(update)
        normalized["updated_at"] = _iso(utc_now())
        if self._update_table_by_id("file_tool_upload_sessions", session_id, normalized):
            return
        if session_id in self._memory_upload_sessions:
            self._memory_upload_sessions[session_id].update(normalized)

    def get_upload_chunk_by_index(self, session_id: str, chunk_index: int) -> dict[str, Any] | None:
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("file_tool_upload_chunks")
                    .select("*")
                    .eq("upload_session_id", session_id)
                    .eq("chunk_index", chunk_index)
                    .limit(1)
                    .execute()
                )
                if result.data:
                    return copy.deepcopy(result.data[0])
            except Exception:
                pass
        return copy.deepcopy(self._memory_upload_chunks.get(f"{session_id}:{chunk_index}"))

    def get_upload_chunk_by_idempotency(self, session_id: str, idempotency_key: str) -> dict[str, Any] | None:
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("file_tool_upload_chunks")
                    .select("*")
                    .eq("upload_session_id", session_id)
                    .eq("idempotency_key", idempotency_key)
                    .limit(1)
                    .execute()
                )
                if result.data:
                    return copy.deepcopy(result.data[0])
            except Exception:
                pass
        for row in self._memory_upload_chunks.values():
            if row.get("upload_session_id") == session_id and row.get("idempotency_key") == idempotency_key:
                return copy.deepcopy(row)
        return None

    def create_upload_chunk(self, row: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        normalized = {
            "id": str(uuid.uuid4()),
            "created_at": _iso(now),
            "updated_at": _iso(now),
            "status": "stored",
            **copy.deepcopy(row),
        }
        if not self._insert("file_tool_upload_chunks", normalized):
            self._memory_upload_chunks[f"{normalized['upload_session_id']}:{normalized['chunk_index']}"] = copy.deepcopy(normalized)
        return copy.deepcopy(normalized)

    def list_upload_chunks(self, session_id: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("file_tool_upload_chunks")
                    .select("*")
                    .eq("upload_session_id", session_id)
                    .order("chunk_index")
                    .execute()
                )
                rows = result.data or []
            except Exception:
                rows = []
        if not rows:
            rows = [
                copy.deepcopy(row)
                for row in self._memory_upload_chunks.values()
                if row.get("upload_session_id") == session_id
            ]
            rows.sort(key=lambda item: int(item.get("chunk_index") or 0))
        return rows

    def record_progress_event(
        self,
        job_id: str,
        *,
        stage: str,
        percent: float | None = None,
        processed_ms: int | None = None,
        speed: float | None = None,
        eta_seconds: int | None = None,
        message: str | None = None,
        event_type: str = "progress",
    ) -> dict[str, Any]:
        sequence_id = self.next_progress_sequence(job_id)
        row = {
            "id": str(uuid.uuid4()),
            "job_id": job_id,
            "sequence_id": sequence_id,
            "event_type": event_type,
            "stage": stage,
            "percent": percent,
            "processed_ms": processed_ms,
            "speed": speed,
            "eta_seconds": eta_seconds,
            "message": message,
            "created_at": _iso(utc_now()),
        }
        if not self._insert("file_tool_job_progress_events", row):
            self._memory_progress_events.setdefault(job_id, []).append(copy.deepcopy(row))
        return copy.deepcopy(row)

    def next_progress_sequence(self, job_id: str) -> int:
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("file_tool_job_progress_events")
                    .select("sequence_id")
                    .eq("job_id", job_id)
                    .order("sequence_id", desc=True)
                    .limit(1)
                    .execute()
                )
                if result.data:
                    return int(result.data[0].get("sequence_id") or 0) + 1
            except Exception:
                pass
        existing = self._memory_progress_events.get(job_id, [])
        if not existing:
            return 1
        return max(int(row.get("sequence_id") or 0) for row in existing) + 1

    def list_progress_events(self, job_id: str, after_sequence_id: int = 0, limit: int = 100) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("file_tool_job_progress_events")
                    .select("*")
                    .eq("job_id", job_id)
                    .gt("sequence_id", after_sequence_id)
                    .order("sequence_id")
                    .limit(limit)
                    .execute()
                )
                rows = result.data or []
            except Exception:
                rows = []
        if not rows:
            rows = [
                copy.deepcopy(row)
                for row in self._memory_progress_events.get(job_id, [])
                if int(row.get("sequence_id") or 0) > after_sequence_id
            ][:limit]
        return rows

    def upsert_video_metadata(self, job_id: str, metadata: dict[str, Any]) -> None:
        row = {
            "job_id": job_id,
            "metadata_json": copy.deepcopy(metadata),
            "updated_at": _iso(utc_now()),
        }
        if self._supabase is not None:
            try:
                self._supabase.table("file_tool_video_metadata").upsert(row, on_conflict="job_id").execute()
                return
            except Exception:
                pass
        self._memory_video_metadata[job_id] = copy.deepcopy(row)

    def create_video_output(self, job_id: str, payload: dict[str, Any]) -> None:
        row = {
            "id": str(uuid.uuid4()),
            "job_id": job_id,
            **copy.deepcopy(payload),
            "created_at": _iso(utc_now()),
            "updated_at": _iso(utc_now()),
        }
        if not self._insert("file_tool_video_outputs", row):
            self._memory_video_outputs[job_id] = copy.deepcopy(row)

    def upsert_ocr_result(self, job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = {
            "job_id": job_id,
            **copy.deepcopy(payload),
            "updated_at": _iso(utc_now()),
        }
        existing = self.get_ocr_result(job_id)
        if existing:
            row["created_at"] = existing.get("created_at") or _iso(utc_now())
        else:
            row["created_at"] = _iso(utc_now())
        if self._supabase is not None:
            try:
                self._supabase.table("file_tool_ocr_results").upsert(row, on_conflict="job_id").execute()
                return row
            except Exception:
                pass
        self._memory_ocr_results[job_id] = copy.deepcopy(row)
        return row

    def get_ocr_result(self, job_id: str) -> dict[str, Any] | None:
        row = self._select_one("file_tool_ocr_results", "job_id", job_id)
        if row:
            return row
        stored = self._memory_ocr_results.get(job_id)
        return copy.deepcopy(stored) if stored else None

    def delete_ocr_result(self, job_id: str) -> None:
        if self._supabase is not None:
            try:
                self._supabase.table("file_tool_ocr_results").delete().eq("job_id", job_id).execute()
            except Exception:
                pass
        self._memory_ocr_results.pop(job_id, None)

    def cleanup_expired(self, now: datetime | None = None) -> list[FileToolArtifact]:
        now = now or utc_now()
        expired: list[FileToolArtifact] = []
        if self._supabase is not None:
            try:
                result = (
                    self._supabase.table("file_tool_artifacts")
                    .select("*")
                    .lt("retention_expires_at", _iso(now))
                    .limit(500)
                    .execute()
                )
                for row in result.data or []:
                    expired.append(self._row_to_artifact(row))
                if expired:
                    ids = [artifact.id for artifact in expired]
                    self._supabase.table("file_tool_artifacts").delete().in_("id", ids).execute()
            except Exception:
                expired = []

        if not expired:
            to_delete = []
            for artifact_id, row in self._memory_artifacts.items():
                if _parse_dt(row.get("retention_expires_at")) < now:
                    expired.append(self._row_to_artifact(row))
                    to_delete.append(artifact_id)
            for artifact_id in to_delete:
                self._memory_artifacts.pop(artifact_id, None)
        return expired

    def _insert(self, table: str, row: dict[str, Any]) -> bool:
        if self._supabase is None:
            return False
        try:
            self._supabase.table(table).insert(row).execute()
            return True
        except Exception:
            return False

    def _select_one(self, table: str, field: str, value: str) -> dict[str, Any] | None:
        if self._supabase is None:
            return None
        try:
            result = self._supabase.table(table).select("*").eq(field, value).limit(1).execute()
            return result.data[0] if result.data else None
        except Exception:
            return None

    def _update_table_by_id(self, table: str, row_id: str, update: dict[str, Any]) -> bool:
        if self._supabase is None:
            return False
        try:
            self._supabase.table(table).update(update).eq("id", row_id).execute()
            return True
        except Exception:
            return False

    def _update_job(self, job_id: str, update: dict[str, Any]) -> None:
        if self._supabase is not None:
            try:
                self._supabase.table("file_tool_jobs").update(update).eq("id", job_id).execute()
                return
            except Exception:
                pass
        if job_id in self._memory_jobs:
            self._memory_jobs[job_id].update(update)

    def _match_owner(self, query: Any, owner: FileToolOwner) -> Any:
        if owner.is_authenticated:
            return query.eq("user_id", owner.owner_id)
        return query.eq("guest_id_hash", owner.owner_id)

    def _owner_matches_row(self, owner: FileToolOwner, row: dict[str, Any]) -> bool:
        if owner.is_authenticated:
            return row.get("user_id") == owner.owner_id
        return row.get("guest_id_hash") == owner.owner_id

    def _draft_key(self, owner: FileToolOwner, tool_key: str) -> str:
        return f"{owner.token_subject}:{tool_key}"

    def _row_to_owner(self, row: dict[str, Any]) -> FileToolOwner:
        if row.get("user_id"):
            return FileToolOwner(OwnerType.USER, row["user_id"], row.get("tenant_id"))
        return FileToolOwner(OwnerType.GUEST, row.get("guest_id_hash") or "unknown", row.get("tenant_id"))

    def _row_to_job(self, row: dict[str, Any]) -> FileToolJob:
        return FileToolJob(
            id=row["id"],
            tool_key=row["tool_key"],
            status=FileToolStatus(row.get("status") or FileToolStatus.QUEUED.value),
            execution_mode=ExecutionMode(row.get("execution_mode") or ExecutionMode.SYNC.value),
            owner=self._row_to_owner(row),
            request_payload=row.get("request_json") or {},
            created_at=_parse_dt(row.get("created_at")),
            updated_at=_parse_dt(row.get("updated_at")),
            idempotency_key=row.get("idempotency_key"),
            error_code=row.get("error_code"),
            error_message=row.get("error_message"),
        )

    def _row_to_artifact(self, row: dict[str, Any]) -> FileToolArtifact:
        return FileToolArtifact(
            id=row["id"],
            job_id=row["job_id"],
            tool_key=row["tool_key"],
            owner=self._row_to_owner(row),
            filename=row["filename"],
            mime_type=row.get("mime_type") or "application/pdf",
            size_bytes=int(row.get("size_bytes") or 0),
            sha256=row.get("sha256") or "",
            storage_provider=row.get("storage_provider") or "unknown",
            storage_key=row.get("storage_key") or "",
            expires_at=_parse_dt(row.get("retention_expires_at")),
            created_at=_parse_dt(row.get("created_at")),
            download_count=int(row.get("download_count") or 0),
        )
