"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import styles from "./form-public.module.css";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface FormField {
  id: string;
  field_type: string;
  label: string;
  placeholder?: string;
  help_text?: string;
  default_value?: string;
  required: boolean;
  options: { label: string; value: string }[];
}

interface PublicForm {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  theme: {
    primaryColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
  };
  settings: {
    submitButtonText?: string;
    successMessage?: string;
    successRedirectUrl?: string | null;
  };
  fields: FormField[];
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function WorkspacePublicFormPage() {
  const { username, slug } = useParams<{ username: string; slug: string }>();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const res = await fetch(`/api/forms/workspace/${username}/${slug}`);
        const data = await res.json();
        if (data.success && data.form) {
          setForm(data.form);
          // Initialize default values
          const defaults: Record<string, string> = {};
          for (const field of data.form.fields) {
            if (field.default_value) {
              defaults[field.id] = field.default_value;
            }
          }
          setValues(defaults);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [username, slug]);

  const handleChange = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleCheckboxChange = (fieldId: string, optionValue: string, checked: boolean) => {
    setValues((prev) => {
      const current = prev[fieldId] ? prev[fieldId].split(",").filter(Boolean) : [];
      const updated = checked
        ? [...current, optionValue]
        : current.filter((v) => v !== optionValue);
      return { ...prev, [fieldId]: updated.join(",") };
    });
  };

  const validate = (): boolean => {
    if (!form) return false;
    const newErrors: Record<string, string> = {};
    for (const field of form.fields) {
      if (field.required && !["heading", "divider", "hidden"].includes(field.field_type)) {
        const val = values[field.id]?.trim();
        if (!val) {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
      if (field.field_type === "email" && values[field.id]?.trim()) {
        const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
        if (!emailRegex.test(values[field.id])) {
          newErrors[field.id] = "Please enter a valid email address";
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    // Capture UTM params from URL
    const utmParams: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
      const val = searchParams.get(key);
      if (val) utmParams[key] = val;
    });

    try {
      const res = await fetch(`/api/forms/workspace/${username}/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, ...utmParams }),
      });
      const data = await res.json();

      if (data.success) {
        setSubmitted(true);
        setSuccessMessage(data.message || "Thank you! Your response has been recorded.");
        if (data.redirect_url) {
          setTimeout(() => { window.location.href = data.redirect_url; }, 2000);
        }
      } else if (data.errors) {
        setErrors(data.errors);
      } else {
        setErrors({ _form: data.error || "Submission failed. Please try again." });
      }
    } catch {
      setErrors({ _form: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Render Field ────────────────────────────────────────────────────── */
  const renderField = (field: FormField) => {
    if (field.field_type === "hidden") return null;

    if (field.field_type === "heading") {
      return <h2 className={styles.fieldHeading}>{field.label}</h2>;
    }

    if (field.field_type === "divider") {
      return <hr className={styles.fieldDivider} />;
    }

    const fieldId = field.id;
    const input = (() => {
      switch (field.field_type) {
        case "textarea":
          return (
            <textarea
              className={styles.fieldTextarea}
              value={values[fieldId] || ""}
              onChange={(e) => handleChange(fieldId, e.target.value)}
              placeholder={field.placeholder || ""}
              required={field.required}
            />
          );
        case "dropdown":
        case "multi_select":
          return (
            <select
              className={styles.fieldSelect}
              value={values[fieldId] || ""}
              onChange={(e) => handleChange(fieldId, e.target.value)}
              required={field.required}
            >
              <option value="">{field.placeholder || "Select an option..."}</option>
              {field.options.map((o, i) => (
                <option key={i} value={o.value}>{o.label}</option>
              ))}
            </select>
          );
        case "radio":
          return (
            <div className={styles.radioGroup}>
              {field.options.map((o, i) => (
                <label key={i} className={styles.radioOption}>
                  <input
                    type="radio"
                    name={fieldId}
                    value={o.value}
                    checked={values[fieldId] === o.value}
                    onChange={(e) => handleChange(fieldId, e.target.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          );
        case "checkbox":
          return (
            <div className={styles.checkboxGroup}>
              {field.options.map((o, i) => {
                const selected = values[fieldId]?.split(",") || [];
                return (
                  <label key={i} className={styles.checkboxOption}>
                    <input
                      type="checkbox"
                      checked={selected.includes(o.value)}
                      onChange={(e) => handleCheckboxChange(fieldId, o.value, e.target.checked)}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          );
        case "date":
          return (
            <input
              type="date"
              className={styles.fieldInput}
              value={values[fieldId] || ""}
              onChange={(e) => handleChange(fieldId, e.target.value)}
              required={field.required}
            />
          );
        case "file_upload":
          return (
            <input
              type="file"
              className={styles.fieldInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleChange(fieldId, file.name);
              }}
              style={{ padding: "10px 16px" }}
            />
          );
        default: {
          const typeMap: Record<string, string> = {
            email: "email",
            phone: "tel",
            number: "number",
            url: "url",
          };
          return (
            <input
              type={typeMap[field.field_type] || "text"}
              className={styles.fieldInput}
              value={values[fieldId] || ""}
              onChange={(e) => handleChange(fieldId, e.target.value)}
              placeholder={field.placeholder || ""}
              required={field.required}
            />
          );
        }
      }
    })();

    return (
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          {field.label}
          {field.required && <span className={styles.fieldRequired}>*</span>}
        </label>
        {input}
        {field.help_text && <p className={styles.fieldHelpText}>{field.help_text}</p>}
        {errors[fieldId] && <p className={styles.fieldError}>⚠ {errors[fieldId]}</p>}
      </div>
    );
  };

  /* ─── Loading ─────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  /* ─── Not Found ───────────────────────────────────────────────────────── */
  if (notFound || !form) {
    return (
      <div className={styles.publicFormPage}>
        <div className={styles.formWrapper}>
          <div className={styles.formBody}>
            <div className={styles.notFound}>
              <div className={styles.notFoundIcon}>📋</div>
              <h2 className={styles.notFoundTitle}>Form Not Found</h2>
              <p className={styles.notFoundText}>
                This form doesn&apos;t exist or is no longer accepting responses.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Success State ───────────────────────────────────────────────────── */
  if (submitted) {
    return (
      <div className={styles.publicFormPage}>
        <div className={styles.formWrapper}>
          <div className={styles.formBody}>
            <div className={styles.successContainer}>
              <div className={styles.successIcon}>✓</div>
              <h2 className={styles.successTitle}>
                {form.settings.successMessage ? "Response Submitted!" : "Thank You!"}
              </h2>
              <p className={styles.successMessage}>{successMessage}</p>
            </div>
          </div>
          <div className={styles.poweredBy}>
            Powered by <a href="/">Flowauxi</a>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Form ────────────────────────────────────────────────────────────── */
  return (
    <div
      className={styles.publicFormPage}
      style={{
        ...(form.theme?.backgroundColor && { background: form.theme.backgroundColor }),
        ...(form.theme?.fontFamily && { fontFamily: form.theme.fontFamily }),
      }}
    >
      <div className={styles.formWrapper}>
        <div className={styles.formHeader}>
          <h1 className={styles.formTitle}>{form.title}</h1>
          {form.description && (
            <p className={styles.formDescription}>{form.description}</p>
          )}
        </div>

        <div className={styles.formBody}>
          <form onSubmit={handleSubmit} noValidate>
            {form.fields
              .sort((a, b) => (a as FormField & { position: number }).position - (b as FormField & { position: number }).position)
              .map((field) => (
                <div key={field.id}>{renderField(field)}</div>
              ))}

            {errors._form && (
              <div className={styles.fieldError} style={{ marginBottom: 16, fontSize: 14 }}>
                ⚠ {errors._form}
              </div>
            )}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting}
              style={{
                ...(form.theme?.primaryColor && {
                  background: `linear-gradient(135deg, ${form.theme.primaryColor}, ${form.theme.primaryColor}cc)`,
                }),
              }}
            >
              {submitting ? "Submitting..." : (form.settings.submitButtonText || "Submit")}
            </button>
          </form>
        </div>

        <div className={styles.poweredBy}>
          Powered by <a href="/">Flowauxi</a>
        </div>
      </div>
    </div>
  );
}
