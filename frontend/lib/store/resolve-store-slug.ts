export function resolveEffectiveStoreSlug(params: {
  firebaseUid: string;
  urlSlug: string | null | undefined;
  hasCustomDomain: boolean;
}): string {
  const fallback = params.firebaseUid.slice(0, 8).toLowerCase();
  if (!params.hasCustomDomain) return fallback;
  const trimmed = params.urlSlug?.trim();
  return trimmed || fallback;
}

export function isAiSettingsConfigured(
  businessName: string | null | undefined,
): boolean {
  return Boolean(businessName?.trim());
}
