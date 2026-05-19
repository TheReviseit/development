"""Validation helpers for the Video Converter for WhatsApp tool."""

from __future__ import annotations

import math
import os
import re
from pathlib import PurePath
from typing import Any

from ..contracts.video_converter import VideoConversionOptions, VideoUploadSessionRequest
from ..domain.entities import FileToolOwner
from ..domain.errors import ValidationError
from ..domain.policies import (
    ALLOWED_VIDEO_EXTENSIONS,
    VIDEO_CONVERSION_LIMITS,
    VIDEO_MIME_TYPES,
)


CONTENT_RANGE_RE = re.compile(r"^bytes\s+(\d+)-(\d+)/(\d+)$", re.IGNORECASE)


class VideoConverterValidator:
    """Central validator for upload manifests, chunks, and conversion options."""

    def validate_upload_session(self, request: VideoUploadSessionRequest, owner: FileToolOwner) -> None:
        extension = normalized_extension(request.filename)
        if extension not in ALLOWED_VIDEO_EXTENSIONS:
            raise ValidationError("UNSUPPORTED_VIDEO_FORMAT", "Choose a supported video file.")

        expected_mime = VIDEO_MIME_TYPES.get(extension)
        if request.declared_mime_type and expected_mime and not _mime_compatible(request.declared_mime_type, expected_mime):
            raise ValidationError("VIDEO_MIME_MISMATCH", "The video MIME type does not match the file extension.")

        max_size = max_input_bytes(owner)
        if request.total_size_bytes > max_size:
            raise ValidationError("VIDEO_TOO_LARGE", "The video file is larger than the allowed limit.")

        if request.chunk_size_bytes < VIDEO_CONVERSION_LIMITS.min_chunk_size_bytes:
            raise ValidationError("VIDEO_CHUNK_TOO_SMALL", "Upload chunks are smaller than the minimum size.")
        if request.chunk_size_bytes > VIDEO_CONVERSION_LIMITS.max_chunk_size_bytes:
            raise ValidationError("VIDEO_CHUNK_TOO_LARGE", "Upload chunks are larger than the maximum size.")
        expected_chunks = math.ceil(request.total_size_bytes / request.chunk_size_bytes)
        if request.total_chunks != expected_chunks:
            raise ValidationError("VIDEO_CHUNK_COUNT_MISMATCH", "Upload chunk count does not match the file size.")
        if request.total_chunks > VIDEO_CONVERSION_LIMITS.max_chunks:
            raise ValidationError("VIDEO_TOO_MANY_CHUNKS", "The upload has too many chunks.")

    def validate_chunk(
        self,
        *,
        session: dict[str, Any],
        chunk_index: int,
        content_range: str | None,
        chunk_sha256: str | None,
        idempotency_key: str | None,
        body_size: int,
    ) -> tuple[int, int, int]:
        if session.get("status") in {"expired", "failed", "assembled", "cancelled"}:
            raise ValidationError("UPLOAD_SESSION_CLOSED", "This upload session is no longer accepting chunks.")
        if chunk_index < 0 or chunk_index >= int(session["total_chunks"]):
            raise ValidationError("VIDEO_CHUNK_INDEX_INVALID", "Chunk index is outside the upload manifest.")
        if not idempotency_key:
            raise ValidationError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required for chunk uploads.")
        if not chunk_sha256 or not re.fullmatch(r"[0-9a-fA-F]{64}", chunk_sha256):
            raise ValidationError("CHUNK_HASH_REQUIRED", "X-Chunk-Sha256 must be a SHA-256 hex digest.")
        if not content_range:
            raise ValidationError("CONTENT_RANGE_REQUIRED", "Content-Range is required for chunk uploads.")

        match = CONTENT_RANGE_RE.match(content_range.strip())
        if not match:
            raise ValidationError("CONTENT_RANGE_INVALID", "Content-Range must use bytes start-end/total.")
        start, end, total = (int(value) for value in match.groups())
        if total != int(session["total_size_bytes"]):
            raise ValidationError("CONTENT_RANGE_INVALID", "Content-Range total does not match the upload session.")
        expected_start = chunk_index * int(session["chunk_size_bytes"])
        expected_end = min(expected_start + int(session["chunk_size_bytes"]), total) - 1
        if start != expected_start or end != expected_end:
            raise ValidationError("CONTENT_RANGE_INVALID", "Content-Range does not match the chunk index.")
        if body_size != end - start + 1:
            raise ValidationError("VIDEO_CHUNK_SIZE_MISMATCH", "Chunk body length does not match Content-Range.")
        return start, end, total

    def validate_options(self, options: VideoConversionOptions) -> None:
        if options.trim_start_seconds is not None and options.trim_end_seconds is not None:
            if options.trim_end_seconds <= options.trim_start_seconds:
                raise ValidationError("INVALID_VIDEO_TRIM", "Trim end must be after trim start.")


def sanitize_video_filename(filename: str) -> str:
    stem = PurePath(filename.replace("\\", "/")).name
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "-", stem).strip(" ._-")
    if not stem:
        stem = "flowauxi-video"
    if len(stem) > VIDEO_CONVERSION_LIMITS.max_filename_length:
        root, ext = os.path.splitext(stem)
        keep = max(1, VIDEO_CONVERSION_LIMITS.max_filename_length - len(ext))
        stem = f"{root[:keep]}{ext}"
    return stem


def output_video_filename(source_filename: str) -> str:
    source = sanitize_video_filename(source_filename)
    stem = re.sub(r"\.[^.]+$", "", source).strip(" ._-") or "flowauxi-video"
    max_stem = max(1, VIDEO_CONVERSION_LIMITS.max_filename_length - 4)
    return f"{stem[:max_stem]}.mp4"


def normalized_extension(filename: str) -> str:
    suffix = PurePath(filename.replace("\\", "/")).suffix.lower()
    return ".3gp" if suffix == ".3gpp" else suffix


def max_input_bytes(owner: FileToolOwner) -> int:
    env_key = "FILE_TOOLS_VIDEO_MAX_AUTH_BYTES" if owner.is_authenticated else "FILE_TOOLS_VIDEO_MAX_GUEST_BYTES"
    fallback = (
        VIDEO_CONVERSION_LIMITS.authenticated_max_input_bytes
        if owner.is_authenticated
        else VIDEO_CONVERSION_LIMITS.guest_max_input_bytes
    )
    return _env_int(env_key, fallback)


def max_duration_seconds(owner: FileToolOwner) -> int:
    env_key = "FILE_TOOLS_VIDEO_MAX_AUTH_DURATION_SECONDS" if owner.is_authenticated else "FILE_TOOLS_VIDEO_MAX_GUEST_DURATION_SECONDS"
    fallback = (
        VIDEO_CONVERSION_LIMITS.authenticated_max_duration_seconds
        if owner.is_authenticated
        else VIDEO_CONVERSION_LIMITS.guest_max_duration_seconds
    )
    return _env_int(env_key, fallback)


def _mime_compatible(declared: str, expected: str) -> bool:
    aliases = {
        "video/quicktime": {"video/quicktime", "video/mov"},
        "video/mp4": {"video/mp4", "application/mp4", "video/x-m4v"},
        "video/3gpp": {"video/3gpp", "video/3gp"},
        "video/mp2t": {"video/mp2t", "video/mpeg"},
    }
    return declared == expected or declared in aliases.get(expected, {expected})


def _env_int(key: str, fallback: int) -> int:
    value = os.getenv(key)
    if not value:
        return fallback
    try:
        parsed = int(value)
    except ValueError:
        return fallback
    return parsed if parsed > 0 else fallback
