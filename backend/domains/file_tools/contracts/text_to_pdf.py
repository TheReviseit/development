"""Versioned Text to PDF request contract."""

from __future__ import annotations

import re
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..domain.policies import ALLOWED_ALIGNMENTS, ALLOWED_FONTS, ALLOWED_ORIENTATIONS, ALLOWED_PAGE_SIZES
from ..domain.errors import ValidationError

TextMark = Literal["bold", "italic", "underline"]
Alignment = Literal["left", "center", "right", "justify"]
PageSize = Literal["A4", "Letter", "Legal"]
Orientation = Literal["portrait", "landscape"]
FontFamily = Literal[
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
]

HTML_TAG_RE = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")


def _reject_html_tags(value: str, field_name: str) -> str:
    if HTML_TAG_RE.search(value):
        raise ValueError(f"{field_name} must use the safe text model, not raw HTML.")
    return value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ParagraphBlock(StrictModel):
    type: Literal["paragraph"]
    text: str = Field(max_length=20_000)
    marks: list[TextMark] = Field(default_factory=list, max_length=3)
    align: Optional[Alignment] = "left"

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        return _reject_html_tags(value, "paragraph text")

    @field_validator("align")
    @classmethod
    def validate_align(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ALLOWED_ALIGNMENTS:
            raise ValueError("Invalid alignment.")
        return value


class HeadingBlock(StrictModel):
    type: Literal["heading"]
    level: Literal[1, 2, 3]
    text: str = Field(min_length=1, max_length=1_000)
    marks: list[TextMark] = Field(default_factory=list, max_length=3)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        return _reject_html_tags(value, "heading text")


class ListBlock(StrictModel):
    type: Literal["list"]
    ordered: bool = False
    start: Optional[int] = Field(default=None, ge=1, le=999_999)
    items: list[str] = Field(min_length=1, max_length=500)

    @field_validator("items")
    @classmethod
    def validate_items(cls, values: list[str]) -> list[str]:
        for item in values:
            if len(item) > 2_000:
                raise ValueError("List item is too long.")
            _reject_html_tags(item, "list item")
        return values


class PageBreakBlock(StrictModel):
    type: Literal["pageBreak"]


TextPdfBlock = Annotated[
    Union[ParagraphBlock, HeadingBlock, ListBlock, PageBreakBlock],
    Field(discriminator="type"),
]


class TextPdfDocument(StrictModel):
    version: Literal["1"]
    title: Optional[str] = Field(default=None, max_length=180)
    blocks: list[TextPdfBlock] = Field(min_length=1, max_length=5_000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value:
            return _reject_html_tags(value, "document title")
        return value


class Margins(StrictModel):
    top: float = Field(ge=18, le=144)
    right: float = Field(ge=18, le=144)
    bottom: float = Field(ge=18, le=144)
    left: float = Field(ge=18, le=144)


class HeaderFooter(StrictModel):
    enabled: bool = False
    text: Optional[str] = Field(default=None, max_length=500)
    pageNumbers: Optional[bool] = False

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: Optional[str]) -> Optional[str]:
        if value:
            return _reject_html_tags(value, "header/footer text")
        return value


class TextPdfOptions(StrictModel):
    pageSize: PageSize = "A4"
    orientation: Orientation = "portrait"
    margins: Margins = Field(default_factory=lambda: Margins(top=54, right=54, bottom=54, left=54))
    fontFamily: FontFamily = "Auto"
    fontSize: float = Field(default=12, ge=8, le=32)
    lineHeight: float = Field(default=1.4, ge=1.0, le=2.5)
    header: Optional[HeaderFooter] = None
    footer: Optional[HeaderFooter] = None

    @field_validator("pageSize")
    @classmethod
    def validate_page_size(cls, value: str) -> str:
        if value not in ALLOWED_PAGE_SIZES:
            raise ValueError("Invalid page size.")
        return value

    @field_validator("orientation")
    @classmethod
    def validate_orientation(cls, value: str) -> str:
        if value not in ALLOWED_ORIENTATIONS:
            raise ValueError("Invalid orientation.")
        return value

    @field_validator("fontFamily")
    @classmethod
    def validate_font(cls, value: str) -> str:
        if value not in ALLOWED_FONTS:
            raise ValueError("Invalid font family.")
        return value


class TextPdfGenerateRequest(StrictModel):
    idempotencyKey: Optional[str] = Field(default=None, max_length=120)
    document: TextPdfDocument
    options: TextPdfOptions

    def assert_has_renderable_content(self) -> None:
        if self.content_character_count() <= 0:
            raise ValidationError(
                "EMPTY_TEXT_PDF_DOCUMENT",
                "Add text before generating a PDF.",
            )

    def character_count(self) -> int:
        total = len(self.document.title or "")
        for block in self.document.blocks:
            if isinstance(block, (ParagraphBlock, HeadingBlock)):
                total += len(block.text)
            elif isinstance(block, ListBlock):
                total += sum(len(item) for item in block.items)
        return total

    def content_character_count(self) -> int:
        total = 0
        for block in self.document.blocks:
            if isinstance(block, (ParagraphBlock, HeadingBlock)):
                total += len(block.text.strip())
            elif isinstance(block, ListBlock):
                total += sum(len(item.strip()) for item in block.items)
        return total

    @classmethod
    def parse_or_raise(cls, payload: dict) -> "TextPdfGenerateRequest":
        try:
            return cls.model_validate(payload)
        except Exception as exc:
            raise ValidationError("INVALID_TEXT_PDF_REQUEST", str(exc)) from exc
