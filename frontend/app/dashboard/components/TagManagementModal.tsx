"use client";

import { useState, useCallback } from "react";
import { auth } from "@/src/firebase/firebase";
import styles from "./TagManagementModal.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TagManagementModalProps {
  isOpen: boolean;
  contactIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function TagManagementModal({
  isOpen,
  contactIds,
  onClose,
  onSuccess,
}: TagManagementModalProps) {
  const [tagsStr, setTagsStr] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleClose = useCallback(() => {
    setTagsStr("");
    setError("");
    setSuccess(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const parsedTags = tagsStr
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const handleSubmit = async () => {
    if (parsedTags.length === 0) {
      setError("Please enter at least one tag.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Authentication required.");

      console.log(
        `🏷️ Adding tags [${parsedTags.join(", ")}] to ${contactIds.length} contacts`,
      );

      // Add tags to each selected contact in parallel
      const results = await Promise.allSettled(
        contactIds.map((id) =>
          fetch(`/api/contacts/${id}/tags`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-ID": user.uid,
            },
            body: JSON.stringify({ tags: parsedTags }),
          }).then((res) => {
            if (!res.ok) throw new Error(`Failed for contact ${id}`);
            return res.json();
          }),
        ),
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      if (failed > 0) {
        console.warn(`⚠️ Tags applied to ${succeeded}/${contactIds.length}, ${failed} failed`);
      } else {
        console.log(`✅ Tags applied to all ${succeeded} contacts`);
      }

      setSuccess(true);

      // Auto-close after brief success state
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 800);
    } catch (err: any) {
      console.error("❌ Tag management error:", err);
      setError(err.message || "Failed to add tags. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Add Tags</h2>
          <button className={styles.closeBtn} onClick={handleClose}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <p className={styles.subtitle}>
            Add tags to {contactIds.length} selected contact
            {contactIds.length !== 1 ? "s" : ""}
          </p>

          {error && <div className={styles.errorText}>{error}</div>}
          {success && (
            <div className={styles.successText}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Tags applied successfully!
            </div>
          )}

          <div className={styles.inputGroup}>
            <label className={styles.label}>
              Tags (comma-separated)
            </label>
            <input
              type="text"
              className={styles.inputField}
              placeholder="e.g. vip, premium, newsletter"
              value={tagsStr}
              onChange={(e) => {
                setTagsStr(e.target.value);
                setError("");
              }}
              disabled={isLoading || success}
              autoFocus
            />
          </div>

          {/* Tag preview chips */}
          {parsedTags.length > 0 && (
            <div className={styles.tagPreview}>
              {parsedTags.map((tag) => (
                <span key={tag} className={styles.tagChip}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={isLoading || success || parsedTags.length === 0}
          >
            {isLoading ? (
              <div className={styles.spinner} />
            ) : success ? (
              "Done ✓"
            ) : (
              `Apply to ${contactIds.length}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
