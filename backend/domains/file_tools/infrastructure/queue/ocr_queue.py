"""Queue adapter for OCR extraction tasks."""

from __future__ import annotations

import logging
import os
import threading
import uuid
from dataclasses import dataclass

from ...domain.errors import ConversionError

logger = logging.getLogger("file_tools.ocr_queue")


@dataclass(frozen=True)
class EnqueuedOcrTask:
    task_id: str | None
    queue: str


class OcrQueue:
    queue = "ocr"

    def enqueue_extraction(self, job_id: str) -> EnqueuedOcrTask:
        if _inline_dev_workers_enabled():
            return self._run_inline(job_id)
        return self._send("file_tools.ocr.extract", [job_id], self.queue)

    def _run_inline(self, job_id: str) -> EnqueuedOcrTask:
        task_id = f"inline-ocr-{uuid.uuid4().hex}"

        def runner() -> None:
            try:
                from ...application.ocr_service import OcrService
                from ..repositories import FileToolsRepository
                from ..storage.factory import create_artifact_storage

                OcrService(FileToolsRepository(), create_artifact_storage()).extract(job_id)
            except Exception:
                logger.exception("inline_ocr_worker_failed job_id=%s", job_id)

        threading.Thread(target=runner, name=task_id, daemon=True).start()
        return EnqueuedOcrTask(task_id=task_id, queue=self.queue)

    def _send(self, task_name: str, args: list[str], queue: str) -> EnqueuedOcrTask:
        try:
            from celery_app import celery_app
        except Exception as exc:
            raise ConversionError("OCR workers are not configured.", "OCR_QUEUE_UNAVAILABLE") from exc

        if celery_app is None:
            raise ConversionError("OCR workers are not configured.", "OCR_QUEUE_UNAVAILABLE")

        try:
            result = celery_app.send_task(task_name, args=args, queue=queue)
            return EnqueuedOcrTask(task_id=getattr(result, "id", None), queue=queue)
        except Exception as exc:
            raise ConversionError("OCR workers are temporarily unavailable.", "OCR_QUEUE_UNAVAILABLE") from exc


def _inline_dev_workers_enabled() -> bool:
    default = "false" if os.getenv("FLASK_ENV", "development").lower() == "production" else "true"
    return os.getenv("FILES_OCR_INLINE_DEV_WORKERS", default).lower() in {"1", "true", "yes", "on"}

