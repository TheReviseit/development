"""Contracts for image OCR requests and responses."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from werkzeug.datastructures import FileStorage, ImmutableMultiDict

from ..domain.errors import ValidationError

TOOL_KEY = "ocr"


@dataclass(frozen=True)
class OcrUploadRequest:
    file_bytes: bytes
    filename: str
    declared_mime_type: str
    idempotency_key: str | None = None

    @property
    def normalized_payload(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "declaredMimeType": self.declared_mime_type,
            "inputSizeBytes": len(self.file_bytes),
            "idempotencyKey": self.idempotency_key,
        }

    @classmethod
    def parse_or_raise(
        cls,
        files: ImmutableMultiDict[str, FileStorage],
        form: ImmutableMultiDict[str, str],
    ) -> "OcrUploadRequest":
        uploaded = files.get("file")
        if uploaded is None or not uploaded.filename:
            raise ValidationError("OCR_FILE_REQUIRED", "Add an image before extracting text.")

        file_bytes = uploaded.read()
        if not file_bytes:
            raise ValidationError("OCR_FILE_REQUIRED", "Add an image before extracting text.")

        return cls(
            file_bytes=file_bytes,
            filename=(uploaded.filename or "image").strip(),
            declared_mime_type=(uploaded.mimetype or "").strip().lower(),
            idempotency_key=_parse_idempotency_key(form.get("idempotencyKey")),
        )


def _parse_idempotency_key(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 160:
        raise ValidationError("OCR_INVALID_REQUEST", "Idempotency key is too long.")
    return normalized

