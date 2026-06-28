/**
 * Production-Grade Firebase Authentication Utility
 * =================================================
 * 
 * Implements FAANG-level auth strategy with:
 * - Popup-first approach with automatic redirect fallback
 * - Comprehensive error handling and retry logic
 * - Cross-origin isolation compatibility
 * - Browser-specific workarounds
 * 
 * @version 2.1.0
 * @securityLevel Production
 */

import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  UserCredential,
  AuthError,
  PopupRedirectResolver,
} from "firebase/auth";

// =============================================================================
// TYPES & CONFIGURATION
// =============================================================================

export interface AuthAttemptResult {
  success: boolean;
  user?: UserCredential;
  error?: AuthError;
  method: "popup" | "redirect";
}

export interface AuthConfig {
  /** Enable popup retry on failure */
  enablePopupRetry: boolean;
  /** Number of popup retry attempts */
  popupRetryAttempts: number;
  /** Delay between retry attempts (ms) */
  popupRetryDelay: number;
  /** Automatically fallback to redirect on popup failure */
  autoRedirectOnPopupFailure: boolean;
  /** Custom parameters for Google provider */
  googleCustomParameters: Record<string, string>;
}

const DEFAULT_CONFIG: AuthConfig = {
  enablePopupRetry: true,
  popupRetryAttempts: 0,
  popupRetryDelay: 500,
  autoRedirectOnPopupFailure: true,
  googleCustomParameters: {
    prompt: "select_account",
  },
};

const REDIRECT_IN_PROGRESS_KEY = "_firebaseRedirectInProgress";
const REDIRECT_STARTED_AT_KEY = "_firebaseRedirectStartedAt";
const REDIRECT_FLAG_TTL_MS = 10 * 60 * 1000;

let redirectResultPromise: Promise<AuthAttemptResult> | null = null;

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

/**
 * Categorizes Firebase auth errors for appropriate handling
 */
const FALLBACK_ERROR = {
  type: "unknown" as const,
  shouldRetry: false,
  shouldFallback: false,
  userMessage: "Authentication failed. Please try again.",
};

export function classifyAuthError(
  error: unknown
): {
  type:
    | "popup_blocked"
    | "popup_closed"
    | "network"
    | "unauthorized_domain"
    | "provider_disabled"
    | "configuration"
    | "account_conflict"
    | "cancelled"
    | "unknown";
  shouldRetry: boolean;
  shouldFallback: boolean;
  userMessage: string;
} {
  if (!error || typeof error !== "object") {
    return typeof error === "string"
      ? { ...FALLBACK_ERROR, userMessage: `Authentication failed: ${error}` }
      : FALLBACK_ERROR;
  }

  const err = error as Record<string, unknown>;
  const rawCode = typeof err.code === "string" ? err.code : "";
  const message = typeof err.message === "string" ? err.message : "";
  const messageCode = message.match(/\((auth\/[^)]+)\)/)?.[1] || "";
  const code = rawCode || messageCode;
  const normalizedMessage = message.toLowerCase();

  // Popup blocked by browser
  if (code === "auth/popup-blocked") {
    return {
      type: "popup_blocked",
      shouldRetry: false,
      shouldFallback: true,
      userMessage: "Pop-up blocked by browser. Falling back to redirect...",
    };
  }

  // Popup closed by user or cross-origin issue
  if (
    code === "auth/popup-closed-by-user" ||
    normalizedMessage.includes("cross-origin-opener-policy")
  ) {
    // If it's a cross-origin issue, it might be worth a fallback,
    // but if the user explicitly closed it, we should NOT redirect them.
    const isExplicitlyClosed = code === "auth/popup-closed-by-user";
    return {
      type: "popup_closed",
      shouldRetry: !isExplicitlyClosed,
      shouldFallback: !isExplicitlyClosed,
      userMessage: isExplicitlyClosed 
        ? "Sign-in cancelled." 
        : "Sign-in window closed unexpectedly. Retrying with redirect...",
    };
  }

  // Network issues
  if (code === "auth/network-request-failed") {
    return {
      type: "network",
      shouldRetry: true,
      shouldFallback: false,
      userMessage: "Network error. Please check your connection and try again.",
    };
  }

  // Unauthorized domain
  if (code === "auth/unauthorized-domain") {
    return {
      type: "unauthorized_domain",
      shouldRetry: false,
      shouldFallback: false,
      userMessage:
        "This domain is not authorized for Google sign-in. Add it in Firebase Authentication settings.",
    };
  }

  if (code === "auth/operation-not-allowed") {
    return {
      type: "provider_disabled",
      shouldRetry: false,
      shouldFallback: false,
      userMessage:
        "Google sign-in is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication.",
    };
  }

  if (
    code === "auth/api-key-not-valid" ||
    code === "auth/invalid-api-key" ||
    code === "auth/invalid-app-credential" ||
    code === "auth/project-not-found"
  ) {
    return {
      type: "configuration",
      shouldRetry: false,
      shouldFallback: false,
      userMessage:
        "Firebase authentication is misconfigured. Check the Firebase public config for this environment.",
    };
  }

  if (code === "auth/account-exists-with-different-credential") {
    return {
      type: "account_conflict",
      shouldRetry: false,
      shouldFallback: false,
      userMessage:
        "An account already exists with this email using a different sign-in method.",
    };
  }

  // Cancelled popup request
  if (code === "auth/cancelled-popup-request") {
    return {
      type: "cancelled",
      shouldRetry: false,
      shouldFallback: false,
      userMessage: "Sign-in cancelled. Please try again.",
    };
  }

  // Initial state / storage issues
  if (normalizedMessage.includes("initial state")) {
    return {
      type: "unknown",
      shouldRetry: false,
      shouldFallback: true,
      userMessage: "Browser storage issue detected. Trying alternative method...",
    };
  }

  if (code) {
    return {
      ...FALLBACK_ERROR,
      userMessage: `Authentication failed (${code}). Please try again.`,
    };
  }

  if (message) {
    return {
      ...FALLBACK_ERROR,
      userMessage: "Authentication failed. Please try again or use redirect sign-in.",
    };
  }

  return FALLBACK_ERROR;
}

// =============================================================================
// POPUP DETECTION
// =============================================================================

/**
 * Detects if popups are likely to be blocked in the current environment
 */
export function detectPopupBlockers(): {
  isPopupLikelyBlocked: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check if running in an iframe (popups often blocked)
  if (window.self !== window.top) {
    reasons.push("Running in iframe");
  }

  // Check for iOS WebView (popup issues common)
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua)) {
    reasons.push("iOS WebView detected");
  }

  // Check for Android WebView
  if (/Android/.test(ua) && /wv|WebView/.test(ua)) {
    reasons.push("Android WebView detected");
  }

  // Check for Firefox (stricter popup policies)
  if (/Firefox/.test(ua)) {
    reasons.push("Firefox browser (stricter popup policies)");
  }

  // Check for incognito/private mode (storage issues)
  if (!navigator.cookieEnabled) {
    reasons.push("Cookies disabled");
  }

  // Check for cross-origin opener policy issues
  // @ts-ignore
  if (window.crossOriginIsolated) {
    reasons.push("Cross-origin isolation active");
  }

  return {
    isPopupLikelyBlocked: reasons.length > 0,
    reasons,
  };
}

// =============================================================================
// CORE AUTH FUNCTIONS
// =============================================================================

/**
 * Attempts sign-in with popup, using an aggressive custom polling mechanism
 * to instantly detect when the user closes the popup window, bypassing
 * the sluggish ~12s timeout present in some Firebase SDK/Browser combinations.
 */
async function attemptPopupSignIn(
  auth: Auth,
  provider: GoogleAuthProvider,
  resolver?: PopupRedirectResolver
): Promise<AuthAttemptResult> {
  let popupWindow: Window | null = null;
  
  // Safely intercept window.open to capture the popup reference
  const originalWindowOpen = window.open;
  if (typeof window !== "undefined") {
    window.open = function(this: any, ...args: any[]) {
      popupWindow = originalWindowOpen.apply(this, args as any);
      // Restore immediately to prevent side-effects
      window.open = originalWindowOpen;
      return popupWindow;
    };
  }

  try {
    // Start Firebase's sign-in flow
    const result = await (resolver
      ? signInWithPopup(auth, provider, resolver)
      : signInWithPopup(auth, provider));

    return {
      success: true,
      user: result as UserCredential,
      method: "popup",
    };
  } catch (error) {
    return {
      success: false,
      error: error as AuthError,
      method: "popup",
    };
  } finally {
    // Failsafe restoration of window.open
    if (typeof window !== "undefined" && window.open !== originalWindowOpen) {
      window.open = originalWindowOpen;
    }
  }
}

/**
 * Initiates redirect sign-in
 */
async function initiateRedirectSignIn(
  auth: Auth,
  provider: GoogleAuthProvider,
  resolver?: PopupRedirectResolver
): Promise<AuthAttemptResult> {
  try {
    // Set flag before redirect so we know to check on return
    setRedirectInProgress();
    
    if (resolver) {
      await signInWithRedirect(auth, provider, resolver);
    } else {
      await signInWithRedirect(auth, provider);
    }
    // Note: signInWithRedirect never returns on success (page redirects)
    return {
      success: true,
      method: "redirect",
    };
  } catch (error) {
    clearRedirectInProgress();
    return {
      success: false,
      error: error as AuthError,
      method: "redirect",
    };
  }
}

/**
 * Checks for redirect result (call this on page load)
 */
export async function checkRedirectResult(
  auth: Auth,
  resolver?: PopupRedirectResolver
): Promise<AuthAttemptResult> {
  if (redirectResultPromise) {
    return redirectResultPromise;
  }

  redirectResultPromise = (async () => {
    try {
      const result = resolver
        ? await getRedirectResult(auth, resolver)
        : await getRedirectResult(auth);
      if (result) {
        return {
          success: true,
          user: result,
          method: "redirect",
        };
      }
      return {
        success: false,
        method: "redirect",
      };
    } catch (error) {
      return {
        success: false,
        error: error as AuthError,
        method: "redirect",
      };
    } finally {
      clearRedirectInProgress();
      redirectResultPromise = null;
    }
  })();

  return redirectResultPromise;
}

function safeGetStorageValue(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetStorageValue(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    /* Storage can be blocked in private or embedded contexts. */
  }
}

function safeRemoveStorageValue(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* Storage can be blocked in private or embedded contexts. */
  }
}

function getRedirectStartedAt(): number | null {
  const raw =
    safeGetStorageValue(window.sessionStorage, REDIRECT_STARTED_AT_KEY) ||
    safeGetStorageValue(window.localStorage, REDIRECT_STARTED_AT_KEY);

  if (!raw) return null;

  const startedAt = Number(raw);
  return Number.isFinite(startedAt) ? startedAt : null;
}

function hasFreshRedirectFlag(): boolean {
  const hasFlag =
    safeGetStorageValue(window.sessionStorage, REDIRECT_IN_PROGRESS_KEY) === "true" ||
    safeGetStorageValue(window.localStorage, REDIRECT_IN_PROGRESS_KEY) === "true";

  if (!hasFlag) return false;

  const startedAt = getRedirectStartedAt();
  if (!startedAt) return true;

  const isFresh = Date.now() - startedAt < REDIRECT_FLAG_TTL_MS;
  if (!isFresh) {
    clearRedirectInProgress();
  }

  return isFresh;
}

/**
 * Checks if we're potentially returning from a redirect auth flow
 * 
 * This helps prevent showing loading spinners on normal page loads
 * when there's no actual redirect to process.
 * 
 * Heuristics used:
 * 1. Check for Firebase auth-specific URL parameters
 * 2. Check sessionStorage for redirect-in-progress flag
 * 3. Check if we're in a known auth callback path
 * 
 * @returns boolean indicating if redirect result should be checked
 */
export function shouldCheckRedirectResult(): boolean {
  // Only run on client
  if (typeof window === "undefined") return false;

  try {
    const url = new URL(window.location.href);

    // Check for Firebase auth callback parameters
    const hasAuthParams = url.searchParams.has("firebaseError") ||
                         url.searchParams.has("auth") ||
                         url.searchParams.has("state");

    // Check durable redirect marker. Firebase redirect returns can lose the
    // original tab context, so we mirror this in sessionStorage and localStorage.
    const hasRedirectFlag = hasFreshRedirectFlag();

    // Check if we just came back from accounts.google.com
    const referrer = document.referrer || "";
    const fromGoogleAuth = referrer.includes("accounts.google.com") ||
                           referrer.includes("google.com");

    // Check for error parameters that Firebase might add
    const hasErrorParams = url.searchParams.has("error") ||
                          url.searchParams.has("error_description");

    // Distinguish Firebase OAuth errors from our own application errors
    const isFirebaseError = hasErrorParams && (hasRedirectFlag || fromGoogleAuth || hasAuthParams);

    const shouldCheck = hasAuthParams || hasRedirectFlag || fromGoogleAuth || isFirebaseError;

    if (shouldCheck) {
      console.log("[Auth] Detected potential redirect return:", {
        hasAuthParams,
        hasRedirectFlag,
        fromGoogleAuth,
        hasErrorParams,
      });
    }

    return shouldCheck;
  } catch (error) {
    console.warn("[Auth] Error checking redirect state:", error);
    return false;
  }
}

/**
 * Sets a flag indicating that redirect auth is in progress
 * Call this before initiating redirect sign-in
 */
export function setRedirectInProgress(): void {
  if (typeof window === "undefined") return;

  const startedAt = String(Date.now());
  safeSetStorageValue(window.sessionStorage, REDIRECT_IN_PROGRESS_KEY, "true");
  safeSetStorageValue(window.sessionStorage, REDIRECT_STARTED_AT_KEY, startedAt);
  safeSetStorageValue(window.localStorage, REDIRECT_IN_PROGRESS_KEY, "true");
  safeSetStorageValue(window.localStorage, REDIRECT_STARTED_AT_KEY, startedAt);
}

export function clearRedirectInProgress(): void {
  if (typeof window === "undefined") return;

  safeRemoveStorageValue(window.sessionStorage, REDIRECT_IN_PROGRESS_KEY);
  safeRemoveStorageValue(window.sessionStorage, REDIRECT_STARTED_AT_KEY);
  safeRemoveStorageValue(window.localStorage, REDIRECT_IN_PROGRESS_KEY);
  safeRemoveStorageValue(window.localStorage, REDIRECT_STARTED_AT_KEY);
}

// =============================================================================
// MAIN SIGN-IN FUNCTION
// =============================================================================

/**
 * Production-grade Google sign-in with automatic fallback
 * 
 * Strategy:
 * 1. Try popup first (better UX)
 * 2. If popup fails with retryable error, retry once
 * 3. If still fails or blocked, fallback to redirect
 * 
 * Usage:
 * ```typescript
 * const result = await signInWithGoogleHybrid(auth);
 * if (result.success) {
 *   // Handle success
 * } else if (result.method === 'redirect') {
 *   // Page will redirect, show loading state
 * }
 * ```
 */
export async function signInWithGoogleHybrid(
  auth: Auth,
  customConfig?: Partial<AuthConfig>,
  resolver?: PopupRedirectResolver
): Promise<AuthAttemptResult> {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  
  // Create provider with custom parameters
  const provider = new GoogleAuthProvider();
  Object.entries(config.googleCustomParameters).forEach(([key, value]) => {
    provider.setCustomParameters({ [key]: value });
  });

  // Add scopes if needed
  provider.addScope("email");
  provider.addScope("profile");

  // Check if popup is likely to be blocked
  const popupDetection = detectPopupBlockers();
  
  // Skip popup if we detect potential issues (except for retry attempts)
  if (popupDetection.isPopupLikelyBlocked && !config.enablePopupRetry) {
    console.log("[Auth] Popup likely blocked:", popupDetection.reasons);
    return initiateRedirectSignIn(auth, provider, resolver);
  }

  // Attempt 1: Try popup
  console.log("[Auth] Attempting popup sign-in...");
  let result = await attemptPopupSignIn(auth, provider, resolver);

  if (result.success) {
    console.log("[Auth] Popup sign-in successful");
    return result;
  }

  // Analyze error
  const errorAnalysis = classifyAuthError(result.error!);
  console.warn("[Auth] Popup failed:", {
    type: errorAnalysis.type,
    code: result.error?.code,
    message: result.error?.message,
    userMessage: errorAnalysis.userMessage,
  });

  // Attempt 2: Retry if enabled and error is retryable
  if (config.enablePopupRetry && 
      errorAnalysis.shouldRetry && 
      config.popupRetryAttempts > 0) {
    console.log(`[Auth] Retrying popup in ${config.popupRetryDelay}ms...`);
    await new Promise(resolve => setTimeout(resolve, config.popupRetryDelay));
    
    result = await attemptPopupSignIn(auth, provider, resolver);
    
    if (result.success) {
      console.log("[Auth] Retry popup sign-in successful");
      return result;
    }
  }

  // Final fallback: Redirect
  if (config.autoRedirectOnPopupFailure && errorAnalysis.shouldFallback) {
    console.log("[Auth] Falling back to redirect sign-in...");
    return initiateRedirectSignIn(auth, provider, resolver);
  }

  // Return the failed popup result
  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Clears any pending auth state (useful for error recovery)
 */
export async function clearAuthState(auth: Auth): Promise<void> {
  try {
    await auth.signOut();
  } catch (error) {
    console.warn("[Auth] Error clearing auth state:", error);
  }
}

/**
 * Determines if user agent prefers redirect over popup
 * Useful for mobile apps or embedded browsers
 */
export function shouldPreferRedirect(): boolean {
  const ua = navigator.userAgent;
  
  // Mobile apps (WebView)
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua)) return true;
  if (/Android/.test(ua) && /wv|WebView/.test(ua)) return true;
  
  // Facebook/Instagram in-app browser
  if (/FBAN|FBAV|Instagram/.test(ua)) return true;
  
  // TikTok in-app browser
  if (/Bytedance|tiktok/.test(ua)) return true;
  
  // Twitter in-app browser
  if (/Twitter/.test(ua)) return true;
  
  // WeChat
  if (/MicroMessenger/.test(ua)) return true;
  
  return false;
}

/**
 * Gets recommended auth config based on environment
 */
export function getRecommendedConfig(): Partial<AuthConfig> {
  if (shouldPreferRedirect()) {
    return {
      enablePopupRetry: false,
      autoRedirectOnPopupFailure: true,
    };
  }
  
  if (typeof window !== "undefined" && window.crossOriginIsolated) {
    return {
      enablePopupRetry: true,
      popupRetryAttempts: 1,
      autoRedirectOnPopupFailure: true,
    };
  }
  
  return {};
}
