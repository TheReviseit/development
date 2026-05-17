import {
  blocksFromText,
  countTextPdfCharacters,
  createTextPdfDocument,
  defaultEditorText,
  defaultTextPdfOptions,
  estimateTextPdfPages,
} from "@/lib/file-tools/text-to-pdf-model";
import { getPreviewPageMetrics, getPreviewPages } from "@/lib/file-tools/preview-renderer";

describe("text-to-pdf model", () => {
  it("starts with an empty editor draft", () => {
    const document = createTextPdfDocument(defaultEditorText);

    expect(defaultEditorText).toBe("");
    expect(countTextPdfCharacters(document)).toBe(0);
    expect(estimateTextPdfPages(document, defaultTextPdfOptions)).toBe(1);
  });

  it("parses headings, lists, paragraphs, and page breaks into safe blocks", () => {
    const blocks = blocksFromText("# Title\n\nA paragraph\n\n- One\n- Two\n\n---page---\n\n## Next");

    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Title", marks: [] },
      { type: "paragraph", text: "A paragraph", align: "left" },
      { type: "list", ordered: false, items: ["One", "Two"] },
      { type: "pageBreak" },
      { type: "heading", level: 2, text: "Next", marks: [] },
    ]);
  });

  it("counts text across supported block types", () => {
    const document = createTextPdfDocument("Alpha\n\n1. Beta\n2. Gamma", "Doc");

    expect(countTextPdfCharacters(document)).toBe("DocAlphaBetaGamma".length);
  });

  it("keeps pasted numbered lists together across blank lines", () => {
    const blocks = blocksFromText(
      "வருவாய் கோட்டாட்சியர்களின் கடமைகளும் பொறுப்புகளும்\n\n1. வட்டாட்சியர்கள் பணிகளை மேற்பார்வை செய்தல்.\n\n2. வட்ட அலுவலகங்களை தணிக்கை செய்தல்.\n\n3. நாட்குறிப்புகளை ஆய்வு செய்தல்.",
    );

    expect(blocks).toEqual([
      {
        type: "paragraph",
        text: "வருவாய் கோட்டாட்சியர்களின் கடமைகளும் பொறுப்புகளும்",
        align: "left",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "வட்டாட்சியர்கள் பணிகளை மேற்பார்வை செய்தல்.",
          "வட்ட அலுவலகங்களை தணிக்கை செய்தல்.",
          "நாட்குறிப்புகளை ஆய்வு செய்தல்.",
        ],
      },
    ]);
  });

  it("preserves explicit ordered list start values for double-digit numbering", () => {
    const blocks = blocksFromText("8. Eight\n9. Nine\n10. Ten\n11. Eleven");

    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        start: 8,
        items: ["Eight", "Nine", "Ten", "Eleven"],
      },
    ]);
  });

  it("renders explicit page breaks as separate preview pages", () => {
    const document = createTextPdfDocument("Page one\n\n---page---\n\n10. Page two");
    const pages = getPreviewPages(document, defaultTextPdfOptions);

    expect(pages).toHaveLength(2);
    expect(pages[1][0]).toMatchObject({ type: "list", ordered: true, start: 10 });
  });

  it("uses exact PDF point dimensions for the selected paper", () => {
    expect(getPreviewPageMetrics({ ...defaultTextPdfOptions, pageSize: "A4", orientation: "portrait" })).toEqual({
      width: 595,
      height: 842,
    });
    expect(getPreviewPageMetrics({ ...defaultTextPdfOptions, pageSize: "Letter", orientation: "portrait" })).toEqual({
      width: 612,
      height: 792,
    });
    expect(getPreviewPageMetrics({ ...defaultTextPdfOptions, pageSize: "Legal", orientation: "landscape" })).toEqual({
      width: 1008,
      height: 612,
    });
  });

  it("does not render a blank preview page for a trailing page break", () => {
    const document = createTextPdfDocument("Only real content\n\n---page---");
    const pages = getPreviewPages(document, defaultTextPdfOptions);

    expect(pages).toHaveLength(1);
    expect(pages[0][0]).toMatchObject({ type: "paragraph", text: "Only real content" });
  });

  it("paginates long preview lists while preserving continued numbering", () => {
    const rawText = Array.from({ length: 24 }, (_, index) => `${index + 8}. Item ${index + 8}`).join("\n");
    const document = createTextPdfDocument(rawText);
    const pages = getPreviewPages(document, {
      ...defaultTextPdfOptions,
      pageSize: "A4",
      margins: { top: 360, right: 54, bottom: 360, left: 54 },
    });

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0][0]).toMatchObject({ type: "list", ordered: true, start: 8 });
    expect(pages[1][0]).toMatchObject({ type: "list", ordered: true });
    expect(pages[1][0]).not.toMatchObject({ start: 1 });
  });

  it("does not over-paginate Tamil grapheme clusters as separate characters", () => {
    const tamilSyllable = "\u0b95\u0bbf";
    const tamilParagraph = tamilSyllable.repeat(120);
    const rawText = Array.from({ length: 10 }, () => tamilParagraph).join("\n\n");
    const document = createTextPdfDocument(rawText);
    const pages = getPreviewPages(document, defaultTextPdfOptions);

    expect(document.blocks).toHaveLength(10);
    expect(pages).toHaveLength(1);
  });

  it("estimates pages with explicit page breaks", () => {
    const document = createTextPdfDocument("Alpha\n\n---page---\n\nBeta", "Doc");

    expect(estimateTextPdfPages(document, defaultTextPdfOptions)).toBeGreaterThanOrEqual(2);
  });
});
