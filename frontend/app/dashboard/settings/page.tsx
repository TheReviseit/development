"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import styles from "./settings.module.css";

export default function SettingsPage() {
  const { firebaseUser, loading } = useAuth();
  const [copied, setCopied] = useState(false);
  const [urlSlug, setUrlSlug] = useState("");
  const [loadingSlug, setLoadingSlug] = useState(true);

  // ✅ Fetch canonical slug from business API
  useEffect(() => {
    const fetchSlug = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data?.urlSlug) {
            setUrlSlug(result.data.urlSlug);
          } else if (firebaseUser?.uid) {
            // Fallback to UID if no slug yet
            setUrlSlug(firebaseUser.uid);
          }
        }
      } catch (error) {
        console.error("Error fetching slug:", error);
        if (firebaseUser?.uid) {
          setUrlSlug(firebaseUser.uid);
        }
      } finally {
        setLoadingSlug(false);
      }
    };

    if (!loading && firebaseUser) {
      fetchSlug();
    }
  }, [loading, firebaseUser]);

  // ✅ Generate store URL using canonical slug
  const storeUrl =
    typeof window !== "undefined" && urlSlug
      ? `${window.location.origin}/store/${urlSlug}`
      : `/store/${urlSlug || "your-store-name"}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleOpenStore = () => {
    window.open(storeUrl, "_blank");
  };

  // Show loading while auth or slug is loading
  if (loading || loadingSlug) {
    return (
      <div className={styles.settingsContainer}>
        <div className={styles.settingsHeader}>
          <h1 className={styles.settingsTitle}>Settings</h1>
          <p className={styles.settingsSubtitle}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.settingsHeader}>
        <h1 className={styles.settingsTitle}>Settings</h1>
        <p className={styles.settingsSubtitle}>
          Manage your account and store preferences
        </p>
      </div>

      {/* Store Link Card */}
      <div className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardIcon}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className={styles.cardTitleGroup}>
            <h2 className={styles.cardTitle}>Your Store</h2>
            <p className={styles.cardDescription}>
              Share this link with customers to access your online store
            </p>
          </div>
        </div>

        {urlSlug ? (
          <div className={styles.storeLinkContainer}>
            <div className={styles.storeLinkBox}>
              <span className={styles.storeLinkText}>{storeUrl}</span>
            </div>
            <div className={styles.storeLinkActions}>
              <button
                className={styles.copyBtn}
                onClick={handleCopyLink}
                title={copied ? "Copied!" : "Copy link"}
              >
                {copied ? (
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
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
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
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button className={styles.openBtn} onClick={handleOpenStore}>
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
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open Store
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.cardNote}>
            Please log in to see your store link.
          </p>
        )}
      </div>

      {/* Placeholder for more settings */}
      <div className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardIcon}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div className={styles.cardTitleGroup}>
            <h2 className={styles.cardTitle}>Account Settings</h2>
            <p className={styles.cardDescription}>More settings coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
