"""Tool registry for the Files Tools platform."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..converters.text_to_pdf.reportlab_converter import ReportLabTextToPdfConverter
from ..domain.policies import TEXT_TO_PDF_LIMITS
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
            )
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
