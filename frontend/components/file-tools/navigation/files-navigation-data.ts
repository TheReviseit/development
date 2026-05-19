import {
  FileImage,
  FileLock2,
  FileSignature,
  FileText,
  Files,
  Minimize2,
  ScanText,
  ShieldCheck,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";

export type FilesMegaTone = "blue" | "coral" | "green" | "indigo" | "purple" | "yellow";

export interface FilesNavItem {
  id: string;
  labelKey: string;
  shortLabelKey?: string;
  href: string;
  megaId?: string;
  tablet?: boolean;
}

export interface FilesMegaTool {
  id: string;
  href: string;
  icon: LucideIcon;
  labelKey: string;
  tone: FilesMegaTone;
}

export interface FilesMegaSection {
  id: string;
  headingKey: string;
  tools: FilesMegaTool[];
}

export const FILES_NAV_ITEMS: FilesNavItem[] = [
  { id: "merge-pdf", labelKey: "nav.mergePdf", href: "/tools/merge-pdf", tablet: true },
  { id: "split-pdf", labelKey: "nav.splitPdf", href: "/tools/split-pdf", tablet: true },
  { id: "compress-pdf", labelKey: "nav.compressPdf", href: "/tools/compress-pdf", tablet: true },
  { id: "convert-pdf", labelKey: "nav.convertPdf", href: "/tools/text-to-pdf" },
  { id: "all-tools", labelKey: "nav.allTools", shortLabelKey: "nav.allToolsShort", href: "/tools", megaId: "all-tools" },
];

export const FILES_MOBILE_PRIMARY_ITEMS = FILES_NAV_ITEMS.filter((item) => item.id !== "all-tools");

export const FILES_MEGA_SECTIONS: FilesMegaSection[] = [
  {
    id: "organize-pdf",
    headingKey: "mega.sections.organizePdf",
    tools: [
      { id: "merge-pdf", href: "/tools/merge-pdf", icon: Files, labelKey: "mega.tools.mergePdf", tone: "coral" },
      { id: "split-pdf", href: "/tools/split-pdf", icon: Files, labelKey: "mega.tools.splitPdf", tone: "coral" },
      { id: "remove-pages", href: "/tools", icon: Files, labelKey: "mega.tools.removePages", tone: "coral" },
      { id: "extract-pages", href: "/tools", icon: Files, labelKey: "mega.tools.extractPages", tone: "coral" },
      { id: "organize-pdf", href: "/tools", icon: Files, labelKey: "mega.tools.organizePdf", tone: "coral" },
      { id: "scan-to-pdf", href: "/tools", icon: ScanText, labelKey: "mega.tools.scanToPdf", tone: "coral" },
    ],
  },
  {
    id: "convert-to-pdf",
    headingKey: "mega.sections.convertToPdf",
    tools: [
      { id: "text-to-pdf", href: "/tools/text-to-pdf", icon: FileText, labelKey: "mega.tools.textToPdf", tone: "blue" },
      { id: "image-converter", href: "/tools/image-converter", icon: FileImage, labelKey: "mega.tools.imageConverter", tone: "yellow" },
      { id: "video-whatsapp", href: "/tools/video-converter-for-whatsapp", icon: Video, labelKey: "mega.tools.videoWhatsapp", tone: "green" },
      { id: "jpg-to-pdf", href: "/tools/image-to-pdf", icon: FileImage, labelKey: "mega.tools.jpgToPdf", tone: "yellow" },
      { id: "word-to-pdf", href: "/tools/word-to-pdf", icon: FileText, labelKey: "mega.tools.wordToPdf", tone: "blue" },
      { id: "powerpoint-to-pdf", href: "/tools/powerpoint-to-pdf", icon: FileText, labelKey: "mega.tools.powerPointToPdf", tone: "coral" },
      { id: "excel-to-pdf", href: "/tools/excel-to-pdf", icon: FileText, labelKey: "mega.tools.excelToPdf", tone: "green" },
      { id: "html-to-pdf", href: "/tools/html-to-pdf", icon: FileText, labelKey: "mega.tools.htmlToPdf", tone: "yellow" },
    ],
  },
  {
    id: "convert-from-pdf",
    headingKey: "mega.sections.convertFromPdf",
    tools: [
      { id: "pdf-to-jpg", href: "/tools/pdf-to-image", icon: FileImage, labelKey: "mega.tools.pdfToJpg", tone: "yellow" },
      { id: "pdf-to-word", href: "/tools/pdf-to-word", icon: FileText, labelKey: "mega.tools.pdfToWord", tone: "blue" },
      { id: "pdf-to-powerpoint", href: "/tools/pdf-to-powerpoint", icon: FileText, labelKey: "mega.tools.pdfToPowerPoint", tone: "coral" },
      { id: "pdf-to-excel", href: "/tools/pdf-to-excel", icon: FileText, labelKey: "mega.tools.pdfToExcel", tone: "green" },
      { id: "pdf-to-pdfa", href: "/tools", icon: FileText, labelKey: "mega.tools.pdfToPdfA", tone: "blue" },
    ],
  },
  {
    id: "optimize-pdf",
    headingKey: "mega.sections.optimizePdf",
    tools: [
      { id: "compress-pdf", href: "/tools/compress-pdf", icon: Minimize2, labelKey: "mega.tools.compressPdf", tone: "green" },
      { id: "repair-pdf", href: "/tools", icon: FileText, labelKey: "mega.tools.repairPdf", tone: "green" },
      { id: "ocr-pdf", href: "/tools/ocr", icon: ScanText, labelKey: "mega.tools.ocrPdf", tone: "green" },
    ],
  },
  {
    id: "edit-pdf",
    headingKey: "mega.sections.editPdf",
    tools: [
      { id: "rotate-pdf", href: "/tools/rotate-pdf", icon: FileSignature, labelKey: "mega.tools.rotatePdf", tone: "purple" },
      { id: "add-page-numbers", href: "/tools", icon: FileText, labelKey: "mega.tools.addPageNumbers", tone: "purple" },
      { id: "add-watermark", href: "/tools/watermark-pdf", icon: FileSignature, labelKey: "mega.tools.addWatermark", tone: "purple" },
      { id: "crop-pdf", href: "/tools", icon: FileSignature, labelKey: "mega.tools.cropPdf", tone: "purple" },
      { id: "edit-pdf", href: "/tools/edit-pdf", icon: FileSignature, labelKey: "mega.tools.editPdf", tone: "purple" },
      { id: "pdf-forms", href: "/tools", icon: FileText, labelKey: "mega.tools.pdfForms", tone: "purple" },
    ],
  },
  {
    id: "pdf-security",
    headingKey: "mega.sections.pdfSecurity",
    tools: [
      { id: "unlock-pdf", href: "/tools/unlock-pdf", icon: FileLock2, labelKey: "mega.tools.unlockPdf", tone: "blue" },
      { id: "protect-pdf", href: "/tools/protect-pdf", icon: ShieldCheck, labelKey: "mega.tools.protectPdf", tone: "blue" },
      { id: "sign-pdf", href: "/tools/sign-pdf", icon: FileSignature, labelKey: "mega.tools.signPdf", tone: "blue" },
      { id: "redact-pdf", href: "/tools", icon: FileLock2, labelKey: "mega.tools.redactPdf", tone: "blue" },
      { id: "compare-pdf", href: "/tools", icon: Files, labelKey: "mega.tools.comparePdf", tone: "blue" },
    ],
  },
  {
    id: "pdf-intelligence",
    headingKey: "mega.sections.pdfIntelligence",
    tools: [
      { id: "ai-summarizer", href: "/tools/ocr", icon: Sparkles, labelKey: "mega.tools.aiSummarizer", tone: "indigo" },
      { id: "translate-pdf", href: "/tools/ocr", icon: Sparkles, labelKey: "mega.tools.translatePdf", tone: "indigo" },
    ],
  },
];

export const FILES_TOOL_SEARCH_INDEX = FILES_MEGA_SECTIONS.flatMap((section) =>
  section.tools.map((tool) => ({
    ...tool,
    sectionId: section.id,
    sectionHeadingKey: section.headingKey,
  })),
);
