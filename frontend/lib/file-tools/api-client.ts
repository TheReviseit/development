import type {
  FileToolErrorResponse,
  FileToolHistoryItem,
  TextPdfGenerateRequest,
  TextPdfGenerateResponse,
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

export function generateTextPdf(request: TextPdfGenerateRequest) {
  return fileToolsFetch<TextPdfGenerateResponse>("/text-to-pdf/generate", {
    method: "POST",
    body: JSON.stringify(request),
  });
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
