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

export type OcrStatus =
  | "created"
  | "quarantined"
  | "queued"
  | "preprocessing"
  | "extracting"
  | "merging"
  | "exporting"
  | "completed"
  | "failed"
  | "deleted"
  | "expired";

export interface OcrConfidence {
  mean: number;
  min: number;
  lowConfidenceTokenCount: number;
  providerAgreement: number;
}

export interface OcrFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface OcrJob {
  id: string;
  status: OcrStatus;
  fileName: string;
  mimeType: string;
  pageCount: number;
  processedPageCount: number;
  confidence?: OcrConfidence | null;
  failure?: OcrFailure | null;
}

export interface OcrUploadResponse {
  job: OcrJob;
  taskId?: string;
  idempotentReplay?: boolean;
}

export interface OcrRetryResponse {
  job: OcrJob;
}

export interface OcrTextResponse {
  id: string;
  status: OcrStatus;
  text: string;
}

export interface OcrBlock {
  id: string;
  pageIndex: number;
  type: string;
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  readingOrder: number;
}

export interface OcrJsonResponse extends OcrJob {
  text: string;
  blocks: OcrBlock[];
}

export type VideoQualityPreset = "best_quality" | "balanced" | "small_size" | "whatsapp_optimized";
export type VideoResolutionPreset = "original" | "1080p" | "720p" | "480p";
export type VideoUploadStatus =
  | "receiving"
  | "assembly_queued"
  | "assembling"
  | "assembled"
  | "failed"
  | "expired"
  | "cancelled";

export interface VideoUploadSession {
  id: string;
  batchId?: string | null;
  filename: string;
  declaredMimeType?: string | null;
  totalSizeBytes: number;
  chunkSizeBytes: number;
  totalChunks: number;
  receivedBytes: number;
  status: VideoUploadStatus;
  expiresAt: string;
  sourceReady: boolean;
}

export interface VideoUploadChunk {
  chunkIndex: number;
  byteStart: number;
  byteEnd: number;
  sha256: string;
  sizeBytes: number;
  status: string;
}

export interface VideoConversionOptions {
  qualityPreset: VideoQualityPreset;
  resolutionPreset: VideoResolutionPreset;
  normalizeFps: boolean;
  normalizeAudio: boolean;
  removeAudio: boolean;
  bitrateKbps?: number | null;
  trimStartSeconds?: number | null;
  trimEndSeconds?: number | null;
  generateThumbnail: boolean;
  generatePoster: boolean;
}

export interface VideoUploadCreateResponse {
  success: true;
  uploadSession: VideoUploadSession;
}

export interface VideoChunkUploadResponse {
  success: true;
  uploadSession: VideoUploadSession;
  chunk: VideoUploadChunk;
}

export interface VideoUploadStatusResponse {
  success: true;
  uploadSession: VideoUploadSession;
  chunks?: VideoUploadChunk[];
  taskId?: string | null;
}

export interface VideoJobResponse {
  success: true;
  job: FileToolJob & {
    errorCode?: string | null;
    errorMessage?: string | null;
  };
  artifact?: FileToolArtifact | null;
  downloadUrl?: string | null;
  taskId?: string | null;
}

export interface VideoPresetResponse {
  success: true;
  presets: {
    qualityPresets: Array<{
      key: VideoQualityPreset;
      label: string;
      crf: number;
      audioBitrate: string;
      maxHeight: number | null;
      fpsCap: number | null;
      profile: string;
    }>;
    resolutionPresets: VideoResolutionPreset[];
  };
}
