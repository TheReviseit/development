"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import styles from "./DemoModal.module.css";

interface DemoModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * DemoModal — Full-screen video popup
 * Plays /demo.mp4 with autoplay when opened.
 * Closes on overlay click, X button, or Escape key.
 */
export default function DemoModal({ open, onClose }: DemoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Autoplay when opened, pause when closed
  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Autoplay blocked by browser — user can click play manually
      });
    }
    if (!open && videoRef.current) {
      videoRef.current.pause();
    }
  }, [open]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close demo"
        >
          <X size={20} />
        </button>
        <video
          ref={videoRef}
          className={styles.video}
          src="/demo.mp4"
          controls
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
}
