import {
  DEFAULT_THEME_ID,
  FALLBACK_THEME_ID,
  THEME_ENGINE_ENABLED,
  getThemeDefinition,
  isThemeId,
} from "./theme-registry";
import { readStoredTheme } from "./theme-storage";
import type { ThemeId } from "./theme-types";

export function resolveInitialThemeFromDom(): ThemeId {
  if (!THEME_ENGINE_ENABLED) {
    return FALLBACK_THEME_ID;
  }

  if (typeof document === "undefined") {
    return DEFAULT_THEME_ID;
  }

  const domTheme = document.documentElement.dataset.theme;
  return isThemeId(domTheme) ? domTheme : readStoredTheme();
}

export function applyThemeToDocument(themeId: ThemeId): ThemeId {
  const resolvedTheme = THEME_ENGINE_ENABLED ? themeId : FALLBACK_THEME_ID;

  if (typeof document === "undefined") {
    return resolvedTheme;
  }

  const theme = getThemeDefinition(resolvedTheme);
  const root = document.documentElement;

  root.dataset.theme = theme.id;
  root.dataset.colorScheme = theme.colorScheme;
  root.style.colorScheme = theme.colorScheme;
  root.classList.toggle("dark", theme.id === "dark");
  root.classList.toggle("light", theme.id === "light");

  const metaThemeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );

  if (metaThemeColor) {
    metaThemeColor.content = theme.metaThemeColor;
  }

  return theme.id;
}
