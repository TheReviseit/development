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
import { auth } from "@/src/firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Toast from "../components/Toast/Toast";
import "../login/login.css";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Get current user from Firebase auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setUserEmail(user.email);
      } else {
        // No user logged in, redirect to signup
        router.push("/signup");
      }
    });

    return () => unsubscribe();
  }, [router]);

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

  // Handle input change
  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste
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

    if (!userId) {
      setError("Please log in to verify your email");
      setLoading(false);
      return;
    }

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

      setSuccess("Email verified successfully! Redirecting...");

      // Redirect to onboarding after 1.5 seconds
      setTimeout(() => {
        router.push("/onboarding");
      }, 1500);
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || "Invalid verification code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Resend code
  const handleResend = async () => {
    setResendLoading(true);
    setError("");

    if (!userId || !userEmail) {
      setError("User information not available. Please log in again.");
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
              We've sent a verification code to your email.
              <br />
              Enter the 6-digit code to continue.
            </p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="auth-right">
          <div className="brand-tag">
            <img src="/logo.png" alt="Revise It Logo" width="24" height="24" />
            <span>Revise It</span>
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
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "center",
                  marginBottom: "24px",
                }}
              >
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
                    onPaste={index === 0 ? handlePaste : undefined}
                    style={{
                      width: "50px",
                      height: "60px",
                      textAlign: "center",
                      fontSize: "24px",
                      fontWeight: "600",
                      border: "2px solid #e5e7eb",
                      borderRadius: "8px",
                      outline: "none",
                    }}
                    className="verification-input"
                    disabled={loading}
                  />
                ))}
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Verifying..." : "Verify Email"}
              </button>

              <div className="auth-divider">
                <span>DIDN'T RECEIVE CODE?</span>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleResend}
                disabled={resendLoading || resendCooldown > 0}
                style={{ marginBottom: "16px" }}
              >
                {resendLoading
                  ? "Sending..."
                  : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend Code"}
              </button>
            </form>

            <p className="auth-footer" style={{ marginTop: "0" }}>
              Wrong email? <Link href="/signup">Sign up again</Link>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .verification-input:focus {
          border-color: #1a1a1a !important;
          box-shadow: 0 0 0 3px rgba(26, 26, 26, 0.1);
        }

        .verification-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
