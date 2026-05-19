"""Contracts for the Video Converter for WhatsApp tool."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from ..domain.errors import ValidationError
from ..domain.policies import (
    VIDEO_CONVERSION_LIMITS,
    VIDEO_PRESETS,
    VIDEO_RESOLUTION_PRESETS,
)


TOOL_KEY = "video_whatsapp_converter"
API_NAMESPACE = "video-whatsapp"


@dataclass(frozen=True)
class VideoUploadSessionRequest:
    filename: str
    declared_mime_type: str
    total_size_bytes: int
    chunk_size_bytes: int
    total_chunks: int
    sha256: Optional[str]
    batch_id: Optional[str]

    @classmethod
    def parse_or_raise(cls, payload: dict[str, Any]) -> "VideoUploadSessionRequest":
        filename = str(payload.get("filename") or "").strip()
        if not filename:
            raise ValidationError("VIDEO_FILENAME_REQUIRED", "A source filename is required.")

        declared_mime_type = str(payload.get("declaredMimeType") or payload.get("mimeType") or "").strip().lower()
        total_size_bytes = _positive_int(payload.get("totalSizeBytes"), "VIDEO_SIZE_REQUIRED")
        chunk_size_bytes = int(payload.get("chunkSizeBytes") or VIDEO_CONVERSION_LIMITS.default_chunk_size_bytes)
        total_chunks = _positive_int(payload.get("totalChunks"), "VIDEO_CHUNK_COUNT_REQUIRED")
        sha256 = _optional_sha256(payload.get("sha256"))
        batch_id = _optional_token(payload.get("batchId"), "batchId")

        return cls(
            filename=filename,
            declared_mime_type=declared_mime_type,
            total_size_bytes=total_size_bytes,
            chunk_size_bytes=chunk_size_bytes,
            total_chunks=total_chunks,
            sha256=sha256,
            batch_id=batch_id,
        )


@dataclass(frozen=True)
class VideoConversionOptions:
    quality_preset: str = "whatsapp_optimized"
    resolution_preset: str = "720p"
    normalize_fps: bool = True
    normalize_audio: bool = False
    remove_audio: bool = False
    bitrate_kbps: Optional[int] = None
    trim_start_seconds: Optional[float] = None
    trim_end_seconds: Optional[float] = None
    generate_thumbnail: bool = True
    generate_poster: bool = True

    @classmethod
    def parse_or_raise(cls, payload: dict[str, Any] | None) -> "VideoConversionOptions":
        data = payload or {}
        quality_preset = str(data.get("qualityPreset") or "whatsapp_optimized").strip()
        resolution_preset = str(data.get("resolutionPreset") or "720p").strip()
        if quality_preset not in VIDEO_PRESETS:
            raise ValidationError("INVALID_VIDEO_PRESET", "Choose a supported quality preset.")
        if resolution_preset not in VIDEO_RESOLUTION_PRESETS:
            raise ValidationError("INVALID_VIDEO_RESOLUTION", "Choose a supported resolution preset.")

        trim_start = _optional_seconds(data.get("trimStartSeconds"), "INVALID_VIDEO_TRIM")
        trim_end = _optional_seconds(data.get("trimEndSeconds"), "INVALID_VIDEO_TRIM")
        if trim_start is not None and trim_end is not None and trim_end <= trim_start:
            raise ValidationError("INVALID_VIDEO_TRIM", "Trim end must be after trim start.")

        bitrate = data.get("bitrateKbps")
        bitrate_kbps = None
        if bitrate not in {None, ""}:
            try:
                bitrate_kbps = int(bitrate)
            except (TypeError, ValueError) as exc:
                raise ValidationError("INVALID_VIDEO_BITRATE", "Bitrate must be a number.") from exc
            if bitrate_kbps < 128 or bitrate_kbps > 20_000:
                raise ValidationError("INVALID_VIDEO_BITRATE", "Bitrate is outside the supported range.")

        return cls(
            quality_preset=quality_preset,
            resolution_preset=resolution_preset,
            normalize_fps=bool(data.get("normalizeFps", True)),
            normalize_audio=bool(data.get("normalizeAudio", False)),
            remove_audio=bool(data.get("removeAudio", False)),
            bitrate_kbps=bitrate_kbps,
            trim_start_seconds=trim_start,
            trim_end_seconds=trim_end,
            generate_thumbnail=bool(data.get("generateThumbnail", True)),
            generate_poster=bool(data.get("generatePoster", True)),
        )

    def to_payload(self) -> dict[str, Any]:
        return {
            "qualityPreset": self.quality_preset,
            "resolutionPreset": self.resolution_preset,
            "normalizeFps": self.normalize_fps,
            "normalizeAudio": self.normalize_audio,
            "removeAudio": self.remove_audio,
            "bitrateKbps": self.bitrate_kbps,
            "trimStartSeconds": self.trim_start_seconds,
            "trimEndSeconds": self.trim_end_seconds,
            "generateThumbnail": self.generate_thumbnail,
            "generatePoster": self.generate_poster,
        }


@dataclass(frozen=True)
class VideoJobCreateRequest:
    upload_session_id: str
    options: VideoConversionOptions
    idempotency_key: Optional[str]

    @classmethod
    def parse_or_raise(cls, payload: dict[str, Any]) -> "VideoJobCreateRequest":
        upload_session_id = _required_uuidish(payload.get("uploadSessionId"), "UPLOAD_SESSION_REQUIRED")
        idempotency_key = _optional_token(payload.get("idempotencyKey"), "idempotencyKey")
        return cls(
            upload_session_id=upload_session_id,
            options=VideoConversionOptions.parse_or_raise(payload.get("options")),
            idempotency_key=idempotency_key,
        )


def _positive_int(value: Any, code: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(code, "A positive number is required.") from exc
    if parsed <= 0:
        raise ValidationError(code, "A positive number is required.")
    return parsed


def _optional_seconds(value: Any, code: str) -> float | None:
    if value in {None, ""}:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(code, "Trim values must be numeric seconds.") from exc
    if parsed < 0:
        raise ValidationError(code, "Trim values must be positive.")
    return parsed


def _optional_sha256(value: Any) -> str | None:
    if value in {None, ""}:
        return None
    normalized = str(value).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", normalized):
        raise ValidationError("INVALID_VIDEO_HASH", "SHA-256 must be a 64-character hex digest.")
    return normalized


def _optional_token(value: Any, field: str) -> str | None:
    if value in {None, ""}:
        return None
    normalized = str(value).strip()
    if len(normalized) > 160:
        raise ValidationError("INVALID_VIDEO_TOKEN", f"{field} is too long.")
    if not re.fullmatch(r"[A-Za-z0-9._:-]+", normalized):
        raise ValidationError("INVALID_VIDEO_TOKEN", f"{field} contains unsupported characters.")
    return normalized


def _required_uuidish(value: Any, code: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValidationError(code, "Upload session is required.")
    if len(normalized) > 80 or not re.fullmatch(r"[A-Za-z0-9-]+", normalized):
        raise ValidationError(code, "Upload session is invalid.")
    return normalized
