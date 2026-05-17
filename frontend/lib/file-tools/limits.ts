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

export const MARGIN_PRESETS = {
  compact: { top: 36, right: 36, bottom: 36, left: 36 },
  standard: { top: 54, right: 54, bottom: 54, left: 54 },
  spacious: { top: 72, right: 72, bottom: 72, left: 72 },
} as const;
