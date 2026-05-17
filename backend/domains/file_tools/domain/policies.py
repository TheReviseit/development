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
