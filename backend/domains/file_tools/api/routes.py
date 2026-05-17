"""Flask blueprint for the Files Tools platform."""

from __future__ import annotations

import hashlib
import os
import uuid
from io import BytesIO

from flask import Blueprint, jsonify, request, send_file

from ..application.cleanup_service import CleanupService
from ..application.conversion_orchestrator import ConversionOrchestrator
from ..application.draft_service import DraftService
from ..application.history_service import HistoryService
from ..application.rate_limit_service import InMemoryRateLimitService
from ..application.tool_registry import ToolRegistry
from ..contracts.common import RequestContext
from ..domain.entities import FileToolOwner
from ..domain.enums import OwnerType
from ..domain.errors import FeatureDisabledError, FileToolError, NotFoundError, PermissionDeniedError
from ..domain.events import FILE_TOOL_DOWNLOADED
from ..infrastructure.repositories import FileToolsRepository
from ..infrastructure.security.signed_downloads import verify_download_token
from ..infrastructure.storage.r2_storage import create_artifact_storage
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
        _services_cache = {
            "registry": registry,
            "repository": repository,
            "storage": storage,
            "orchestrator": ConversionOrchestrator(registry, repository, storage, rate_limits),
            "drafts": DraftService(repository),
            "history": HistoryService(repository),
            "cleanup": CleanupService(repository, storage),
        }
    return _services_cache


@file_tools_bp.route("/tools", methods=["GET"])
def list_tools():
    response = jsonify({"success": True, "tools": _tool_registry.list_public()})
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=60"
    return response


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
    tenant_id = request.headers.get("X-Tenant-Id") or None
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
    if os.getenv(env_key, "true").lower() in {"0", "false", "off", "disabled"}:
        raise FeatureDisabledError(message)
