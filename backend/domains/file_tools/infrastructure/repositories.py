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
