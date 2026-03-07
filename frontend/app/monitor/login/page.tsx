"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./MonitorLogin.module.css";

// ============================================================================
// Monitor Login Page
// Authenticates admin users and redirects to /monitor/ai
// ============================================================================

export default function MonitorLoginPage() {
  const router = useRouter();
  const [adminKey, setAdminKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  // ──────────────────────────────────────────────
  // Check for existing session on mount
  // ──────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("monitor_admin_key");
    if (saved) {
      // Validate the saved key before redirecting
      validateAndRedirect(saved);
    } else {
      setCheckingSession(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateAndRedirect = useCallback(
    async (key: string) => {
      try {
        const res = await fetch("/api/monitor/ai", {
          headers: { "X-Monitor-Key": key },
        });

        if (res.ok) {
          router.replace("/monitor/ai");
          return;
        }

        // Key is invalid — clear it
        localStorage.removeItem("monitor_admin_key");
      } catch {
        // Network error — allow manual login
      }
      setCheckingSession(false);
    },
    [router],
  );

  // ──────────────────────────────────────────────
  // Login handler
  // ──────────────────────────────────────────────
  const handleLogin = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!adminKey.trim() || loading) return;

      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/monitor/ai", {
          headers: { "X-Monitor-Key": adminKey.trim() },
        });

        if (res.status === 401) {
          setError("Invalid admin key. Please check and try again.");
          setLoading(false);
          return;
        }

        if (!res.ok) {
          setError("Monitoring service unavailable. Please try again later.");
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (!data.success) {
          setError(data.error || "Authentication failed");
          setLoading(false);
          return;
        }

        // Save key if "Remember me" is checked
        if (rememberMe) {
          localStorage.setItem("monitor_admin_key", adminKey.trim());
        } else {
          sessionStorage.setItem("monitor_admin_key", adminKey.trim());
        }

        // Redirect to monitoring dashboard
        router.push("/monitor/ai");
      } catch {
        setError("Failed to connect to the monitoring service.");
        setLoading(false);
      }
    },
    [adminKey, loading, rememberMe, router],
  );

  // ──────────────────────────────────────────────
  // Loading state while checking session
  // ──────────────────────────────────────────────
  if (checkingSession) {
    return (
      <div className={styles.container}>
        <div className={styles.meshBackground} />
        <div className={styles.card} style={{ textAlign: "center" }}>
          <div className={styles.iconWrapper}>
            <div className={styles.iconCircle}>
              <div className={styles.spinner} />
            </div>
          </div>
          <p style={{ color: "#808080", fontSize: 14, margin: 0 }}>
            Verifying session...
          </p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // Login form
  // ──────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {/* Animated background */}
      <div className={styles.meshBackground} />
      <div className={styles.gridOverlay} />
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.orb} ${styles.orb3}`} />

      {/* Branding */}
      <div className={styles.branding}>
        <div className={styles.brandLogo}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <span className={styles.brandName}>Flowauxi Monitor</span>
      </div>

      {/* Login Card */}
      <div className={styles.card}>
        {/* Shield Icon */}
        <div className={styles.iconWrapper}>
          <div className={styles.iconCircle}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
        </div>

        {/* Header */}
        <h1 className={styles.title}>Platform Monitor</h1>
        <p className={styles.subtitle}>
          Enter your admin credentials to access the
          <br />
          AI monitoring dashboard
        </p>

        {/* Error */}
        {error && (
          <div className={styles.errorBanner}>
            <div className={styles.errorIcon}>!</div>
            <span className={styles.errorText}>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          {/* Admin Key Field */}
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="monitor-admin-key">
              Admin Key
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="monitor-admin-key"
                type={showKey ? "text" : "password"}
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter your admin key"
                className={styles.input}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              <div className={styles.inputIcon}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowKey(!showKey)}
                aria-label="Toggle key visibility"
                tabIndex={-1}
              >
                {showKey ? (
                  <svg
                    width="18"
                    height="18"
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
                    width="18"
                    height="18"
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

          {/* Remember me */}
          <div className={styles.rememberRow}>
            <input
              type="checkbox"
              id="remember-monitor"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className={styles.checkbox}
            />
            <label htmlFor="remember-monitor" className={styles.rememberLabel}>
              Remember this device
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !adminKey.trim()}
          >
            {loading ? (
              <>
                <div className={styles.spinner} />
                Authenticating...
              </>
            ) : (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Access Dashboard
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerIcon}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </div>
          <span className={styles.footerText}>
            Protected by enterprise-grade security
          </span>
        </div>
      </div>
    </div>
  );
}
