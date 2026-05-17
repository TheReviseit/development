"""Signed download token generation and verification."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass

from ...domain.errors import PermissionDeniedError
from ...domain.policies import TEXT_TO_PDF_LIMITS


@dataclass(frozen=True)
class DownloadClaims:
    artifact_id: str
    subject: str
    expires_at: int


def _secret() -> bytes:
    value = os.getenv("FILES_SIGNING_SECRET") or os.getenv("RESOURCE_SIGNING_SECRET")
    if not value:
        value = "local-dev-files-tools-signing-secret"
    return value.encode("utf-8")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def create_download_token(artifact_id: str, subject: str, ttl_seconds: int | None = None) -> str:
    expires_at = int(time.time()) + (ttl_seconds or TEXT_TO_PDF_LIMITS.signed_download_ttl_seconds)
    payload = {
        "artifact_id": artifact_id,
        "subject": subject,
        "exp": expires_at,
        "nonce": secrets.token_urlsafe(12),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded_payload = _b64url(payload_bytes)
    signature = hmac.new(_secret(), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded_payload}.{_b64url(signature)}"


def verify_download_token(token: str, artifact_id: str, subject: str) -> DownloadClaims:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected_signature = hmac.new(_secret(), encoded_payload.encode("ascii"), hashlib.sha256).digest()
        provided_signature = _b64url_decode(encoded_signature)
        if not hmac.compare_digest(expected_signature, provided_signature):
            raise PermissionDeniedError("Invalid download token.")

        payload = json.loads(_b64url_decode(encoded_payload))
        if payload.get("artifact_id") != artifact_id or payload.get("subject") != subject:
            raise PermissionDeniedError("Download token does not match this artifact.")
        if int(payload.get("exp", 0)) < int(time.time()):
            raise PermissionDeniedError("Download token has expired.")

        return DownloadClaims(
            artifact_id=payload["artifact_id"],
            subject=payload["subject"],
            expires_at=int(payload["exp"]),
        )
    except PermissionDeniedError:
        raise
    except Exception as exc:
        raise PermissionDeniedError("Invalid download token.") from exc
