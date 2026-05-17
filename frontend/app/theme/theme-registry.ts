import type { ThemeDefinition, ThemeId } from "./theme-types";

export const THEME_STORAGE_KEY = "flowauxi:theme:v1";
export const DEFAULT_THEME_ID: ThemeId = "light";
export const FALLBACK_THEME_ID: ThemeId = "dark";

export const THEME_ENGINE_ENABLED =
  process.env.NEXT_PUBLIC_THEME_ENGINE_ENABLED !== "false";

export const THEME_REGISTRY = [
  {
    id: "light",
    label: "Light",
    mode: "light",
    selector: 'html[data-theme="light"]',
    colorScheme: "light",
    metaThemeColor: "#f6f7fb",
    isDefault: true,
    supportsCustomTokens: true,
  },
  {
    id: "dark",
    label: "Dark",
    mode: "dark",
    selector: 'html[data-theme="dark"]',
    colorScheme: "dark",
    metaThemeColor: "#050607",
    supportsCustomTokens: true,
  },
] as const satisfies readonly ThemeDefinition[];

export const THEME_IDS = THEME_REGISTRY.map((theme) => theme.id);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

export function getThemeDefinition(themeId: ThemeId): ThemeDefinition {
  return (
    THEME_REGISTRY.find((theme) => theme.id === themeId) ??
    THEME_REGISTRY.find((theme) => theme.id === DEFAULT_THEME_ID) ??
    THEME_REGISTRY[0]
  );
}

export function coerceThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}
