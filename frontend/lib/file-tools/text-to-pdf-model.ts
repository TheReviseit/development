import type {
  TextAlign,
  TextMark,
  TextPdfBlock,
  TextPdfDocument,
  TextPdfGenerateRequest,
  TextPdfOptions,
} from "./contracts";

export const defaultTextPdfOptions: TextPdfOptions = {
  pageSize: "A4",
  orientation: "portrait",
  margins: { top: 54, right: 54, bottom: 54, left: 54 },
  fontFamily: "Auto",
  fontSize: 12,
  lineHeight: 1.4,
  header: { enabled: false, text: "" },
  footer: { enabled: false, text: "", pageNumbers: false },
};

export const defaultEditorText = "";
export const defaultTextPdfTitle = "Untitled document";

export function createTextPdfRequest(args: {
  title?: string;
  rawText: string;
  options?: TextPdfOptions;
  marks?: TextMark[];
  align?: TextAlign;
  idempotencyKey?: string;
}): TextPdfGenerateRequest {
  return {
    idempotencyKey: args.idempotencyKey,
    document: createTextPdfDocument(args.rawText, args.title, args.marks, args.align),
    options: args.options ?? defaultTextPdfOptions,
  };
}

export function createTextPdfDocument(
  rawText: string,
  title?: string,
  marks: TextMark[] = [],
  align: TextAlign = "left",
): TextPdfDocument {
  return {
    version: "1",
    title: title?.trim() || defaultTextPdfTitle,
    blocks: blocksFromText(rawText, marks, align),
  };
}

export function blocksFromText(rawText: string, marks: TextMark[] = [], align: TextAlign = "left"): TextPdfBlock[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const blocks: TextPdfBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let listStart = 1;

  const listMatchFor = (value: string) => ({
    ordered: value.match(/^(\d+)[\.)]\s+(.+)$/),
    unordered: value.match(/^[-*]\s+(.+)$/),
  });

  const nextMeaningfulLine = (startIndex: number) => {
    for (let index = startIndex; index < lines.length; index += 1) {
      const trimmed = (lines[index] ?? "").trim();
      if (trimmed) return trimmed;
    }
    return "";
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({
      type: "paragraph",
      text: paragraph.join("\n").trim(),
      marks: marks.length ? marks : undefined,
      align,
    });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({
      type: "list",
      ordered: listOrdered,
      ...(listOrdered && listStart !== 1 ? { start: listStart } : {}),
      items: listItems,
    });
    listItems = [];
    listOrdered = false;
    listStart = 1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const { ordered: orderedMatch, unordered: unorderedMatch } = listMatchFor(trimmed);

    if (trimmed === "---page---" || trimmed === "\\page") {
      flushParagraph();
      flushList();
      blocks.push({ type: "pageBreak" });
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      if (listItems.length) {
        const nextList = listMatchFor(nextMeaningfulLine(index + 1));
        const nextListOrdered = Boolean(nextList.ordered);
        if ((nextList.ordered || nextList.unordered) && nextListOrdered === listOrdered) {
          continue;
        }
      }
      flushList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: 3, text: trimmed.slice(4), marks });
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: 2, text: trimmed.slice(3), marks });
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: 1, text: trimmed.slice(2), marks });
      continue;
    }

    if (orderedMatch || unorderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      if (listItems.length && listOrdered !== ordered) {
        flushList();
      }
      listOrdered = ordered;
      if (!listItems.length && orderedMatch) {
        listStart = Number(orderedMatch[1]);
      }
      listItems.push((orderedMatch?.[2] || unorderedMatch?.[1] || "").trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.length ? blocks : [{ type: "paragraph", text: " ", align }];
}

export function countTextPdfCharacters(document: TextPdfDocument): number {
  return (document.title?.trim().length ?? 0) + countTextPdfContentCharacters(document);
}

export function countTextPdfContentCharacters(document: TextPdfDocument): number {
  return document.blocks.reduce((total, block) => {
    if (block.type === "paragraph" || block.type === "heading") {
      return total + block.text.trim().length;
    }
    if (block.type === "list") {
      return total + block.items.reduce((sum, item) => sum + item.trim().length, 0);
    }
    return total;
  }, 0);
}

export function hasTextPdfContent(document: TextPdfDocument): boolean {
  return countTextPdfContentCharacters(document) > 0;
}

export function estimateTextPdfPages(document: TextPdfDocument, options: TextPdfOptions): number {
  const characters = countTextPdfCharacters(document);
  const pageSizeFactor = options.pageSize === "Legal" ? 1.25 : options.pageSize === "Letter" ? 1.05 : 1;
  const orientationFactor = options.orientation === "landscape" ? 1.2 : 1;
  const fontFactor = Math.max(0.6, 12 / options.fontSize);
  const charsPerPage = 2_500 * pageSizeFactor * orientationFactor * fontFactor;
  const explicitBreaks = document.blocks.filter((block) => block.type === "pageBreak").length;
  return Math.max(1, Math.ceil(characters / charsPerPage) + explicitBreaks);
}
