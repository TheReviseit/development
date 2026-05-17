"""ReportLab implementation of the Text to PDF converter."""

from __future__ import annotations

from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import ListFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer

from ...contracts.text_to_pdf import HeadingBlock, ListBlock, PageBreakBlock, ParagraphBlock, TextPdfGenerateRequest
from ...domain.errors import ConversionError
from ..base import ConversionResult, Converter
from .font_registry import PdfFontEngineError, assert_text_pdf_fonts_ready, resolve_font_name
from .layout_mapper import document_padding_for_chrome, get_page_size, heading_style, paragraph_style, pdf_markup


class PageCountingCanvas(Canvas):
    """Canvas that tracks final page count without replaying pages."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._page_count = 0

    def showPage(self):
        self._page_count = max(self._page_count, self.getPageNumber())
        super().showPage()

    def save(self):
        if len(self._code):
            self._page_count = max(self._page_count, self.getPageNumber())
        super().save()

    @property
    def page_count(self) -> int:
        return max(1, self._page_count)


class ReportLabTextToPdfConverter(Converter[TextPdfGenerateRequest]):
    tool_key = "text_to_pdf"

    def convert(self, request: TextPdfGenerateRequest) -> ConversionResult:
        try:
            assert_text_pdf_fonts_ready(request)
        except PdfFontEngineError as exc:
            raise ConversionError(_public_font_error_message(exc.code), code=exc.code) from exc

        buffer = BytesIO()
        options = request.options
        page_width, page_height = get_page_size(options)
        header_pad, footer_pad = document_padding_for_chrome(options)

        doc = SimpleDocTemplate(
            buffer,
            pagesize=(page_width, page_height),
            title=request.document.title or "Flowauxi Text to PDF",
            author="Flowauxi",
            creator="Flowauxi Files Tools",
            producer="Flowauxi Files Tools",
            leftMargin=options.margins.left,
            rightMargin=options.margins.right,
            topMargin=options.margins.top + header_pad,
            bottomMargin=options.margins.bottom + footer_pad,
            pageCompression=1,
        )

        story = self._build_story(request)
        canvas_ref: dict[str, PageCountingCanvas] = {}

        def canvas_factory(*args, **kwargs):
            canvas = PageCountingCanvas(*args, **kwargs)
            canvas_ref["canvas"] = canvas
            return canvas

        def draw_chrome(canvas: Canvas, _doc):
            self._draw_header_footer(canvas, request, page_width, page_height)

        try:
            doc.build(
                story,
                onFirstPage=draw_chrome,
                onLaterPages=draw_chrome,
                canvasmaker=canvas_factory,
            )
        except Exception as exc:
            raise ConversionError("Unable to render the PDF document.") from exc

        pdf_bytes = buffer.getvalue()
        page_count = canvas_ref.get("canvas").page_count if canvas_ref.get("canvas") else 1

        return ConversionResult(
            bytes=pdf_bytes,
            mime_type="application/pdf",
            extension="pdf",
            page_count=page_count,
        )

    def _build_story(self, request: TextPdfGenerateRequest) -> list:
        options = request.options
        story: list = []

        blocks = self._merge_adjacent_list_blocks(request.document.blocks)

        for index, block in enumerate(blocks):
            if isinstance(block, PageBreakBlock):
                if story and not isinstance(story[-1], PageBreak) and self._has_renderable_block_after(blocks, index):
                    story.append(PageBreak())
                continue

            if isinstance(block, HeadingBlock):
                story.append(
                    Paragraph(
                        pdf_markup(block.text, options, list(block.marks)),
                        heading_style(options, block.level, list(block.marks), block.text),
                    )
                )
                continue

            if isinstance(block, ParagraphBlock):
                if not block.text.strip():
                    story.append(Spacer(1, options.fontSize * options.lineHeight))
                else:
                    story.append(
                        Paragraph(
                            self._apply_marks(pdf_markup(block.text, options, list(block.marks)), list(block.marks)),
                            paragraph_style(options, list(block.marks), block.align, block.text),
                        )
                    )
                continue

            if isinstance(block, ListBlock):
                list_items = [
                    Paragraph(pdf_markup(item, options), paragraph_style(options, text=item))
                    for item in block.items
                    if item.strip()
                ]
                if list_items:
                    story.append(self._list_flowable(block, list_items, request))

        if not story:
            story.append(Paragraph(" ", paragraph_style(options, text=" ")))
        return story

    def _has_renderable_block_after(self, blocks: list, current_index: int) -> bool:
        for block in blocks[current_index + 1 :]:
            if isinstance(block, PageBreakBlock):
                continue
            if isinstance(block, (HeadingBlock, ParagraphBlock)):
                if block.text.strip():
                    return True
                continue
            if isinstance(block, ListBlock) and any(item.strip() for item in block.items):
                return True
        return False

    def _list_flowable(
        self,
        block: ListBlock,
        list_items: list[Paragraph],
        request: TextPdfGenerateRequest,
    ) -> ListFlowable:
        options = request.options
        bullet_font = resolve_font_name("Helvetica")
        bullet_size = options.fontSize

        if block.ordered:
            start = block.start or 1
            final_number = start + len(list_items) - 1
            widest_label = f"{final_number}."
            label_width = max(18, len(widest_label) * bullet_size * 0.6)
            left_indent = max(24, label_width + 12)
            return ListFlowable(
                list_items,
                bulletType="1",
                start=start,
                leftIndent=left_indent,
                bulletAlign="right",
                bulletFormat="%s.",
                bulletFontName=bullet_font,
                bulletFontSize=bullet_size,
            )

        return ListFlowable(
            list_items,
            bulletType="bullet",
            leftIndent=18,
            bulletFontName=bullet_font,
            bulletFontSize=bullet_size,
        )

    def _merge_adjacent_list_blocks(self, blocks: list) -> list:
        merged: list = []
        for block in blocks:
            if (
                isinstance(block, ListBlock)
                and merged
                and isinstance(merged[-1], ListBlock)
                and self._can_merge_list_blocks(merged[-1], block)
            ):
                merged[-1] = merged[-1].model_copy(update={"items": [*merged[-1].items, *block.items]})
                continue
            merged.append(block)
        return merged

    def _can_merge_list_blocks(self, previous: ListBlock, current: ListBlock) -> bool:
        if previous.ordered != current.ordered:
            return False
        if not previous.ordered:
            return True

        expected_start = (previous.start or 1) + len(previous.items)
        return current.start is None or current.start == expected_start

    def _apply_marks(self, text: str, marks: list[str]) -> str:
        if "underline" in marks:
            text = f"<u>{text}</u>"
        return text

    def _draw_header_footer(self, canvas: Canvas, request: TextPdfGenerateRequest, page_width: float, page_height: float) -> None:
        options = request.options
        canvas.saveState()
        canvas.setFillColor(HexColor("#111827"))
        canvas.setStrokeColor(HexColor("#E5E7EB"))

        if options.header and options.header.enabled and options.header.text:
            canvas.setFont(resolve_font_name(options.fontFamily), max(8, min(options.fontSize - 1, 12)))
            y = page_height - max(0.3 * inch, options.margins.top * 0.55)
            self._draw_shaped_chrome_text(
                canvas,
                options.header.text[:160],
                request,
                options.margins.left,
                y - 2,
                page_width - options.margins.left - options.margins.right,
                max(8, min(options.fontSize - 1, 12)),
            )
            canvas.line(options.margins.left, y - 8, page_width - options.margins.right, y - 8)

        if options.footer and options.footer.enabled:
            footer_text = options.footer.text or ""
            if options.footer.pageNumbers:
                page_text = f"Page {canvas.getPageNumber()}"
                footer_text = f"{footer_text}   {page_text}".strip()
            if footer_text:
                canvas.setFont(resolve_font_name(options.fontFamily), max(8, min(options.fontSize - 1, 11)))
                y = max(0.28 * inch, options.margins.bottom * 0.45)
                canvas.line(options.margins.left, y + 12, page_width - options.margins.right, y + 12)
                self._draw_shaped_chrome_text(
                    canvas,
                    footer_text[:180],
                    request,
                    options.margins.left,
                    y - 2,
                    page_width - options.margins.left - options.margins.right,
                    max(8, min(options.fontSize - 1, 11)),
                )

        canvas.restoreState()

    def _draw_shaped_chrome_text(
        self,
        canvas: Canvas,
        text: str,
        request: TextPdfGenerateRequest,
        x: float,
        y: float,
        width: float,
        font_size: float,
    ) -> None:
        options = request.options.model_copy(
            update={
                "fontSize": font_size,
                "lineHeight": 1.15,
            }
        )
        paragraph = Paragraph(
            pdf_markup(text, options),
            paragraph_style(options, text=text),
        )
        paragraph.wrapOn(canvas, width, font_size * 1.6)
        paragraph.drawOn(canvas, x, y)


def _public_font_error_message(code: str) -> str:
    if code == "PDF_SHAPING_UNAVAILABLE":
        return (
            "The PDF service is not ready to render Indian-script text."
        )
    if code == "FONT_NOT_REGISTERED":
        return "A required PDF font is not available on the server."
    if code == "UNSUPPORTED_GLYPH":
        return "Some characters in this document are not supported by the current PDF font."
    if code == "PDF_GLYPH_PREFLIGHT_UNAVAILABLE":
        return "PDF font validation is not available on the server."
    return "PDF generation failed."
