/**
 * Client ID Management
 * ====================
 *
 * FAANG-level session persistence for analytics.
 *
 * Uses _fa_client_id cookie (not _ga) to avoid conflicts with GA internal logic.
 * Persists across sessions after consent is granted.
 *
 * Features:
 *   - UUID generation for new sessions
 *   - Cookie-based persistence
 *   - Consent-aware (only persist after consent)
 *   - Consent versioning for audit trails
 */

import { isDebugMode } from "./config";

// =============================================================================
// CONSTANTS
// =============================================================================

const CLIENT_ID_COOKIE_NAME = "_fa_client_id";
const CONSENT_VERSION_COOKIE_NAME = "_fa_consent_version";
const COOKIE_OPTIONS = {
  path: "/",
  sameSite: "Lax" as const,
  secure: true,
  maxAge: 365 * 24 * 60 * 60, // 1 year
};

// =============================================================================
// TYPES
// =============================================================================

export interface ClientIdState {
  clientId: string;
  consentVersion: number;
  firstVisit: number;
  lastVisit: number;
}

// =============================================================================
// STATE
// =============================================================================

let _clientId: string | null = null;
let _consentVersion: number = 1;
let _initialized: boolean = false;

// =============================================================================
// UUID GENERATION (Client-side)
// =============================================================================

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =============================================================================
// COOKIE UTILITIES
// =============================================================================

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(
  name: string,
  value: string,
  options?: Partial<typeof COOKIE_OPTIONS>
): void {
  if (typeof document === "undefined") return;

  const opts = { ...COOKIE_OPTIONS, ...options };
  const expires = new Date(Date.now() + opts.maxAge! * 1000).toUTCString();

  document.cookie =
    `${name}=${encodeURIComponent(value)};expires=${expires};path=${opts.path};sameSite=${opts.sameSite}${opts.secure ? ";secure" : ""}`;
}

function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

// =============================================================================
// CLIENT ID MANAGEMENT
// =============================================================================

/**
 * Initialize client ID.
 * Reads from cookie or generates new.
 * Must be called after consent is granted.
 */
export function initializeClientId(): void {
  if (typeof window === "undefined" || _initialized) return;

  let existingClientId = getCookie(CLIENT_ID_COOKIE_NAME);
  let existingConsentVersion = parseInt(
    getCookie(CONSENT_VERSION_COOKIE_NAME) || "0",
    10
  );

  if (existingClientId) {
    _clientId = existingClientId;

    if (isDebugMode()) {
      console.log(
        "%c[Analytics:ClientId] Reusing existing client ID",
        "color: #10B981;",
        { clientId: _clientId }
      );
    }
  } else {
    _clientId = generateUUID();
    setCookie(CLIENT_ID_COOKIE_NAME, _clientId);

    if (isDebugMode()) {
      console.log(
        "%c[Analytics:ClientId] Generated new client ID",
        "color: #10B981;",
        { clientId: _clientId }
      );
    }
  }

  _consentVersion = existingConsentVersion || 1;
  _initialized = true;
}

/**
 * Get the current client ID.
 */
export function getClientId(): string | null {
  return _clientId;
}

/**
 * Get current consent version.
 */
export function getConsentVersion(): number {
  return _consentVersion;
}

/**
 * Increment consent version (called on consent state change).
 * Returns the new version number.
 */
export function incrementConsentVersion(): number {
  _consentVersion += 1;
  setCookie(CONSENT_VERSION_COOKIE_NAME, _consentVersion.toString());

  if (isDebugMode()) {
    console.log(
      "%c[Analytics:ClientId] Consent version incremented",
      "color: #F59E0B;",
      { consentVersion: _consentVersion }
    );
  }

  return _consentVersion;
}

/**
 * Reset client ID (called on consent revoke).
 * Clears all cookies and resets state.
 */
export function resetClientId(): void {
  if (typeof window === "undefined") return;

  deleteCookie(CLIENT_ID_COOKIE_NAME);
  deleteCookie(CONSENT_VERSION_COOKIE_NAME);

  _clientId = null;
  _consentVersion = 1;
  _initialized = false;

  if (isDebugMode()) {
    console.log(
      "%c[Analytics:ClientId] Client ID reset (consent revoked)",
      "color: #EF4444;"
    );
  }
}

/**
 * Check if client ID is initialized.
 */
export function isClientIdInitialized(): boolean {
  return _initialized;
}

// =============================================================================
// WINDOW EXPOSURE
// =============================================================================

declare global {
  interface Window {
    __flowauxi_client_id: string | null;
    __flowauxi_consent_version: number;
  }
}

if (typeof window !== "undefined") {
  window.__flowauxi_client_id = null;
  window.__flowauxi_consent_version = 1;
}
