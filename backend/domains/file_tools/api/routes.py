"""Flask blueprint for the Files Tools platform."""

from __future__ import annotations

import hashlib
import os
import uuid
from io import BytesIO

from flask import Blueprint, jsonify, request, send_file

try:
    from flask import Response, stream_with_context
except Exception:  # Keeps route import compatible with narrow Flask test doubles.
    Response = None  # type: ignore[assignment]

    def stream_with_context(generator):  # type: ignore[no-redef]
        return generator

from ..application.cleanup_service import CleanupService
from ..application.conversion_orchestrator import ConversionOrchestrator
from ..application.draft_service import DraftService
from ..application.history_service import HistoryService
from ..application.ocr_service import OcrService
from ..application.rate_limit_service import InMemoryRateLimitService
from ..application.tool_registry import ToolRegistry
from ..application.video_backpressure_service import VideoBackpressureService
from ..application.video_job_service import VideoJobService
from ..application.video_progress_service import VideoProgressService
from ..application.video_upload_service import VideoUploadService
from ..contracts.image_converter import ImageConvertRequest
from ..contracts.common import RequestContext
from ..converters.video_converter.ffmpeg_service import FfmpegService
from ..converters.video_converter.ffprobe_service import FfprobeService
from ..converters.video_converter.processing_plan import preset_payload
from ..domain.entities import FileToolOwner
from ..domain.enums import OwnerType
from ..domain.errors import FeatureDisabledError, FileToolError, NotFoundError, PermissionDeniedError
from ..domain.events import FILE_TOOL_DOWNLOADED
from ..infrastructure.observability import set_video_gauge, video_metrics_snapshot
from ..infrastructure.queue.ocr_queue import OcrQueue
from ..infrastructure.queue.video_queue import VideoQueue
from ..infrastructure.repositories import FileToolsRepository
from ..infrastructure.security.signed_downloads import verify_download_token
from ..infrastructure.storage.factory import create_artifact_storage, storage_factory_status
from ..validators.image_converter_validator import image_runtime_status, supported_output_formats
from ..validators.ocr_validator import OcrValidator
from ..validators.video_converter_validator import VideoConverterValidator
from .response_mapper import error_response, success_response, unexpected_error_response

file_tools_bp = Blueprint("file_tools", __name__, url_prefix="/api/file-tools")

_tool_registry = ToolRegistry()
_services_cache: dict | None = None


def _services() -> dict:
    global _services_cache
    if _services_cache is None:
        registry = _tool_registry
        repository = FileToolsRepository()
        storage = create_artifact_storage()
        rate_limits = InMemoryRateLimitService()
        video_validator = VideoConverterValidator()
        ocr_validator = OcrValidator()
        video_backpressure = VideoBackpressureService()
        video_queue = VideoQueue()
        ocr_queue = OcrQueue()
        _services_cache = {
            "registry": registry,
            "repository": repository,
            "storage": storage,
            "orchestrator": ConversionOrchestrator(registry, repository, storage, rate_limits),
            "drafts": DraftService(repository),
            "history": HistoryService(repository),
            "cleanup": CleanupService(repository, storage),
            "video_backpressure": video_backpressure,
            "video_queue": video_queue,
            "ocr_queue": ocr_queue,
            "ocr": OcrService(repository, storage, ocr_validator, ocr_queue),
            "video_uploads": VideoUploadService(repository, storage, video_validator, video_backpressure),
            "video_jobs": VideoJobService(repository, video_validator, video_backpressure, video_queue),
            "video_progress": VideoProgressService(repository, video_backpressure),
        }
    return _services_cache


@file_tools_bp.route("/tools", methods=["GET"])
def list_tools():
    response = jsonify({"success": True, "tools": _tool_registry.list_public()})
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=60"
    return response


@file_tools_bp.route("/health", methods=["GET"])
def file_tools_health():
    """Route-level health check used by frontend proxy and deploy gates."""
    deep = request.args.get("deep") in {"1", "true", "yes"}
    details = {}
    checks = {
        "routes": True,
        "tools_registered": bool(_tool_registry.list_public()),
        "files_tools_enabled": _feature_enabled("FILES_TOOLS_ENABLED"),
        "text_to_pdf_enabled": _feature_enabled("FILES_TEXT_TO_PDF_ENABLED"),
        "image_converter_enabled": _feature_enabled("FILES_IMAGE_CONVERTER_ENABLED"),
        "ocr_enabled": _feature_enabled("FILES_OCR_ENABLED"),
        "video_converter_enabled": _feature_enabled("FILES_VIDEO_CONVERTER_ENABLED"),
    }

    if deep:
        checks["pdf_shaping_stack"] = _pdf_shaping_stack_ready()
        checks["pdf_glyph_preflight"] = _pdf_glyph_preflight_ready()
        checks["image_conversion_stack"] = _image_conversion_stack_ready()
        details["image_conversion"] = image_runtime_status() if checks["image_conversion_stack"] else {"status": "not_ready"}
        checks["artifact_storage"], details["artifact_storage"] = _artifact_storage_status()
        checks["ocr_runtime"] = _ocr_runtime_ready()
        details["ocr"] = _services()["ocr"].health()
        checks["ffmpeg"] = FfmpegService().is_available()
        checks["ffprobe"] = FfprobeService().is_available()
        details["video"] = _video_runtime_status()

    ready = all(checks.values())
    payload = {
        "success": True,
        "status": "ready" if ready else "not_ready",
        "service": "file_tools",
        "checks": checks,
    }
    if details:
        payload["details"] = details

    return success_response(
        payload,
        200 if ready else 503,
    )


@file_tools_bp.route("/text-to-pdf/generate", methods=["POST"])
def generate_text_to_pdf():
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_TEXT_TO_PDF_ENABLED", "Text to PDF is disabled.")
        payload = request.get_json(silent=True) or {}
        result = _services()["orchestrator"].generate_text_to_pdf(payload, context)
        return success_response(result.model_dump(), 200)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/image-converter/convert", methods=["POST"])
def convert_image():
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_IMAGE_CONVERTER_ENABLED", "Image Converter is disabled.")
        image_request = ImageConvertRequest.parse_or_raise(request.files, request.form)
        result = _services()["orchestrator"].generate_image_conversion(image_request, context)
        return success_response(result.model_dump(), 200)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/image-converter/formats", methods=["GET"])
def image_converter_formats():
    response = jsonify({"success": True, "formats": image_runtime_status()})
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=60"
    return response


@file_tools_bp.route("/ocr/health", methods=["GET"])
def ocr_health():
    return success_response(_services()["ocr"].health(), 200)


@file_tools_bp.route("/ocr/upload", methods=["POST"])
def upload_ocr_image():
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_OCR_ENABLED", "OCR is disabled.")
        return success_response(_services()["ocr"].upload(request.files, request.form, context), 202)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/ocr/<job_id>", methods=["GET"])
def get_ocr_job(job_id: str):
    context = _request_context()
    try:
        return success_response(_services()["ocr"].get_job(job_id, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/ocr/<job_id>/text", methods=["GET"])
def get_ocr_text(job_id: str):
    context = _request_context()
    try:
        return success_response(_services()["ocr"].get_text(job_id, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/ocr/<job_id>/json", methods=["GET"])
def get_ocr_json(job_id: str):
    context = _request_context()
    try:
        return success_response(_services()["ocr"].get_json(job_id, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/ocr/<job_id>/retry", methods=["POST"])
def retry_ocr_job(job_id: str):
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_OCR_ENABLED", "OCR is disabled.")
        return success_response(_services()["ocr"].retry(job_id, context), 202)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/ocr/<job_id>", methods=["DELETE"])
def delete_ocr_job(job_id: str):
    context = _request_context()
    try:
        return success_response(_services()["ocr"].delete(job_id, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/presets", methods=["GET"])
def video_whatsapp_presets():
    response = jsonify({"success": True, "presets": preset_payload()})
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=60"
    return response


@file_tools_bp.route("/video-whatsapp/uploads", methods=["POST"])
def create_video_upload_session():
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_VIDEO_CONVERTER_ENABLED", "Video Converter for WhatsApp is disabled.")
        payload = request.get_json(silent=True) or {}
        return success_response(_services()["video_uploads"].create_session(payload, context), 201)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/uploads/<session_id>", methods=["GET"])
def get_video_upload_session(session_id: str):
    context = _request_context()
    try:
        return success_response(_services()["video_uploads"].get_session(session_id, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/uploads/<session_id>/chunks/<int:chunk_index>", methods=["PUT"])
def upload_video_chunk(session_id: str, chunk_index: int):
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_VIDEO_CONVERTER_ENABLED", "Video Converter for WhatsApp is disabled.")
        content = request.get_data(cache=False)
        result = _services()["video_uploads"].store_chunk(
            session_id,
            chunk_index,
            content=content,
            content_range=request.headers.get("Content-Range"),
            chunk_sha256=request.headers.get("X-Chunk-Sha256"),
            idempotency_key=request.headers.get("Idempotency-Key"),
            context=context,
        )
        return success_response(result)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/uploads/<session_id>/complete", methods=["POST"])
def complete_video_upload(session_id: str):
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_VIDEO_CONVERTER_ENABLED", "Video Converter for WhatsApp is disabled.")
        result = _services()["video_uploads"].complete_session(session_id, context, _services()["video_queue"])
        return success_response(result, 202)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/jobs", methods=["POST"])
def create_video_job():
    context = _request_context()
    try:
        _assert_feature_enabled("FILES_TOOLS_ENABLED", "Files Tools is disabled.")
        _assert_feature_enabled("FILES_VIDEO_CONVERTER_ENABLED", "Video Converter for WhatsApp is disabled.")
        payload = request.get_json(silent=True) or {}
        return success_response(_services()["video_jobs"].create_job(payload, context), 202)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/jobs/<job_id>", methods=["GET"])
def get_video_job(job_id: str):
    context = _request_context()
    try:
        return success_response(_services()["video_jobs"].get_job(job_id, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/jobs/<job_id>/cancel", methods=["POST"])
def cancel_video_job(job_id: str):
    context = _request_context()
    try:
        return success_response(_services()["video_jobs"].cancel_job(job_id, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/jobs/<job_id>/retry", methods=["POST"])
def retry_video_job(job_id: str):
    context = _request_context()
    try:
        return success_response(_services()["video_jobs"].retry_job(job_id, context), 202)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/video-whatsapp/jobs/<job_id>/events", methods=["GET"])
def stream_video_job_events(job_id: str):
    context = _request_context()
    try:
        last_event_id = request.headers.get("Last-Event-ID") or request.args.get("after") or "0"
        after = int(last_event_id) if str(last_event_id).isdigit() else 0
        stream = _services()["video_progress"].stream(job_id, context, after)
        if Response is None:
            return stream, 200, {"Content-Type": "text/event-stream", "Cache-Control": "no-store"}
        return Response(
            stream_with_context(stream),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-store",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id: str):
    context = _request_context()
    try:
        repository = _services()["repository"]
        job = repository.get_job(job_id)
        if not job:
            raise NotFoundError("Job not found.")
        _assert_owner(job.owner, context.owner)
        artifact = repository.get_artifact_for_job(job.id)
        payload = {
            "success": True,
            "job": {
                "id": job.id,
                "status": job.status.value,
                "toolKey": job.tool_key,
                "errorCode": job.error_code,
                "errorMessage": job.error_message,
            },
            "artifact": None,
        }
        if artifact:
            payload["artifact"] = {
                "id": artifact.id,
                "filename": artifact.filename,
                "sizeBytes": artifact.size_bytes,
                "expiresAt": artifact.expires_at.isoformat(),
            }
        return success_response(payload)
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/artifacts/<artifact_id>/download", methods=["GET"])
def download_artifact(artifact_id: str):
    context = _request_context()
    try:
        token = request.args.get("token", "")
        services = _services()
        repository = services["repository"]
        storage = services["storage"]
        artifact = repository.get_artifact(artifact_id)
        if not artifact:
            raise NotFoundError("Artifact not found.")
        _assert_owner(artifact.owner, context.owner)
        verify_download_token(token, artifact_id, context.owner.token_subject)
        content = storage.get_bytes(artifact.storage_key)
        repository.increment_download_count(artifact.id)
        repository.record_event(
            context.owner,
            FILE_TOOL_DOWNLOADED,
            artifact.tool_key,
            {"artifact_id": artifact.id, "job_id": artifact.job_id},
        )
        return send_file(
            BytesIO(content),
            mimetype=artifact.mime_type,
            as_attachment=True,
            download_name=artifact.filename,
            max_age=0,
        )
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/history", methods=["GET"])
def list_history():
    context = _request_context()
    try:
        return success_response(_services()["history"].list_history(context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/drafts/text-to-pdf", methods=["GET"])
def get_text_to_pdf_draft():
    context = _request_context()
    try:
        return success_response({"success": True, "draft": _services()["drafts"].get_text_to_pdf_draft(context)})
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/drafts/text-to-pdf", methods=["PUT"])
def save_text_to_pdf_draft():
    context = _request_context()
    try:
        payload = request.get_json(silent=True) or {}
        return success_response(_services()["drafts"].save_text_to_pdf_draft(payload, context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/drafts/text-to-pdf", methods=["DELETE"])
def delete_text_to_pdf_draft():
    context = _request_context()
    try:
        return success_response(_services()["drafts"].delete_text_to_pdf_draft(context))
    except FileToolError as exc:
        return error_response(exc, context.request_id)
    except Exception:
        return unexpected_error_response(context.request_id)


@file_tools_bp.route("/internal/cleanup", methods=["POST"])
def cleanup_expired():
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    expected = os.getenv("ADMIN_API_KEY") or os.getenv("FILE_TOOLS_CLEANUP_ADMIN_KEY")
    provided = request.headers.get("X-Admin-Api-Key") or request.headers.get("Authorization", "").replace("Bearer ", "")
    if not expected or provided != expected:
        return error_response(PermissionDeniedError("Invalid cleanup credentials."), request_id)
    try:
        return success_response(_services()["cleanup"].cleanup_expired())
    except FileToolError as exc:
        return error_response(exc, request_id)
    except Exception:
        return unexpected_error_response(request_id)


def _request_context() -> RequestContext:
    user_id = request.headers.get("X-User-Id") or ""
    guest_id = request.headers.get("X-Guest-Session") or ""
    tenant_id = _uuid_or_none(request.headers.get("X-Tenant-Id"))
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    ip_address = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr

    if user_id:
        owner = FileToolOwner(OwnerType.USER, user_id, tenant_id)
    else:
        if not guest_id:
            raw = f"{ip_address}:{request.headers.get('User-Agent', '')}"
            guest_id = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        owner = FileToolOwner(OwnerType.GUEST, guest_id, tenant_id)

    return RequestContext(
        owner=owner,
        request_id=request_id,
        ip_address=ip_address,
        user_agent=request.headers.get("User-Agent"),
    )


def _assert_owner(resource_owner: FileToolOwner, request_owner: FileToolOwner) -> None:
    if resource_owner.owner_type != request_owner.owner_type or resource_owner.owner_id != request_owner.owner_id:
        raise PermissionDeniedError()


def _assert_feature_enabled(env_key: str, message: str) -> None:
    if not _feature_enabled(env_key):
        raise FeatureDisabledError(message)


def _feature_enabled(env_key: str) -> bool:
    return os.getenv(env_key, "true").lower() not in {"0", "false", "off", "disabled"}


def _uuid_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def _pdf_shaping_stack_ready() -> bool:
    try:
        from lib.fonts.pdf_font_engine import assert_shaping_stack_available

        assert_shaping_stack_available()
        return True
    except Exception:
        return False


def _pdf_glyph_preflight_ready() -> bool:
    try:
        from lib.fonts.pdf_font_engine import preflight_texts

        preflight_texts("Auto", ["Flowauxi", "தமிழ்", "हिन्दी", "മലയാളം", "ಕನ್ನಡ", "తెలుగు"])
        return True
    except Exception:
        return False


def _image_conversion_stack_ready() -> bool:
    try:
        return bool(supported_output_formats())
    except Exception:
        return False


def _ocr_runtime_ready() -> bool:
    try:
        return bool(_services()["ocr"].health().get("available"))
    except Exception:
        return False


def _artifact_storage_status() -> tuple[bool, dict[str, object]]:
    try:
        storage = create_artifact_storage()
        storage.health_check()
        return True, {"status": "ready", "provider": storage.provider, "factory": storage_factory_status()}
    except Exception as exc:
        return False, {
            "status": "not_ready",
            "code": getattr(exc, "code", "STORAGE_ERROR"),
            "message": getattr(exc, "message", "Artifact storage is not ready."),
            "factory": storage_factory_status(),
        }


def _video_runtime_status() -> dict[str, object]:
    backpressure = _services().get("video_backpressure")
    ingest_depth = backpressure.queue_depth("video_ingest") if backpressure else 0
    video_depth = backpressure.queue_depth("video") if backpressure else 0
    set_video_gauge("file_tools_video_ingest_queue_depth", ingest_depth)
    set_video_gauge("file_tools_video_queue_depth", video_depth)
    return {
        "ffmpeg": FfmpegService().version(),
        "ffprobe": FfprobeService().version(),
        "queues": {
            "video_ingest": ingest_depth,
            "video": video_depth,
        },
        "metrics": video_metrics_snapshot(),
    }
