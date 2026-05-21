from __future__ import annotations

import os
import time
import traceback
from typing import Any

from flask import Blueprint, jsonify, request, g

from domains.custom_domains.application.service import get_custom_domain_service, ServiceResult
from domains.custom_domains.domain.errors import DomainEngineError, DomainErrorCode

domain_bp = Blueprint("domains", __name__, url_prefix="/api/domains")


def _request_id() -> str:
    return request.headers.get("X-Request-Id") or f"dom_{int(time.time() * 1000)}"


def _json_result(result: ServiceResult):
    response = jsonify(result.body)
    response.status_code = result.status_code
    if result.replayed:
        response.headers["X-Idempotency-Replayed"] = "true"
    return response


def _error_response(exc: DomainEngineError):
    return jsonify(exc.to_dict(_request_id())), exc.status_code


def _unexpected_error_response(exc: Exception):
    request_id = _request_id()
    print(f"[DomainRoutes] Unexpected error request_id={request_id}: {type(exc).__name__}: {exc}")
    traceback.print_exc()

    message = "Domain service failed unexpectedly."
    code = DomainErrorCode.INTERNAL_ERROR.value
    status_code = 500
    if _looks_like_missing_domain_migration(exc):
        message = (
            "Custom domain database schema is missing required columns. "
            "Apply the latest custom-domain migrations through 20260521002400_domain_store_bindings.sql to Supabase, then retry."
        )
        code = DomainErrorCode.SCHEMA_MIGRATION_REQUIRED.value
        status_code = 503

    return jsonify({
        "success": False,
        "code": code,
        "message": message,
        "retryable": False,
        "nextRetryAt": None,
        "requestId": request_id,
    }), status_code


def _looks_like_missing_domain_migration(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "tenant_domains.setup_mode" in text
        or "tenant_domains.nameserver_status" in text
        or "tenant_domains.managed_dns_status" in text
        or "tenant_domains.desired_nameservers" in text
        or "tenant_domains.managed_dns_records" in text
        or "tenant_domains.resource_type" in text
        or "tenant_domains.resource_id" in text
        or "tenant_domains.canonical_store_slug" in text
        or "could not find" in text and "tenant_domains" in text and "schema cache" in text
    )


def _get_authenticated_user_id() -> str | None:
    existing = getattr(g, "user_id", None)
    if existing:
        return str(existing)

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            from firebase_admin import auth as firebase_auth
            decoded = firebase_auth.verify_id_token(token, check_revoked=True)
            user_id = decoded.get("uid")
            if user_id:
                g.user_id = user_id
                return user_id
        except Exception:
            try:
                from firebase_admin import auth as firebase_auth
                decoded = firebase_auth.verify_session_cookie(token, check_revoked=True)
                user_id = decoded.get("uid")
                if user_id:
                    g.user_id = user_id
                    return user_id
            except Exception:
                pass

    header_user = request.headers.get("X-User-ID")
    if header_user and os.getenv("FLASK_ENV", "development") != "production":
        g.user_id = header_user
        return header_user
    return None


def _require_user_id() -> str:
    user_id = _get_authenticated_user_id()
    if not user_id:
        raise DomainEngineError(DomainErrorCode.AUTH_REQUIRED, "Authentication required.", status_code=401)
    return user_id


def _require_internal_secret() -> None:
    expected = os.getenv("DOMAIN_INTERNAL_SECRET")
    if not expected:
        if _is_production_environment():
            raise DomainEngineError(DomainErrorCode.INTERNAL_ERROR, "Internal domain routing secret is not configured.", 503)
        return
    provided = request.headers.get("X-Internal-Domain-Secret")
    if provided != expected:
        raise DomainEngineError(DomainErrorCode.AUTH_REQUIRED, "Internal domain routing auth failed.", 401)


def _is_production_environment() -> bool:
    env_values = {
        os.getenv("FLASK_ENV", ""),
        os.getenv("APP_ENV", ""),
        os.getenv("ENV", ""),
        os.getenv("ENVIRONMENT", ""),
        os.getenv("PYTHON_ENV", ""),
        os.getenv("RENDER_ENV", ""),
    }
    if any(value.strip().lower() in {"production", "prod"} for value in env_values):
        return True
    return bool(os.getenv("RENDER"))


@domain_bp.errorhandler(DomainEngineError)
def handle_domain_engine_error(exc: DomainEngineError):
    return _error_response(exc)


@domain_bp.errorhandler(Exception)
def handle_unexpected_domain_error(exc: Exception):
    return _unexpected_error_response(exc)


@domain_bp.route("", methods=["GET"])
def list_domains():
    try:
        user_id = _require_user_id()
        product = request.args.get("productDomain") or request.args.get("product_domain")
        return _json_result(get_custom_domain_service().list_domains(user_id, product))
    except DomainEngineError as exc:
        return _error_response(exc)
    except Exception as exc:
        return _unexpected_error_response(exc)


@domain_bp.route("", methods=["POST"])
def add_domain():
    try:
        user_id = _require_user_id()
        payload: dict[str, Any] = request.get_json(silent=True) or {}
        raw_host = payload.get("domain") or payload.get("host")
        product_domain = payload.get("productDomain") or payload.get("product_domain") or "shop"
        setup_mode = payload.get("setupMode") or payload.get("setup_mode") or "nameserver"
        if not raw_host:
            raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Request body must include domain.", 400)
        return _json_result(
            get_custom_domain_service().add_domain(
                user_id=user_id,
                raw_host=str(raw_host),
                product_domain=str(product_domain),
                setup_mode=str(setup_mode),
                idempotency_key=request.headers.get("X-Idempotency-Key", ""),
            )
        )
    except DomainEngineError as exc:
        return _error_response(exc)
    except Exception as exc:
        return _unexpected_error_response(exc)


@domain_bp.route("/<domain_id>", methods=["GET"])
def get_domain(domain_id: str):
    try:
        return _json_result(get_custom_domain_service().get_domain(_require_user_id(), domain_id))
    except DomainEngineError as exc:
        return _error_response(exc)
    except Exception as exc:
        return _unexpected_error_response(exc)


@domain_bp.route("/<domain_id>/verify", methods=["POST"])
def verify_domain(domain_id: str):
    try:
        return _json_result(get_custom_domain_service().verify_domain(_require_user_id(), domain_id))
    except DomainEngineError as exc:
        return _error_response(exc)
    except Exception as exc:
        return _unexpected_error_response(exc)


@domain_bp.route("/<domain_id>", methods=["PATCH"])
def update_domain(domain_id: str):
    try:
        payload: dict[str, Any] = request.get_json(silent=True) or {}
        return _json_result(get_custom_domain_service().update_domain(_require_user_id(), domain_id, payload))
    except DomainEngineError as exc:
        return _error_response(exc)
    except Exception as exc:
        return _unexpected_error_response(exc)


@domain_bp.route("/<domain_id>", methods=["DELETE"])
def delete_domain(domain_id: str):
    try:
        return _json_result(get_custom_domain_service().delete_domain(_require_user_id(), domain_id))
    except DomainEngineError as exc:
        return _error_response(exc)
    except Exception as exc:
        return _unexpected_error_response(exc)


@domain_bp.route("/routing/resolve", methods=["GET"])
def resolve_routing_host():
    try:
        _require_internal_secret()
        host = request.args.get("host", "")
        if not host:
            raise DomainEngineError(DomainErrorCode.INVALID_HOST, "host query parameter is required.", 400)
        return _json_result(get_custom_domain_service().resolve_host(host))
    except DomainEngineError as exc:
        return _error_response(exc)
    except Exception as exc:
        return _unexpected_error_response(exc)
