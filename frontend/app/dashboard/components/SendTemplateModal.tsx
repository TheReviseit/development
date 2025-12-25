"use client";

import { useState, useEffect } from "react";
import styles from "../dashboard.module.css";
import { sendTemplateMessage, Template } from "@/lib/api/whatsapp";

interface SendTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: Template | null;
  userId: string;
}

export default function SendTemplateModal({
  isOpen,
  onClose,
  template,
  userId,
}: SendTemplateModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Extract variable count from template body
  const extractVariableCount = (bodyText: string): number => {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const indices = matches.map((m) => parseInt(m.replace(/[{}]/g, "")));
    return indices.length > 0 ? Math.max(...indices) : 0;
  };

  // Initialize variables when template changes
  useEffect(() => {
    if (template?.body_text) {
      const count = extractVariableCount(template.body_text);
      setVariables(new Array(count).fill(""));
    } else {
      setVariables([]);
    }
    setError(null);
    setSuccess(false);
  }, [template]);

  const handleSend = async () => {
    if (!template || !phoneNumber.trim()) {
      setError("Please enter a phone number");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await sendTemplateMessage(userId, {
        template_id: template.id,
        phone_number: phoneNumber.replace(/[^0-9]/g, ""),
        variables: variables.length > 0 ? variables : undefined,
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        setError("Failed to send message");
      }
    } catch (err: any) {
      setError(err.message || "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhoneNumber("");
    setVariables([]);
    setError(null);
    setSuccess(false);
    onClose();
  };

  // Replace variables in body text for preview
  const getPreviewText = () => {
    if (!template?.body_text) return "";
    let text = template.body_text;
    variables.forEach((val, idx) => {
      text = text.replace(`{{${idx + 1}}}`, val || `{{${idx + 1}}}`);
    });
    return text;
  };

  if (!isOpen || !template) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.sendModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sendModalHeader}>
          <h2>Send Template Message</h2>
          <button className={styles.closeModalBtn} onClick={handleClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.sendModalContent}>
          {/* Template Info */}
          <div className={styles.sendModalSection}>
            <label>Template</label>
            <div className={styles.templatePreviewBox}>
              <strong>{template.template_name}</strong>
              <span className={styles.templateBadge}>{template.status}</span>
            </div>
          </div>

          {/* Phone Number */}
          <div className={styles.sendModalSection}>
            <label>Recipient Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. 919876543210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className={styles.sendInput}
            />
            <small
              style={{ color: "var(--dash-text-muted)", fontSize: "12px" }}
            >
              Include country code without + (e.g., 91 for India)
            </small>
          </div>

          {/* Variables */}
          {variables.length > 0 && (
            <div className={styles.sendModalSection}>
              <label>Template Variables</label>
              <div className={styles.variablesGrid}>
                {variables.map((val, idx) => (
                  <div key={idx} className={styles.variableInput}>
                    <span className={styles.variableLabel}>{`{{${
                      idx + 1
                    }}}`}</span>
                    <input
                      type="text"
                      placeholder={`Value for {{${idx + 1}}}`}
                      value={val}
                      onChange={(e) => {
                        const newVars = [...variables];
                        newVars[idx] = e.target.value;
                        setVariables(newVars);
                      }}
                      className={styles.sendInput}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          <div className={styles.sendModalSection}>
            <label>Message Preview</label>
            <div className={styles.messagePreview}>
              {template.header_content && (
                <div className={styles.previewHeader}>
                  {template.header_content}
                </div>
              )}
              <div className={styles.previewBody}>{getPreviewText()}</div>
              {template.footer_text && (
                <div className={styles.previewFooter}>
                  {template.footer_text}
                </div>
              )}
            </div>
          </div>

          {/* Error/Success */}
          {error && (
            <div className={styles.sendError}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className={styles.sendSuccess}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Message sent successfully!
            </div>
          )}
        </div>

        <div className={styles.sendModalFooter}>
          <button className={styles.secondaryBtn} onClick={handleClose}>
            Cancel
          </button>
          <button
            className={styles.primaryBtn}
            onClick={handleSend}
            disabled={loading || !phoneNumber.trim() || success}
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Send Message
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
