export const UI_STATE_COOKIE = "flowauxi_ui_state";

export interface UiState {
  ai_settings_configured: boolean;
  store_slug: string | null;
}

export function parseUiState(value: string | undefined | null): UiState {
  if (!value) return { ai_settings_configured: false, store_slug: null };
  try {
    const parsed = JSON.parse(value);
    return {
      ai_settings_configured: parsed?.ai_settings_configured === true,
      store_slug: typeof parsed?.store_slug === "string" ? parsed.store_slug : null,
    };
  } catch {
    return { ai_settings_configured: false, store_slug: null };
  }
}

export function serializeUiState(state: UiState): string {
  return JSON.stringify(state);
}

export function getUiStateCookieOptions() {
  return {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax" as const,
  };
}

export function clientWriteUiState(state: UiState): void {
  if (typeof document === "undefined") return;
  const opts = getUiStateCookieOptions();
  const parts: string[] = [
    `${UI_STATE_COOKIE}=${encodeURIComponent(serializeUiState(state))}`,
    `path=${opts.path}`,
    `max-age=${opts.maxAge}`,
    `samesite=${opts.sameSite}`,
  ];
  if (opts.secure) parts.push("secure");
  document.cookie = parts.join("; ");
}
