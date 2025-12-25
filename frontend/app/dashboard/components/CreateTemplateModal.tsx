"use client";

import { useState, useEffect } from "react";
import styles from "./CreateTemplateModal.module.css";
import {
  createTemplate,
  CreateTemplateData,
  Template,
} from "@/lib/api/whatsapp";

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  editTemplate?: Template | null;
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "bn", label: "Bengali" },
  { code: "pa", label: "Punjabi" },
  { code: "es", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
];

const CATEGORIES = [
  {
    id: "MARKETING",
    label: "Marketing",
    icon: "📢",
    description: "Promotions, offers, and product updates",
  },
  {
    id: "UTILITY",
    label: "Utility",
    icon: "🔧",
    description: "Order updates, confirmations, and notifications",
  },
  {
    id: "AUTHENTICATION",
    label: "Authentication",
    icon: "🔐",
    description: "OTP codes and verification messages",
  },
];

export default function CreateTemplateModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  editTemplate,
}: CreateTemplateModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<
    "MARKETING" | "UTILITY" | "AUTHENTICATION"
  >("UTILITY");
  const [language, setLanguage] = useState("en");

  // Header
  const [hasHeader, setHasHeader] = useState(false);
  const [headerType, setHeaderType] = useState<
    "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"
  >("TEXT");
  const [headerText, setHeaderText] = useState("");

  // Body
  const [body, setBody] = useState("");
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);

  // Footer
  const [hasFooter, setHasFooter] = useState(false);
  const [footer, setFooter] = useState("");

  // Buttons
  const [hasButtons, setHasButtons] = useState(false);
  const [buttons, setButtons] = useState<
    Array<{
      type: "URL" | "PHONE_NUMBER" | "QUICK_REPLY";
      text: string;
      url?: string;
      phone_number?: string;
    }>
  >([]);

  // Populate form when editing
  useEffect(() => {
    if (editTemplate && isOpen) {
      setName(editTemplate.template_name || "");
      setCategory(
        (editTemplate.category as "MARKETING" | "UTILITY" | "AUTHENTICATION") ||
          "UTILITY"
      );
      setLanguage(editTemplate.language || "en");

      // Header
      if (editTemplate.header_content) {
        setHasHeader(true);
        setHeaderType(
          (editTemplate.header_type as
            | "TEXT"
            | "IMAGE"
            | "VIDEO"
            | "DOCUMENT") || "TEXT"
        );
        setHeaderText(editTemplate.header_content || "");
      }

      // Body
      setBody(editTemplate.body_text || "");

      // Footer
      if (editTemplate.footer_text) {
        setHasFooter(true);
        setFooter(editTemplate.footer_text);
      }

      // Buttons
      if (editTemplate.buttons && editTemplate.buttons.length > 0) {
        setHasButtons(true);
        setButtons(
          editTemplate.buttons.map((btn) => ({
            type:
              (btn.type as "URL" | "PHONE_NUMBER" | "QUICK_REPLY") ||
              "QUICK_REPLY",
            text: btn.text || "",
            url: btn.url,
          }))
        );
      }
    }
  }, [editTemplate, isOpen]);

  // Extract variables from body text
  const extractVariables = (text: string): number[] => {
    const matches = text.match(/\{\{(\d+)\}\}/g) || [];
    return [...new Set(matches.map((m) => parseInt(m.replace(/[{}]/g, ""))))];
  };

  const variables = extractVariables(body);

  // Reset form
  const resetForm = () => {
    setStep(1);
    setName("");
    setCategory("UTILITY");
    setLanguage("en");
    setHasHeader(false);
    setHeaderType("TEXT");
    setHeaderText("");
    setBody("");
    setBodyExamples([]);
    setHasFooter(false);
    setFooter("");
    setHasButtons(false);
    setButtons([]);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Validate template name (WhatsApp requirements)
  const isValidName = (n: string) => {
    return /^[a-z][a-z0-9_]*$/.test(n) && n.length >= 3 && n.length <= 512;
  };

  // Check if body has variables at start or end (Meta doesn't allow this)
  const hasVariableAtStartOrEnd = (text: string): boolean => {
    const trimmed = text.trim();
    return /^\{\{\d+\}\}/.test(trimmed) || /\{\{\d+\}\}$/.test(trimmed);
  };

  const bodyHasInvalidVariables = hasVariableAtStartOrEnd(body);

  // Add button
  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { type: "QUICK_REPLY", text: "" }]);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, field: string, value: string) => {
    const newButtons = [...buttons];
    (newButtons[index] as any)[field] = value;
    setButtons(newButtons);
  };

  // Submit
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const templateData: CreateTemplateData = {
        name,
        category,
        language,
        body,
      };

      if (hasHeader && headerType === "TEXT" && headerText) {
        templateData.header = { type: "TEXT", text: headerText };
      } else if (hasHeader && headerType !== "TEXT") {
        templateData.header = { type: headerType };
      }

      // Ensure all variables have example values (required by Meta)
      if (variables.length > 0) {
        const defaultExamples = [
          "John",
          "12345",
          "Monday",
          "10:00 AM",
          "Thank you",
        ];
        const examples = variables.map((v, idx) => {
          const userExample = bodyExamples[v - 1];
          if (userExample && userExample.trim()) {
            return userExample.trim();
          }
          // Provide a default example if user didn't fill one
          return defaultExamples[idx] || `example_${v}`;
        });
        templateData.body_examples = examples;
      }

      if (hasFooter && footer) {
        templateData.footer = footer;
      }

      if (hasButtons && buttons.length > 0) {
        templateData.buttons = buttons.filter((b) => b.text);
      }

      await createTemplate(userId, templateData);
      handleClose();
      onSuccess();
    } catch (err: any) {
      console.error("Failed to create template:", err);
      setError(err.message || "Failed to create template");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Get current time for preview
  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Replace variables with example values for preview
  const getPreviewBody = () => {
    let previewText = body || "Your message will appear here...";
    bodyExamples.forEach((example, idx) => {
      if (example) {
        previewText = previewText.replace(`{{${idx + 1}}}`, example);
      }
    });
    return previewText;
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div
        className={styles.modalContainer}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Modal Content */}
        <div className={styles.modal}>
          {/* Header */}
          <div className={styles.modalHeader}>
            <div>
              <h2 className={styles.modalTitle}>Create Message Template</h2>
              <p className={styles.modalSubtitle}>
                Step {step} of 3 - Templates require Meta approval before use
              </p>
            </div>
            <button className={styles.closeBtn} onClick={handleClose}>
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

          {/* Error */}
          {error && (
            <div className={styles.errorBanner}>
              ⚠️ {error}
              <button
                onClick={() => setError(null)}
                className={styles.errorClose}
              >
                ✕
              </button>
            </div>
          )}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Template Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g., order_confirmation"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase())}
                />
                <p className={styles.hint}>
                  Lowercase letters, numbers, and underscores only. Min 3
                  characters.
                </p>
                {name && !isValidName(name) && (
                  <p className={styles.errorText}>
                    Invalid name format. Use lowercase letters, numbers, and
                    underscores. Must start with a letter.
                  </p>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Category <span className={styles.required}>*</span>
                </label>
                <div className={styles.categoryGrid}>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      className={`${styles.categoryCard} ${
                        category === cat.id ? styles.categoryActive : ""
                      }`}
                      onClick={() =>
                        setCategory(
                          cat.id as "MARKETING" | "UTILITY" | "AUTHENTICATION"
                        )
                      }
                    >
                      <span className={styles.categoryIcon}>{cat.icon}</span>
                      <span className={styles.categoryLabel}>{cat.label}</span>
                      <span className={styles.categoryDesc}>
                        {cat.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Language <span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Content */}
          {step === 2 && (
            <div className={styles.modalBody}>
              {/* Header Toggle */}
              <div className={styles.toggleSection}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                  />
                  <span>Add Header (Optional)</span>
                </label>
              </div>

              {hasHeader && (
                <div className={styles.subSection}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Header Type</label>
                    <div className={styles.radioGroup}>
                      {["TEXT", "IMAGE", "VIDEO", "DOCUMENT"].map((type) => (
                        <label key={type} className={styles.radioLabel}>
                          <input
                            type="radio"
                            name="headerType"
                            checked={headerType === type}
                            onChange={() =>
                              setHeaderType(
                                type as "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"
                              )
                            }
                          />
                          {type.charAt(0) + type.slice(1).toLowerCase()}
                        </label>
                      ))}
                    </div>
                  </div>

                  {headerType === "TEXT" && (
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Header Text</label>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g., Order Confirmed!"
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                        maxLength={60}
                      />
                      <p className={styles.hint}>Max 60 characters</p>
                    </div>
                  )}

                  {headerType !== "TEXT" && (
                    <p className={styles.hint}>
                      📎 {headerType.toLowerCase()} will be uploaded when
                      sending the message
                    </p>
                  )}
                </div>
              )}

              {/* Body */}
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Body Text <span className={styles.required}>*</span>
                </label>
                <textarea
                  className={styles.textarea}
                  placeholder="Hi {{1}}, your order #{{2}} has been confirmed and will arrive by {{3}}."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={1024}
                />
                <div className={styles.textareaFooter}>
                  <p className={styles.hint}>
                    Use {"{{1}}"}, {"{{2}}"}, etc. for variables
                  </p>
                  <span className={styles.charCount}>{body.length}/1024</span>
                </div>
                {bodyHasInvalidVariables && (
                  <p className={styles.errorText}>
                    ⚠️ Variables cannot be at the start or end of the message.
                    Add text before/after your variables.
                  </p>
                )}
              </div>

              {/* Variable Examples */}
              {variables.length > 0 && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    Variable Examples (Required for approval)
                  </label>
                  {variables.map((v) => (
                    <div key={v} className={styles.variableRow}>
                      <span className={styles.variableLabel}>
                        {"{{"}
                        {v}
                        {"}}"}
                      </span>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder={`Example for variable ${v}`}
                        value={bodyExamples[v - 1] || ""}
                        onChange={(e) => {
                          const newExamples = [...bodyExamples];
                          newExamples[v - 1] = e.target.value;
                          setBodyExamples(newExamples);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Footer Toggle */}
              <div className={styles.toggleSection}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={hasFooter}
                    onChange={(e) => setHasFooter(e.target.checked)}
                  />
                  <span>Add Footer (Optional)</span>
                </label>
              </div>

              {hasFooter && (
                <div className={styles.subSection}>
                  <div className={styles.formGroup}>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g., Thank you for shopping with us!"
                      value={footer}
                      onChange={(e) => setFooter(e.target.value)}
                      maxLength={60}
                    />
                    <p className={styles.hint}>Max 60 characters</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Buttons & Preview */}
          {step === 3 && (
            <div className={styles.modalBody}>
              {/* Buttons Toggle */}
              <div className={styles.toggleSection}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={hasButtons}
                    onChange={(e) => setHasButtons(e.target.checked)}
                  />
                  <span>Add Buttons (Optional, max 3)</span>
                </label>
              </div>

              {hasButtons && (
                <div className={styles.subSection}>
                  {buttons.map((btn, idx) => (
                    <div key={idx} className={styles.buttonRow}>
                      <select
                        className={styles.selectSmall}
                        value={btn.type}
                        onChange={(e) =>
                          updateButton(idx, "type", e.target.value)
                        }
                      >
                        <option value="QUICK_REPLY">Quick Reply</option>
                        <option value="URL">URL</option>
                        <option value="PHONE_NUMBER">Phone</option>
                      </select>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="Button text"
                        value={btn.text}
                        onChange={(e) =>
                          updateButton(idx, "text", e.target.value)
                        }
                        maxLength={25}
                      />
                      {btn.type === "URL" && (
                        <input
                          type="url"
                          className={styles.input}
                          placeholder="https://..."
                          value={btn.url || ""}
                          onChange={(e) =>
                            updateButton(idx, "url", e.target.value)
                          }
                        />
                      )}
                      {btn.type === "PHONE_NUMBER" && (
                        <input
                          type="tel"
                          className={styles.input}
                          placeholder="+91..."
                          value={btn.phone_number || ""}
                          onChange={(e) =>
                            updateButton(idx, "phone_number", e.target.value)
                          }
                        />
                      )}
                      <button
                        className={styles.removeBtn}
                        onClick={() => removeButton(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {buttons.length < 3 && (
                    <button className={styles.addBtn} onClick={addButton}>
                      + Add Button
                    </button>
                  )}
                </div>
              )}

              <div className={styles.infoBox}>
                <strong>⏱️ Approval Time:</strong> Templates typically take
                24-48 hours for Meta to review and approve.
              </div>
            </div>
          )}

          {/* Footer */}
          <div className={styles.modalFooter}>
            {step > 1 && (
              <button
                className={styles.secondaryBtn}
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            )}
            <div className={styles.footerRight}>
              <button className={styles.cancelBtn} onClick={handleClose}>
                Cancel
              </button>
              {step < 3 ? (
                <button
                  className={styles.primaryBtn}
                  onClick={() => setStep(step + 1)}
                  disabled={
                    (step === 1 && (!name || !isValidName(name))) ||
                    (step === 2 && (!body || bodyHasInvalidVariables))
                  }
                >
                  Next
                </button>
              ) : (
                <button
                  className={styles.primaryBtn}
                  onClick={handleSubmit}
                  disabled={loading || !body || bodyHasInvalidVariables}
                >
                  {loading ? "Creating..." : "Submit for Approval"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* WhatsApp Preview Panel */}
        <div className={styles.previewPanel}>
          <h3 className={styles.previewTitle}>Template preview</h3>
          <div className={styles.phonePreview}>
            <div className={styles.chatBackground}>
              <div className={styles.messageBubble}>
                {hasHeader && headerText && (
                  <div className={styles.previewMessageHeader}>
                    {headerText}
                  </div>
                )}
                <div className={styles.previewMessageBody}>
                  {getPreviewBody()}
                </div>
                {hasFooter && footer && (
                  <div className={styles.previewMessageFooter}>{footer}</div>
                )}
                <span className={styles.messageTime}>{getCurrentTime()}</span>
              </div>
              {hasButtons && buttons.length > 0 && (
                <div className={styles.previewButtons}>
                  {buttons.map((btn, idx) => (
                    <div key={idx} className={styles.previewButton}>
                      {btn.text || `Button ${idx + 1}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
