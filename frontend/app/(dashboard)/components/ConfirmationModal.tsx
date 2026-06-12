"use client";

import React, { useEffect } from "react";
import styles from "./ConfirmationModal.module.css";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  isLoading?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  type = "danger",
  isLoading = false,
}: ConfirmationModalProps) {
  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConfirm();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className={styles.header}>
          <h2 id="confirm-title" className={styles.title}>
            {title}
          </h2>
          <button
            className={styles.closeBtn}
            onClick={handleCancel}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.message}>{message}</p>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            className={`${styles.confirmBtn} ${styles[type]}`}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? <div className={styles.spinner}></div> : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
