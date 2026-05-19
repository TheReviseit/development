import hashlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domains.file_tools.application.video_upload_service import VideoUploadService
from domains.file_tools.application.video_backpressure_service import VideoBackpressureService
from domains.file_tools.application.video_conversion_service import VideoConversionService
from domains.file_tools.contracts.common import RequestContext
from domains.file_tools.contracts.video_converter import VideoConversionOptions, VideoUploadSessionRequest
from domains.file_tools.converters.video_converter.ffmpeg_service import FfmpegService
from domains.file_tools.converters.video_converter.ffprobe_service import VideoProbeResult
from domains.file_tools.converters.video_converter.processing_plan import build_processing_plan
from domains.file_tools.domain.entities import FileToolOwner
from domains.file_tools.domain.enums import OwnerType
from domains.file_tools.domain.errors import ConflictError, GoneError, ValidationError
from domains.file_tools.infrastructure.repositories import FileToolsRepository
from domains.file_tools.infrastructure.storage.local_dev_storage import LocalDevStorage
from domains.file_tools.validators.video_converter_validator import VideoConverterValidator

MIN_CHUNK = 1024 * 1024


@pytest.fixture(autouse=True)
def reset_file_tool_memory():
    FileToolsRepository._memory_jobs.clear()
    FileToolsRepository._memory_artifacts.clear()
    FileToolsRepository._memory_drafts.clear()
    FileToolsRepository._memory_events.clear()
    FileToolsRepository._memory_upload_sessions.clear()
    FileToolsRepository._memory_upload_chunks.clear()
    FileToolsRepository._memory_progress_events.clear()
    yield
    FileToolsRepository._memory_jobs.clear()
    FileToolsRepository._memory_artifacts.clear()
    FileToolsRepository._memory_drafts.clear()
    FileToolsRepository._memory_events.clear()
    FileToolsRepository._memory_upload_sessions.clear()
    FileToolsRepository._memory_upload_chunks.clear()
    FileToolsRepository._memory_progress_events.clear()


def context() -> RequestContext:
    return RequestContext(
        owner=FileToolOwner(OwnerType.GUEST, "video-test-guest"),
        request_id="req-video-test",
        ip_address="127.0.0.1",
    )


def upload_service(tmp_path: Path) -> VideoUploadService:
    return VideoUploadService(
        FileToolsRepository(supabase_client=None),
        LocalDevStorage(str(tmp_path)),
        VideoConverterValidator(),
        VideoBackpressureService(redis_client=None),
    )


def test_upload_session_validates_chunk_manifest():
    request = VideoUploadSessionRequest.parse_or_raise(
        {
            "filename": "clip.mov",
            "declaredMimeType": "video/quicktime",
            "totalSizeBytes": MIN_CHUNK * 2,
            "chunkSizeBytes": MIN_CHUNK,
            "totalChunks": 2,
        }
    )

    VideoConverterValidator().validate_upload_session(request, context().owner)

    bad = VideoUploadSessionRequest.parse_or_raise(
        {
            "filename": "clip.exe",
            "declaredMimeType": "application/octet-stream",
            "totalSizeBytes": MIN_CHUNK * 2,
            "chunkSizeBytes": MIN_CHUNK,
            "totalChunks": 2,
        }
    )
    with pytest.raises(ValidationError) as exc:
        VideoConverterValidator().validate_upload_session(bad, context().owner)
    assert exc.value.code == "UNSUPPORTED_VIDEO_FORMAT"


def test_chunk_upload_is_idempotent_and_conflicting_hash_rejected(tmp_path):
    service = upload_service(tmp_path)
    ctx = context()
    session = service.create_session(
        {
            "filename": "clip.mp4",
            "declaredMimeType": "video/mp4",
            "totalSizeBytes": MIN_CHUNK * 2,
            "chunkSizeBytes": MIN_CHUNK,
            "totalChunks": 2,
        },
        ctx,
    )["uploadSession"]
    body = b"a" * MIN_CHUNK
    digest = hashlib.sha256(body).hexdigest()

    first = service.store_chunk(
        session["id"],
        0,
        content=body,
        content_range=f"bytes 0-{MIN_CHUNK - 1}/{MIN_CHUNK * 2}",
        chunk_sha256=digest,
        idempotency_key="chunk-0",
        context=ctx,
    )
    duplicate = service.store_chunk(
        session["id"],
        0,
        content=body,
        content_range=f"bytes 0-{MIN_CHUNK - 1}/{MIN_CHUNK * 2}",
        chunk_sha256=digest,
        idempotency_key="chunk-0",
        context=ctx,
    )
    assert first["chunk"]["sha256"] == duplicate["chunk"]["sha256"]

    other = b"b" * MIN_CHUNK
    with pytest.raises(ConflictError):
        service.store_chunk(
            session["id"],
            0,
            content=other,
            content_range=f"bytes 0-{MIN_CHUNK - 1}/{MIN_CHUNK * 2}",
            chunk_sha256=hashlib.sha256(other).hexdigest(),
            idempotency_key="chunk-0b",
            context=ctx,
        )


def test_expired_session_rejects_chunk_with_gone(tmp_path):
    service = upload_service(tmp_path)
    ctx = context()
    session = service.create_session(
        {
            "filename": "clip.webm",
            "declaredMimeType": "video/webm",
            "totalSizeBytes": MIN_CHUNK,
            "chunkSizeBytes": MIN_CHUNK,
            "totalChunks": 1,
        },
        ctx,
    )["uploadSession"]
    service.repository.update_upload_session(session["id"], {"expires_at": "2000-01-01T00:00:00+00:00"})

    with pytest.raises(GoneError):
        service.store_chunk(
            session["id"],
            0,
            content=b"a" * MIN_CHUNK,
            content_range=f"bytes 0-{MIN_CHUNK - 1}/{MIN_CHUNK}",
            chunk_sha256=hashlib.sha256(b"a" * MIN_CHUNK).hexdigest(),
            idempotency_key="late",
            context=ctx,
        )


def test_whatsapp_preset_builds_faststart_h264_aac_command(tmp_path):
    options = VideoConversionOptions.parse_or_raise({"qualityPreset": "whatsapp_optimized", "resolutionPreset": "720p"})
    plan = build_processing_plan(options, tmp_path / "in.mov", tmp_path / "out.mp4")

    args = plan.ffmpeg_args("ffmpeg")

    assert "-c:v" in args
    assert "libx264" in args
    assert "-c:a" in args
    assert "aac" in args
    assert "-movflags" in args
    assert "+faststart" in args
    assert "-progress" in args
    assert "pipe:1" in args
    assert "0:a:0?" in args


def test_probe_validation_allows_multiple_audio_tracks():
    probe = VideoProbeResult(
        container="mov,mp4,m4a,3gp,3g2,mj2",
        duration_seconds=12.0,
        width=1280,
        height=720,
        fps=30.0,
        video_codec="h264",
        audio_codec="aac",
        audio_streams=2,
        video_streams=1,
        bit_rate=1000000,
        raw={},
    )
    job = type("Job", (), {"owner": context().owner})()

    VideoConversionService._validate_probe(VideoConversionService.__new__(VideoConversionService), job, probe)


def test_ffmpeg_progress_reader_does_not_block_on_noisy_stderr(tmp_path):
    fake_ffmpeg = tmp_path / "fake_ffmpeg.py"
    fake_ffmpeg.write_text(
        "import sys\n"
        "sys.stderr.write('x' * 200000)\n"
        "sys.stderr.flush()\n"
        "sys.stdout.write('out_time_ms=1000000\\nprogress=end\\n')\n"
        "sys.stdout.flush()\n",
        encoding="utf-8",
    )
    progress: list[dict[str, object]] = []

    FfmpegService(binary=sys.executable)._run_ffmpeg_progress(
        [sys.executable, str(fake_ffmpeg)],
        duration_ms=1000,
        on_progress=progress.append,
        should_cancel=lambda: False,
    )

    assert progress
    assert progress[-1]["percent"] == 99.0
