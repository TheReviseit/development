"""Queue adapter for OCR extraction tasks."""

from __future__ import annotations

import logging
import os
import threading
import uuid
from dataclasses import dataclass
from urllib.parse import urlparse

from ...domain.errors import ConversionError

logger = logging.getLogger("file_tools.ocr_queue")

_TRUTHY = {"1", "true", "yes", "on"}
_PRODUCTION_ENV_VALUES = {"production", "prod", "staging", "stage", "preview"}
_LOCAL_ENV_VALUES = {"development", "dev", "local", "test", "testing"}
_DEPLOYMENT_MARKER_KEYS = (
    "RENDER",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_SERVICE_NAME",
    "FLY_APP_NAME",
    "DYNO",
    "HEROKU_APP_NAME",
    "K_SERVICE",
    "GAE_ENV",
    "AWS_EXECUTION_ENV",
    "ECS_CONTAINER_METADATA_URI",
    "ECS_CONTAINER_METADATA_URI_V4",
    "WEBSITE_SITE_NAME",
)


@dataclass(frozen=True)
class EnqueuedOcrTask:
    task_id: str | None
    queue: str


class OcrQueue:
    queue = "ocr"

    def enqueue_extraction(self, job_id: str) -> EnqueuedOcrTask:
        if self.inline_enabled():
            return self._run_inline(job_id)
        return self._send("file_tools.ocr.extract", [job_id], self.queue)

    def inline_enabled(self) -> bool:
        return _inline_dev_workers_enabled()

    def health(self) -> dict[str, object]:
        inline = self.inline_enabled()
        return {
            "available": True if inline else _celery_broker_available(),
            "mode": "inline" if inline else "celery",
            "queue": self.queue,
            "broker": _broker_status(),
        }

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
    configured = os.getenv("FILES_OCR_INLINE_DEV_WORKERS")
    if configured is not None:
        return configured.strip().lower() in _TRUTHY
    if _production_environment_detected():
        return False
    return _local_environment_detected()


def _production_environment_detected() -> bool:
    for key in ("FLASK_ENV", "APP_ENV", "ENV", "PYTHON_ENV", "NODE_ENV"):
        if os.getenv(key, "").strip().lower() in _PRODUCTION_ENV_VALUES:
            return True
    if any(os.getenv(key) for key in _DEPLOYMENT_MARKER_KEYS):
        return True
    redis_url = os.getenv("REDIS_URL")
    return bool(redis_url and not _is_local_url(redis_url))


def _local_environment_detected() -> bool:
    for key in ("FLASK_ENV", "APP_ENV", "ENV", "PYTHON_ENV", "NODE_ENV"):
        if os.getenv(key, "").strip().lower() in _LOCAL_ENV_VALUES:
            return True
    redis_url = os.getenv("REDIS_URL")
    return not redis_url or _is_local_url(redis_url)


def _celery_broker_available() -> bool:
    connection = None
    try:
        from celery_app import celery_app

        if celery_app is None:
            return False
        connection = celery_app.broker_connection()
        timeout = float(os.getenv("FILES_OCR_QUEUE_HEALTH_TIMEOUT_SECONDS", "1.5"))
        connection.ensure_connection(max_retries=1, timeout=timeout)
        return True
    except Exception:
        return False
    finally:
        if connection is not None:
            try:
                connection.release()
            except Exception:
                pass


def _broker_status() -> dict[str, object]:
    redis_url = os.getenv("REDIS_URL")
    return {
        "configured": bool(redis_url),
        "local": _is_local_url(redis_url) if redis_url else False,
    }


def _is_local_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        host = urlparse(value).hostname or ""
    except Exception:
        return False
    return host.lower() in {"localhost", "127.0.0.1", "::1"}
