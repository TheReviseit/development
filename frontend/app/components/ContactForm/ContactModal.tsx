"use client";

import { useEffect } from "react";
import ContactForm from "./ContactForm";

export interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  source?: "landing" | "dashboard" | "shop";
  defaultValues?: {
    name?: string;
    email?: string;
    phone?: string;
    subject?: string;
    message?: string;
  };
  onSuccess?: (data: {
    name: string;
    email: string;
    phone: string;
    subject: string;
    message: string;
  }) => void;
  onError?: (error: string) => void;
}

export default function ContactModal({
  open,
  onClose,
  source = "landing",
  defaultValues,
  onSuccess,
  onError,
}: ContactModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflowY: "auto",
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "32px",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close contact form"
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            borderRadius: "8px",
            color: "#6b7280",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f3f4f6";
            e.currentTarget.style.color = "#111827";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#6b7280";
          }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2
          style={{
            fontSize: "24px",
            fontWeight: 600,
            color: "var(--heading-color)",
            marginBottom: "24px",
            fontFamily: "var(--font-secondary)",
            letterSpacing: "-0.01em",
          }}
        >
          Get in Touch
        </h2>

        <ContactForm
          variant="inline"
          source={source}
          defaultValues={defaultValues}
          onSuccess={onSuccess}
          onError={onError}
        />
      </div>
    </div>
  );
}