"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import "./login.css";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      const createSession = async (user: any) => {
        const idToken = await user.getIdToken();
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
      };

      await createSession(result.user);

      // Check onboarding status - relies on session cookie now
      const response = await fetch("/api/onboarding/check");
      const data = await response.json();

      if (data.onboardingCompleted) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Use popup for better user experience
      const result = await signInWithPopup(auth, provider);

      // Create Session Cookie
      const idToken = await result.user.getIdToken();
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      // Create user record in Supabase if it doesn't exist
      try {
        await fetch("/api/auth/create-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firebase_uid: result.user.uid,
            full_name: result.user.displayName || "",
            email: result.user.email || "",
          }),
        });
      } catch (supabaseError) {
        console.error("Supabase user creation error:", supabaseError);
        // Continue anyway - user can still use the app
      }

      // Check onboarding status
      const response = await fetch("/api/onboarding/check");
      const data = await response.json();

      if (data.onboardingCompleted) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (err: any) {
      console.error("Google sign in error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in cancelled. Please try again.");
      } else if (err.code === "auth/popup-blocked") {
        setError("Popup was blocked. Please allow popups for this site.");
      } else {
        setError(err.message || "Failed to sign in with Google");
      }
      setGoogleLoading(false);
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
              Get
              <br />
              Everything
              <br />
              You Want
            </h1>
            <p className="sub-text">
              You can get everything you want if you work hard,
              <br />
              trust the process, and stick to the plan.
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
              <h2>Welcome Back</h2>
              <p>Enter your email and password to access your account</p>
            </div>

            {error && (
              <div style={{ color: "red", marginBottom: "10px" }}>{error}</div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? (
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

              <div className="form-options">
                <label className="checkbox-label">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>
                <Link href="/forgot-password" className="forgot-link">
                  Forgot Password
                </Link>
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Signing In..." : "Sign In"}
              </button>

              <button
                type="button"
                className="btn-google"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
              >
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
                {googleLoading ? "Signing In..." : "Sign In with Google"}
              </button>
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
