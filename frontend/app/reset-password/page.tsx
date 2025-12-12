"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import Toast from "../components/Toast/Toast";
import { handleFirebaseError } from "../utils/firebaseErrors";
import "../login/login.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [codeValid, setCodeValid] = useState(false);

  // Verify the reset code when component mounts
  useEffect(() => {
    const code = searchParams.get("oobCode");

    if (!code) {
      setError(
        "Invalid or missing reset code. Please request a new password reset link."
      );
      setVerifying(false);
      return;
    }

    setOobCode(code);

    // Verify the code is valid
    verifyPasswordResetCode(auth, code)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setCodeValid(true);
        setVerifying(false);
      })
      .catch((err) => {
        console.error("Code verification error:", err);
        setError(handleFirebaseError(err));
        setVerifying(false);
      });
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (newPassword.length < 6) {
      setError("Password should be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!oobCode) {
      setError(
        "Reset code is missing. Please try requesting a new reset link."
      );
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess("Password reset successful! Redirecting to login...");

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(handleFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while verifying code
  if (verifying) {
    return (
      <div className="auth-container login-page">
        <div className="auth-split">
          <div className="auth-left">
            <div className="quote-section">
              <p className="quote-label">A WISE QUOTE</p>
            </div>
            <div className="gradient-overlay"></div>
            <div className="content-section">
              <h1 className="main-heading">
                Reset
                <br />
                Your
                <br />
                Password
              </h1>
            </div>
          </div>
          <div className="auth-right">
            <div className="form-container" style={{ textAlign: "center" }}>
              <h2>Verifying reset link...</h2>
              <p style={{ color: "#6b7280", marginTop: "10px" }}>
                Please wait while we verify your password reset link.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error if code is invalid
  if (!codeValid) {
    return (
      <div className="auth-container login-page">
        <div className="auth-split">
          <div className="auth-left">
            <div className="quote-section">
              <p className="quote-label">A WISE QUOTE</p>
            </div>
            <div className="gradient-overlay"></div>
            <div className="content-section">
              <h1 className="main-heading">
                Invalid
                <br />
                Reset
                <br />
                Link
              </h1>
            </div>
          </div>
          <div className="auth-right">
            <div className="brand-tag">
              <img
                src="/logo.png"
                alt="Revise It Logo"
                width="24"
                height="24"
              />
              <span>Revise It</span>
            </div>
            <div className="form-container">
              <div className="form-header">
                <h2>Link Expired or Invalid</h2>
                <p>
                  This password reset link has expired or is invalid. Please
                  request a new one.
                </p>
              </div>

              {error && (
                <Toast
                  message={error}
                  type="error"
                  onClose={() => setError("")}
                />
              )}

              <Link
                href="/forgot-password"
                className="btn-primary"
                style={{
                  textAlign: "center",
                  display: "block",
                  textDecoration: "none",
                }}
              >
                Request New Reset Link
              </Link>

              <p className="auth-footer">
                Remember your password? <Link href="/login">Sign In</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container login-page">
      <div className="auth-split">
        {/* Left Side - Gradient */}
        <div className="auth-left">
          <div className="quote-section">
            <p className="quote-label">A WISE QUOTE</p>
          </div>
          <div className="gradient-overlay"></div>
          <div className="content-section">
            <h1 className="main-heading">
              Create
              <br />
              New
              <br />
              Password
            </h1>
            <p className="sub-text">
              Your new password must be different
              <br />
              from previously used passwords.
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
              <h2>Reset Password</h2>
              <p>Enter your new password for {email}</p>
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
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    id="newPassword"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showNewPassword ? (
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
                    ) : (
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
                    )}
                  </button>
                </div>
                <small style={{ color: "#6b7280", fontSize: "12px" }}>
                  Must be at least 6 characters
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showConfirmPassword ? (
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
                    ) : (
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
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Resetting Password..." : "Reset Password"}
              </button>
            </form>

            <p className="auth-footer">
              Remember your password? <Link href="/login">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
