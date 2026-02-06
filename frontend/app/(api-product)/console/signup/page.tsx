"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import "../console.css";

function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/console";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/console/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        // Check if email verification is required
        if (data.requires_verification) {
          // Store email for the verification page (secure - not in URL)
          sessionStorage.setItem("console_verify_email", email);
          router.push("/console/verify-email");
        } else {
          router.push(next);
        }
      } else {
        setError(data.message || "Unable to create account");
        setLoading(false);
      }
    } catch (err) {
      console.error("Signup error:", err);
      setError("Unable to connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="console-auth-card">
      <div className="console-auth-logo">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>Flowauxi</span>
      </div>

      <h1 className="console-auth-title">Create your account</h1>
      <p className="console-auth-subtitle">Start sending OTPs in minutes</p>

      {error && <div className="console-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="console-form-group">
          <label htmlFor="name">Full Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            required
            autoComplete="name"
          />
        </div>

        <div className="console-form-group">
          <label htmlFor="email">Work Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="console-form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          className="console-btn console-btn-primary"
          disabled={loading}
        >
          {loading ? "Creating account..." : "Get Started"}
        </button>
      </form>

      <p className="console-auth-footer">
        Already have an account?
        <Link
          href={`/console/login${next !== "/console" ? `?next=${next}` : ""}`}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function ConsoleSignupPage() {
  return (
    <div className="console-auth">
      <Suspense
        fallback={
          <div className="console-auth-card">
            <div style={{ color: "white", textAlign: "center" }}>
              Loading...
            </div>
          </div>
        }
      >
        <SignupForm />
      </Suspense>
    </div>
  );
}
