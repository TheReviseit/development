"""Retention cleanup for file tool artifacts."""

from __future__ import annotations

from ..domain.events import FILE_TOOL_EXPIRED
from ..infrastructure.repositories import FileToolsRepository
from ..infrastructure.storage.base import ArtifactStorage


class CleanupService:
    def __init__(self, repository: FileToolsRepository, storage: ArtifactStorage):
        self.repository = repository
        self.storage = storage

    def cleanup_expired(self) -> dict:
        expired = self.repository.cleanup_expired()
        deleted = 0
        for artifact in expired:
            try:
                self.storage.delete(artifact.storage_key)
                deleted += 1
                self.repository.record_event(
                    artifact.owner,
                    FILE_TOOL_EXPIRED,
                    artifact.tool_key,
                    {"artifact_id": artifact.id, "job_id": artifact.job_id},
                )
            except Exception:
                continue
        return {"success": True, "expiredArtifacts": len(expired), "deletedObjects": deleted}
