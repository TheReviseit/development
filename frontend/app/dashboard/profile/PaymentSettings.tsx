"use client";

import { useState, useEffect } from "react";
import styles from "./PaymentSettings.module.css";

interface PaymentData {
  razorpayKeyId: string;
  razorpayKeySecret: string;
  paymentsEnabled: boolean;
}

interface PaymentSettingsProps {
  initialData?: PaymentData;
  onSave?: () => void;
  showToast?: (message: string, type: "success" | "error") => void;
}

export default function PaymentSettings({
  initialData,
  onSave,
  showToast,
}: PaymentSettingsProps) {
  const [razorpayKeyId, setRazorpayKeyId] = useState(
    initialData?.razorpayKeyId || "",
  );
  const [razorpayKeySecret, setRazorpayKeySecret] = useState(
    initialData?.razorpayKeySecret || "",
  );
  const [paymentsEnabled, setPaymentsEnabled] = useState(
    initialData?.paymentsEnabled || false,
  );
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Update local state if initialData changes
  useEffect(() => {
    if (initialData) {
      setRazorpayKeyId(initialData.razorpayKeyId || "");
      setRazorpayKeySecret(initialData.razorpayKeySecret || "");
      setPaymentsEnabled(initialData.paymentsEnabled || false);
    }
  }, [initialData]);

  // Save payment settings
  const handleSave = async () => {
    // Validate
    if (paymentsEnabled && (!razorpayKeyId || !razorpayKeySecret)) {
      showToast?.(
        "Please enter both Key ID and Key Secret to enable payments",
        "error",
      );
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpayKeyId,
          razorpayKeySecret,
          paymentsEnabled,
        }),
      });

      if (response.ok) {
        showToast?.("Payment settings saved successfully!", "success");
        onSave?.();
      } else {
        showToast?.("Failed to save payment settings", "error");
      }
    } catch (error) {
      console.error("Error saving payment settings:", error);
      showToast?.("Failed to save payment settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.headerIcon}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </div>
        <div>
          <h2 className={styles.cardTitle}>Payment Gateway</h2>
          <p className={styles.cardDescription}>
            Connect your Razorpay account to accept online payments in your
            store
          </p>
        </div>
      </div>

      <div className={styles.content}>
        {/* Enable Toggle */}
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>Enable Online Payments</span>
            <span className={styles.toggleHint}>
              Allow customers to pay directly in your store
            </span>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={paymentsEnabled}
              onChange={(e) => setPaymentsEnabled(e.target.checked)}
            />
            <span className={styles.toggleSlider}></span>
          </label>
        </div>

        {/* API Keys Section */}
        <div className={styles.keysSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Razorpay API Keys</h3>
            <a
              href="https://dashboard.razorpay.com/app/website-app-settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.helpLink}
            >
              Get your keys →
            </a>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Key ID</label>
            <input
              type="text"
              className={styles.input}
              value={razorpayKeyId}
              onChange={(e) => setRazorpayKeyId(e.target.value)}
              placeholder="rzp_live_xxxxxxxxxxxxxxxx"
            />
            <span className={styles.inputHint}>
              Starts with rzp_live_ for production or rzp_test_ for testing
            </span>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Key Secret</label>
            <div className={styles.secretInputWrapper}>
              <input
                type={showSecret ? "text" : "password"}
                className={styles.input}
                value={razorpayKeySecret}
                onChange={(e) => setRazorpayKeySecret(e.target.value)}
                placeholder="Your secret key"
              />
              <button
                type="button"
                className={styles.toggleSecretBtn}
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? (
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
                ) : (
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
                )}
              </button>
            </div>
            <span className={styles.inputHint}>
              Keep this secret safe. Never share it publicly.
            </span>
          </div>
        </div>

        {/* Info Box */}
        <div className={styles.infoBox}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <strong>How it works:</strong>
            <p>
              Payments from your customers go directly to your Razorpay account.
              We never hold or process your funds.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.cardFooter}>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Payment Settings"}
        </button>
      </div>
    </div>
  );
}
