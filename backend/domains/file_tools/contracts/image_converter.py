"""Contracts and parsing helpers for image conversion requests."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from werkzeug.datastructures import FileStorage, ImmutableMultiDict

from ..domain.errors import ValidationError
from ..domain.policies import (
    ALLOWED_IMAGE_OUTPUT_FORMATS,
    IMAGE_CONVERSION_LIMITS,
)

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


@dataclass(frozen=True)
class ImageConvertRequest:
    file_bytes: bytes
    filename: str
    declared_mime_type: str
    output_format: str
    quality: Optional[int]
    background: str
    idempotencyKey: Optional[str] = None

    @property
    def normalized_payload(self) -> dict[str, object]:
        return {
            "filename": self.filename,
            "declaredMimeType": self.declared_mime_type,
            "inputSizeBytes": len(self.file_bytes),
            "outputFormat": self.output_format,
            "quality": self.quality,
            "background": self.background,
            "idempotencyKey": self.idempotencyKey,
        }

    @classmethod
    def parse_or_raise(
        cls,
        files: ImmutableMultiDict[str, FileStorage],
        form: ImmutableMultiDict[str, str],
    ) -> "ImageConvertRequest":
        uploaded = files.get("file")
        if uploaded is None or not uploaded.filename:
            raise ValidationError("IMAGE_FILE_REQUIRED", "Add an image before converting.")

        file_bytes = uploaded.read()
        if not file_bytes:
            raise ValidationError("IMAGE_FILE_REQUIRED", "Add an image before converting.")

        output_format = _normalize_output_format(form.get("outputFormat"))
        quality = _parse_quality(form.get("quality"))
        background = _parse_background(form.get("background"))
        idempotency_key = _parse_idempotency_key(form.get("idempotencyKey"))

        return cls(
            file_bytes=file_bytes,
            filename=(uploaded.filename or "image").strip(),
            declared_mime_type=(uploaded.mimetype or "").strip().lower(),
            output_format=output_format,
            quality=quality,
            background=background,
            idempotencyKey=idempotency_key,
        )


def default_quality_for(output_format: str) -> int | None:
    if output_format == "jpeg":
        return IMAGE_CONVERSION_LIMITS.default_jpeg_quality
    if output_format == "webp":
        return IMAGE_CONVERSION_LIMITS.default_webp_quality
    if output_format == "avif":
        return IMAGE_CONVERSION_LIMITS.default_avif_quality
    return None


def _normalize_output_format(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized == "jpg":
        normalized = "jpeg"
    if normalized not in ALLOWED_IMAGE_OUTPUT_FORMATS:
        raise ValidationError("UNSUPPORTED_OUTPUT_FORMAT", "Choose a supported output format.")
    return normalized


def _parse_quality(value: str | None) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        quality = int(value)
    except ValueError as exc:
        raise ValidationError("INVALID_IMAGE_FILE", "Image quality must be a number from 1 to 100.") from exc
    if quality < 1 or quality > 100:
        raise ValidationError("INVALID_IMAGE_FILE", "Image quality must be between 1 and 100.")
    return quality


def _parse_background(value: str | None) -> str:
    background = (value or "#ffffff").strip()
    if not HEX_COLOR_RE.match(background):
        raise ValidationError("INVALID_IMAGE_FILE", "Background color must be a hex color.")
    return background.lower()


def _parse_idempotency_key(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 120:
        raise ValidationError("INVALID_IMAGE_FILE", "Idempotency key is too long.")
    return normalized
