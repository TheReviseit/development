"use client";

import {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  ClipboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/src/firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Toast from "../components/Toast/Toast";
import ButtonSpinner from "../components/ui/ButtonSpinner";
import { getProductDomainFromBrowser } from "@/lib/domain/client";
import {
  getOnboardingCheck,
  getOnboardingDestination,
  recordOnboardingRedirect,
} from "@/lib/auth/onboarding-check-client";
import "../login/login.css";

const OTP_LENGTH = 6;
const REDIRECT_DELAY_MS = 1500;
const emptyCode = (): string[] => Array(OTP_LENGTH).fill("");
const OTP_CODE_RE = new RegExp(`^\\d{${OTP_LENGTH}}$`);

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(emptyCode);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyInFlightRef = useRef(false);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verificationCode = code.join("");
  const isCodeComplete = OTP_CODE_RE.test(verificationCode);
  const isVerificationLocked = loading || isVerified;

  const routeAfterVerification = async () => {
    const product = getProductDomainFromBrowser();

    try {
      const status = await getOnboardingCheck({ product, force: true });
      const destination = getOnboardingDestination(status, product);
      recordOnboardingRedirect(destination);
      router.replace(destination);
    } catch (error) {
      console.error("[VerifyEmail] Failed to resolve onboarding destination:", error);
      router.replace(`/onboarding-embedded?domain=${product}`);
    }
  };

  // Get current user from Firebase auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setUserEmail(user.email);
      } else {
        // No user logged in, redirect to signup
        router.replace("/signup");
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(
        () => setResendCooldown(resendCooldown - 1),
        1000
      );
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const applyDigits = (startIndex: number, digits: string) => {
    if (isVerificationLocked) return;

    const nextDigits = digits
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH - startIndex);
    if (!nextDigits) return;

    const newCode = [...code];
    nextDigits.split("").forEach((digit, offset) => {
      newCode[startIndex + offset] = digit;
    });

    setCode(newCode);
    setError("");

    const nextFocusIndex = Math.min(
      startIndex + nextDigits.length,
      OTP_LENGTH - 1
    );
    inputRefs.current[nextFocusIndex]?.focus();
  };

  // Handle input change
  const handleChange = (index: number, value: string) => {
    if (isVerificationLocked) return;

    const digits = value.replace(/\D/g, "");

    if (digits.length > 1) {
      applyDigits(index, digits);
      return;
    }

    const newCode = [...code];
    newCode[index] = digits;
    setCode(newCode);
    setError("");

    // Auto-focus next input
    if (digits && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (isVerificationLocked) return;

    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste
  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    applyDigits(index, e.clipboardData.getData("text"));
  };

  // Submit verification
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (verifyInFlightRef.current || isVerified) {
      return;
    }

    if (!isCodeComplete) {
      setError("Kindly enter the complete 6-digit verification code.");
      return;
    }

    setError("");
    setLoading(true);
    verifyInFlightRef.current = true;

    if (!userId) {
      setError("Please log in again to verify your email.");
      setLoading(false);
      verifyInFlightRef.current = false;
      return;
    }

    let verificationSucceeded = false;

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      verificationSucceeded = true;
      setIsVerified(true);
      setSuccess("Email verified successfully! Redirecting...");

      redirectTimeoutRef.current = setTimeout(() => {
        void routeAfterVerification();
      }, REDIRECT_DELAY_MS);
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || "Invalid verification code. Please try again.");
      setCode(emptyCode());
      inputRefs.current[0]?.focus();
    } finally {
      if (!verificationSucceeded) {
        setLoading(false);
        verifyInFlightRef.current = false;
      }
    }
  };

  // Resend code
  const handleResend = async () => {
    if (resendLoading || resendCooldown > 0 || isVerificationLocked) {
      return;
    }

    setResendLoading(true);
    setError("");

    if (!userId || !userEmail) {
      setError("User information is unavailable. Please log in again.");
      setResendLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: userEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend code");
      }

      setSuccess("Verification code sent! Check your email.");
      setResendCooldown(60); // 60 second cooldown
    } catch (err: any) {
      console.error("Resend error:", err);
      setError(err.message || "Failed to resend code. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="auth-container login-page">
      <div className="auth-split">
        {/* Left Side - Gradient */}
        <div className="auth-left">
          <div className="quote-section">
            <p className="quote-label">VERIFY YOUR EMAIL</p>
          </div>
          <div className="gradient-overlay"></div>
          <div className="content-section">
            <h1 className="main-heading">
              Check
              <br />
              Your
              <br />
              Email
            </h1>
            <p className="sub-text">
              We&apos;ve sent a verification code to your email.
              <br />
              Enter the 6-digit code to continue.
            </p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="auth-right">
          <div className="brand-tag">
            <Image src="/logo.png" alt="Flowauxi Logo" width={24} height={24} />
            <span>Flowauxi</span>
          </div>

          <div className="form-container">
            <div className="form-header">
              <h2>Email Verification</h2>
              <p>Enter the 6-digit code sent to your email</p>
            </div>

            {error && (
              <Toast
                message={error}
                type="error"
                onClose={() => setError("")}
              />
            )}

            {success && (
              <Toast
                message={success}
                type="success"
                onClose={() => setSuccess("")}
                duration={3000}
              />
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="otp-input-container">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={(e) => handlePaste(index, e)}
                    className="verification-input"
                    disabled={isVerificationLocked}
                    aria-label={`Verification code digit ${index + 1}`}
                    aria-invalid={Boolean(error)}
                  />
                ))}
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={isVerificationLocked || !isCodeComplete}
              >
                {isVerified ? (
                  "Verified"
                ) : loading ? (
                  <ButtonSpinner size={20} />
                ) : (
                  "Verify Email"
                )}
              </button>

              <div className="auth-divider">
                <span>DIDN&apos;T RECEIVE CODE?</span>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleResend}
                disabled={
                  resendLoading ||
                  resendCooldown > 0 ||
                  isVerificationLocked
                }
                style={{ marginBottom: "16px" }}
              >
                {resendLoading ? (
                  <ButtonSpinner size={20} />
                ) : resendCooldown > 0 ? (
                  `Resend in ${resendCooldown}s`
                ) : (
                  "Resend Code"
                )}
              </button>
            </form>

            <p className="auth-footer" style={{ marginTop: "0" }}>
              Wrong email? <Link href="/signup">Sign up again</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
