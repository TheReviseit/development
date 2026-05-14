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
import "../console.css";

const OTP_LENGTH = 6;
const REDIRECT_DELAY_MS = 1500;
const emptyCode = (): string[] => Array(OTP_LENGTH).fill("");
const OTP_CODE_RE = new RegExp(`^\\d{${OTP_LENGTH}}$`);

/**
 * Console Email Verification Page
 *
 * Enterprise-grade OTP verification with:
 * - 6-digit code input with auto-focus
 * - Paste support for full code
 * - Resend functionality with cooldown
 * - Error handling with attempts remaining
 */
export default function ConsoleVerifyEmailPage() {
  const router = useRouter();

  // State
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(emptyCode);
  const [loading, setLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
    null,
  );

  // Refs for OTP inputs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyInFlightRef = useRef(false);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verificationCode = code.join("");
  const isCodeComplete = OTP_CODE_RE.test(verificationCode);
  const isVerificationLocked = loading || isVerified;

  // Load email from sessionStorage on mount
  useEffect(() => {
    const storedEmail = sessionStorage.getItem("console_verify_email");
    if (storedEmail) {
      setEmail(storedEmail);
    }
    // If no email in sessionStorage, show fallback UI (don't auto-redirect)
  }, []);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(
        () => setResendCooldown(resendCooldown - 1),
        1000,
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

  // Handle OTP input change
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

  // Handle backspace navigation
  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (isVerificationLocked) return;

    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste (paste full 6-digit code)
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

    let verificationSucceeded = false;

    try {
      const response = await fetch("/api/console/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          code: verificationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.attempts_remaining !== undefined) {
          setAttemptsRemaining(data.attempts_remaining);
        }
        throw new Error(data.message || "Verification failed");
      }

      verificationSucceeded = true;
      setIsVerified(true);
      setSuccess("Email verified! Redirecting to console...");

      // Clear stored email
      sessionStorage.removeItem("console_verify_email");

      // Redirect to console
      redirectTimeoutRef.current = setTimeout(() => {
        router.push("/console");
      }, REDIRECT_DELAY_MS);
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || "Invalid verification code");
      setCode(emptyCode());
      inputRefs.current[0]?.focus();
    } finally {
      if (!verificationSucceeded) {
        setLoading(false);
        verifyInFlightRef.current = false;
      }
    }
  };

  // Resend verification code
  const handleResend = async () => {
    if (resendLoading || resendCooldown > 0 || isVerificationLocked) return;

    setResendLoading(true);
    setError("");

    try {
      const response = await fetch("/api/console/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to resend code");
      }

      setSuccess("New code sent! Check your email.");
      setResendCooldown(60); // 60 second cooldown
      setAttemptsRemaining(null);

      // Clear success message after 3s
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      console.error("Resend error:", err);
      setError(err.message || "Failed to resend code");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="console-auth">
      <div className="console-auth-card">
        {/* Logo */}
        <div className="console-auth-logo">
          <span className="console-auth-logo-icon">⬡</span>
          <span className="console-auth-logo-text">Flowauxi</span>
        </div>

        {/* Header */}
        <h1 className="console-auth-title">Verify your email</h1>

        {/* Fallback UI when no email in sessionStorage */}
        {!email ? (
          <>
            <p className="console-auth-subtitle">
              Your verification session has expired or you arrived here
              directly.
            </p>
            <div
              className="console-alert console-alert-error"
              style={{ marginBottom: "16px" }}
            >
              Please start the signup process again to receive a verification
              code.
            </div>
            <Link
              href="/console/signup"
              className="console-btn console-btn-primary console-btn-full"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Return to Signup
            </Link>
          </>
        ) : (
          <>
            <p className="console-auth-subtitle">
              We sent a 6-digit code to
              <br />
              <strong>{email}</strong>
            </p>

            {/* OTP Form */}
            <form onSubmit={handleSubmit}>
              {/* OTP Input Grid */}
              <div className="console-otp-container">
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
                    className="console-otp-input"
                    autoFocus={index === 0}
                    aria-label={`Digit ${index + 1}`}
                    aria-invalid={Boolean(error)}
                    disabled={isVerificationLocked}
                  />
                ))}
              </div>

              {/* Error Message */}
              {error && (
                <div className="console-alert console-alert-error">
                  {error}
                  {attemptsRemaining !== null && attemptsRemaining > 0 && (
                    <span className="console-attempts-remaining">
                      {" "}
                      ({attemptsRemaining} attempt
                      {attemptsRemaining !== 1 ? "s" : ""} remaining)
                    </span>
                  )}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="console-alert console-alert-success">
                  {success}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="console-btn console-btn-primary console-btn-full"
                disabled={isVerificationLocked || !isCodeComplete}
              >
                {isVerified ? (
                  "Verified"
                ) : loading ? (
                  <span className="console-btn-loading">
                    <span className="console-spinner"></span>
                    Verifying...
                  </span>
                ) : (
                  "Verify Email"
                )}
              </button>
            </form>

            {/* Resend Code */}
            <div className="console-auth-resend">
              <span className="console-auth-resend-text">
                Didn&apos;t receive the code?
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={
                  resendLoading ||
                  resendCooldown > 0 ||
                  isVerificationLocked
                }
                className="console-btn-link"
              >
                {resendLoading
                  ? "Sending..."
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend Code"}
              </button>
            </div>

            {/* Footer Links */}
            <div className="console-auth-footer">
              <Link href="/console/signup" className="console-link">
                Use different email
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
