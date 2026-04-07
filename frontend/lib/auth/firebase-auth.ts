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
  popupRetryAttempts: 1,
  popupRetryDelay: 500,
  autoRedirectOnPopupFailure: true,
  googleCustomParameters: {
    prompt: "select_account",
  },
};

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

/**
 * Categorizes Firebase auth errors for appropriate handling
 */
export function classifyAuthError(error: AuthError): {
  type: "popup_blocked" | "popup_closed" | "network" | "unauthorized_domain" | "cancelled" | "unknown";
  shouldRetry: boolean;
  shouldFallback: boolean;
  userMessage: string;
} {
  const code = error.code || "";
  const message = error.message || "";

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
  if (code === "auth/popup-closed-by-user") {
    return {
      type: "popup_closed",
      shouldRetry: true,
      shouldFallback: true,
      userMessage: "Sign-in window closed. Retrying with redirect...",
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
      userMessage: "This domain is not authorized. Please contact support.",
    };
  }

  // Cancelled popup request
  if (code === "auth/cancelled-popup-request") {
    return {
      type: "cancelled",
      shouldRetry: false,
      shouldFallback: true,
      userMessage: "Sign-in cancelled. Please try again.",
    };
  }

  // Initial state / storage issues
  if (message.includes("initial state")) {
    return {
      type: "unknown",
      shouldRetry: false,
      shouldFallback: true,
      userMessage: "Browser storage issue detected. Trying alternative method...",
    };
  }

  // Default: unknown error
  return {
    type: "unknown",
    shouldRetry: false,
    shouldFallback: true,
    userMessage: "Authentication failed. Trying alternative method...",
  };
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
 * Attempts sign-in with popup
 */
async function attemptPopupSignIn(
  auth: Auth,
  provider: GoogleAuthProvider,
  resolver?: PopupRedirectResolver
): Promise<AuthAttemptResult> {
  try {
    const result = await signInWithPopup(auth, provider, resolver);
    return {
      success: true,
      user: result,
      method: "popup",
    };
  } catch (error) {
    return {
      success: false,
      error: error as AuthError,
      method: "popup",
    };
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
    
    await signInWithRedirect(auth, provider, resolver);
    // Note: signInWithRedirect never returns on success (page redirects)
    return {
      success: true,
      method: "redirect",
    };
  } catch (error) {
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
  try {
    const result = await getRedirectResult(auth, resolver);
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
  }
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

    // Check sessionStorage for redirect flag
    const hasRedirectFlag = sessionStorage.getItem("_firebaseRedirectInProgress") === "true";

    // Check if we just came back from accounts.google.com
    const referrer = document.referrer || "";
    const fromGoogleAuth = referrer.includes("accounts.google.com") ||
                           referrer.includes("google.com");

    // Check for error parameters that Firebase might add
    const hasErrorParams = url.searchParams.has("error") ||
                          url.searchParams.has("error_description");

    // Clear the redirect flag if it exists (we're processing it now)
    if (hasRedirectFlag) {
      sessionStorage.removeItem("_firebaseRedirectInProgress");
    }

    const shouldCheck = hasAuthParams || hasRedirectFlag || fromGoogleAuth || hasErrorParams;

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
  try {
    sessionStorage.setItem("_firebaseRedirectInProgress", "true");
  } catch (error) {
    console.warn("[Auth] Could not set redirect flag:", error);
  }
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
  console.log("[Auth] Popup failed:", errorAnalysis.type, errorAnalysis.userMessage);

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
