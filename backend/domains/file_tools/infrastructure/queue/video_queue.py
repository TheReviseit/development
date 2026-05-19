"""Queue adapter for video file-tool tasks."""

from __future__ import annotations

import logging
import os
import threading
import uuid
from dataclasses import dataclass

from ...domain.errors import ConversionError

logger = logging.getLogger("file_tools.video_queue")


@dataclass(frozen=True)
class EnqueuedTask:
    task_id: str | None
    queue: str


class VideoQueue:
    assembly_queue = "video_ingest"
    conversion_queue = "video"

    def enqueue_assembly(self, upload_session_id: str) -> EnqueuedTask:
        if _inline_dev_workers_enabled():
            return self._run_inline("assembly", upload_session_id, self.assembly_queue)
        return self._send("file_tools.video.assemble_upload", [upload_session_id], self.assembly_queue)

    def enqueue_conversion(self, job_id: str) -> EnqueuedTask:
        if _inline_dev_workers_enabled():
            return self._run_inline("conversion", job_id, self.conversion_queue)
        return self._send("file_tools.video.convert", [job_id], self.conversion_queue)

    def _run_inline(self, kind: str, resource_id: str, queue: str) -> EnqueuedTask:
        task_id = f"inline-{kind}-{uuid.uuid4().hex}"

        def runner() -> None:
            try:
                from ...application.video_assembly_service import VideoAssemblyService
                from ...application.video_conversion_service import VideoConversionService
                from ..repositories import FileToolsRepository
                from ..storage.factory import create_artifact_storage

                repository = FileToolsRepository()
                storage = create_artifact_storage()
                if kind == "assembly":
                    VideoAssemblyService(repository, storage).assemble(resource_id)
                else:
                    VideoConversionService(repository, storage).convert(resource_id)
            except Exception:
                logger.exception("inline_video_worker_failed kind=%s resource_id=%s", kind, resource_id)

        thread = threading.Thread(target=runner, name=task_id, daemon=True)
        thread.start()
        return EnqueuedTask(task_id=task_id, queue=queue)

    def _send(self, task_name: str, args: list[str], queue: str) -> EnqueuedTask:
        try:
            from celery_app import celery_app
        except Exception as exc:
            raise ConversionError("Video workers are not configured.", "VIDEO_QUEUE_UNAVAILABLE") from exc

        if celery_app is None:
            raise ConversionError("Video workers are not configured.", "VIDEO_QUEUE_UNAVAILABLE")

        try:
            result = celery_app.send_task(task_name, args=args, queue=queue)
            return EnqueuedTask(task_id=getattr(result, "id", None), queue=queue)
        except Exception as exc:
            raise ConversionError("Video workers are temporarily unavailable.", "VIDEO_QUEUE_UNAVAILABLE") from exc


def _inline_dev_workers_enabled() -> bool:
    default = "false" if os.getenv("FLASK_ENV", "development").lower() == "production" else "true"
    return os.getenv("FILE_TOOLS_VIDEO_INLINE_DEV_WORKERS", default).lower() in {"1", "true", "yes", "on"}
