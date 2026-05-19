"""Central policy values for the file tools domain."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta


@dataclass(frozen=True)
class TextPdfLimits:
    guest_character_limit: int = 50_000
    authenticated_character_limit: int = 250_000
    max_pdf_size_bytes: int = 25 * 1024 * 1024
    max_pages: int = 200
    guest_retention: timedelta = timedelta(hours=24)
    authenticated_retention: timedelta = timedelta(days=30)
    draft_retention: timedelta = timedelta(days=30)
    guest_generate_per_minute: int = 10
    authenticated_generate_per_minute: int = 30
    signed_download_ttl_seconds: int = 600


TEXT_TO_PDF_LIMITS = TextPdfLimits()


@dataclass(frozen=True)
class ImageConversionLimits:
    guest_max_input_bytes: int = 15 * 1024 * 1024
    authenticated_max_input_bytes: int = 50 * 1024 * 1024
    guest_max_megapixels: int = 25
    authenticated_max_megapixels: int = 80
    max_output_bytes: int = 50 * 1024 * 1024
    max_filename_length: int = 180
    conversion_timeout_seconds: float = 45.0
    guest_retention: timedelta = timedelta(hours=24)
    authenticated_retention: timedelta = timedelta(days=30)
    default_jpeg_quality: int = 92
    default_webp_quality: int = 82
    default_avif_quality: int = 70


IMAGE_CONVERSION_LIMITS = ImageConversionLimits()


@dataclass(frozen=True)
class OcrLimits:
    guest_max_input_bytes: int = 15 * 1024 * 1024
    authenticated_max_input_bytes: int = 50 * 1024 * 1024
    guest_max_megapixels: int = 25
    authenticated_max_megapixels: int = 80
    timeout_seconds: int = 120
    max_filename_length: int = 180
    guest_retention: timedelta = timedelta(hours=24)
    authenticated_retention: timedelta = timedelta(days=30)
    max_runtime_languages: int = 8


OCR_LIMITS = OcrLimits()

OCR_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".tif",
    ".tiff",
    ".bmp",
}

OCR_IMAGE_MIME_TYPES = {
    "png": {"image/png"},
    "jpeg": {"image/jpeg", "image/jpg"},
    "webp": {"image/webp"},
    "tiff": {"image/tiff", "image/x-tiff"},
    "bmp": {"image/bmp", "image/x-ms-bmp"},
}


@dataclass(frozen=True)
class VideoConversionLimits:
    guest_max_input_bytes: int = 256 * 1024 * 1024
    authenticated_max_input_bytes: int = 2 * 1024 * 1024 * 1024
    guest_max_duration_seconds: int = 10 * 60
    authenticated_max_duration_seconds: int = 60 * 60
    default_chunk_size_bytes: int = 8 * 1024 * 1024
    min_chunk_size_bytes: int = 1 * 1024 * 1024
    max_chunk_size_bytes: int = 32 * 1024 * 1024
    max_chunks: int = 4096
    upload_session_ttl_seconds: int = 24 * 60 * 60
    assembly_timeout_seconds: int = 30 * 60
    conversion_timeout_seconds: int = 90 * 60
    cancel_grace_seconds: float = 8.0
    progress_emit_interval_seconds: float = 1.0
    sse_heartbeat_seconds: int = 15
    guest_retention: timedelta = timedelta(hours=24)
    authenticated_retention: timedelta = timedelta(days=30)
    max_filename_length: int = 180
    max_audio_streams: int = 16
    max_video_streams: int = 1


VIDEO_CONVERSION_LIMITS = VideoConversionLimits()

ALLOWED_VIDEO_EXTENSIONS = {
    ".mov",
    ".mp4",
    ".avi",
    ".mkv",
    ".webm",
    ".flv",
    ".3gp",
    ".mts",
    ".m4v",
}

VIDEO_MIME_TYPES = {
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".flv": "video/x-flv",
    ".3gp": "video/3gpp",
    ".mts": "video/mp2t",
    ".m4v": "video/x-m4v",
}

VIDEO_PRESETS = {"best_quality", "balanced", "small_size", "whatsapp_optimized"}
VIDEO_RESOLUTION_PRESETS = {"original", "1080p", "720p", "480p"}

ALLOWED_IMAGE_INPUT_FORMATS = {"jpeg", "png", "webp", "bmp", "gif", "tiff", "heic", "avif"}
ALLOWED_IMAGE_OUTPUT_FORMATS = {"jpeg", "png", "webp", "avif"}
IMAGE_MIME_TYPES = {
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "avif": "image/avif",
    "bmp": "image/bmp",
    "gif": "image/gif",
    "tiff": "image/tiff",
    "heic": "image/heic",
}

ALLOWED_PAGE_SIZES = {"A4", "Letter", "Legal"}
ALLOWED_ORIENTATIONS = {"portrait", "landscape"}
ALLOWED_FONTS = {
    "Auto",
    "NotoSans",
    "NotoSansTamil",
    "NotoSansDevanagari",
    "NotoSansMalayalam",
    "NotoSansKannada",
    "NotoSansTelugu",
    "Nirmala UI",
    "Arial Unicode MS",
    "Helvetica",
    "Times-Roman",
    "Courier",
}
ALLOWED_ALIGNMENTS = {"left", "center", "right", "justify"}
SAFE_FILENAME_FALLBACK = "flowauxi-text-to-pdf.pdf"
