"""Validation for image-only OCR inputs."""

from __future__ import annotations

import os
import re
from pathlib import PurePath

from ..contracts.ocr import OcrUploadRequest
from ..domain.entities import FileToolOwner
from ..domain.errors import ValidationError
from ..domain.policies import OCR_IMAGE_EXTENSIONS, OCR_IMAGE_MIME_TYPES, OCR_LIMITS
from .image_converter_validator import FORMAT_EXTENSIONS, inspect_image, sniff_image_format, supported_input_formats

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._ -]+")


class OcrValidator:
    def validate_upload(self, request: OcrUploadRequest, owner: FileToolOwner) -> dict[str, object]:
        if len(request.file_bytes) > max_input_bytes(owner):
            raise ValidationError("OCR_FILE_TOO_LARGE", "Image file is too large for OCR.")

        extension = PurePath(request.filename.replace("\\", "/")).suffix.lower()
        if extension in {".pdf", ".heic", ".heif", ".avif"}:
            raise ValidationError("OCR_UNSUPPORTED_INPUT", "OCR currently supports image files only. PDF and HEIC OCR are not available yet.")
        if extension and extension not in OCR_IMAGE_EXTENSIONS:
            raise ValidationError("OCR_UNSUPPORTED_INPUT", "This image format is not supported for OCR.")

        sniffed = sniff_image_format(request.file_bytes)
        if sniffed not in OCR_IMAGE_MIME_TYPES:
            raise ValidationError("OCR_UNSUPPORTED_INPUT", "This image format is not supported for OCR.")
        if sniffed not in supported_input_formats():
            raise ValidationError("OCR_UNSUPPORTED_INPUT", "This image decoder is not available on this server.")

        if extension:
            normalized_ext = "jpeg" if extension in {".jpg", ".jpeg"} else extension.lstrip(".")
            if normalized_ext == "tif":
                normalized_ext = "tiff"
            if normalized_ext not in FORMAT_EXTENSIONS.get(sniffed, set()):
                raise ValidationError("OCR_MIME_MISMATCH", "The image extension does not match its content.")

        if request.declared_mime_type:
            allowed_mimes = OCR_IMAGE_MIME_TYPES.get(sniffed, set())
            if request.declared_mime_type not in allowed_mimes:
                raise ValidationError("OCR_MIME_MISMATCH", "The uploaded image MIME type is not supported for OCR.")

        inspection = inspect_image(request.file_bytes, expected_format=sniffed)
        if inspection.megapixels > max_megapixels(owner):
            raise ValidationError("OCR_IMAGE_TOO_LARGE", "Image dimensions are too large for OCR.")

        return {
            "format": inspection.format,
            "width": inspection.width,
            "height": inspection.height,
            "megapixels": inspection.megapixels,
            "hasAlpha": inspection.has_alpha,
        }


def sanitize_ocr_filename(filename: str) -> str:
    stem = PurePath(filename.replace("\\", "/")).name
    stem = _SAFE_NAME_RE.sub("-", stem).strip(" ._-")
    if not stem:
        stem = "flowauxi-ocr-image"
    if len(stem) > OCR_LIMITS.max_filename_length:
        root, ext = os.path.splitext(stem)
        keep = max(1, OCR_LIMITS.max_filename_length - len(ext))
        stem = f"{root[:keep]}{ext}"
    return stem


def max_input_bytes(owner: FileToolOwner) -> int:
    env_key = "FILES_OCR_MAX_AUTH_BYTES" if owner.is_authenticated else "FILES_OCR_MAX_GUEST_BYTES"
    fallback = OCR_LIMITS.authenticated_max_input_bytes if owner.is_authenticated else OCR_LIMITS.guest_max_input_bytes
    return _env_int(env_key, fallback)


def max_megapixels(owner: FileToolOwner) -> int:
    env_key = "FILES_OCR_MAX_AUTH_MEGAPIXELS" if owner.is_authenticated else "FILES_OCR_MAX_GUEST_MEGAPIXELS"
    fallback = OCR_LIMITS.authenticated_max_megapixels if owner.is_authenticated else OCR_LIMITS.guest_max_megapixels
    return _env_int(env_key, fallback)


def _env_int(key: str, fallback: int) -> int:
    value = os.getenv(key)
    if not value:
        return fallback
    try:
        parsed = int(value)
    except ValueError:
        return fallback
    return parsed if parsed > 0 else fallback

