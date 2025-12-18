"use client";

import Link from "next/link";
import { useState, useCallback, memo, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ButtonSpinner from "../components/ui/ButtonSpinner";
import { handleFirebaseError } from "../utils/firebaseErrors";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import styles from "./Signup.module.css";
import { useDebounce } from "@/lib/hooks/useDebounce";

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
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
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

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Real-time validation states
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordStrength, setPasswordStrength] = useState("");

  // Debounced values for validation
  const debouncedEmail = useDebounce(email, 500);
  const debouncedPassword = useDebounce(password, 300);
  const debouncedConfirmPassword = useDebounce(confirmPassword, 300);

  const router = useRouter();

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
          password
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
            // Create user in Supabase
            fetch("/api/auth/create-user", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                firebase_uid: userCredential.user.uid,
                full_name: name,
                email: email,
              }),
            }),
            // Send verification email
            fetch("/api/auth/send-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: userCredential.user.uid,
                email: email,
              }),
            }),
          ]);

        // Log user creation errors (non-critical)
        if (userCreationResult.status === "rejected") {
          console.error("User creation error:", userCreationResult.reason);
        }

        // Check verification email (important but not blocking)
        if (verificationResult.status === "rejected") {
          console.error("Verification email error:", verificationResult.reason);
          // Continue anyway - user can resend from verify-email page
        } else if (verificationResult.status === "fulfilled") {
          const verifyResponse = verificationResult.value;
          if (!verifyResponse.ok) {
            console.error(
              "Verification email failed with status:",
              verifyResponse.status
            );
            // Continue anyway - user can resend from verify-email page
          }
        }

        router.push("/verify-email");
      } catch (err: any) {
        console.error("Signup error:", err);

        // Ensure we always reset loading state on error
        setLoading(false);

        // Handle the error and display it to the user
        const errorMessage = handleFirebaseError(err);
        setError(errorMessage);

        // Log the specific error code for debugging
        if (err?.code) {
          console.error("Firebase error code:", err.code);
        }
      }
    },
    [name, email, password, confirmPassword, router]
  );

  const handleGoogleSignUp = useCallback(async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();

      provider.setCustomParameters({
        prompt: "select_account",
      });

      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      // Check if user already exists in the database
      const checkResponse = await fetch("/api/auth/check-user-exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (checkResponse.ok) {
        const { exists } = await checkResponse.json();

        if (exists) {
          // User already exists - show error and stop signup
          setError(
            "An account with this email already exists. Please use the login page instead."
          );
          setGoogleLoading(false);

          // Sign out the user from Firebase since they shouldn't be signing up
          await auth.signOut();
          return;
        }
      }

      // User doesn't exist - proceed with signup
      const [sessionSuccess, onboardingCompleted] = await Promise.all([
        createSessionWithRetry(idToken),
        checkOnboardingStatus(),

        fetch("/api/auth/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firebase_uid: result.user.uid,
            full_name: result.user.displayName || "",
            email: result.user.email || "",
          }),
        }).catch((err) => console.error("User creation error:", err)),

        // Send welcome email for Google users
        fetch("/api/auth/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: result.user.email || "",
            userName: result.user.displayName || "",
          }),
        }).catch((err) => console.error("Welcome email error:", err)),
      ]);

      if (!sessionSuccess) {
        throw new Error("Failed to create session");
      }

      router.push(onboardingCompleted ? "/dashboard" : "/onboarding");
    } catch (err: any) {
      console.error("Google sign up error:", err);

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
        errorMessage = "Sign-up cancelled. Only one sign-up request at a time.";
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
            <img src="/logo.png" alt="Revise It Logo" width="24" height="24" />
            <span>Revise It</span>
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
