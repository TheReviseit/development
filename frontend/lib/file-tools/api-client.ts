import type {
  FileToolErrorResponse,
  FileToolHistoryItem,
  ImageConverterFormatsResponse,
  ImageConvertRequest,
  ImageConvertResponse,
  OcrJob,
  OcrJsonResponse,
  OcrRetryResponse,
  OcrTextResponse,
  OcrUploadResponse,
  TextPdfGenerateRequest,
  TextPdfGenerateResponse,
  VideoChunkUploadResponse,
  VideoConversionOptions,
  VideoJobResponse,
  VideoPresetResponse,
  VideoUploadCreateResponse,
  VideoUploadStatusResponse,
} from "./contracts";

export class FileToolsApiError extends Error {
  code: string;
  requestId?: string;

  constructor(code: string, message: string, requestId?: string) {
    super(message);
    this.name = "FileToolsApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

async function fileToolsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/file-tools${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = (await response.json()) as T | FileToolErrorResponse;
  if (!response.ok || (data as FileToolErrorResponse).success === false) {
    const error = (data as FileToolErrorResponse).error;
    throw new FileToolsApiError(
      error?.code || "REQUEST_FAILED",
      error?.message || "The file request failed.",
      error?.requestId,
    );
  }
  return data as T;
}

async function fileToolsMultipartFetch<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`/api/file-tools${path}`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  const data = (await response.json()) as T | FileToolErrorResponse;
  if (!response.ok || (data as FileToolErrorResponse).success === false) {
    const error = (data as FileToolErrorResponse).error;
    throw new FileToolsApiError(
      error?.code || "REQUEST_FAILED",
      error?.message || "The file request failed.",
      error?.requestId,
    );
  }
  return data as T;
}

export function generateTextPdf(request: TextPdfGenerateRequest) {
  return fileToolsFetch<TextPdfGenerateResponse>("/text-to-pdf/generate", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function convertImage(request: ImageConvertRequest) {
  const formData = new FormData();
  formData.set("file", request.file);
  formData.set("outputFormat", request.outputFormat);
  if (typeof request.quality === "number") {
    formData.set("quality", String(request.quality));
  }
  if (request.background) {
    formData.set("background", request.background);
  }
  if (request.idempotencyKey) {
    formData.set("idempotencyKey", request.idempotencyKey);
  }
  return fileToolsMultipartFetch<ImageConvertResponse>("/image-converter/convert", formData);
}

export function getImageConverterFormats() {
  return fileToolsFetch<ImageConverterFormatsResponse>("/image-converter/formats");
}

export function getTextPdfDraft() {
  return fileToolsFetch<{ success: true; draft: TextPdfGenerateRequest | null }>("/drafts/text-to-pdf");
}

export function saveTextPdfDraft(request: TextPdfGenerateRequest) {
  return fileToolsFetch<{ success: true; expiresAt: string }>("/drafts/text-to-pdf", {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function deleteTextPdfDraft() {
  return fileToolsFetch<{ success: true }>("/drafts/text-to-pdf", {
    method: "DELETE",
  });
}

export function getFileToolHistory() {
  return fileToolsFetch<{ success: true; items: FileToolHistoryItem[] }>("/history");
}

export function uploadOcrImage(file: File, idempotencyKey?: string) {
  const formData = new FormData();
  formData.set("file", file);
  if (idempotencyKey) {
    formData.set("idempotencyKey", idempotencyKey);
  }
  return fileToolsMultipartFetch<OcrUploadResponse>("/ocr/upload", formData);
}

export function getOcrJob(jobId: string) {
  return fileToolsFetch<OcrJob>(`/ocr/${encodeURIComponent(jobId)}`);
}

export function getOcrText(jobId: string) {
  return fileToolsFetch<OcrTextResponse>(`/ocr/${encodeURIComponent(jobId)}/text`);
}

export function getOcrJson(jobId: string) {
  return fileToolsFetch<OcrJsonResponse>(`/ocr/${encodeURIComponent(jobId)}/json`);
}

export function retryOcrJob(jobId: string) {
  return fileToolsFetch<OcrRetryResponse>(`/ocr/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function deleteOcrJob(jobId: string) {
  return fileToolsFetch<OcrJob>(`/ocr/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
  });
}

export function createVideoUploadSession(request: {
  filename: string;
  declaredMimeType: string;
  totalSizeBytes: number;
  chunkSizeBytes: number;
  totalChunks: number;
  sha256?: string;
  batchId?: string;
}) {
  return fileToolsFetch<VideoUploadCreateResponse>("/video-whatsapp/uploads", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function uploadVideoChunk(request: {
  uploadSessionId: string;
  chunkIndex: number;
  totalSizeBytes: number;
  byteStart: number;
  byteEnd: number;
  chunk: Blob;
  sha256: string;
  idempotencyKey: string;
}) {
  const response = await fetch(
    `/api/file-tools/video-whatsapp/uploads/${request.uploadSessionId}/chunks/${request.chunkIndex}`,
    {
      method: "PUT",
      body: request.chunk,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${request.byteStart}-${request.byteEnd}/${request.totalSizeBytes}`,
        "X-Chunk-Sha256": request.sha256,
        "Idempotency-Key": request.idempotencyKey,
      },
      cache: "no-store",
    },
  );
  return parseFileToolsResponse<VideoChunkUploadResponse>(response);
}

export function completeVideoUpload(uploadSessionId: string) {
  return fileToolsFetch<VideoUploadStatusResponse>(`/video-whatsapp/uploads/${uploadSessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getVideoUploadSession(uploadSessionId: string) {
  return fileToolsFetch<VideoUploadStatusResponse>(`/video-whatsapp/uploads/${uploadSessionId}`);
}

export function createVideoJob(request: {
  uploadSessionId: string;
  options: VideoConversionOptions;
  idempotencyKey?: string;
}) {
  return fileToolsFetch<VideoJobResponse>("/video-whatsapp/jobs", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getVideoJob(jobId: string) {
  return fileToolsFetch<VideoJobResponse>(`/video-whatsapp/jobs/${jobId}`);
}

export function cancelVideoJob(jobId: string) {
  return fileToolsFetch<VideoJobResponse>(`/video-whatsapp/jobs/${jobId}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function retryVideoJob(jobId: string) {
  return fileToolsFetch<VideoJobResponse>(`/video-whatsapp/jobs/${jobId}/retry`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getVideoPresets() {
  return fileToolsFetch<VideoPresetResponse>("/video-whatsapp/presets");
}

async function parseFileToolsResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | FileToolErrorResponse;
  if (!response.ok || (data as FileToolErrorResponse).success === false) {
    const error = (data as FileToolErrorResponse).error;
    throw new FileToolsApiError(
      error?.code || "REQUEST_FAILED",
      error?.message || "The file request failed.",
      error?.requestId,
    );
  }
  return data as T;
}
