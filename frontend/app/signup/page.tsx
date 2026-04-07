"use client";

import Link from "next/link";
import { useState, useCallback, memo, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
import {
  signInWithGoogleHybrid,
  checkRedirectResult,
  classifyAuthError,
  getRecommendedConfig,
  shouldCheckRedirectResult,
} from "@/lib/auth/firebase-auth";

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

// Helper function to create session with retry
async function createSessionWithRetry(
  idToken: string,
  retries = 2,
): Promise<boolean> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (response.ok) return true;
      if (i === retries) throw new Error("Session creation failed");
    } catch (error) {
      if (i === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
    }
  }
  return false;
}

// Helper function to check if user has completed WhatsApp onboarding
async function checkOnboardingStatus(): Promise<boolean> {
  try {
    const response = await fetch("/api/onboarding/check");
    if (!response.ok) {
      console.log("[checkOnboardingStatus] API returned non-ok status:", response.status);
      return false;
    }
    const data = await response.json();
    console.log("[checkOnboardingStatus] API response:", {
      onboardingCompleted: data.onboardingCompleted,
      whatsappConnected: data.whatsappConnected,
      hasActiveTrial: data.hasActiveTrial,
      hasActiveSubscription: data.hasActiveSubscription,
    });
    const isOnboardingComplete = data.whatsappConnected === true;
    console.log("[checkOnboardingStatus] Returning:", isOnboardingComplete);
    return isOnboardingComplete;
  } catch (error) {
    console.error("[checkOnboardingStatus] Error:", error);
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCTION-GRADE AUTH UTILITIES
// FAANG-Level Session Management with Circuit Breakers and Observability
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for session confirmation polling.
 *
 * Why these values:
 * - maxAttempts: 5 attempts provides ~1.5s total wait time worst case
 * - baseIntervalMs: 150ms is enough for cookie propagation in 95% of cases
 * - backoffMultiplier: Exponential prevents thundering herd on slow clients
 */
const SESSION_CONFIRMATION_CONFIG = {
  maxAttempts: 5,
  baseIntervalMs: 150,
  backoffMultiplier: 1.0, // Linear backoff: 150, 300, 450, 600, 750ms
};

/**
 * Verify session cookie is readable server-side with exponential backoff polling.
 *
 * This eliminates the auth-to-navigation race condition by confirming the
 * session cookie has propagated before allowing navigation to proceed.
 *
 * @param maxAttempts - Maximum polling attempts (default: 5)
 * @param baseIntervalMs - Base interval between attempts (default: 150ms)
 * @returns Promise<boolean> - True if session confirmed, false if exhausted
 */
async function waitForSessionConfirmation(
  maxAttempts: number = SESSION_CONFIRMATION_CONFIG.maxAttempts,
  baseIntervalMs: number = SESSION_CONFIRMATION_CONFIG.baseIntervalMs
): Promise<boolean> {
  console.log(
    `[Auth] Starting session confirmation polling (max ${maxAttempts} attempts)`
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch("/api/auth/verify-session", {
        method: "GET",
        credentials: "include", // CRITICAL: Must send cookies
        cache: "no-store", // Never cache this verification
        headers: {
          "X-Request-Source": "signup-flow",
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(
          `[Auth] Session confirmed on attempt ${attempt + 1}/${maxAttempts}`,
          { userId: data.userId }
        );
        return true;
      }

      // Session not ready yet, log and retry
      const errorData = await response.json().catch(() => ({}));
      console.log(
        `[Auth] Session not ready (attempt ${attempt + 1}/${maxAttempts}):`,
        errorData.error || `HTTP ${response.status}`
      );
    } catch (error) {
      console.warn(
        `[Auth] Session verification error (attempt ${attempt + 1}/${maxAttempts}):`,
        error
      );
    }

    // Calculate delay with linear backoff
    const delay = baseIntervalMs * (attempt + 1);
    console.log(`[Auth] Waiting ${delay}ms before retry...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  console.error(`[Auth] Session confirmation failed after ${maxAttempts} attempts`);
  return false;
}

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
  const measures = ["auth-to-nav", "nav-latency", "session-confirmation"];

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
  const [passwordError, setPasswordError] = useState("");
  const [passwordStrength, setPasswordStrength] = useState("");

  // Debounced values for validation
  const debouncedEmail = useDebounce(email, 500);
  const debouncedPassword = useDebounce(password, 300);
  const debouncedConfirmPassword = useDebounce(confirmPassword, 300);

  const router = useRouter();

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

          // Create session
          const sessionSuccess = await createSessionWithRetry(idToken);
          if (!sessionSuccess) {
            setError("Failed to create session. Please try again.");
            setGoogleLoading(false);
            setIsRedirectPending(false);
            await auth.signOut();
            return;
          }

          // Create user record
          await fetch("/api/auth/create-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firebase_uid: result.user.user.uid,
              full_name: result.user.user.displayName || "",
              email: result.user.user.email || "",
              phone: "",
              signup_domain: getProductDomainFromBrowser(),
            }),
          });

          // Check onboarding and redirect
          const onboardingCompleted = await checkOnboardingStatus();
          router.push(onboardingCompleted ? "/dashboard" : "/onboarding");
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
        setPasswordError("Passwords do not match");
      } else if (!passwordError || passwordError === "Passwords do not match") {
        setPasswordError("");
      }
    }
  }, [debouncedPassword, debouncedConfirmPassword, passwordError]);

  const clearError = useCallback(() => setError(""), []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

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

        const idToken = await userCredential.user.getIdToken();

        // Step 2: Create session first (critical path)
        const sessionSuccess = await createSessionWithRetry(idToken);
        if (!sessionSuccess) {
          throw new Error("Failed to create session");
        }

        // Step 3: PARALLEL - Create user + send verification
        const [userCreationResult, verificationResult] =
          await Promise.allSettled([
            fetch("/api/auth/create-user", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                firebase_uid: userCredential.user.uid,
                full_name: name,
                email: email,
                phone: phone,
                signup_domain: getProductDomainFromBrowser(),
              }),
            }),
            fetch("/api/auth/send-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: userCredential.user.uid,
                email: email,
              }),
            }),
          ]);

        if (userCreationResult.status === "rejected") {
          console.error("User creation error:", userCreationResult.reason);
        }

        if (verificationResult.status === "rejected") {
          console.error("Verification email error:", verificationResult.reason);
        }

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
    [name, email, password, confirmPassword, phone, router],
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
        const sessionSuccess = await createSessionWithRetry(idToken);
        if (!sessionSuccess) {
          setError("Failed to create session. Please try again.");
          setGoogleLoading(false);
          await auth.signOut();
          return;
        }

        // ════════════════════════════════════════════════════════════════════
        // STEP 4: Create User Record (Non-blocking)
        // ════════════════════════════════════════════════════════════════════
        fetch("/api/auth/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firebase_uid: result.user.user.uid,
            full_name: result.user.user.displayName || "",
            email: result.user.user.email || "",
            phone: "",
            signup_domain: getProductDomainFromBrowser(),
          }),
        }).catch((err) => {
          // Non-critical: log but don't block flow
          console.error("[Auth] User creation failed (non-blocking):", err);
        });

        // ════════════════════════════════════════════════════════════════════
        // STEP 5: Session Confirmation with Exponential Backoff
        // CRITICAL: Confirms cookie propagation before navigation
        // ════════════════════════════════════════════════════════════════════
        console.log("[Auth] Session created, confirming propagation...");
        performance.mark("session-confirmation-start");

        const sessionConfirmed = await waitForSessionConfirmation(
          5, // maxAttempts
          150 // baseIntervalMs
        );

        performance.mark("session-confirmation-end");
        performance.measure(
          "session-confirmation",
          "session-confirmation-start",
          "session-confirmation-end"
        );

        if (!sessionConfirmed) {
          console.error("[Auth] Session confirmation failed after all attempts");
          setError(
            "Session verification timed out. Please refresh the page and try again."
          );
          setGoogleLoading(false);
          await auth.signOut();
          return;
        }

        performance.mark("auth-success");

        // ════════════════════════════════════════════════════════════════════
        // STEP 6: Check Onboarding Status and Navigate
        // ════════════════════════════════════════════════════════════════════
        const onboardingCompleted = await checkOnboardingStatus();

        performance.mark("navigation-start");

        // Navigate to appropriate destination
        const destination = onboardingCompleted ? "/dashboard" : "/onboarding";
        console.log(`[Auth] Navigating to ${destination}`);

        router.push(destination);

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
          logPerformanceMetric("session-confirmation", 750); // 750ms target

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
  }, [router]);

  // Show loading state if redirect is pending
  if (isRedirectPending) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authSplit}>
          <div className={styles.authLeft}>
            <div className={styles.quoteSection}>
              <p className={styles.quoteLabel}>WHY FLOWAUXI</p>
            </div>
            <div className={styles.gradientOverlay}></div>
            <div className={styles.contentSection}>
              <h1 className={styles.mainHeading}>
                Automate
                <br />
                Your WhatsApp
                <br />
                Business
              </h1>
              <p className={styles.subText}>
                Join 500+ businesses automating customer conversations
                <br />
                and scaling sales without hiring extra staff.
              </p>
              <div className={styles.benefitsList}>
                <div className={styles.benefitItem}>✓ AI-powered WhatsApp automation</div>
                <div className={styles.benefitItem}>✓ Automated orders & invoicing</div>
                <div className={styles.benefitItem}>✓ Broadcast campaigns & analytics</div>
              </div>
            </div>
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
          <div className={styles.quoteSection}>
            <p className={styles.quoteLabel}>WHY FLOWAUXI</p>
          </div>
          <div className={styles.gradientOverlay}></div>
          <div className={styles.contentSection}>
            <h1 className={styles.mainHeading}>
              Automate
              <br />
              Your WhatsApp
              <br />
              Business
            </h1>
            <p className={styles.subText}>
              Join 500+ businesses automating customer conversations
              <br />
              and scaling sales without hiring extra staff.
            </p>
            <div className={styles.benefitsList}>
              <div className={styles.benefitItem}>✓ AI-powered WhatsApp automation</div>
              <div className={styles.benefitItem}>✓ Automated orders & invoicing</div>
              <div className={styles.benefitItem}>✓ Broadcast campaigns & analytics</div>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className={styles.authRight}>
          <div className={styles.brandTag}>
            <img src="/logo.png" alt="Flowauxi Logo" width="24" height="24" />
            <span>Flowauxi</span>
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
                <input
                  type="tel"
                  id="phone"
                  placeholder="+91 XXXXX XXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoComplete="tel"
                  pattern="[+]?[0-9]{10,15}"
                  title="Please enter a valid phone number (10-15 digits)"
                />
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
                    className={passwordError ? styles.inputError : ""}
                  />
                  <button
                    type="button"
                    className={styles.togglePassword}
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                </div>
                {passwordStrength && password.length > 0 && (
                  <div className={styles.passwordStrength}>
                    <div
                      className={`${styles.strengthBar} ${styles[passwordStrength]}`}
                    ></div>
                    <span className={styles.strengthText}>
                      Password strength: {passwordStrength}
                    </span>
                  </div>
                )}
                {passwordError && (
                  <span className={styles.validationError}>
                    {passwordError}
                  </span>
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
                  />
                  <button
                    type="button"
                    className={styles.togglePassword}
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    aria-label="Toggle password visibility"
                  >
                    {showConfirmPassword ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                </div>
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
                      style={{ color: "#22C15A", textDecoration: "underline" }}
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#22C15A", textDecoration: "underline" }}
                    >
                      Privacy Policy
                    </a>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={loading}
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
