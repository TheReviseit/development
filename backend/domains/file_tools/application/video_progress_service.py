"""SSE progress stream for video conversion jobs."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator

from ..contracts.common import RequestContext
from ..domain.enums import FileToolStatus
from ..domain.errors import NotFoundError, PermissionDeniedError
from ..infrastructure.repositories import FileToolsRepository
from .video_backpressure_service import VideoBackpressureService


TERMINAL_STATUSES = {
    FileToolStatus.SUCCEEDED.value,
    FileToolStatus.FAILED.value,
    FileToolStatus.CANCELLED.value,
    FileToolStatus.DEAD_LETTER.value,
}


class VideoProgressService:
    def __init__(self, repository: FileToolsRepository, backpressure: VideoBackpressureService):
        self.repository = repository
        self.backpressure = backpressure

    def stream(self, job_id: str, context: RequestContext, after_sequence_id: int = 0) -> Iterator[str]:
        self.backpressure.assert_allowed(context.owner.token_subject, "sse")
        job = self.repository.get_job(job_id)
        if not job:
            raise NotFoundError("Job not found.")
        if job.owner.owner_type != context.owner.owner_type or job.owner.owner_id != context.owner.owner_id:
            raise PermissionDeniedError("You do not have access to this job.")

        cursor = after_sequence_id
        last_heartbeat = 0.0
        while True:
            events = self.repository.list_progress_events(job_id, cursor, limit=100)
            for event in events:
                cursor = max(cursor, int(event["sequence_id"]))
                yield _sse(event["event_type"], event, cursor)

            job = self.repository.get_job(job_id)
            if job and job.status.value in TERMINAL_STATUSES:
                yield _sse(job.status.value, {"jobId": job.id, "status": job.status.value}, cursor + 1)
                return

            now = time.monotonic()
            if now - last_heartbeat >= 15:
                yield _sse("heartbeat", {"jobId": job_id, "ts": time.time()}, cursor)
                last_heartbeat = now
            time.sleep(1)


def _sse(event_type: str, payload: dict, event_id: int) -> str:
    return f"id: {event_id}\nevent: {event_type}\ndata: {json.dumps(payload, default=str)}\n\n"
