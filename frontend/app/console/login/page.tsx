"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import "../console.css";

function LoginForm() {
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
    setLoading(true);

    try {
      const response = await fetch("/api/console/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        router.push(next);
      } else {
        setError(data.message || "Invalid email or password");
        setLoading(false);
      }
    } catch (err) {
      console.error("Login error:", err);
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

      <h1 className="console-auth-title">Welcome back</h1>
      <p className="console-auth-subtitle">Sign in to your developer console</p>

      {error && <div className="console-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="console-form-group">
          <label htmlFor="email">Email</label>
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
            placeholder="Enter your password"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="console-btn console-btn-primary"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Continue"}
        </button>
      </form>

      <p className="console-auth-footer">
        Don't have an account?
        <Link
          href={`/console/signup${next !== "/console" ? `?next=${next}` : ""}`}
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function ConsoleLoginPage() {
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
        <LoginForm />
      </Suspense>
    </div>
  );
}
