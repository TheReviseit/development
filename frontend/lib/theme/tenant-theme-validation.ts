import { isThemeId } from "@/app/theme/theme-registry";
import type { ThemeId } from "@/app/theme/theme-types";

const allowedTokenPattern =
  /^--(color|chart|shadow|radius|space|motion|dash|admin|public)-[a-z0-9-]+$/;

const blockedValuePattern = /(?:url\s*\(|expression\s*\(|javascript:|@import)/i;

export interface TenantThemeTokenMap {
  id: string;
  baseTheme: ThemeId;
  tokens: Record<string, string>;
}

export function isSafeThemeTokenName(name: string): boolean {
  return allowedTokenPattern.test(name);
}

export function isSafeThemeTokenValue(value: string): boolean {
  return value.length <= 160 && !blockedValuePattern.test(value);
}

export function validateTenantThemeTokens(
  candidate: Partial<TenantThemeTokenMap>
): TenantThemeTokenMap | null {
  if (!candidate.id || !candidate.baseTheme || !isThemeId(candidate.baseTheme)) {
    return null;
  }

  const tokens = candidate.tokens ?? {};
  const sanitizedEntries = Object.entries(tokens).filter(
    ([name, value]) =>
      isSafeThemeTokenName(name) &&
      typeof value === "string" &&
      isSafeThemeTokenValue(value)
  );

  return {
    id: candidate.id,
    baseTheme: candidate.baseTheme,
    tokens: Object.fromEntries(sanitizedEntries),
  };
}
