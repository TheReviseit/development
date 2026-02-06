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
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
    null,
  );

  // Refs for OTP inputs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load email from sessionStorage on mount
  useEffect(() => {
    const storedEmail = sessionStorage.getItem("console_verify_email");
    if (storedEmail) {
      setEmail(storedEmail);
    }
    // If no email in sessionStorage, show fallback UI (don't auto-redirect)
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

  // Handle OTP input change
  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError("");

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace navigation
  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste (paste full 6-digit code)
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (pastedData.length === 6) {
      const newCode = pastedData.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  // Submit verification
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const verificationCode = code.join("");

    if (verificationCode.length !== 6) {
      setError("Please enter all 6 digits");
      return;
    }

    setError("");
    setLoading(true);

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

      setSuccess("Email verified! Redirecting to console...");

      // Clear stored email
      sessionStorage.removeItem("console_verify_email");

      // Redirect to console
      setTimeout(() => {
        router.push("/console");
      }, 1500);
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || "Invalid verification code");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Resend verification code
  const handleResend = async () => {
    if (resendCooldown > 0) return;

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
                    onPaste={handlePaste}
                    className="console-otp-input"
                    autoFocus={index === 0}
                    aria-label={`Digit ${index + 1}`}
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
                disabled={loading || code.join("").length !== 6}
              >
                {loading ? (
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
                Didn't receive the code?
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading || resendCooldown > 0}
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
