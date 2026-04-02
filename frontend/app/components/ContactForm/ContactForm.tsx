"use client";

import { useContactForm, type UseContactFormOptions } from "@/lib/hooks/useContactForm";

export interface ContactFormProps {
  variant?: "inline" | "modal" | "compact";
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
  accessKey?: string;
  className?: string;
  id?: string;
}

export default function ContactForm({
  variant = "inline",
  source = "landing",
  defaultValues,
  onSuccess,
  onError,
  accessKey,
  className = "",
  id,
}: ContactFormProps) {
  const hookOptions: UseContactFormOptions = {
    defaultValues,
    source,
    onSuccess,
    onError,
    accessKey,
  };

  const {
    formData,
    errors,
    isSubmitting,
    submitStatus,
    honeypot,
    handleChange,
    handleSubmit,
  } = useContactForm(hookOptions);

  const formId = id || `contact-form-${source}`;
  const isCompact = variant === "compact";

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className={`contact-form ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: isCompact ? "16px" : "24px",
      }}
    >
      {submitStatus.type && (
        <div
          className={`alert alert-${submitStatus.type}`}
          style={{
            padding: "1rem",
            marginBottom: isCompact ? "0.5rem" : "1.5rem",
            borderRadius: "8px",
            backgroundColor:
              submitStatus.type === "success"
                ? "rgba(0, 0, 0, 1)"
                : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${
              submitStatus.type === "success"
                ? "rgba(39, 219, 105, 0.3)"
                : "rgba(239, 68, 68, 0.3)"
            }`,
            color: submitStatus.type === "success" ? "#ffffffff" : "#ef4444",
          }}
        >
          {submitStatus.message}
        </div>
      )}

      <input type="hidden" name="honeypot" value={honeypot} tabIndex={-1} autoComplete="off" />

      <div
        className="form-row"
        style={{
          display: "grid",
          gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr",
          gap: isCompact ? "12px" : "20px",
        }}
      >
        <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label htmlFor={`${formId}-name`} className="form-label" style={{ fontSize: "14px", fontWeight: 600, color: "var(--heading-color)", marginBottom: "4px", letterSpacing: "0.01em", fontFamily: "var(--font-primary)" }}>
            Full Name
          </label>
          <input
            type="text"
            id={`${formId}-name`}
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`form-input ${errors.name ? "error" : ""}`}
            placeholder="John Doe"
            style={{
              width: "100%",
              padding: "14px 18px",
              border: `1px solid ${errors.name ? "#ef4444" : "#d1d5db"}`,
              borderRadius: "12px",
              fontSize: "15px",
              fontFamily: "var(--font-primary)",
              color: "var(--heading-color, #111827)",
              background: "#f9fafb",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              outline: "none",
              lineHeight: "1.5",
              letterSpacing: "0.005em",
              fontWeight: 400,
            }}
          />
          {errors.name && (
            <span className="error-message" style={{ fontSize: "13px", color: "#ef4444", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              ⚠ {errors.name}
            </span>
          )}
        </div>

        <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label htmlFor={`${formId}-email`} className="form-label" style={{ fontSize: "14px", fontWeight: 600, color: "var(--heading-color)", marginBottom: "4px", letterSpacing: "0.01em", fontFamily: "var(--font-primary)" }}>
            Email Address
          </label>
          <input
            type="email"
            id={`${formId}-email`}
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={`form-input ${errors.email ? "error" : ""}`}
            placeholder="john@example.com"
            style={{
              width: "100%",
              padding: "14px 18px",
              border: `1px solid ${errors.email ? "#ef4444" : "#d1d5db"}`,
              borderRadius: "12px",
              fontSize: "15px",
              fontFamily: "var(--font-primary)",
              color: "var(--heading-color, #111827)",
              background: "#f9fafb",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              outline: "none",
              lineHeight: "1.5",
              letterSpacing: "0.005em",
              fontWeight: 400,
            }}
          />
          {errors.email && (
            <span className="error-message" style={{ fontSize: "13px", color: "#ef4444", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              ⚠ {errors.email}
            </span>
          )}
        </div>
      </div>

      <div
        className="form-row"
        style={{
          display: "grid",
          gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr",
          gap: isCompact ? "12px" : "20px",
        }}
      >
        <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label htmlFor={`${formId}-phone`} className="form-label" style={{ fontSize: "14px", fontWeight: 600, color: "var(--heading-color)", marginBottom: "4px", letterSpacing: "0.01em", fontFamily: "var(--font-primary)" }}>
            Phone Number
          </label>
          <input
            type="tel"
            id={`${formId}-phone`}
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className={`form-input ${errors.phone ? "error" : ""}`}
            placeholder="+1 (555) 123-4567"
            style={{
              width: "100%",
              padding: "14px 18px",
              border: `1px solid ${errors.phone ? "#ef4444" : "#d1d5db"}`,
              borderRadius: "12px",
              fontSize: "15px",
              fontFamily: "var(--font-primary)",
              color: "var(--heading-color, #111827)",
              background: "#f9fafb",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              outline: "none",
              lineHeight: "1.5",
              letterSpacing: "0.005em",
              fontWeight: 400,
            }}
          />
          {errors.phone && (
            <span className="error-message" style={{ fontSize: "13px", color: "#ef4444", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              ⚠ {errors.phone}
            </span>
          )}
        </div>

        <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label htmlFor={`${formId}-subject`} className="form-label" style={{ fontSize: "14px", fontWeight: 600, color: "var(--heading-color)", marginBottom: "4px", letterSpacing: "0.01em", fontFamily: "var(--font-primary)" }}>
            Subject
          </label>
          <input
            type="text"
            id={`${formId}-subject`}
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            className={`form-input ${errors.subject ? "error" : ""}`}
            placeholder="How can we help?"
            style={{
              width: "100%",
              padding: "14px 18px",
              border: `1px solid ${errors.subject ? "#ef4444" : "#d1d5db"}`,
              borderRadius: "12px",
              fontSize: "15px",
              fontFamily: "var(--font-primary)",
              color: "var(--heading-color, #111827)",
              background: "#f9fafb",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              outline: "none",
              lineHeight: "1.5",
              letterSpacing: "0.005em",
              fontWeight: 400,
            }}
          />
          {errors.subject && (
            <span className="error-message" style={{ fontSize: "13px", color: "#ef4444", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              ⚠ {errors.subject}
            </span>
          )}
        </div>
      </div>

      <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label htmlFor={`${formId}-message`} className="form-label" style={{ fontSize: "14px", fontWeight: 600, color: "var(--heading-color)", marginBottom: "4px", letterSpacing: "0.01em", fontFamily: "var(--font-primary)" }}>
          Message
        </label>
        <textarea
          id={`${formId}-message`}
          name="message"
          value={formData.message}
          onChange={handleChange}
          className={`form-textarea ${errors.message ? "error" : ""}`}
          placeholder="Tell us more about your inquiry..."
          rows={isCompact ? 4 : 6}
          style={{
            width: "100%",
            padding: "14px 18px",
            border: `1px solid ${errors.message ? "#ef4444" : "#d1d5db"}`,
            borderRadius: "12px",
            fontSize: "15px",
            fontFamily: "var(--font-primary)",
            color: "var(--heading-color, #111827)",
            background: "#f9fafb",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            outline: "none",
            lineHeight: "1.5",
            letterSpacing: "0.005em",
            fontWeight: 400,
            resize: "vertical",
            minHeight: isCompact ? "100px" : "140px",
          }}
        />
        {errors.message && (
          <span className="error-message" style={{ fontSize: "13px", color: "#ef4444", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
            ⚠ {errors.message}
          </span>
        )}
      </div>

      <button
        type="submit"
        className="btn btn-primary contact-submit-btn"
        disabled={isSubmitting}
        style={{
          marginTop: isCompact ? "0" : "8px",
          width: "100%",
          padding: isCompact ? "12px 24px" : "16px 32px",
          fontSize: isCompact ? "14px" : "16px",
          fontWeight: 600,
          position: "relative",
          overflow: "hidden",
          background: "#000000 !important",
          color: "white !important",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          border: "none",
          cursor: isSubmitting ? "not-allowed" : "pointer",
          opacity: isSubmitting ? 0.7 : 1,
        }}
      >
        {isSubmitting ? (
          <>
            <span className="spinner" style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid rgba(255, 255, 255, 0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            Sending...
          </>
        ) : (
          <>
            Send Message
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "20px", height: "20px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </>
        )}
      </button>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .form-input:focus,
        .form-textarea:focus {
          border-color: var(--auth-gradient-start);
          box-shadow: 0 0 0 4px rgba(34, 193, 90, 0.1);
          transform: translateY(-2px);
        }
        .form-input::placeholder,
        .form-textarea::placeholder {
          color: var(--text-placeholder);
        }
      `}</style>
    </form>
  );
}