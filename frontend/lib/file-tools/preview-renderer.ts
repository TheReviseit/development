import type { TextPdfBlock, TextPdfDocument, TextPdfOptions } from "./contracts";

const AVERAGE_TEXT_GLYPH_WIDTH = 0.56;
const MIN_LINE_CAPACITY_UNITS = 16;
const LIST_MARKER_CAPACITY_UNITS = 8;
const LIST_LINE_CAPACITY_SCALE = 0.92;
const PREVIEW_LINE_HEIGHT_FUDGE = 1.06;
const PAGE_BOTTOM_SAFETY_LINES = 1.35;
const PARAGRAPH_SPACE_AFTER_FACTOR = 0.75;
const LIST_SPACE_AFTER_FACTOR = 0.85;
const LIST_ITEM_GAP = 5;
const SPACE_DISPLAY_UNITS = 0.55;

type GraphemeSegmenter = {
  segment(value: string): Iterable<{ segment: string }>;
};

export function getPreviewPageMetrics(options: TextPdfOptions) {
  const base = options.pageSize === "Legal" ? { width: 612, height: 1008 } : options.pageSize === "Letter" ? { width: 612, height: 792 } : { width: 595, height: 842 };
  return options.orientation === "landscape"
    ? { width: base.height, height: base.width }
    : base;
}

export function getPreviewPages(document: TextPdfDocument, options: TextPdfOptions): TextPdfBlock[][] {
  const metrics = getPreviewPageMetrics(options);
  const fontSize = options.fontSize;
  const lineHeight = fontSize * options.lineHeight * PREVIEW_LINE_HEIGHT_FUDGE;
  const headerHeight = options.header?.enabled && options.header.text ? lineHeight + 14 : 0;
  const footerHeight = options.footer?.enabled ? lineHeight + 14 : 0;
  const pageBottomReserve = lineHeight * PAGE_BOTTOM_SAFETY_LINES;
  const availableHeight = Math.max(
    lineHeight * 4,
    metrics.height - options.margins.top - options.margins.bottom - headerHeight - footerHeight - pageBottomReserve,
  );
  const availableWidth = Math.max(120, metrics.width - options.margins.left - options.margins.right);
  const lineCapacity = Math.max(MIN_LINE_CAPACITY_UNITS, availableWidth / (fontSize * AVERAGE_TEXT_GLYPH_WIDTH));
  const pages: TextPdfBlock[][] = [[]];
  let usedHeight = 0;

  const currentPage = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push([]);
    usedHeight = 0;
  };
  const appendBlock = (block: TextPdfBlock, height: number) => {
    if (usedHeight > 0 && usedHeight + height > availableHeight) {
      newPage();
    }
    currentPage().push(block);
    usedHeight += height;
  };

  for (const block of document.blocks) {
    if (block.type === "pageBreak") {
      if (currentPage().length > 0) {
        newPage();
      }
      continue;
    }

    if (block.type === "paragraph") {
      const lines = wrapTextLines(block.text || " ", lineCapacity);
      const spaceAfter = fontSize * PARAGRAPH_SPACE_AFTER_FACTOR;
      while (lines.length > 0) {
        if (usedHeight > 0 && usedHeight + lineHeight + spaceAfter > availableHeight) {
          newPage();
        }
        const capacity = Math.max(1, Math.floor((availableHeight - usedHeight - spaceAfter) / lineHeight));
        const chunk = lines.splice(0, capacity);
        appendBlock({ ...block, text: chunk.join("\n") }, chunk.length * lineHeight + spaceAfter);
      }
      continue;
    }

    if (block.type === "heading") {
      const scale = block.level === 1 ? 1.85 : block.level === 2 ? 1.45 : 1.2;
      const headingLineHeight = fontSize * scale * 1.22;
      const lines = wrapTextLines(block.text, Math.max(10, lineCapacity / scale));
      appendBlock(block, lines.length * headingLineHeight + fontSize * 1.1);
      continue;
    }

    if (block.type === "list") {
      const listStart = block.start ?? 1;
      const finalListNumber = listStart + block.items.length - 1;
      const markerCapacity = block.ordered
        ? Math.max(LIST_MARKER_CAPACITY_UNITS, measureDisplayUnits(`${finalListNumber}.`) + 2.2)
        : LIST_MARKER_CAPACITY_UNITS;
      const itemLineCapacity = Math.max(8, (lineCapacity - markerCapacity) * LIST_LINE_CAPACITY_SCALE);
      const listSpaceAfter = fontSize * LIST_SPACE_AFTER_FACTOR;
      let chunkItems: string[] = [];
      let chunkStart = listStart;
      let chunkHeight = 0;

      const flushListChunk = () => {
        if (!chunkItems.length) return;
        appendBlock(
          {
            ...block,
            start: block.ordered && chunkStart !== 1 ? chunkStart : undefined,
            items: chunkItems,
          },
          chunkHeight + listSpaceAfter,
        );
        chunkItems = [];
        chunkHeight = 0;
      };

      block.items.forEach((item, index) => {
        const itemLines = wrapTextLines(item || " ", itemLineCapacity);
        const itemHeight = Math.max(lineHeight, itemLines.length * lineHeight) + LIST_ITEM_GAP;
        if (chunkItems.length > 0 && usedHeight + chunkHeight + itemHeight + listSpaceAfter > availableHeight) {
          flushListChunk();
        }
        if (!chunkItems.length) {
          chunkStart = listStart + index;
          if (usedHeight > 0 && usedHeight + itemHeight + listSpaceAfter > availableHeight) {
            newPage();
          }
        }
        chunkItems.push(item);
        chunkHeight += itemHeight;
      });

      flushListChunk();
    }
  }

  return withoutTrailingEmptyPages(pages);
}

export function getPreviewSummary(document: TextPdfDocument, options: TextPdfOptions) {
  return {
    pages: getPreviewPages(document, options).length,
    blocks: document.blocks.length,
  };
}

function wrapTextLines(text: string, lineCapacity: number): string[] {
  const lines: string[] = [];
  for (const logicalLine of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!logicalLine.trim()) {
      lines.push("");
      continue;
    }

    let current = "";
    let currentUnits = 0;

    for (const word of logicalLine.trim().split(/\s+/)) {
      const wordUnits = measureDisplayUnits(word);
      if (wordUnits > lineCapacity) {
        if (current) {
          lines.push(current);
          current = "";
          currentUnits = 0;
        }
        lines.push(...splitLongToken(word, lineCapacity));
        continue;
      }

      const next = current ? `${current} ${word}` : word;
      const nextUnits = current ? currentUnits + SPACE_DISPLAY_UNITS + wordUnits : wordUnits;
      if (nextUnits > lineCapacity && current) {
        lines.push(current);
        current = word;
        currentUnits = wordUnits;
      } else {
        current = next;
        currentUnits = nextUnits;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

function withoutTrailingEmptyPages(pages: TextPdfBlock[][]): TextPdfBlock[][] {
  const nextPages = [...pages];
  while (nextPages.length > 1 && nextPages[nextPages.length - 1].length === 0) {
    nextPages.pop();
  }
  return nextPages.length ? nextPages : [[]];
}

function splitLongToken(value: string, lineCapacity: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentUnits = 0;

  for (const grapheme of graphemes(value)) {
    const graphemeUnits = measureGraphemeUnits(grapheme);
    if (current && currentUnits + graphemeUnits > lineCapacity) {
      chunks.push(current);
      current = "";
      currentUnits = 0;
    }
    current += grapheme;
    currentUnits += graphemeUnits;
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [value];
}

function measureDisplayUnits(value: string): number {
  let units = 0;
  for (const grapheme of graphemes(value)) {
    units += measureGraphemeUnits(grapheme);
  }
  return units;
}

function measureGraphemeUnits(grapheme: string): number {
  if (!grapheme) return 0;
  if (/^\s+$/u.test(grapheme)) return SPACE_DISPLAY_UNITS;
  if (/^\p{Mark}+$/u.test(grapheme)) return 0;
  if (containsEmojiOrFullWidthGlyph(grapheme)) return 1.75;
  if (/^[.,;:!?'"()[\]{}<>/\\|`~\-\u2013\u2014_]+$/u.test(grapheme)) return 0.55;
  return 1;
}

function containsEmojiOrFullWidthGlyph(value: string): boolean {
  return /[\p{Extended_Pictographic}\u1100-\u11FF\u2E80-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFE10-\uFE6F\uFF00-\uFFEF]/u.test(value);
}

function graphemes(value: string): string[] {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => GraphemeSegmenter;
    }
  ).Segmenter;

  if (!Segmenter) {
    return Array.from(value);
  }

  return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value), ({ segment }) => segment);
}
