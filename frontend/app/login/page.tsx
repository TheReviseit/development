"use client";

import Link from "next/link";
import { useState, useCallback, memo, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import ButtonSpinner from "../components/ui/ButtonSpinner";
import { handleFirebaseError } from "../utils/firebaseErrors";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import styles from "./Login.module.css";
import { getProductDomainFromBrowser } from "@/lib/domain/client";
import {
  signInWithGoogleHybrid,
  checkRedirectResult,
  classifyAuthError,
  getRecommendedConfig,
  shouldCheckRedirectResult,
} from "@/lib/auth/firebase-auth";

// Lazy load Toast component - only loaded when needed
const Toast = dynamic(() => import("../components/Toast/Toast"), {
  ssr: false,
});

// Memoized Eye icons to prevent re-renders
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
): Promise<{ ok: boolean; status: number; code?: string; message?: string }> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken, allowCreate }),
      });

      if (response.ok) return { ok: true, status: response.status };

      const errorData = await response.json().catch(() => ({}));
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

async function syncLoginWithAutoHeal(idToken: string) {
  const first = await syncWithRetry(idToken, false);
  if (first.ok) return first;
  if (first.status === 404 || first.code === "USER_NOT_FOUND") {
    return await syncWithRetry(idToken, true);
  }
  return first;
}

// Helper function to check onboarding status with fallback
async function checkOnboardingStatus(): Promise<boolean> {
  try {
    const response = await fetch("/api/onboarding/check");
    if (!response.ok) return false;
    const data = await response.json();
    return data.onboardingCompleted ?? false;
  } catch {
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCTION-GRADE AUTH UTILITIES (Shared with signup flow)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for session confirmation polling.
 */
const SESSION_CONFIRMATION_CONFIG = {
  maxAttempts: 5,
  baseIntervalMs: 150,
  backoffMultiplier: 1.0,
};

/**
 * Verify session cookie is readable server-side with exponential backoff polling.
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
        credentials: "include",
        cache: "no-store",
        headers: {
          "X-Request-Source": "login-flow",
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

    const delay = baseIntervalMs * (attempt + 1);
    console.log(`[Auth] Waiting ${delay}ms before retry...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  console.error(`[Auth] Session confirmation failed after ${maxAttempts} attempts`);
  return false;
}

/**
 * Circuit breaker for Firebase ID token retrieval.
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

      const tokenPromise = user.getIdToken(true);
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

      if (attempt === maxRetries) {
        console.error(`[${operationId}] All ${maxRetries + 1} attempts exhausted`);
        return null;
      }

      const backoffDelay = 100 * (attempt + 1);
      console.log(`[${operationId}] Retrying in ${backoffDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }

  return null;
}

/**
 * Log performance metrics to console and optionally to analytics.
 */
function logPerformanceMetric(measureName: string, targetMs: number): void {
  const measure = performance.getEntriesByName(measureName)[0] as PerformanceMeasure;

  if (!measure) {
    console.warn(`[AuthPerf] No measure found: ${measureName}`);
    return;
  }

  const duration = Math.round(measure.duration);
  const status = duration <= targetMs ? "✓" : "✗";

  if (process.env.NODE_ENV === "development") {
    console.log(`[AuthPerf] ${status} ${measureName}: ${duration}ms (target: ${targetMs}ms)`);
  }

  if (duration > targetMs) {
    console.warn(
      `[AuthPerf] SLOW: ${measureName} took ${duration}ms, exceeding ${targetMs}ms target`
    );
  }

  if (process.env.NODE_ENV === "production" && typeof window !== "undefined") {
    if (typeof window.gtag === "function") {
      window.gtag("event", "auth_performance", {
        event_category: "performance",
        event_label: measureName,
        value: duration,
        custom_parameter_1: duration <= targetMs ? "within_target" : "exceeded_target",
      });
    }
  }
}

/**
 * Clear all auth-related performance marks and measures.
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

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isRedirectPending, setIsRedirectPending] = useState(false);
  const [domain, setDomain] = useState<string>("dashboard");
  const router = useRouter();

  // Resolve current domain for dynamic marketing copy
  useEffect(() => {
    setDomain(getProductDomainFromBrowser());
  }, []);

  // Check for redirect result on mount (ONLY if we detect a redirect return)
  useEffect(() => {
    // Only check redirect result if we detect we're returning from a redirect
    if (!shouldCheckRedirectResult()) {
      console.log("[Login] No redirect detected, skipping check");
      return;
    }

    const handleRedirectResult = async () => {
      try {
        setGoogleLoading(true);
        setIsRedirectPending(true);
        
        console.log("[Login] Checking redirect result...");
        const result = await checkRedirectResult(auth);

        if (result.success && result.user) {
          console.log("[Login] Redirect result successful");
          const idToken = await result.user.user.getIdToken();

          // Provision user + set session cookie (canonical, with auto-heal)
          const syncResult = await syncLoginWithAutoHeal(idToken);
          if (!syncResult.ok) {
            throw new Error(syncResult.code || "AUTH_SYNC_FAILED");
          }

          // Check onboarding and redirect
          const onboardingCompleted = await checkOnboardingStatus();
          router.push(onboardingCompleted ? "/dashboard" : "/onboarding");
        } else if (result.error) {
          // Handle redirect error
          const errorAnalysis = classifyAuthError(result.error);
          console.error("[Login] Redirect auth error:", errorAnalysis);
          setError(errorAnalysis.userMessage);
          setGoogleLoading(false);
          setIsRedirectPending(false);
          setCheckingSession(false);
        } else {
          // No result and no error - might be a normal page load
          console.log("[Login] No redirect result found");
          setGoogleLoading(false);
          setIsRedirectPending(false);
          setCheckingSession(false);
        }
      } catch (err) {
        console.error("[Login] Redirect result error:", err);
        setGoogleLoading(false);
        setIsRedirectPending(false);
        setCheckingSession(false);
      }
    };

    handleRedirectResult();
  }, [router]);

  // Timeout protection: if session check takes >8s, show login form anyway
  useEffect(() => {
    if (!checkingSession) return;
    const timeout = setTimeout(() => {
      console.warn("[LOGIN] Session check timeout — showing login form");
      setCheckingSession(false);
    }, 8000);
    return () => clearTimeout(timeout);
  }, [checkingSession]);

  /**
   * Enterprise-grade session validation on mount
   */
  useEffect(() => {
    let isMounted = true;

    const validateSession = async () => {
      const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
        if (!isMounted) return;

        if (firebaseUser) {
          try {
            const idToken = await firebaseUser.getIdToken(true);
            const syncResult = await syncLoginWithAutoHeal(idToken);

            if (syncResult.ok) {
              const onboardingDone = await checkOnboardingStatus();
              if (isMounted) {
                router.replace(onboardingDone ? "/dashboard" : "/onboarding");
              }
              return;
            }

            // If we couldn't sync, clear stale Firebase session and show login form
            console.warn("[Login] Session sync failed:", syncResult);
            await auth.signOut();
          } catch (error) {
            console.error("Session validation error:", error);
            try {
              await auth.signOut();
            } catch {}
          }
        }

        if (isMounted) {
          setCheckingSession(false);
        }
      });

      return unsubscribe;
    };

    const unsubscribePromise = validateSession();

    return () => {
      isMounted = false;
      unsubscribePromise.then((unsub) => unsub?.());
    };
  }, [router]);

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
    },
    [],
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
    },
    [],
  );

  const togglePassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const clearError = useCallback(() => {
    setError("");
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await result.user.getIdToken();
        const syncResult = await syncLoginWithAutoHeal(idToken);
        if (!syncResult.ok) {
          throw new Error(syncResult.code || "AUTH_SYNC_FAILED");
        }

        const onboardingCompleted = await checkOnboardingStatus();
        router.push(onboardingCompleted ? "/dashboard" : "/onboarding");
      } catch (err: any) {
        console.error("Login error:", err);
        setError(handleFirebaseError(err));
        setLoading(false);
      }
    },
    [email, password, router],
  );

  /**
   * PRODUCTION-GRADE Google Sign In
   * =====================================================
   *
   * FAANG-level auth flow with circuit breaker, session confirmation,
   * and performance observability. Eliminates auth-to-navigation race.
   */
  const handleGoogleSignIn = useCallback(async () => {
    clearAuthPerformanceMarks();
    performance.mark("auth-start");

    setError("");
    setGoogleLoading(true);

    try {
      const envConfig = getRecommendedConfig();
      const result = await signInWithGoogleHybrid(auth, envConfig);

      // Handle redirect case
      if (result.method === "redirect" && !result.error) {
        setIsRedirectPending(true);
        return;
      }

      // Handle popup success
      if (result.success && result.user) {
        // STEP 1: Token retrieval with circuit breaker
        const idToken = await getIdTokenWithCircuitBreaker(
          result.user.user,
          2,
          5000
        );

        if (!idToken) {
          setError("Failed to retrieve authentication token. Please try again.");
          setGoogleLoading(false);
          await auth.signOut();
          return;
        }

        // STEP 2: Provision user + set session cookie (canonical, with auto-heal)
        const syncResult = await syncLoginWithAutoHeal(idToken);
        if (!syncResult.ok) {
          throw new Error(syncResult.code || "AUTH_SYNC_FAILED");
        }

        // STEP 3: Session confirmation with polling
        performance.mark("session-confirmation-start");
        const sessionConfirmed = await waitForSessionConfirmation(5, 150);
        performance.mark("session-confirmation-end");
        performance.measure(
          "session-confirmation",
          "session-confirmation-start",
          "session-confirmation-end"
        );

        if (!sessionConfirmed) {
          setError("Session verification timed out. Please refresh and try again.");
          setGoogleLoading(false);
          await auth.signOut();
          return;
        }

        performance.mark("auth-success");

        // STEP 5: Check onboarding and navigate
        const onboardingCompleted = await checkOnboardingStatus();
        performance.mark("navigation-start");

        router.push(onboardingCompleted ? "/dashboard" : "/onboarding");

        // STEP 6: Performance logging
        setTimeout(() => {
          performance.mark("navigation-complete");
          performance.measure("auth-to-nav", "auth-start", "navigation-complete");
          performance.measure("nav-latency", "navigation-start", "navigation-complete");

          logPerformanceMetric("auth-to-nav", 750);
          logPerformanceMetric("nav-latency", 400);
          logPerformanceMetric("session-confirmation", 750);

          const totalMeasure = performance.getEntriesByName("auth-to-nav")[0] as PerformanceMeasure;
          if (totalMeasure) {
            const status = totalMeasure.duration <= 750 ? "SUCCESS" : "SLOW";
            console.log(`[Auth] ${status}: Login flow completed in ${Math.round(totalMeasure.duration)}ms`);
          }
        }, 100);
      } else {
        if (result.error) {
          const errorAnalysis = classifyAuthError(result.error);
          setError(errorAnalysis.userMessage);
        }
        setGoogleLoading(false);
      }
    } catch (err: any) {
      console.error("Google sign in error:", err);
      setGoogleLoading(false);

      let errorMessage = "Failed to sign in with Google";

      if (err.code === "auth/popup-closed-by-user") {
        errorMessage = "Sign-in cancelled. Please try again and complete the Google sign-in process.";
      } else if (err.code === "auth/popup-blocked") {
        errorMessage = "Pop-up blocked by browser. Please allow pop-ups for this site and try again.";
      } else if (err.code === "auth/unauthorized-domain") {
        errorMessage = "This domain is not authorized. Please contact support.";
      } else if (err.code === "auth/cancelled-popup-request") {
        errorMessage = "Sign-in cancelled. Only one sign-in request at a time.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (err.message && err.message.includes("initial state")) {
        errorMessage = "Browser storage issue detected. Please enable cookies and try again, or try using a different browser.";
      } else {
        errorMessage = handleFirebaseError(err);
      }

      setError(errorMessage);
    }
  }, [router]);

  // Dynamic left pane content
  const isBooking = domain === "booking";
  
  const marketingContent = {
    quoteLabel: isBooking ? "WHY FLOWAUXI BOOKINGS" : "WHY FLOWAUXI",
    heading: isBooking ? (
      <>
        Provide
        <br />
        Lovely
        <br />
        Services
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
    subText: isBooking ? (
      <>
        List your offerings. Get booked instantly
        <br />
        and grow your community without the hassle.
      </>
    ) : (
      <>
        Join businesses across India automating customer conversations
        <br />
        and scaling sales without hiring extra staff.
      </>
    ),
    benefits: isBooking ? (
      <div className={styles.benefitsList}>
        <div className={styles.benefitItem}>✓ Instant booking confirmation</div>
        <div className={styles.benefitItem}>✓ Automated smart reminders</div>
        <div className={styles.benefitItem}>✓ Real-time calendar sync</div>
      </div>
    ) : (
      <div className={styles.benefitsList}>
        <div className={styles.benefitItem}>✓ AI-powered WhatsApp automation</div>
        <div className={styles.benefitItem}>✓ Automated orders & invoicing</div>
        <div className={styles.benefitItem}>✓ Broadcast campaigns & analytics</div>
      </div>
    )
  };

  // Show loading state if redirect is pending
  if (isRedirectPending) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authSplit}>
          <div className={styles.authLeft}>
            <div className={styles.quoteSection}>
              <p className={styles.quoteLabel}>{marketingContent.quoteLabel}</p>
            </div>
            <div className={styles.gradientOverlay}></div>
            <div className={styles.contentSection}>
              <h1 className={styles.mainHeading}>
                {marketingContent.heading}
              </h1>
              <p className={styles.subText}>
                {marketingContent.subText}
              </p>
              {marketingContent.benefits}
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
                  Completing sign in...
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
            <p className={styles.quoteLabel}>{marketingContent.quoteLabel}</p>
          </div>
          <div className={styles.gradientOverlay}></div>
          <div className={styles.contentSection}>
            <h1 className={styles.mainHeading}>
              {marketingContent.heading}
            </h1>
            <p className={styles.subText}>
              {marketingContent.subText}
            </p>
            {marketingContent.benefits}
          </div>
        </div>

        {/* Right Side - Form */}
        <div className={styles.authRight}>
          <div className={styles.brandTag}>
            <Image src="/logo.png" alt="Flowauxi Logo" width={24} height={24} />
            <span>Flowauxi</span>
          </div>

          <div className={styles.formContainer}>
            {checkingSession ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "300px",
                  gap: "16px",
                }}
              >
                <ButtonSpinner size={32} />
                <p style={{ color: "#666", fontSize: "14px" }}>
                  Checking session...
                </p>
              </div>
            ) : (
              <>
                <div className={styles.formHeader}>
                  <h2>Welcome Back</h2>
                  <p>Enter your email and password to access your account</p>
                </div>

                {error && (
                  <Toast message={error} type="error" onClose={clearError} />
                )}

                <form className={styles.authForm} onSubmit={handleSubmit}>
                  <div className={styles.formGroup}>
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={handleEmailChange}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="password">Password</label>
                    <div className={styles.passwordWrapper}>
                      <input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={handlePasswordChange}
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className={styles.togglePassword}
                        onClick={togglePassword}
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                    </div>
                  </div>

                  <div className={styles.formOptions}>
                    <label className={styles.checkboxLabel}>
                      <input type="checkbox" />
                      <span>Remember me</span>
                    </label>
                    <Link href="/forgot-password" className={styles.forgotLink}>
                      Forgot Password
                    </Link>
                  </div>

                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={loading || checkingSession}
                  >
                    {loading ? <ButtonSpinner size={20} /> : "Sign In"}
                  </button>

                  <button
                    type="button"
                    className={styles.btnGoogle}
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading || checkingSession}
                  >
                    {googleLoading ? (
                      <ButtonSpinner size={20} />
                    ) : (
                      <>
                        <GoogleIcon />
                        <span>Sign In with Google</span>
                      </>
                    )}
                  </button>
                </form>

                <p className={styles.authFooter}>
                  Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
