"""Worker-side video transcoding orchestration."""

from __future__ import annotations

import hashlib
import shutil
import tempfile
import time
import uuid
from pathlib import Path

from ..contracts.video_converter import TOOL_KEY, VideoConversionOptions
from ..converters.video_converter.ffmpeg_service import FfmpegService
from ..converters.video_converter.ffprobe_service import FfprobeService, output_is_faststart
from ..converters.video_converter.processing_plan import build_processing_plan
from ..domain.enums import FileToolStatus
from ..domain.errors import ConversionError, FileToolError, ValidationError
from ..domain.policies import VIDEO_CONVERSION_LIMITS
from ..infrastructure.observability import (
    hash_identifier,
    increment_video_counter,
    log_event,
    log_failure,
    observe_video_histogram,
)
from ..infrastructure.repositories import FileToolsRepository, utc_now
from ..infrastructure.storage.base import ArtifactStorage
from ..validators.video_converter_validator import (
    max_duration_seconds,
    output_video_filename,
)


class VideoConversionService:
    def __init__(
        self,
        repository: FileToolsRepository,
        storage: ArtifactStorage,
        ffmpeg: FfmpegService | None = None,
        ffprobe: FfprobeService | None = None,
    ):
        self.repository = repository
        self.storage = storage
        self.ffmpeg = ffmpeg or FfmpegService()
        self.ffprobe = ffprobe or FfprobeService()

    def convert(self, job_id: str) -> dict[str, object]:
        job = self.repository.get_job(job_id)
        if not job:
            raise ConversionError("Video job was not found.", "VIDEO_JOB_NOT_FOUND")
        started = time.perf_counter()
        temp_root = Path(tempfile.mkdtemp(prefix=f"flowauxi-video-job-{job_id}-"))
        source_path = temp_root / "source"
        output_path = temp_root / "output.mp4"
        thumbnail_path = temp_root / "thumbnail.jpg"
        poster_path = temp_root / "poster.jpg"
        options = VideoConversionOptions.parse_or_raise(job.request_payload.get("options"))
        stage = "starting"
        try:
            self.repository.update_job(job_id, status=FileToolStatus.RUNNING)
            stage = "preflight"
            self._progress(job_id, stage, 1)
            if not self.ffprobe.is_available():
                raise ConversionError("ffprobe is not installed or not configured.", "FFPROBE_UNAVAILABLE")
            if not self.ffmpeg.is_available():
                raise ConversionError("ffmpeg is not installed or not configured.", "FFMPEG_UNAVAILABLE")

            self._progress(job_id, "downloading", 2)
            self.storage.download_to_path(job.request_payload["sourceStorageKey"], source_path)
            self._raise_if_cancelled(job_id)

            stage = "probing"
            self._progress(job_id, stage, 5)
            probe = self.ffprobe.probe_or_raise(source_path)
            self.repository.upsert_video_metadata(job_id, probe.to_metadata())
            self._validate_probe(job, probe)
            self._raise_if_cancelled(job_id)

            stage = "planning"
            self._progress(job_id, stage, 8)
            plan = build_processing_plan(options, source_path, output_path)

            stage = "converting"
            self._progress(job_id, stage, 10)
            self.ffmpeg.convert(
                plan,
                duration_ms=probe.duration_ms,
                on_progress=lambda progress: self._conversion_progress(job_id, progress),
                should_cancel=lambda: self.repository.is_cancellation_requested(job_id),
            )
            self._raise_if_cancelled(job_id)

            stage = "validating"
            self._progress(job_id, stage, 92)
            output_probe = self.ffprobe.probe_or_raise(output_path)
            self._validate_output(output_path, output_probe, options)

            stage = "storing"
            self._progress(job_id, stage, 94)
            artifact = self._store_output(job, output_path)

            thumbnail_artifact_id = None
            poster_artifact_id = None
            if options.generate_thumbnail:
                stage = "thumbnailing"
                self._progress(job_id, stage, 95)
                thumb_args = plan.thumbnail_args(self.ffmpeg.binary, thumbnail_path, _thumbnail_second(output_probe.duration_seconds))
                self.ffmpeg.generate_still(thumb_args, lambda: self.repository.is_cancellation_requested(job_id))
                thumbnail_artifact_id = self._store_sidecar(job, thumbnail_path, "thumbnail.jpg", "image/jpeg", "thumbnail")
            if options.generate_poster:
                poster_source = thumbnail_path if thumbnail_path.exists() else output_path
                if poster_source == output_path:
                    poster_args = plan.thumbnail_args(self.ffmpeg.binary, poster_path, _thumbnail_second(output_probe.duration_seconds))
                    self.ffmpeg.generate_still(poster_args, lambda: self.repository.is_cancellation_requested(job_id))
                else:
                    shutil.copyfile(thumbnail_path, poster_path)
                poster_artifact_id = self._store_sidecar(job, poster_path, "poster.jpg", "image/jpeg", "poster")

            self._progress(job_id, stage, 98)
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_succeeded(job_id, 0, duration_ms)
            self.repository.record_progress_event(job_id, stage="succeeded", percent=100, event_type="completed")
            self.repository.create_video_output(
                job_id,
                {
                    "output_artifact_id": artifact.id,
                    "thumbnail_artifact_id": thumbnail_artifact_id,
                    "poster_artifact_id": poster_artifact_id,
                    "container": "mp4",
                    "video_codec": output_probe.video_codec,
                    "audio_codec": output_probe.audio_codec,
                    "width": output_probe.width,
                    "height": output_probe.height,
                    "fps": output_probe.fps,
                    "bit_rate": output_probe.bit_rate,
                    "size_bytes": artifact.size_bytes,
                    "validation_status": "passed",
                },
            )
            observe_video_histogram("file_tools_video_conversion_duration_seconds", duration_ms / 1000, preset=options.quality_preset, status="succeeded")
            increment_video_counter("file_tools_video_jobs_total", status="succeeded", preset=options.quality_preset)
            increment_video_counter("file_tools_video_bytes_processed_total", artifact.size_bytes, preset=options.quality_preset)
            log_event(
                "video_conversion_succeeded",
                job_id=job_id,
                user_id_hash=hash_identifier(job.owner.owner_id),
                preset=options.quality_preset,
                duration_ms=duration_ms,
                size_bytes=artifact.size_bytes,
            )
            return {"jobId": job_id, "artifactId": artifact.id}
        except ConversionError as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            if exc.code == "VIDEO_CONVERSION_CANCELLED":
                self.repository.update_job(job_id, status=FileToolStatus.CANCELLED, duration_ms=duration_ms)
                self.repository.record_progress_event(job_id, stage="cancelled", event_type="cancelled")
                increment_video_counter("file_tools_video_cancellations_total", stage=stage)
            else:
                self.repository.mark_job_failed(job_id, exc.code, exc.message, duration_ms)
                self.repository.record_progress_event(job_id, stage=stage, event_type="failed", message=exc.message)
                increment_video_counter("file_tools_video_failures_total", stage=stage, error_code=exc.code, input_codec="unknown")
            log_failure("video_conversion_failed", job_id=job_id, stage=stage, code=exc.code, message=exc.message)
            raise
        except FileToolError as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job_id, exc.code, exc.message, duration_ms)
            self.repository.record_progress_event(job_id, stage=stage, event_type="failed", message=exc.message)
            increment_video_counter("file_tools_video_failures_total", stage=stage, error_code=exc.code, input_codec="unknown")
            log_failure("video_conversion_failed", job_id=job_id, stage=stage, code=exc.code, message=exc.message)
            raise
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self.repository.mark_job_failed(job_id, "VIDEO_CONVERSION_FAILED", "Video conversion failed.", duration_ms)
            self.repository.record_progress_event(job_id, stage=stage, event_type="failed", message="Video conversion failed.")
            increment_video_counter("file_tools_video_failures_total", stage=stage, error_code="VIDEO_CONVERSION_FAILED", input_codec="unknown")
            log_failure("video_conversion_failed", job_id=job_id, stage=stage, internal_error_type=exc.__class__.__name__, message=str(exc))
            raise ConversionError("Video conversion failed.", "VIDEO_CONVERSION_FAILED") from exc
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)

    def _validate_probe(self, job, probe) -> None:
        if probe.video_streams != 1:
            raise ValidationError("UNSUPPORTED_VIDEO_STREAMS", "Video must contain exactly one video stream.")
        if probe.audio_streams > VIDEO_CONVERSION_LIMITS.max_audio_streams:
            raise ValidationError("UNSUPPORTED_AUDIO_STREAMS", "Video has too many audio streams.")
        if not probe.duration_seconds or probe.duration_seconds <= 0:
            raise ValidationError("INVALID_VIDEO_DURATION", "Video duration could not be detected.")
        if probe.duration_seconds > max_duration_seconds(job.owner):
            raise ValidationError("VIDEO_DURATION_TOO_LONG", "Video duration is longer than the allowed limit.")
        if not probe.width or not probe.height:
            raise ValidationError("INVALID_VIDEO_DIMENSIONS", "Video dimensions could not be detected.")

    def _validate_output(self, output_path: Path, probe, options: VideoConversionOptions) -> None:
        if probe.video_codec != "h264":
            raise ConversionError("Converted video did not use H.264.", "VIDEO_OUTPUT_VALIDATION_FAILED")
        if not options.remove_audio and probe.audio_codec not in {"aac", None}:
            raise ConversionError("Converted video did not use AAC audio.", "VIDEO_OUTPUT_VALIDATION_FAILED")
        if not output_is_faststart(output_path):
            raise ConversionError("Converted video is not fast-start optimized.", "VIDEO_OUTPUT_VALIDATION_FAILED")

    def _store_output(self, job, output_path: Path):
        digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
        artifact_id = str(uuid.uuid4())
        filename = output_video_filename(job.request_payload.get("filename") or "flowauxi-video.mp4")
        storage_key = f"file-tools/{job.owner.storage_partition}/{TOOL_KEY}/{job.id}/{artifact_id}.mp4"
        stored = self.storage.put_file(
            storage_key,
            output_path,
            "video/mp4",
            metadata={"tool_key": TOOL_KEY, "job_id": job.id, "artifact_id": artifact_id, "sha256": digest, "kind": "output"},
        )
        expires_at = utc_now() + (
            VIDEO_CONVERSION_LIMITS.authenticated_retention
            if job.owner.is_authenticated
            else VIDEO_CONVERSION_LIMITS.guest_retention
        )
        return self.repository.create_artifact(
            job,
            artifact_id,
            filename,
            "video/mp4",
            stored.size_bytes,
            digest,
            stored.provider,
            stored.key,
            expires_at,
            0,
        )

    def _store_sidecar(self, job, path: Path, filename: str, mime_type: str, kind: str) -> str:
        if not path.exists():
            return ""
        artifact_id = str(uuid.uuid4())
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        storage_key = f"file-tools/{job.owner.storage_partition}/{TOOL_KEY}/{job.id}/{kind}-{artifact_id}.jpg"
        stored = self.storage.put_file(
            storage_key,
            path,
            mime_type,
            metadata={"tool_key": TOOL_KEY, "job_id": job.id, "artifact_id": artifact_id, "sha256": digest, "kind": kind},
        )
        expires_at = utc_now() + (
            VIDEO_CONVERSION_LIMITS.authenticated_retention
            if job.owner.is_authenticated
            else VIDEO_CONVERSION_LIMITS.guest_retention
        )
        artifact = self.repository.create_artifact(
            job,
            artifact_id,
            filename,
            mime_type,
            stored.size_bytes,
            digest,
            stored.provider,
            stored.key,
            expires_at,
            0,
        )
        return artifact.id

    def _conversion_progress(self, job_id: str, progress: dict[str, object]) -> None:
        raw_percent = progress.get("percent")
        percent = None
        if isinstance(raw_percent, (int, float)):
            percent = max(10.0, min(91.0, 10.0 + (float(raw_percent) * 0.81)))
        self.repository.record_progress_event(
            job_id,
            stage="converting",
            percent=percent,
            processed_ms=progress.get("processedMs") if isinstance(progress.get("processedMs"), int) else None,
            speed=progress.get("speed") if isinstance(progress.get("speed"), (int, float)) else None,
            eta_seconds=progress.get("etaSeconds") if isinstance(progress.get("etaSeconds"), int) else None,
            event_type="progress",
        )

    def _progress(self, job_id: str, stage: str, percent: float | None = None) -> None:
        self.repository.record_progress_event(job_id, stage=stage, percent=percent, event_type="stage")

    def _raise_if_cancelled(self, job_id: str) -> None:
        if self.repository.is_cancellation_requested(job_id):
            raise ConversionError("Video conversion was cancelled.", "VIDEO_CONVERSION_CANCELLED")


def _thumbnail_second(duration_seconds: float | None) -> float:
    if not duration_seconds:
        return 0.1
    return min(max(duration_seconds * 0.15, 0.1), 5.0)
