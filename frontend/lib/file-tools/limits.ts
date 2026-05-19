export const TEXT_TO_PDF_LIMITS = {
  guestCharacters: 50_000,
  authenticatedCharacters: 250_000,
  maxPdfSizeBytes: 25 * 1024 * 1024,
  maxPages: 200,
  autosaveDebounceMs: 2_000,
  guestRetentionHours: 24,
  authenticatedRetentionDays: 30,
} as const;

export const PAGE_SIZE_LABELS = {
  A4: "A4",
  Letter: "Letter",
  Legal: "Legal",
} as const;

export const IMAGE_CONVERTER_LIMITS = {
  guestMaxInputBytes: 15 * 1024 * 1024,
  authenticatedMaxInputBytes: 50 * 1024 * 1024,
  defaultQuality: {
    jpeg: 92,
    png: 100,
    webp: 82,
    avif: 70,
  },
  qualityFormats: ["jpeg", "webp", "avif"],
} as const;

export const VIDEO_WHATSAPP_LIMITS = {
  guestMaxInputBytes: 256 * 1024 * 1024,
  authenticatedMaxInputBytes: 2 * 1024 * 1024 * 1024,
  defaultChunkSizeBytes: 8 * 1024 * 1024,
  minChunkSizeBytes: 1 * 1024 * 1024,
  maxChunkSizeBytes: 32 * 1024 * 1024,
  acceptedMimeTypes: [
    "video/quicktime",
    "video/mp4",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
    "video/x-flv",
    "video/3gpp",
    "video/mp2t",
    "video/x-m4v",
  ],
  acceptedExtensions: [".mov", ".mp4", ".avi", ".mkv", ".webm", ".flv", ".3gp", ".mts", ".m4v"],
} as const;

export const MARGIN_PRESETS = {
  compact: { top: 36, right: 36, bottom: 36, left: 36 },
  standard: { top: 54, right: 54, bottom: 54, left: 54 },
  spacious: { top: 72, right: 72, bottom: 72, left: 72 },
} as const;
