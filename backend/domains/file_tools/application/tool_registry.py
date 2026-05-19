"""Tool registry for the Files Tools platform."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..converters.image_converter.pillow_converter import PillowImageConverter
from ..converters.text_to_pdf.reportlab_converter import ReportLabTextToPdfConverter
from ..domain.policies import IMAGE_CONVERSION_LIMITS, OCR_LIMITS, TEXT_TO_PDF_LIMITS, VIDEO_CONVERSION_LIMITS
from ..validators.image_converter_validator import ImageConverterValidator
from ..validators.text_to_pdf_validator import TextToPdfValidator


@dataclass(frozen=True)
class FileToolDefinition:
    key: str
    name: str
    description: str
    category: str
    execution: str
    converter: Any
    validator: Any
    limits: dict[str, int]


class ToolRegistry:
    def __init__(self):
        self._tools = {
            "text_to_pdf": FileToolDefinition(
                key="text_to_pdf",
                name="Text to PDF",
                description="Create a clean PDF from safe rich text blocks.",
                category="convert",
                execution="sync",
                converter=ReportLabTextToPdfConverter(),
                validator=TextToPdfValidator(),
                limits={
                    "guestCharacters": TEXT_TO_PDF_LIMITS.guest_character_limit,
                    "authenticatedCharacters": TEXT_TO_PDF_LIMITS.authenticated_character_limit,
                    "maxPages": TEXT_TO_PDF_LIMITS.max_pages,
                    "maxPdfSizeBytes": TEXT_TO_PDF_LIMITS.max_pdf_size_bytes,
                },
            ),
            "image_converter": FileToolDefinition(
                key="image_converter",
                name="Image Converter",
                description="Convert images between JPG, PNG, WebP, and available modern formats.",
                category="convert",
                execution="sync",
                converter=PillowImageConverter(),
                validator=ImageConverterValidator(),
                limits={
                    "guestMaxInputBytes": IMAGE_CONVERSION_LIMITS.guest_max_input_bytes,
                    "authenticatedMaxInputBytes": IMAGE_CONVERSION_LIMITS.authenticated_max_input_bytes,
                    "guestMaxMegapixels": IMAGE_CONVERSION_LIMITS.guest_max_megapixels,
                    "authenticatedMaxMegapixels": IMAGE_CONVERSION_LIMITS.authenticated_max_megapixels,
                    "maxOutputBytes": IMAGE_CONVERSION_LIMITS.max_output_bytes,
                    "conversionTimeoutSeconds": IMAGE_CONVERSION_LIMITS.conversion_timeout_seconds,
                },
            ),
            "ocr": FileToolDefinition(
                key="ocr",
                name="OCR",
                description="Extract text from image documents with local Tesseract OCR.",
                category="ai",
                execution="async",
                converter=None,
                validator=None,
                limits={
                    "guestMaxInputBytes": OCR_LIMITS.guest_max_input_bytes,
                    "authenticatedMaxInputBytes": OCR_LIMITS.authenticated_max_input_bytes,
                    "guestMaxMegapixels": OCR_LIMITS.guest_max_megapixels,
                    "authenticatedMaxMegapixels": OCR_LIMITS.authenticated_max_megapixels,
                    "timeoutSeconds": OCR_LIMITS.timeout_seconds,
                },
            ),
            "video_whatsapp_converter": FileToolDefinition(
                key="video_whatsapp_converter",
                name="Video Converter for WhatsApp",
                description="Convert videos to mobile-friendly MP4 with H.264, AAC, and fast-start playback.",
                category="convert",
                execution="async",
                converter=None,
                validator=None,
                limits={
                    "guestMaxInputBytes": VIDEO_CONVERSION_LIMITS.guest_max_input_bytes,
                    "authenticatedMaxInputBytes": VIDEO_CONVERSION_LIMITS.authenticated_max_input_bytes,
                    "guestMaxDurationSeconds": VIDEO_CONVERSION_LIMITS.guest_max_duration_seconds,
                    "authenticatedMaxDurationSeconds": VIDEO_CONVERSION_LIMITS.authenticated_max_duration_seconds,
                    "defaultChunkSizeBytes": VIDEO_CONVERSION_LIMITS.default_chunk_size_bytes,
                    "maxChunkSizeBytes": VIDEO_CONVERSION_LIMITS.max_chunk_size_bytes,
                },
            ),
        }

    def get(self, key: str) -> FileToolDefinition:
        return self._tools[key]

    def list_public(self) -> list[dict]:
        return [
            {
                "key": tool.key,
                "name": tool.name,
                "description": tool.description,
                "category": tool.category,
                "execution": tool.execution,
                "limits": tool.limits,
            }
            for tool in self._tools.values()
        ]
