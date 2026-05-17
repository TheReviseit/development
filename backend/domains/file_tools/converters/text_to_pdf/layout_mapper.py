"""Map Text to PDF contracts to ReportLab layout primitives."""

from __future__ import annotations

from html import escape

from reportlab.lib import pagesizes
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch

from ...contracts.text_to_pdf import TextPdfOptions
from .font_registry import requires_complex_shaping, resolve_font_name, rich_text_markup

PAGE_SIZES = {
    "A4": pagesizes.A4,
    "Letter": pagesizes.LETTER,
    "Legal": pagesizes.LEGAL,
}

ALIGNMENTS = {
    "left": TA_LEFT,
    "center": TA_CENTER,
    "right": TA_RIGHT,
    "justify": TA_JUSTIFY,
}


def get_page_size(options: TextPdfOptions) -> tuple[float, float]:
    size = PAGE_SIZES[options.pageSize]
    if options.orientation == "landscape":
        return pagesizes.landscape(size)
    return pagesizes.portrait(size)


def safe_text(value: str) -> str:
    return escape(value or "", quote=False).replace("\n", "<br/>")


def pdf_markup(value: str, options: TextPdfOptions, marks: list[str] | None = None) -> str:
    return rich_text_markup(value or "", options.fontFamily, marks)


def paragraph_style(
    options: TextPdfOptions,
    marks: list[str] | None = None,
    align: str | None = "left",
    text: str = "",
) -> ParagraphStyle:
    font_name = resolve_font_name(options.fontFamily, marks, text)
    return ParagraphStyle(
        name=f"Body-{font_name}-{align}",
        fontName=font_name,
        fontSize=options.fontSize,
        leading=options.fontSize * options.lineHeight,
        alignment=ALIGNMENTS.get(align or "left", TA_LEFT),
        spaceAfter=options.fontSize * 0.65,
        shaping=1 if requires_complex_shaping(text) else 0,
    )


def heading_style(
    options: TextPdfOptions,
    level: int,
    marks: list[str] | None = None,
    text: str = "",
) -> ParagraphStyle:
    scale = {1: 1.85, 2: 1.45, 3: 1.2}.get(level, 1.2)
    font_name = resolve_font_name(options.fontFamily, [*(marks or []), "bold"], text)
    font_size = min(options.fontSize * scale, 36)
    return ParagraphStyle(
        name=f"Heading-{level}-{font_name}",
        fontName=font_name,
        fontSize=font_size,
        leading=font_size * 1.22,
        alignment=TA_LEFT,
        spaceBefore=options.fontSize * 0.4,
        spaceAfter=options.fontSize * 0.7,
        shaping=1 if requires_complex_shaping(text) else 0,
    )


def document_padding_for_chrome(options: TextPdfOptions) -> tuple[float, float]:
    header_pad = 0.35 * inch if options.header and options.header.enabled else 0
    footer_pad = 0.35 * inch if options.footer and options.footer.enabled else 0
    return header_pad, footer_pad
