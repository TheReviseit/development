import {
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  coerceThemeId,
  isThemeId,
} from "./theme-registry";
import type { StoredThemePreference, ThemeId } from "./theme-types";

function safeParsePreference(raw: string | null): ThemeId | null {
  if (!raw) return null;

  if (isThemeId(raw)) {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredThemePreference>;
    return isThemeId(parsed.theme) ? parsed.theme : null;
  } catch {
    return null;
  }
}

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_ID;
  }

  try {
    return safeParsePreference(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function writeStoredTheme(themeId: ThemeId): void {
  if (typeof window === "undefined") return;

  const preference: StoredThemePreference = {
    theme: coerceThemeId(themeId),
    source: "user",
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Theme persistence is a preference only; failing closed keeps the UI usable.
  }
}

export function subscribeToThemeStorage(
  onThemeChange: (themeId: ThemeId) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    onThemeChange(safeParsePreference(event.newValue) ?? DEFAULT_THEME_ID);
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
