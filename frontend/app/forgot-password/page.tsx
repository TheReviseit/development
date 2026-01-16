"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import Toast from "../components/Toast/Toast";
import { handleFirebaseError } from "../utils/firebaseErrors";
import "../login/login.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(
        "Password reset email sent! Please check your inbox and spam folder."
      );
      setEmail(""); // Clear the form
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(handleFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

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
              Reset
              <br />
              Your
              <br />
              Password
            </h1>
            <p className="sub-text">
              Don't worry, it happens to the best of us.
              <br />
              We'll send you a link to reset your password.
            </p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="auth-right">
          <div className="brand-tag">
            <img src="/logo.png" alt="Flowauxi Logo" width="24" height="24" />
            <span>Flowauxi</span>
          </div>

          <div className="form-container">
            <div className="form-header">
              <h2>Forgot Password?</h2>
              <p>Enter your email and we'll send you a reset link</p>
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
                duration={7000}
              />
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <div className="auth-divider">
                <span>OR</span>
              </div>

              <Link href="/login" className="btn-secondary">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12.5 5L7.5 10L12.5 15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back to Login
              </Link>
            </form>

            <p className="auth-footer">
              Don't have an account? <Link href="/signup">Sign Up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
