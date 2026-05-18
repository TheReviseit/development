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
