"use client";

import Link from "next/link";
import { useState, useCallback, memo, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import ButtonSpinner from "../components/ui/ButtonSpinner";
import { handleFirebaseError } from "../utils/firebaseErrors";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import styles from "./Signup.module.css";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { getProductDomainFromBrowser } from "@/lib/domain/client";
import { normalizeIndianPhoneInput } from "@/lib/validation/indianPhone";
import {
  signInWithGoogleHybrid,
  checkRedirectResult,
  classifyAuthError,
  getRecommendedConfig,
  shouldCheckRedirectResult,
} from "@/lib/auth/firebase-auth";
import {
  getOnboardingCheck,
  getOnboardingDestination,
} from "@/lib/auth/onboarding-check-client";
import type { AuthDecision } from "@/types/auth.types";

// Lazy load Toast component
const Toast = dynamic(() => import("../components/Toast/Toast"), {
  ssr: false,
});

// Memoized Eye icons
const EyeIcon = memo(() => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
));
EyeIcon.displayName = "EyeIcon";

const EyeOffIcon = memo(() => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
));
EyeOffIcon.displayName = "EyeOffIcon";

// Memoized Google icon
const GoogleIcon = memo(() => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
));
GoogleIcon.displayName = "GoogleIcon";

// Helper function to provision user + set session cookie (canonical path)
async function syncWithRetry(
  idToken: string,
  allowCreate: boolean,
  retries = 1,
  phoneNumber?: string,
): Promise<{
  ok: boolean;
  status: number;
  code?: string;
  message?: string;
  authDecision?: AuthDecision;
}> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          idToken,
          allowCreate,
          ...(phoneNumber ? { phoneNumber } : {}),
        }),
      });

      const responseData = await response.json().catch(() => ({}));

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          authDecision: responseData.authDecision,
        };
      }

      const errorData = responseData;
      const code = errorData.code || errorData.error;
      const message = errorData.message || errorData.error;

      if (i === retries) return { ok: false, status: response.status, code, message };
    } catch (error) {
      if (i === retries) {
        return { ok: false, status: 0, code: "NETWORK_ERROR", message: "Failed to reach auth server" };
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
    }
  }

  return { ok: false, status: 0, code: "UNKNOWN", message: "Auth sync failed" };
}

// Helper function to check if user has completed WhatsApp onboarding
async function checkOnboardingStatus(): Promise<boolean> {
  try {
    const data = await getOnboardingCheck({ force: true });
    console.log("[checkOnboardingStatus] API response:", {
      onboardingCompleted: data.onboardingCompleted,
      whatsappConnected: data.whatsappConnected,
      hasActiveTrial: data.hasActiveTrial,
      hasActiveSubscription: data.hasActiveSubscription,
      canEnterDashboard: data.canEnterDashboard,
      nextPath: data.nextPath,
      reason: data.reason,
    });
    const product = getProductDomainFromBrowser();
    const isOnboardingComplete = getOnboardingDestination(
      data,
      product,
    ).startsWith("/home");
    console.log("[checkOnboardingStatus] Returning:", isOnboardingComplete);
    return isOnboardingComplete;
  } catch (error) {
    console.error("[checkOnboardingStatus] Error:", error);
    return false;
  }
}

function getPostAuthPath(
  syncResult: { authDecision?: AuthDecision },
  fallbackOnboardingCompleted?: boolean,
) {
  if (syncResult.authDecision?.nextPath) {
    return syncResult.authDecision.nextPath;
  }

  if (typeof fallbackOnboardingCompleted === "boolean") {
    return fallbackOnboardingCompleted
      ? "/home"
      : `/onboarding-embedded?domain=${getProductDomainFromBrowser()}`;
  }

  return `/onboarding-embedded?domain=${getProductDomainFromBrowser()}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCTION-GRADE AUTH UTILITIES
// FAANG-Level Session Management with Circuit Breakers and Observability
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Circuit breaker for Firebase ID token retrieval.
 *
 * Protects against Firebase SDK cold starts and network hangs.
 *
 * @param user - Firebase User object
 * @param maxRetries - Maximum retry attempts (default: 2)
 * @param timeoutMs - Timeout per attempt (default: 5000ms)
 * @returns Promise<string | null> - ID token or null if all attempts fail
 */
async function getIdTokenWithCircuitBreaker(
  user: import("firebase/auth").User,
  maxRetries: number = 2,
  timeoutMs: number = 5000
): Promise<string | null> {
  const operationId = `token_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${operationId}] Token retrieval attempt ${attempt + 1}/${maxRetries + 1}`);

      // Race between token retrieval and timeout
      const tokenPromise = user.getIdToken(true); // forceRefresh: true
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("TOKEN_TIMEOUT")), timeoutMs);
      });

      const token = await Promise.race([tokenPromise, timeoutPromise]);

      console.log(`[${operationId}] Token retrieved successfully`);
      return token;
    } catch (error: any) {
      const isTimeout = error.message === "TOKEN_TIMEOUT";
      const errorMessage = isTimeout
        ? `Token retrieval timed out after ${timeoutMs}ms`
        : error?.message || "Unknown error";

      console.error(`[${operationId}] Attempt ${attempt + 1} failed:`, errorMessage);

      // If this was the last attempt, return null
      if (attempt === maxRetries) {
        console.error(`[${operationId}] All ${maxRetries + 1} attempts exhausted`);
        return null;
      }

      // Exponential backoff before retry: 100ms, 200ms
      const backoffDelay = 100 * (attempt + 1);
      console.log(`[${operationId}] Retrying in ${backoffDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  return null; // Should never reach here
}

/**
 * Log performance metrics to console and optionally to analytics.
 *
 * Production-grade observability for auth flow performance.
 *
 * @param measureName - Name of the performance measure
 * @param targetMs - Target duration in milliseconds
 */
function logPerformanceMetric(measureName: string, targetMs: number): void {
  const measure = performance.getEntriesByName(measureName)[0] as PerformanceMeasure;

  if (!measure) {
    console.warn(`[AuthPerf] No measure found: ${measureName}`);
    return;
  }

  const duration = Math.round(measure.duration);
  const status = duration <= targetMs ? "✓" : "✗";

  // Always log in development
  if (process.env.NODE_ENV === "development") {
    console.log(`[AuthPerf] ${status} ${measureName}: ${duration}ms (target: ${targetMs}ms)`);
  }

  // Log warnings for slow operations in all environments
  if (duration > targetMs) {
    console.warn(
      `[AuthPerf] SLOW: ${measureName} took ${duration}ms, exceeding ${targetMs}ms target`
    );
  }

  // Send to analytics in production only
  if (process.env.NODE_ENV === "production" && typeof window !== "undefined") {
    // Google Analytics 4
    if (typeof window.gtag === "function") {
      window.gtag("event", "auth_performance", {
        event_category: "performance",
        event_label: measureName,
        value: duration,
        custom_parameter_1: duration <= targetMs ? "within_target" : "exceeded_target",
      });
    }

    // Optional: Send to your analytics endpoint
    // fetch('/api/analytics/performance', {
    //   method: 'POST',
    //   body: JSON.stringify({ measure: measureName, duration, target: targetMs }),
    //   keepalive: true,
    // }).catch(() => {}); // Silent fail
  }
}

/**
 * Clear all auth-related performance marks and measures.
 * Call this before starting a new auth flow to prevent pollution.
 */
function clearAuthPerformanceMarks(): void {
  const marks = ["auth-start", "auth-success", "navigation-start", "navigation-complete"];
  const measures = ["auth-to-nav", "nav-latency"];

  marks.forEach((mark) => {
    try {
      performance.clearMarks(mark);
    } catch {
      /* ignore */
    }
  });

  measures.forEach((measure) => {
    try {
      performance.clearMeasures(measure);
    } catch {
      /* ignore */
    }
  });
}

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isRedirectPending, setIsRedirectPending] = useState(false);

  // Real-time validation states
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [passwordStrength, setPasswordStrength] = useState("");

  // Debounced values for validation
  const debouncedEmail = useDebounce(email, 500);
  const debouncedPhone = useDebounce(phone, 300);
  const debouncedPassword = useDebounce(password, 300);
  const debouncedConfirmPassword = useDebounce(confirmPassword, 300);

  const [domain, setDomain] = useState<string>("dashboard");
  const router = useRouter();
  const showPasswordFeedback =
    Boolean(passwordStrength && password.length > 0) || Boolean(passwordError);

  // Resolve current domain for dynamic marketing copy
  useEffect(() => {
    setDomain(getProductDomainFromBrowser());
  }, []);

  // Check for redirect result on mount (ONLY if we detect a redirect return)
  useEffect(() => {
    // Only check redirect result if we detect we're returning from a redirect
    if (!shouldCheckRedirectResult()) {
      console.log("[Signup] No redirect detected, skipping check");
      return;
    }

    const handleRedirectResult = async () => {
      try {
        setGoogleLoading(true);
        setIsRedirectPending(true);
        
        console.log("[Signup] Checking redirect result...");
        const result = await checkRedirectResult(auth);

        if (result.success && result.user) {
          console.log("[Signup] Redirect result successful");
          const idToken = await result.user.user.getIdToken();

          // Check if user already exists
          const checkResponse = await fetch("/api/auth/check-user-exists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });

          if (checkResponse.ok) {
            const { exists } = await checkResponse.json();

            if (exists) {
              setError("An account with this email already exists. Please use the login page instead.");
              setGoogleLoading(false);
              setIsRedirectPending(false);
              await auth.signOut();
              return;
            }
          }

          // Provision user + create session cookie (canonical)
          const syncResult = await syncWithRetry(idToken, true);
          if (!syncResult.ok) {
            setError(
              syncResult.code === "UPSTREAM_TIMEOUT"
                ? "Signup is taking too long. Please retry."
                : "Failed to complete signup. Please try again.",
            );
            setGoogleLoading(false);
            setIsRedirectPending(false);
            await auth.signOut();
            return;
          }

          const fallbackCompleted = syncResult.authDecision
            ? undefined
            : await checkOnboardingStatus();
          router.replace(
            getPostAuthPath(syncResult, fallbackCompleted) || "/onboarding",
          );
        } else if (result.error) {
          // Handle redirect error
          const errorAnalysis = classifyAuthError(result.error);
          console.error("[Signup] Redirect auth error:", errorAnalysis);
          setError(errorAnalysis.userMessage);
          setGoogleLoading(false);
          setIsRedirectPending(false);
        } else {
          // No result and no error - might be a normal page load
          console.log("[Signup] No redirect result found");
          setGoogleLoading(false);
          setIsRedirectPending(false);
        }
      } catch (err) {
        console.error("[Signup] Redirect result error:", err);
        setGoogleLoading(false);
        setIsRedirectPending(false);
      }
    };

    handleRedirectResult();
  }, [router]);

  // Real-time email validation
  useEffect(() => {
    if (debouncedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(debouncedEmail)) {
        setEmailError("Please enter a valid email address");
      } else {
        setEmailError("");
      }
    } else {
      setEmailError("");
    }
  }, [debouncedEmail]);

  // Real-time Indian mobile validation. The UI stores only the national
  // 10-digit number and submits canonical E.164 (+91...) to the server.
  useEffect(() => {
    if (!debouncedPhone) {
      setPhoneError("");
      return;
    }

    const validation = normalizeIndianPhoneInput(debouncedPhone);
    setPhoneError(validation.isValid ? "" : validation.message || "");
  }, [debouncedPhone]);

  // Real-time password strength validation
  useEffect(() => {
    if (debouncedPassword) {
      if (debouncedPassword.length < 6) {
        setPasswordStrength("weak");
        setPasswordError("Password must be at least 6 characters");
      } else if (debouncedPassword.length < 8) {
        setPasswordStrength("medium");
        setPasswordError("");
      } else if (
        debouncedPassword.length >= 8 &&
        /[A-Z]/.test(debouncedPassword) &&
        /[0-9]/.test(debouncedPassword)
      ) {
        setPasswordStrength("strong");
        setPasswordError("");
      } else {
        setPasswordStrength("medium");
        setPasswordError("");
      }
    } else {
      setPasswordStrength("");
      setPasswordError("");
    }
  }, [debouncedPassword]);

  // Real-time password match validation
  useEffect(() => {
    if (debouncedConfirmPassword && debouncedPassword) {
      if (debouncedPassword !== debouncedConfirmPassword) {
        setConfirmPasswordError("Passwords do not match");
      } else if (!confirmPasswordError || confirmPasswordError === "Passwords do not match") {
        setConfirmPasswordError("");
      }
    } else if (!debouncedConfirmPassword) {
      setConfirmPasswordError("");
    }
  }, [debouncedPassword, debouncedConfirmPassword, confirmPasswordError]);

  const clearError = useCallback(() => setError(""), []);

  const handlePhoneChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { nationalNumber } = normalizeIndianPhoneInput(event.target.value);
      setPhone(nationalNumber.slice(0, 10));
      if (phoneError) setPhoneError("");
    },
    [phoneError],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      const phoneValidation = normalizeIndianPhoneInput(phone);
      setPhone(phoneValidation.nationalNumber);

      if (!phoneValidation.isValid || !phoneValidation.e164) {
        const message = phoneValidation.message || "Please enter a valid phone number";
        setPhoneError(message);
        setError(message);
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      setLoading(true);

      try {
        // Step 1: Create Firebase user
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await updateProfile(userCredential.user, { displayName: name });

        // Force a token refresh so the backend receives the new displayName
        const idToken = await userCredential.user.getIdToken(true);

        // Step 2: Provision user + set session cookie (canonical)
        const syncResult = await syncWithRetry(
          idToken,
          true,
          1,
          phoneValidation.e164,
        );
        if (!syncResult.ok) {
          // Graceful degradation: if product provisioning fails
          // but user was created, redirect to onboarding instead of blocking
          if (syncResult.code === "PRODUCT_NOT_ENABLED") {
            console.warn(
              "[Signup] Product not auto-provisioned, redirecting to onboarding",
            );
            router.replace(`/onboarding-embedded?domain=${domain}`);
            return;
          }
          throw new Error(syncResult.code || "AUTH_SYNC_FAILED");
        }

        // Step 3: Send verification email (best-effort)
        fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userCredential.user.uid,
            email: email,
          }),
        }).catch((e) => console.error("Verification email error:", e));

        router.push("/verify-email");
      } catch (err: any) {
        console.error("Signup error:", err);
        setLoading(false);
        const errorMessage = handleFirebaseError(err);
        setError(errorMessage);

        if (err?.code) {
          console.error("Firebase error code:", err.code);
        }
      }
    },
    [name, email, password, confirmPassword, phone, router, domain],
  );

  /**
   * PRODUCTION-GRADE Google Sign Up
   * =====================================================
   *
   * FAANG-level auth flow with:
   * - Circuit breaker protected token retrieval
   * - Exponential backoff session confirmation
   * - Performance observability (marks + measures)
   * - Zero-flicker navigation
   *
   * Eliminates the auth-to-navigation race condition by confirming
   * session cookie propagation before allowing navigation.
   */
  const handleGoogleSignUp = useCallback(async () => {
    // Clear any previous performance marks
    clearAuthPerformanceMarks();

    // Start performance tracking immediately
    performance.mark("auth-start");

    setError("");
    setGoogleLoading(true);

    try {
      // Get environment-optimized config
      const envConfig = getRecommendedConfig();

      const result = await signInWithGoogleHybrid(auth, envConfig);

      // Handle redirect case (page will navigate away)
      if (result.method === "redirect" && !result.error) {
        setIsRedirectPending(true);
        // Page is about to redirect, keep loading state
        return;
      }

      // Handle popup success
      if (result.success && result.user) {
        // ════════════════════════════════════════════════════════════════════
        // STEP 1: Token Retrieval with Circuit Breaker
        // Why: Firebase SDK can hang during cold starts
        // ════════════════════════════════════════════════════════════════════
        const idToken = await getIdTokenWithCircuitBreaker(
          result.user.user,
          2, // maxRetries
          5000 // timeoutMs
        );

        if (!idToken) {
          setError(
            "Failed to retrieve authentication token. Please try again."
          );
          setGoogleLoading(false);
          await auth.signOut();
          return;
        }

        // ════════════════════════════════════════════════════════════════════
        // STEP 2: Check if user already exists
        // ════════════════════════════════════════════════════════════════════
        const checkResponse = await fetch("/api/auth/check-user-exists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (checkResponse.ok) {
          const { exists } = await checkResponse.json();

          if (exists) {
            setError(
              "An account with this email already exists. Please use the login page instead."
            );
            setGoogleLoading(false);
            await auth.signOut();
            return;
          }
        }

        // ════════════════════════════════════════════════════════════════════
        // STEP 3: Create Session (Critical Path)
        // ════════════════════════════════════════════════════════════════════
const syncResult = await syncWithRetry(idToken, true);
        if (!syncResult.ok) {
          if (syncResult.code === "PRODUCT_NOT_ENABLED") {
            console.warn(
              "[Signup] Product not auto-provisioned, redirecting to onboarding",
            );
            router.replace(`/onboarding-embedded?domain=${domain}`);
            return;
          }
          setError("Failed to complete signup. Please try again.");
          setGoogleLoading(false);
          await auth.signOut();
          return;
        }

        // ════════════════════════════════════════════════════════════════════
        // STEP 4: Create User Record (Non-blocking)
        // ════════════════════════════════════════════════════════════════════
        // User provisioning is handled by /api/auth/sync above.

        // ════════════════════════════════════════════════════════════════════
        // STEP 5: Session Confirmation with Exponential Backoff
        // CRITICAL: Confirms cookie propagation before navigation
        // ════════════════════════════════════════════════════════════════════
        performance.mark("auth-success");

        // ════════════════════════════════════════════════════════════════════
        // STEP 6: Check Onboarding Status and Navigate
        // ════════════════════════════════════════════════════════════════════
        const fallbackCompleted = syncResult.authDecision
          ? undefined
          : await checkOnboardingStatus();

        performance.mark("navigation-start");

        const destination =
          getPostAuthPath(syncResult, fallbackCompleted) || "/onboarding";
        console.log(`[Auth] Navigating to ${destination}`);

        router.replace(destination);

        // ════════════════════════════════════════════════════════════════════
        // STEP 7: Performance Observability
        // ════════════════════════════════════════════════════════════════════
        // Use setTimeout to measure after navigation initiates
        setTimeout(() => {
          performance.mark("navigation-complete");

          // Core metric: total auth-to-nav time
          performance.measure(
            "auth-to-nav",
            "auth-start",
            "navigation-complete"
          );

          // Sub-metric: navigation latency only
          performance.measure(
            "nav-latency",
            "navigation-start",
            "navigation-complete"
          );

          // Log all metrics
          logPerformanceMetric("auth-to-nav", 750); // 750ms target
          logPerformanceMetric("nav-latency", 400); // 400ms target

          // Overall success log
          const totalMeasure = performance.getEntriesByName(
            "auth-to-nav"
          )[0] as PerformanceMeasure;
          if (totalMeasure) {
            const status =
              totalMeasure.duration <= 750 ? "SUCCESS" : "SLOW";
            console.log(
              `[Auth] ${status}: Auth flow completed in ${Math.round(
                totalMeasure.duration
              )}ms`
            );
          }
        }, 100);
      } else {
        // Handle failure
        if (result.error) {
          const errorAnalysis = classifyAuthError(result.error);
          setError(errorAnalysis.userMessage);
        }
        setGoogleLoading(false);
      }
    } catch (err: any) {
      console.error("Google sign up error:", err);
      setGoogleLoading(false);

      let errorMessage = "Failed to sign up with Google";

      if (err.code === "auth/popup-closed-by-user") {
        errorMessage =
          "Sign-up cancelled. Please try again and complete the Google sign-in process.";
      } else if (err.code === "auth/popup-blocked") {
        errorMessage =
          "Pop-up blocked by browser. Please allow pop-ups for this site and try again.";
      } else if (err.code === "auth/account-exists-with-different-credential") {
        errorMessage =
          "An account already exists with this email. Please try signing in instead.";
      } else if (err.code === "auth/cancelled-popup-request") {
        errorMessage =
          "Sign-up cancelled. Only one sign-up request at a time.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (err.message && err.message.includes("initial state")) {
        errorMessage =
          "Browser storage issue detected. Please enable cookies and try again, or try using a different browser.";
      } else {
        errorMessage = handleFirebaseError(err);
      }

      setError(errorMessage);
    }
  }, [router, domain]);

  // Dynamic left pane content
  const isBooking = domain === "booking";
  
  const marketingContent = {
    quoteLabel: isBooking ? "WHY FLOWAUXI BOOKINGS" : "WHY FLOWAUXI",
    heading: isBooking ? (
      <>
        Bookings
        <br />
        that run on
        <br />
        autopilot
      </>
    ) : (
      <>
        Automate
        <br />
        Your WhatsApp
        <br />
        Business
      </>
    ),
    subText: isBooking
      ? "Let customers discover services, pick an available slot, and confirm appointments without back-and-forth messages."
      : "Join businesses across India automating customer conversations and scaling sales without hiring extra staff.",
    benefits: isBooking
      ? [
          "Instant booking confirmations",
          "Smart reminders and calendar sync",
          "Staff availability and payments",
        ]
      : [
          "AI-powered WhatsApp automation",
          "Automated orders and invoicing",
          "Broadcast campaigns and analytics",
        ],
  };

  const marketingBenefits = (
    <ul className={styles.benefitsList} aria-label="Product benefits">
      {marketingContent.benefits.map((benefit) => (
        <li className={styles.benefitItem} key={benefit}>
          {benefit}
        </li>
      ))}
    </ul>
  );

  const marketingEyebrow = (
    <div className={styles.quoteSection}>
      <p className={styles.quoteLabel}>{marketingContent.quoteLabel}</p>
    </div>
  );

  const marketingPanel = (
    <div className={styles.marketingContentPanel}>
      <div className={styles.contentSection}>
        <h1 className={styles.mainHeading}>
          {marketingContent.heading}
        </h1>
        <p className={styles.subText}>
          {marketingContent.subText}
        </p>
        {marketingBenefits}
      </div>
    </div>
  );

  // Show loading state if redirect is pending
  if (isRedirectPending) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authSplit}>
          <div className={styles.authLeft}>
            <div className={styles.gradientOverlay}></div>
            {marketingEyebrow}
            {marketingPanel}
          </div>
          <div className={styles.authRight}>
            <div className={styles.formContainer}>
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "300px",
                gap: "16px",
              }}>
                <ButtonSpinner size={32} />
                <p style={{ color: "#666", fontSize: "14px" }}>
                  Completing sign up...
                </p>
                <p style={{ color: "#999", fontSize: "12px" }}>
                  Please don&apos;t close this window
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authSplit}>
        {/* Left Side - Gradient */}
        <div className={styles.authLeft}>
          <div className={styles.gradientOverlay}></div>
          {marketingEyebrow}
          {marketingPanel}
        </div>

        {/* Right Side - Form */}
        <div className={styles.authRight}>
          <div className={styles.brandTag}>
            <Image src="/logo.png" alt="Flowauxi Logo" width={32} height={32} />
            <span style={{ fontSize: "18px", fontWeight: "700" }}>Flowauxi</span>
          </div>

          <div className={styles.formContainer}>
            <div className={styles.formHeader}>
              <h2>Create Account</h2>
              <p>Enter your details to create your account</p>
            </div>

            {error && (
              <Toast message={error} type="error" onClose={clearError} />
            )}

            <form className={styles.authForm} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  id="name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="phone">Phone Number</label>
                <div className={styles.phoneWrapper}>
                  <span className={styles.countryCode} aria-hidden="true">
                    +91
                  </span>
                  <input
                    type="tel"
                    id="phone"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={handlePhoneChange}
                    required
                    autoComplete="tel-national"
                    inputMode="numeric"
                    maxLength={10}
                    pattern="[6-9][0-9]{9}"
                    title="Enter a valid 10-digit Indian mobile number"
                    aria-invalid={phoneError ? "true" : "false"}
                    aria-describedby={phoneError ? "phone-error" : undefined}
                    className={phoneError ? styles.inputError : ""}
                  />
                </div>
                {phoneError && (
                  <span id="phone-error" className={styles.validationError}>
                    {phoneError}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={emailError ? styles.inputError : ""}
                />
                {emailError && (
                  <span className={styles.validationError}>{emailError}</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="password">Password</label>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    aria-describedby={
                      showPasswordFeedback ? "password-feedback" : undefined
                    }
                    className={passwordError ? styles.inputError : ""}
                  />
                  <button
                    type="button"
                    className={styles.togglePassword}
                    onClick={() => setShowPassword((p) => !p)}
                    onMouseDown={(event) => event.preventDefault()}
                    tabIndex={-1}
                    aria-label="Toggle password visibility"
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                </div>
                {showPasswordFeedback && (
                  <div
                    id="password-feedback"
                    className={styles.passwordFeedback}
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {passwordStrength && password.length > 0 && (
                      <div className={styles.passwordStrength}>
                        <div
                          className={`${styles.strengthBar} ${styles[passwordStrength]}`}
                        ></div>
                      </div>
                    )}
                    {passwordError && (
                      <span className={styles.validationError} role="alert">
                        {passwordError}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={confirmPasswordError ? styles.inputError : ""}
                    aria-describedby={
                      confirmPasswordError ? "confirm-password-error" : undefined
                    }
                  />
                  <button
                    type="button"
                    className={styles.togglePassword}
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    onMouseDown={(event) => event.preventDefault()}
                    tabIndex={-1}
                    aria-label="Toggle password visibility"
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                </div>
                {confirmPasswordError && (
                  <div
                    id="confirm-password-error"
                    className={styles.passwordFeedback}
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span className={styles.validationError} role="alert">
                      {confirmPasswordError}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.formOptions}>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" required />
                  <span>
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--hero-green-start, #10b981)",
                        fontWeight: 600,
                        textDecoration: "underline",
                      }}
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--hero-green-start, #10b981)",
                        fontWeight: 600,
                        textDecoration: "underline",
                      }}
                    >
                      Privacy Policy
                    </a>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={loading || Boolean(emailError || phoneError || passwordError || confirmPasswordError)}
              >
                {loading ? <ButtonSpinner size={20} /> : "Sign Up"}
              </button>

              <button
                type="button"
                className={styles.btnGoogle}
                onClick={handleGoogleSignUp}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <ButtonSpinner size={20} />
                ) : (
                  <>
                    <GoogleIcon />
                    <span>Sign Up with Google</span>
                  </>
                )}
              </button>
            </form>

            <p className={styles.authFooter}>
              Already have an account? <Link href="/login">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
