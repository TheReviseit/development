"""Tool registry for the Files Tools platform."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..converters.image_converter.pillow_converter import PillowImageConverter
from ..converters.text_to_pdf.reportlab_converter import ReportLabTextToPdfConverter
from ..domain.policies import IMAGE_CONVERSION_LIMITS, TEXT_TO_PDF_LIMITS
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
