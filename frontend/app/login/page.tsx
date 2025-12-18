"use client";

import Link from "next/link";
import { useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import ButtonSpinner from "../components/ui/ButtonSpinner";
import { handleFirebaseError } from "../utils/firebaseErrors";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import styles from "./Login.module.css";

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

// Helper function to create session with retry logic
async function createSessionWithRetry(
  idToken: string,
  retries = 2
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
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1))); // Exponential backoff
    }
  }
  return false;
}

// Helper function to check onboarding status with fallback
async function checkOnboardingStatus(): Promise<boolean> {
  try {
    const response = await fetch("/api/onboarding/check");
    if (!response.ok) return false;
    const data = await response.json();
    return data.onboardingCompleted ?? false;
  } catch {
    return false; // Default to onboarding on error
  }
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();

  // Memoized handlers to prevent unnecessary re-renders
  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
    },
    []
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
    },
    []
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
        // Step 1: Firebase authentication
        const result = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await result.user.getIdToken();

        // Step 2: PARALLEL execution - session creation and onboarding check
        const [sessionSuccess, onboardingCompleted] = await Promise.all([
          createSessionWithRetry(idToken),
          checkOnboardingStatus(),
        ]);

        if (!sessionSuccess) {
          throw new Error("Failed to create session");
        }

        // Step 3: Navigate based on onboarding status
        router.push(onboardingCompleted ? "/dashboard" : "/onboarding");
      } catch (err: any) {
        console.error("Login error:", err);
        setError(handleFirebaseError(err));
        setLoading(false);
      }
    },
    [email, password, router]
  );

  const handleGoogleSignIn = useCallback(async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      // Add custom parameters to improve auth flow
      provider.setCustomParameters({
        prompt: "select_account", // Always show account selection
      });

      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      // Step 1: Check if user exists in database
      const checkResponse = await fetch("/api/auth/check-user-exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!checkResponse.ok) {
        throw new Error("Failed to verify user account");
      }

      const { exists } = await checkResponse.json();

      // Step 2: If user doesn't exist, create them
      // This handles cases where users signed up but the record wasn't created
      if (!exists) {
        console.log("User not found in database, creating user record...");
        try {
          await fetch("/api/auth/create-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firebase_uid: result.user.uid,
              full_name: result.user.displayName || "",
              email: result.user.email || "",
            }),
          });
          console.log("User record created successfully");
        } catch (createError) {
          console.error("Error creating user record:", createError);
          // Continue anyway - user might already exist but check failed
        }
      }

      // Step 3: Proceed with login
      const [sessionSuccess, onboardingCompleted] = await Promise.all([
        createSessionWithRetry(idToken),
        checkOnboardingStatus(),
      ]);

      if (!sessionSuccess) {
        throw new Error("Failed to create session");
      }

      router.push(onboardingCompleted ? "/dashboard" : "/onboarding");
    } catch (err: any) {
      console.error("Google sign in error:", err);

      // Handle specific Firebase auth errors
      let errorMessage = "Failed to sign in with Google";

      if (err.code === "auth/popup-closed-by-user") {
        errorMessage =
          "Sign-in cancelled. Please try again and complete the Google sign-in process.";
      } else if (err.code === "auth/popup-blocked") {
        errorMessage =
          "Pop-up blocked by browser. Please allow pop-ups for this site and try again.";
      } else if (err.code === "auth/unauthorized-domain") {
        errorMessage = "This domain is not authorized. Please contact support.";
      } else if (err.code === "auth/cancelled-popup-request") {
        errorMessage = "Sign-in cancelled. Only one sign-in request at a time.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (err.message && err.message.includes("initial state")) {
        errorMessage =
          "Browser storage issue detected. Please enable cookies and try again, or try using a different browser.";
      } else {
        errorMessage = handleFirebaseError(err);
      }

      setError(errorMessage);
      setGoogleLoading(false);
    }
  }, [router]);

  return (
    <div className={styles.authContainer}>
      <div className={styles.authSplit}>
        {/* Left Side - Gradient */}
        <div className={styles.authLeft}>
          <div className={styles.quoteSection}>
            <p className={styles.quoteLabel}>A WISE QUOTE</p>
          </div>
          <div className={styles.gradientOverlay}></div>
          <div className={styles.contentSection}>
            <h1 className={styles.mainHeading}>
              Get
              <br />
              Everything
              <br />
              You Want
            </h1>
            <p className={styles.subText}>
              You can get everything you want if you work hard,
              <br />
              trust the process, and stick to the plan.
            </p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className={styles.authRight}>
          <div className={styles.brandTag}>
            <Image
              src="/logo.png"
              alt="Revise It Logo"
              width={24}
              height={24}
            />
            <span>Revise It</span>
          </div>

          <div className={styles.formContainer}>
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
                disabled={loading}
              >
                {loading ? <ButtonSpinner size={20} /> : "Sign In"}
              </button>

              <button
                type="button"
                className={styles.btnGoogle}
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
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
              Don't have an account? <Link href="/signup">Sign Up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
