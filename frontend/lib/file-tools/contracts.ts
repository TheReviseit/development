export type TextMark = "bold" | "italic" | "underline";
export type TextAlign = "left" | "center" | "right" | "justify";
export type TextPdfPageSize = "A4" | "Letter" | "Legal";
export type TextPdfOrientation = "portrait" | "landscape";
export type TextPdfFontFamily =
  | "Auto"
  | "NotoSans"
  | "NotoSansTamil"
  | "NotoSansDevanagari"
  | "NotoSansMalayalam"
  | "NotoSansKannada"
  | "NotoSansTelugu"
  | "Nirmala UI"
  | "Arial Unicode MS"
  | "Helvetica"
  | "Times-Roman"
  | "Courier";

export type TextPdfBlock =
  | {
      type: "paragraph";
      text: string;
      marks?: TextMark[];
      align?: TextAlign;
    }
  | {
      type: "heading";
      level: 1 | 2 | 3;
      text: string;
      marks?: TextMark[];
    }
  | {
      type: "list";
      ordered: boolean;
      start?: number;
      items: string[];
    }
  | {
      type: "pageBreak";
    };

export interface TextPdfDocument {
  version: "1";
  title?: string;
  blocks: TextPdfBlock[];
}

export interface TextPdfMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TextPdfHeaderFooter {
  enabled: boolean;
  text?: string;
  pageNumbers?: boolean;
}

export interface TextPdfOptions {
  pageSize: TextPdfPageSize;
  orientation: TextPdfOrientation;
  margins: TextPdfMargins;
  fontFamily: TextPdfFontFamily;
  fontSize: number;
  lineHeight: number;
  header?: TextPdfHeaderFooter;
  footer?: TextPdfHeaderFooter;
}

export interface TextPdfGenerateRequest {
  idempotencyKey?: string;
  document: TextPdfDocument;
  options: TextPdfOptions;
}

export interface FileToolJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead_letter" | "cancelled" | "expired";
  toolKey: string;
}

export interface FileToolArtifact {
  id: string;
  filename: string;
  sizeBytes: number;
  expiresAt: string;
}

export interface TextPdfGenerateResponse {
  success: true;
  job: FileToolJob;
  artifact: FileToolArtifact;
  downloadUrl: string;
}

export type ImageOutputFormat = "jpeg" | "png" | "webp" | "avif";

export interface ImageConvertRequest {
  file: File;
  outputFormat: ImageOutputFormat;
  quality?: number;
  background?: string;
  idempotencyKey?: string;
}

export interface ImageConvertResponse {
  success: true;
  job: FileToolJob;
  artifact: FileToolArtifact;
  downloadUrl: string;
}

export interface ImageConverterFormatsResponse {
  success: true;
  formats: {
    pillow?: string;
    inputs: string[];
    outputs: ImageOutputFormat[];
    heic?: boolean;
    avifDecode?: boolean;
    avifEncode?: boolean;
  };
}

export interface FileToolErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export type FileToolHistoryItem = {
  id: string;
  jobId: string;
  toolKey: string;
  filename: string;
  sizeBytes: number;
  expiresAt: string;
  createdAt: string;
  downloadCount: number;
  downloadUrl?: string;
};
