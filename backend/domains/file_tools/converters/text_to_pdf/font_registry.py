"""ReportLab font mapping with Noto, HarfBuzz, and glyph preflight gates."""

from __future__ import annotations

from ...contracts.text_to_pdf import HeadingBlock, ListBlock, ParagraphBlock, TextPdfGenerateRequest
from lib.fonts.pdf_font_engine import (
    CORE_FONT_FAMILIES,
    PdfFontEngineError,
    build_reportlab_markup,
    is_complex_text,
    preflight_texts,
    resolve_pdf_font_name,
)


def resolve_font_name(
    font_family: str,
    marks: list[str] | None = None,
    text: str = "",
) -> str:
    return resolve_pdf_font_name(font_family, marks, text)


def rich_text_markup(
    text: str,
    font_family: str,
    marks: list[str] | None = None,
) -> str:
    return build_reportlab_markup(text, font_family, marks)


def assert_text_pdf_fonts_ready(request: TextPdfGenerateRequest) -> None:
    preflight_texts(request.options.fontFamily, _all_pdf_text(request))


def requires_complex_shaping(text: str) -> bool:
    return is_complex_text(text)


def _all_pdf_text(request: TextPdfGenerateRequest) -> list[str]:
    values = [request.document.title or ""]
    if request.options.header and request.options.header.text:
        values.append(request.options.header.text)
    if request.options.footer and request.options.footer.text:
        values.append(request.options.footer.text)

    for block in request.document.blocks:
        if isinstance(block, (ParagraphBlock, HeadingBlock)):
            values.append(block.text)
        elif isinstance(block, ListBlock):
            values.extend(block.items)
    return values
