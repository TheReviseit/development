"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import styles from "../../forms.module.css";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface FormField {
  id: string;
  form_id: string;
  field_type: string;
  label: string;
  placeholder?: string;
  help_text?: string;
  default_value?: string;
  position: number;
  required: boolean;
  validation: Record<string, unknown>;
  options: { label: string; value: string }[];
  conditional?: Record<string, unknown>;
  settings: Record<string, unknown>;
}

interface FormData {
  id: string;
  title: string;
  description: string | null;
  slug: string | null;
  short_id: string | null;
  status: "draft" | "published" | "archived";
  settings: Record<string, unknown>;
  theme: Record<string, unknown>;
  fields?: FormField[];
}

/* ─── Field Types Palette ───────────────────────────────────────────────── */
const FIELD_TYPES = [
  { category: "Basic", fields: [
    { type: "text", label: "Text Input", icon: <img src="/icons/forms/text-aa.svg" alt="Text" width={20} height={20} /> },
    { type: "email", label: "Email", icon: <img src="/icons/forms/email.svg" alt="Email" width={20} height={20} /> },
    { type: "phone_international", label: "Phone", icon: <img src="/icons/forms/phone.svg" alt="Phone" width={20} height={20} /> },
    { type: "number", label: "Number", icon: <img src="/icons/forms/number.svg" alt="Number" width={18} height={18} /> },
    { type: "url", label: "URL", icon: <img src="/icons/forms/url.svg" alt="URL" width={20} height={20} /> },
    { type: "password", label: "Password", icon: <img src="/icons/forms/password.svg" alt="Password" width={20} height={20} /> },
    { type: "textarea", label: "Paragraph", icon: <img src="/icons/forms/paragraph.svg" alt="Paragraph" width={20} height={20} /> },
  ]},
  { category: "Choice", fields: [
    { type: "dropdown", label: "Dropdown", icon: <img src="/icons/forms/form-dropdown.svg" alt="Dropdown" width={20} height={20} /> },
    { type: "radio", label: "Radio", icon: <img src="/icons/forms/radio-button.svg" alt="Radio" width={20} height={20} /> },
    { type: "checkbox", label: "Checkbox", icon: <img src="/icons/forms/check-box.svg" alt="Checkbox" width={20} height={20} /> },
    { type: "multi_select", label: "Multi Select", icon: <img src="/icons/forms/multiselect.svg" alt="Multi Select" width={20} height={20} /> },
    { type: "yes_no", label: "Yes / No", icon: <img src="/icons/forms/yes or no.svg" alt="Yes No" width={20} height={20} /> },
  ]},
  { category: "Date & Time", fields: [
    { type: "date", label: "Date Picker", icon: <img src="/icons/forms/calender.svg" alt="Date" width={20} height={20} /> },
    { type: "time", label: "Time Picker", icon: <img src="/icons/forms/clock.svg" alt="Time" width={20} height={20} /> },
    { type: "date_range", label: "Date Range", icon: <img src="/icons/forms/calender.svg" alt="Date Range" width={20} height={20} /> },
  ]},
  { category: "Survey", fields: [
    { type: "rating", label: "Rating", icon: <img src="/icons/forms/star.svg" alt="Rating" width={20} height={20} /> },
    { type: "scale", label: "Scale (1–10)", icon: <img src="/icons/forms/scale.svg" alt="Scale" width={20} height={20} /> },
    { type: "slider", label: "Slider", icon: <img src="/icons/forms/slider.svg" alt="Slider" width={20} height={20} /> },
  ]},
  { category: "Advanced", fields: [
    { type: "file_upload", label: "File Upload", icon: <img src="/icons/forms/upload.svg" alt="File Upload" width={20} height={20} /> },
    { type: "signature", label: "Signature", icon: <img src="/icons/forms/signature.svg" alt="Signature" width={20} height={20} /> },
    { type: "address", label: "Address", icon: <img src="/icons/forms/address.svg" alt="Address" width={20} height={20} /> },
    { type: "consent_checkbox", label: "Consent", icon: <img src="/icons/forms/consent.svg" alt="Consent" width={20} height={20} /> },
    { type: "hidden", label: "Hidden Field", icon: <img src="/icons/forms/hidden.svg" alt="Hidden" width={20} height={20} /> },
  ]},
  { category: "Layout", fields: [
    { type: "heading", label: "Heading", icon: <img src="/icons/forms/heading.svg" alt="Heading" width={20} height={20} /> },
    { type: "description", label: "Description", icon: "📝" },
    { type: "divider", label: "Divider", icon: "—" },
    { type: "spacer", label: "Spacer", icon: "⬜" },
  ]},
];

/** Field types that use the options editor (label/value pairs) */
const OPTION_FIELD_TYPES = ["dropdown", "radio", "checkbox", "multi_select", "yes_no"];

/** Non-input layout field types — skip from settings like placeholder, required, etc. */
const LAYOUT_FIELD_TYPES = ["heading", "description", "divider", "spacer"];

/* ─── Smart Defaults per Field Type ─────────────────────────────────────── */
const FIELD_DEFAULTS: Record<string, { options?: { label: string; value: string }[]; settings?: Record<string, unknown>; validation?: Record<string, unknown> }> = {
  yes_no: {
    options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }],
  },
  rating: {
    settings: { maxStars: 5 },
  },
  scale: {
    settings: { min: 1, max: 10, minLabel: "Not likely", maxLabel: "Very likely" },
  },
  slider: {
    settings: { min: 0, max: 100, step: 1 },
  },
  address: {
    settings: { fields: ["street", "city", "state", "zip", "country"] },
  },
  phone_international: {
    settings: { defaultCountry: "US" },
  },
  consent_checkbox: {
    settings: { consentText: "I agree to the Terms of Service and Privacy Policy" },
  },
  spacer: {
    settings: { height: 32 },
  },
  file_upload: {
    validation: { maxFileSize: 10, allowedTypes: ["image/*", "application/pdf"] },
  },
};

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function FormBuilderPage() {
  const router = useRouter();
  const { id: formId } = useParams<{ id: string }>();

  const [form, setForm] = useState<FormData | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false); // Prevents concurrent saves

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  // Derive isNew before any hooks that depend on it
  const isNew = !formId || formId === "new";

  // localStorage cache key per form
  const CACHE_KEY = `form-builder-draft-${formId}`;

  /* ─── Fetch Workspace Slug ────────────────────────────────────────────── */
  useEffect(() => {
    const slugify = (text: string): string =>
      text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    const fetchWorkspaceSlug = async () => {
      try {
        const res = await fetch("/api/business/get", { credentials: "include" });
        const responseData = await res.json();
        const biz = responseData.data;
        if (biz?.businessName) {
          // Always derive workspace from business name for clean, human-readable URLs
          setWorkspaceSlug(slugify(biz.businessName));
        }
      } catch (err) {
        console.error("Failed to fetch workspace slug:", err);
      }
    };
    fetchWorkspaceSlug();
  }, []);

  /* ─── Data Fetching ───────────────────────────────────────────────────── */
  const fetchForm = useCallback(async () => {
    // Guard: don't run until formId is available (App Router hydration safety)
    if (!formId) return;

    // Guard: don't re-fetch while a save is in progress (prevents race condition
    // where router.replace triggers fetchForm before fields are persisted)
    if (savingRef.current) return;

    // Lazy creation: "new" forms don't exist in DB yet — start with empty state
    if (isNew) {
      setForm({
        id: "new",
        title: "Untitled Form",
        description: null,
        slug: null,
        short_id: null,
        status: "draft",
        settings: {
          submitButtonText: "Submit",
          successMessage: "Thank you! Your response has been recorded.",
          successRedirectUrl: null,
          notifyOnSubmission: true,
          notifyEmails: [],
          captchaEnabled: false,
          isOpen: true,
          maxResponses: null,
        },
        theme: {
          primaryColor: "#4f46e5",
          backgroundColor: "#ffffff",
          fontFamily: "Inter",
          borderRadius: "8px",
          logoUrl: null,
        },
      });
      setFields([]);
      setLoading(false);
      return;
    }

    // Existing form: fetch from API
    try {
      const res = await fetch(`/api/forms/${formId}`, { credentials: "include" });
      const data = await res.json();
      if (data.success && data.form) {
        setForm(data.form);
        const apiFields = data.form.fields || [];

        // ── Cache Recovery: if API returns no fields, try localStorage ───
        if (apiFields.length === 0) {
          try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
              const cachedFields = JSON.parse(cached) as FormField[];
              if (cachedFields.length > 0) {
                setFields(cachedFields);
                setIsDirty(true); // Mark dirty so autosave picks it up
                console.info(`♻️ Recovered ${cachedFields.length} fields from localStorage cache`);
                return; // Skip setting empty API fields
              }
            }
          } catch { /* ignore corrupt cache */ }
        }

        setFields(apiFields);
      }
    } catch (err) {
      console.error("Failed to fetch form:", err);
      showToast("error", "Failed to load form");
    } finally {
      setLoading(false);
    }
  }, [formId, isNew, CACHE_KEY]);

  useEffect(() => { fetchForm(); }, [fetchForm]);

  /* ─── localStorage Draft Caching ──────────────────────────────────────── */
  useEffect(() => {
    if (fields.length > 0) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(fields));
      } catch { /* storage full — non-fatal */ }
    }
  }, [fields, CACHE_KEY]);

  /* ─── Dirty-State Debounced Autosave (3s) ─────────────────────────────── */
  useEffect(() => {
    // Don't autosave new unsaved forms or when no fields exist
    if (!isDirty || isNew || fields.length === 0 || !form) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (!savingRef.current) {
        handleSave(true); // silent autosave
      }
    }, 3000);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, fields, isNew]);

  /* ─── Toast ───────────────────────────────────────────────────────────── */
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  /* ─── Save ────────────────────────────────────────────────────────────── */
  const handleSave = async (silent = false) => {
    if (!form || savingRef.current) return;
    savingRef.current = true;
    if (!silent) setSaving(true);
    try {
      let targetFormId = formId;

      // ── Lazy Creation: first save for a "new" form ──────────────────────
      if (isNew) {
        const createRes = await fetch("/api/forms", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title || "Untitled Form",
            description: form.description,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData.success || !createData.form) {
          if (!silent) showToast("error", createData.error || "Failed to create form");
          return;
        }

        targetFormId = createData.form.id;
        // DON'T router.replace yet — save fields FIRST to prevent race condition
        setForm(createData.form);
      }

      // ── 1. Save form metadata (title, description, settings) ─────────────
      if (!isNew) {
        const metaRes = await fetch(`/api/forms/${targetFormId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            settings: form.settings,
          }),
        });
        const metaData = await metaRes.json();
        if (!metaRes.ok || !metaData.success) {
          if (!silent) showToast("error", metaData.error || "Failed to save form metadata");
          return;
        }
        setForm((prev) => prev ? { ...prev, ...metaData.form } : prev);
      }

      // ── 2. Bulk update fields (server owns form_id; we don't send it) ──
      const fieldsPayload = fields.map((f, idx) => {
        // Strip client-only properties; server assigns form_id
        const { form_id: _drop, ...rest } = f;
        return { ...rest, position: idx };
      });
      const fieldsRes = await fetch(`/api/forms/${targetFormId}/fields`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fieldsPayload }),
      });
      const fieldsData = await fieldsRes.json();
      if (!fieldsRes.ok || !fieldsData.success) {
        if (!silent) showToast("error", fieldsData.error || "Failed to save form fields");
        return;
      }

      // Sync fields with server-canonical data (correct IDs, form_id, etc.)
      if (fieldsData.fields) {
        setFields(fieldsData.fields);
      }

      // Clear dirty state and localStorage cache on successful save
      setIsDirty(false);
      try { localStorage.removeItem(CACHE_KEY); } catch { /* non-fatal */ }

      // NOW swap the URL — fields are safely in DB, so any fetchForm re-trigger
      // will load them correctly.
      if (isNew && targetFormId && targetFormId !== formId) {
        router.replace(`/dashboard/forms/builder/${targetFormId}`);
      }

      if (!silent) showToast("success", `Saved — ${fields.length} field${fields.length !== 1 ? "s" : ""}`);
    } catch (err) {
      console.error("Failed to save:", err);
      if (!silent) showToast("error", "Failed to save form. Please try again.");
    } finally {
      savingRef.current = false;
      if (!silent) setSaving(false);
    }
  };

  /* ─── Publish / Unpublish ─────────────────────────────────────────────── */
  const handlePublish = async () => {
    await handleSave();
    try {
      const res = await fetch(`/api/forms/${formId}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success && data.form) {
        setForm((prev) => prev ? { ...prev, ...data.form } : prev);
        showToast("success", "Form published! 🚀");
      } else {
        showToast("error", data.error || "Failed to publish form");
      }
    } catch (err) {
      console.error("Failed to publish:", err);
      showToast("error", "Failed to publish form");
    }
  };

  const handleUnpublish = async () => {
    try {
      const res = await fetch(`/api/forms/${formId}/unpublish`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success && data.form) {
        setForm((prev) => prev ? { ...prev, ...data.form } : prev);
        showToast("success", "Form unpublished");
      } else {
        showToast("error", data.error || "Failed to unpublish form");
      }
    } catch (err) {
      console.error("Failed to unpublish:", err);
      showToast("error", "Failed to unpublish form");
    }
  };

  /* ─── Drag & Drop ─────────────────────────────────────────────────────── */
  const handleDragStart = (e: React.DragEvent, fieldType: string) => {
    e.dataTransfer.setData("fieldType", fieldType);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverCanvas(true);
  };

  const handleDragLeave = () => setDragOverCanvas(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCanvas(false);
    const fieldType = e.dataTransfer.getData("fieldType");
    if (!fieldType) return;
    addField(fieldType);
  };

  /* ─── Field CRUD ──────────────────────────────────────────────────────── */
  const addField = (fieldType: string) => {
    const typeInfo = FIELD_TYPES.flatMap(c => c.fields).find(f => f.type === fieldType);
    const defaults = FIELD_DEFAULTS[fieldType] || {};
    const newField: FormField = {
      id: crypto.randomUUID(),                   // ✅ Valid UUID — no prefix
      form_id: formId ?? "",                      // Server overwrites this on save
      field_type: fieldType,
      label: typeInfo?.label || "Untitled Field",
      placeholder: "",
      help_text: "",
      default_value: "",
      position: fields.length,
      required: false,
      validation: defaults.validation || {},
      options: defaults.options || (OPTION_FIELD_TYPES.includes(fieldType)
        ? [{ label: "Option 1", value: "option_1" }, { label: "Option 2", value: "option_2" }]
        : []),
      settings: defaults.settings || {},
    };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setIsDirty(true);
  };

  const removeField = (fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
    setIsDirty(true);
  };

  const moveField = (fieldId: string, direction: "up" | "down") => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === fieldId);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
    setIsDirty(true);
  };

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
    );
    setIsDirty(true);
  };

  /* ─── Field Preview Renderer ──────────────────────────────────────────── */
  const renderFieldPreview = (f: FormField) => {
    const placeholder = f.placeholder || `Enter ${f.label.toLowerCase()}...`;
    const s = f.settings as Record<string, unknown>;

    switch (f.field_type) {
      // ── Basic ────────────────────────────────────────────────────────────
      case "textarea":
        return <textarea className={styles.canvasFieldPreviewTextarea} placeholder={placeholder} readOnly />;
      case "password":
        return <input type="password" className={styles.canvasFieldPreviewInput} placeholder={placeholder} readOnly />;
      case "phone_international":
        return (
          <div style={{ display: "flex", gap: 8 }}>
            <select className={styles.canvasFieldPreviewSelect} disabled style={{ width: 90 }}>
              <option>+1 🇺🇸</option>
              <option>+91 🇮🇳</option>
              <option>+44 🇬🇧</option>
            </select>
            <input className={styles.canvasFieldPreviewInput} placeholder="Phone number" readOnly style={{ flex: 1 }} />
          </div>
        );

      // ── Choice ───────────────────────────────────────────────────────────
      case "dropdown":
      case "multi_select":
        return (
          <select className={styles.canvasFieldPreviewSelect} disabled>
            <option>{placeholder}</option>
            {f.options.map((o, i) => <option key={i}>{o.label}</option>)}
          </select>
        );
      case "radio":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {f.options.map((o, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#666" }}>
                <input type="radio" name={f.id} disabled /> {o.label}
              </label>
            ))}
          </div>
        );
      case "checkbox":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {f.options.map((o, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#666" }}>
                <input type="checkbox" disabled /> {o.label}
              </label>
            ))}
          </div>
        );
      case "yes_no":
        return (
          <div style={{ display: "flex", gap: 8 }}>
            {(f.options.length ? f.options : [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]).map((o, i) => (
              <button
                key={i}
                style={{
                  flex: 1, padding: "10px 16px", borderRadius: 8,
                  border: "1px solid #e5e7eb", background: "#fafafa",
                  fontSize: 14, fontWeight: 500, color: "#333", cursor: "default",
                }}
                disabled
              >
                {o.label}
              </button>
            ))}
          </div>
        );
      case "consent_checkbox":
        return (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "#555", lineHeight: 1.5 }}>
            <input type="checkbox" disabled style={{ marginTop: 4 }} />
            <span>{(s?.consentText as string) || "I agree to the Terms of Service and Privacy Policy"}</span>
          </label>
        );

      // ── Date & Time ──────────────────────────────────────────────────────
      case "date":
        return <input type="date" className={styles.canvasFieldPreviewInput} disabled />;
      case "time":
        return <input type="time" className={styles.canvasFieldPreviewInput} disabled />;
      case "date_range":
        return (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" className={styles.canvasFieldPreviewInput} disabled style={{ flex: 1 }} />
            <span style={{ color: "#999", fontSize: 13, fontWeight: 500 }}>to</span>
            <input type="date" className={styles.canvasFieldPreviewInput} disabled style={{ flex: 1 }} />
          </div>
        );

      // ── Survey ───────────────────────────────────────────────────────────
      case "rating": {
        const maxStars = (s?.maxStars as number) || 5;
        return (
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: maxStars }, (_, i) => (
              <span key={i} style={{ fontSize: 24, color: i < 2 ? "#f59e0b" : "#d1d5db", cursor: "default" }}>★</span>
            ))}
          </div>
        );
      }
      case "scale": {
        const scaleMin = (s?.min as number) ?? 1;
        const scaleMax = (s?.max as number) ?? 10;
        const minLabel = (s?.minLabel as string) || "";
        const maxLabel = (s?.maxLabel as string) || "";
        const count = scaleMax - scaleMin + 1;
        return (
          <div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {Array.from({ length: count }, (_, i) => (
                <button
                  key={i}
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    border: "1px solid #e5e7eb", background: "#fafafa",
                    fontSize: 13, fontWeight: 600, color: "#555", cursor: "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  disabled
                >
                  {scaleMin + i}
                </button>
              ))}
            </div>
            {(minLabel || maxLabel) && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#999" }}>
                <span>{minLabel}</span>
                <span>{maxLabel}</span>
              </div>
            )}
          </div>
        );
      }
      case "slider": {
        const sliderMin = (s?.min as number) ?? 0;
        const sliderMax = (s?.max as number) ?? 100;
        const sliderStep = (s?.step as number) ?? 1;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "#999", minWidth: 24 }}>{sliderMin}</span>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={sliderStep}
              defaultValue={Math.round((sliderMin + sliderMax) / 2)}
              style={{ flex: 1, accentColor: "#4f46e5" }}
              disabled
            />
            <span style={{ fontSize: 12, color: "#999", minWidth: 24 }}>{sliderMax}</span>
          </div>
        );
      }

      // ── Advanced ─────────────────────────────────────────────────────────
      case "file_upload":
        return <input type="file" className={styles.canvasFieldPreviewInput} disabled style={{ padding: "8px 14px" }} />;
      case "signature":
        return (
          <div style={{
            border: "2px dashed #d1d5db", borderRadius: 12, padding: 24,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 100, color: "#999", fontSize: 14, gap: 8,
          }}>
            <span style={{ fontSize: 28 }}>✍️</span>
            <span>Click to sign</span>
          </div>
        );
      case "address":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input className={styles.canvasFieldPreviewInput} placeholder="Street address" readOnly />
            <div style={{ display: "flex", gap: 8 }}>
              <input className={styles.canvasFieldPreviewInput} placeholder="City" readOnly style={{ flex: 1 }} />
              <input className={styles.canvasFieldPreviewInput} placeholder="State" readOnly style={{ flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className={styles.canvasFieldPreviewInput} placeholder="ZIP / Postal" readOnly style={{ flex: 1 }} />
              <input className={styles.canvasFieldPreviewInput} placeholder="Country" readOnly style={{ flex: 1 }} />
            </div>
          </div>
        );
      case "hidden":
        return <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>Hidden field — not visible to users</div>;

      // ── Layout ───────────────────────────────────────────────────────────
      case "heading":
        return <h3 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>{f.label}</h3>;
      case "description":
        return <p style={{ fontSize: 14, color: "#666", margin: 0, lineHeight: 1.6 }}>{f.help_text || "Add a description or instructions for your form respondents."}</p>;
      case "divider":
        return <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "4px 0" }} />;
      case "spacer": {
        const height = (s?.height as number) || 32;
        return <div style={{ height, background: "repeating-linear-gradient(45deg, transparent, transparent 8px, #f3f4f6 8px, #f3f4f6 10px)", borderRadius: 6, opacity: 0.5 }} />;
      }

      // ── Default fallback (text, email, phone, number, url) ───────────────
      default:
        return <input className={styles.canvasFieldPreviewInput} placeholder={placeholder} readOnly />;
    }
  };

  /* ─── Render Guards ───────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading builder...</p>
      </div>
    );
  }

  // Only show "Form not found" for existing forms that returned nothing.
  // For isNew, form is always populated by fetchForm — never null after load.
  if (!form && !isNew) {
    return (
      <div className={styles.loadingContainer}>
        <p className={styles.loadingText}>Form not found</p>
      </div>
    );
  }

  // Safety: if somehow form is still null (e.g., hydration race), keep showing spinner
  if (!form) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading builder...</p>
      </div>
    );
  }


  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const filteredPalette = FIELD_TYPES.map(category => ({
    ...category,
    fields: category.fields.filter(f => f.label.toLowerCase().includes(searchQuery.toLowerCase()))
  })).filter(cat => cat.fields.length > 0);

  return (
    <div 
      className={styles.builderLayout}
      style={{ 
        pointerEvents: saving ? "none" : "auto", 
        opacity: saving ? 0.6 : 1, 
        transition: "opacity 0.2s ease" 
      }}
    >
      {/* ─── Left Panel: Field Palette ─────────────────────────────────── */}
      <div className={styles.fieldPalette}>
        <div className={styles.paletteHeader}>
          <h3 className={styles.paletteTitle}>Field Types</h3>
        </div>
        <div className={styles.paletteSearch}>
          <img src="/icons/search.svg" alt="Search" width={16} height={16} className={styles.paletteSearchIcon} />
          <input
            type="text"
            placeholder="Search fields..."
            className={styles.paletteSearchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredPalette.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
              No results found
            </div>
          ) : (
            filteredPalette.map((category) => {
              const isCollapsed = collapsedCategories.has(category.category) && searchQuery === "";
              return (
                <div key={category.category} className={styles.paletteSection}>
                  <div
                    className={styles.paletteSectionHeader}
                    onClick={() => toggleCategory(category.category)}
                  >
                    <span className={styles.paletteSectionTitle}>{category.category}</span>
                    {searchQuery === "" && (
                      <span 
                        className={styles.paletteSectionToggle}
                        style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        ▲
                      </span>
                    )}
                  </div>
                  <div className={`${styles.paletteSectionContent} ${isCollapsed ? styles.collapsed : ""}`}>
                    <div className={styles.paletteSectionInner}>
                      {category.fields.map((ft) => (
                        <div
                          key={ft.type}
                          className={styles.fieldTypeItem}
                          draggable
                          onDragStart={(e) => handleDragStart(e, ft.type)}
                          onClick={() => addField(ft.type)}
                        >
                          <div className={styles.fieldTypeIcon}>{ft.icon}</div>
                          <span>{ft.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Center: Canvas ────────────────────────────────────────────── */}
      <div className={styles.canvas}>
        <div className={styles.canvasToolbar}>
          <div className={styles.canvasToolbarLeft}>
            <Link href="/dashboard/forms" className={styles.backBtn} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              ← Back
            </Link>
            <input
              ref={titleRef}
              className={styles.formTitleInput}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Form Title"
            />
          </div>
          <div className={styles.canvasToolbarRight}>
            <button className={`${styles.toolbarBtn} ${styles.saveBtn}`} onClick={() => handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            {form.status === "published" ? (
              <button className={`${styles.toolbarBtn} ${styles.unpublishBtn}`} onClick={handleUnpublish}>
                Unpublish
              </button>
            ) : (
              <button className={`${styles.toolbarBtn} ${styles.publishBtn}`} onClick={handlePublish}>
                Publish
              </button>
            )}
          </div>
        </div>

        {/* Published URL Banner */}
        {form.status === "published" && form.slug && (
          <div className={styles.publishedBanner}>
            <span className={styles.publishedBannerText}>Live at: </span>
            <span
              className={styles.publishedBannerUrl}
              onClick={() => {
                const url = workspaceSlug
                  ? `${window.location.origin}/${workspaceSlug}/forms/${form.slug}`
                  : `${window.location.origin}/form/${form.slug}`;
                navigator.clipboard.writeText(url);
                showToast("success", "URL copied!");
              }}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              title="Click to copy your link"
            >
              {workspaceSlug
                ? `${window.location.origin}/${workspaceSlug}/forms/${form.slug}`
                : `${window.location.origin}/form/${form.slug}`}
            </span>
          </div>
        )}

        <div
          className={styles.formCanvas}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {fields.length === 0 ? (
            <div className={`${styles.canvasDropZone} ${dragOverCanvas ? styles.dragOver : ""}`}>
              <div className={styles.canvasDropHint}>
                <div className={styles.canvasDropHintIcon} style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <img src="/icons/forms/form.svg" alt="Form" width={48} height={48} />
                </div>
                <div className={styles.canvasDropHintText}>
                  Drag fields here or click on a field type to add
                </div>
              </div>
            </div>
          ) : (
            fields.map((field) => (
              <div
                key={field.id}
                className={`${styles.canvasField} ${selectedFieldId === field.id ? styles.canvasFieldSelected : ""}`}
                onClick={() => setSelectedFieldId(field.id)}
              >
                <div className={styles.canvasFieldHeader}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span className={styles.canvasFieldDragHandle}>⋮⋮</span>
                    <span className={styles.canvasFieldLabel}>
                      {field.label}
                      {field.required && <span className={styles.canvasFieldRequired}>*</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span className={styles.canvasFieldType}>{field.field_type}</span>
                    <div className={styles.canvasFieldActions}>
                      <button className={styles.canvasFieldActionBtn} onClick={(e) => { e.stopPropagation(); moveField(field.id, "up"); }} title="Move up">↑</button>
                      <button className={styles.canvasFieldActionBtn} onClick={(e) => { e.stopPropagation(); moveField(field.id, "down"); }} title="Move down">↓</button>
                      <button className={styles.canvasFieldActionBtn} onClick={(e) => { e.stopPropagation(); removeField(field.id); }} title="Remove">✕</button>
                    </div>
                  </div>
                </div>
                {field.help_text && (
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>{field.help_text}</div>
                )}
                <div className={styles.canvasFieldPreview}>
                  {renderFieldPreview(field)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Right Panel: Field Settings ───────────────────────────────── */}
      <div className={styles.settingsPanel}>
        {!selectedField ? (
          <div className={styles.settingsPanelEmpty}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginBottom: 16 }}>
                <img src="/icons/forms/gear.svg" alt="Settings" width={48} height={48} style={{ filter: 'brightness(0.3)' }} />
              </div>
              <div style={{ color: '#444', fontSize: 14, fontWeight: 500 }}>Select a field to configure its settings</div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.settingsHeader}>
              <h3 className={styles.settingsTitle}>Field Settings</h3>
              <button className={styles.settingsClose} onClick={() => setSelectedFieldId(null)}>✕</button>
            </div>
            <div className={styles.settingsBody}>
              {/* Label */}
              <div className={styles.settingsGroup}>
                <label className={styles.settingsLabel}>Label</label>
                <input
                  className={styles.settingsInput}
                  value={selectedField.label}
                  onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                />
              </div>

              {/* Placeholder — hide for layout fields and non-text types */}
              {!LAYOUT_FIELD_TYPES.includes(selectedField.field_type) && !["hidden", "rating", "scale", "slider", "yes_no", "consent_checkbox", "signature", "address"].includes(selectedField.field_type) && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Placeholder</label>
                  <input
                    className={styles.settingsInput}
                    value={selectedField.placeholder || ""}
                    onChange={(e) => updateField(selectedField.id, { placeholder: e.target.value })}
                  />
                </div>
              )}

              {/* Help Text — hide for divider/spacer */}
              {!["divider", "spacer"].includes(selectedField.field_type) && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Help Text</label>
                  <input
                    className={styles.settingsInput}
                    value={selectedField.help_text || ""}
                    onChange={(e) => updateField(selectedField.id, { help_text: e.target.value })}
                    placeholder="Add helper text..."
                  />
                </div>
              )}

              {/* Default Value — hide for layout, file, signature, address */}
              {!LAYOUT_FIELD_TYPES.includes(selectedField.field_type) && !["file_upload", "signature", "address", "consent_checkbox"].includes(selectedField.field_type) && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Default Value</label>
                  <input
                    className={styles.settingsInput}
                    value={selectedField.default_value || ""}
                    onChange={(e) => updateField(selectedField.id, { default_value: e.target.value })}
                  />
                </div>
              )}

              {/* Required Toggle — hide for layout/hidden */}
              {![...LAYOUT_FIELD_TYPES, "hidden"].includes(selectedField.field_type) && (
                <div className={styles.settingsGroup}>
                  <div className={styles.settingsToggle}>
                    <label className={styles.settingsLabel}>Required</label>
                    <div
                      className={`${styles.toggleSwitch} ${selectedField.required ? styles.active : ""}`}
                      onClick={() => updateField(selectedField.id, { required: !selectedField.required })}
                    />
                  </div>
                </div>
              )}

              {/* ─── Field Width ─────────────────────────────────────────── */}
              {!LAYOUT_FIELD_TYPES.includes(selectedField.field_type) && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Field Width</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "Full", value: "full" },
                      { label: "Half", value: "half" },
                      { label: "Third", value: "third" },
                    ].map((w) => (
                      <button
                        key={w.value}
                        onClick={() => updateField(selectedField.id, { settings: { ...selectedField.settings, width: w.value } })}
                        style={{
                          flex: 1, padding: "6px 10px", borderRadius: 6,
                          border: "1px solid",
                          borderColor: (selectedField.settings as Record<string, unknown>)?.width === w.value ? "#4f46e5" : "#e5e7eb",
                          background: (selectedField.settings as Record<string, unknown>)?.width === w.value ? "#eef2ff" : "#fff",
                          color: (selectedField.settings as Record<string, unknown>)?.width === w.value ? "#4f46e5" : "#555",
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Options Editor (dropdown, radio, checkbox, multi_select, yes_no) ─── */}
              {OPTION_FIELD_TYPES.includes(selectedField.field_type) && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Options</label>
                  <div className={styles.optionsEditor}>
                    {selectedField.options.map((opt, idx) => (
                      <div key={idx} className={styles.optionRow}>
                        <input
                          className={styles.optionInput}
                          value={opt.label}
                          onChange={(e) => {
                            const newOptions = [...selectedField.options];
                            newOptions[idx] = {
                              label: e.target.value,
                              value: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                            };
                            updateField(selectedField.id, { options: newOptions });
                          }}
                          placeholder={`Option ${idx + 1}`}
                        />
                        <button
                          className={styles.optionRemoveBtn}
                          onClick={() => {
                            const newOptions = selectedField.options.filter((_, i) => i !== idx);
                            updateField(selectedField.id, { options: newOptions });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      className={styles.addOptionBtn}
                      onClick={() => {
                        const newOptions = [
                          ...selectedField.options,
                          { label: `Option ${selectedField.options.length + 1}`, value: `option_${selectedField.options.length + 1}` },
                        ];
                        updateField(selectedField.id, { options: newOptions });
                      }}
                    >
                      + Add Option
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Rating: Max Stars ──────────────────────────────────── */}
              {selectedField.field_type === "rating" && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Max Stars</label>
                  <select
                    className={styles.settingsInput}
                    value={((selectedField.settings as Record<string, unknown>)?.maxStars as number) || 5}
                    onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, maxStars: parseInt(e.target.value) } })}
                  >
                    <option value={3}>3 Stars</option>
                    <option value={5}>5 Stars</option>
                    <option value={7}>7 Stars</option>
                    <option value={10}>10 Stars</option>
                  </select>
                </div>
              )}

              {/* ─── Scale: Min / Max / Labels ──────────────────────────── */}
              {selectedField.field_type === "scale" && (
                <>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Min Value</label>
                    <input className={styles.settingsInput} type="number" value={((selectedField.settings as Record<string, unknown>)?.min as number) ?? 1}
                      onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, min: parseInt(e.target.value) || 0 } })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Max Value</label>
                    <input className={styles.settingsInput} type="number" value={((selectedField.settings as Record<string, unknown>)?.max as number) ?? 10}
                      onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, max: parseInt(e.target.value) || 10 } })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Min Label</label>
                    <input className={styles.settingsInput} value={((selectedField.settings as Record<string, unknown>)?.minLabel as string) || ""}
                      onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, minLabel: e.target.value } })} placeholder="e.g. Not likely" />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Max Label</label>
                    <input className={styles.settingsInput} value={((selectedField.settings as Record<string, unknown>)?.maxLabel as string) || ""}
                      onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, maxLabel: e.target.value } })} placeholder="e.g. Very likely" />
                  </div>
                </>
              )}

              {/* ─── Slider: Min / Max / Step ──────────────────────────── */}
              {selectedField.field_type === "slider" && (
                <>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Min</label>
                    <input className={styles.settingsInput} type="number" value={((selectedField.settings as Record<string, unknown>)?.min as number) ?? 0}
                      onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, min: parseInt(e.target.value) || 0 } })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Max</label>
                    <input className={styles.settingsInput} type="number" value={((selectedField.settings as Record<string, unknown>)?.max as number) ?? 100}
                      onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, max: parseInt(e.target.value) || 100 } })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Step</label>
                    <input className={styles.settingsInput} type="number" min={1} value={((selectedField.settings as Record<string, unknown>)?.step as number) ?? 1}
                      onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, step: parseInt(e.target.value) || 1 } })} />
                  </div>
                </>
              )}

              {/* ─── Spacer: Height ─────────────────────────────────────── */}
              {selectedField.field_type === "spacer" && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Height (px)</label>
                  <input className={styles.settingsInput} type="number" min={8} max={200}
                    value={((selectedField.settings as Record<string, unknown>)?.height as number) || 32}
                    onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, height: parseInt(e.target.value) || 32 } })} />
                </div>
              )}

              {/* ─── Consent: Text ──────────────────────────────────────── */}
              {selectedField.field_type === "consent_checkbox" && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Consent Text</label>
                  <textarea
                    className={styles.settingsTextarea}
                    value={((selectedField.settings as Record<string, unknown>)?.consentText as string) || ""}
                    onChange={(e) => updateField(selectedField.id, { settings: { ...selectedField.settings, consentText: e.target.value } })}
                    placeholder="I agree to the Terms of Service..."
                  />
                </div>
              )}

              {/* ─── Validation: Min/Max Length (text fields) ───────────── */}
              {["text", "textarea", "email", "url", "password"].includes(selectedField.field_type) && (
                <>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Min Length</label>
                    <input className={styles.settingsInput} type="number" min={0}
                      value={(selectedField.validation as Record<string, number>).minLength || ""}
                      onChange={(e) => updateField(selectedField.id, {
                        validation: { ...selectedField.validation, minLength: parseInt(e.target.value) || undefined },
                      })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Max Length</label>
                    <input className={styles.settingsInput} type="number" min={0}
                      value={(selectedField.validation as Record<string, number>).maxLength || ""}
                      onChange={(e) => updateField(selectedField.id, {
                        validation: { ...selectedField.validation, maxLength: parseInt(e.target.value) || undefined },
                      })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Regex Pattern</label>
                    <input className={styles.settingsInput}
                      value={(selectedField.validation as Record<string, string>).pattern || ""}
                      onChange={(e) => updateField(selectedField.id, {
                        validation: { ...selectedField.validation, pattern: e.target.value || undefined },
                      })} placeholder="e.g. ^[A-Za-z]+$" />
                  </div>
                </>
              )}

              {/* ─── Validation: Number min/max ────────────────────────── */}
              {selectedField.field_type === "number" && (
                <>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Min Value</label>
                    <input className={styles.settingsInput} type="number"
                      value={(selectedField.validation as Record<string, number>).min ?? ""}
                      onChange={(e) => updateField(selectedField.id, {
                        validation: { ...selectedField.validation, min: parseFloat(e.target.value) || undefined },
                      })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Max Value</label>
                    <input className={styles.settingsInput} type="number"
                      value={(selectedField.validation as Record<string, number>).max ?? ""}
                      onChange={(e) => updateField(selectedField.id, {
                        validation: { ...selectedField.validation, max: parseFloat(e.target.value) || undefined },
                      })} />
                  </div>
                </>
              )}

              {/* ─── Validation: File Upload ───────────────────────────── */}
              {selectedField.field_type === "file_upload" && (
                <>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Max File Size (MB)</label>
                    <input className={styles.settingsInput} type="number" min={1}
                      value={(selectedField.validation as Record<string, number>).maxFileSize || 10}
                      onChange={(e) => updateField(selectedField.id, {
                        validation: { ...selectedField.validation, maxFileSize: parseInt(e.target.value) || 10 },
                      })} />
                  </div>
                  <div className={styles.settingsGroup}>
                    <label className={styles.settingsLabel}>Allowed File Types</label>
                    <input className={styles.settingsInput}
                      value={((selectedField.validation as Record<string, unknown>).allowedTypes as string[] || []).join(", ")}
                      onChange={(e) => updateField(selectedField.id, {
                        validation: { ...selectedField.validation, allowedTypes: e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean) },
                      })} placeholder="image/*, application/pdf" />
                  </div>
                </>
              )}

              {/* ─── Conditional Logic ─────────────────────────────────── */}
              {!LAYOUT_FIELD_TYPES.includes(selectedField.field_type) && (
                <div className={styles.settingsGroup}>
                  <label className={styles.settingsLabel}>Conditional Logic</label>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Show this field when...</div>
                  {(() => {
                    const cond = (selectedField.conditional as { fieldId?: string; operator?: string; value?: string }) || {};
                    const otherFields = fields.filter(f => f.id !== selectedField.id && !LAYOUT_FIELD_TYPES.includes(f.field_type));
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <select
                          className={styles.settingsInput}
                          value={cond.fieldId || ""}
                          onChange={(e) => updateField(selectedField.id, {
                            conditional: e.target.value ? { ...cond, fieldId: e.target.value } : undefined,
                          })}
                        >
                          <option value="">Always show (no condition)</option>
                          {otherFields.map(f => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>
                        {cond.fieldId && (
                          <>
                            <select className={styles.settingsInput} value={cond.operator || "equals"}
                              onChange={(e) => updateField(selectedField.id, { conditional: { ...cond, operator: e.target.value } })}>
                              <option value="equals">Equals</option>
                              <option value="not_equals">Not Equals</option>
                              <option value="contains">Contains</option>
                              <option value="not_empty">Is Not Empty</option>
                              <option value="greater_than">Greater Than</option>
                              <option value="less_than">Less Than</option>
                            </select>
                            {cond.operator !== "not_empty" && (
                              <input className={styles.settingsInput} value={cond.value || ""}
                                onChange={(e) => updateField(selectedField.id, { conditional: { ...cond, value: e.target.value } })}
                                placeholder="Value..." />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "success" ? styles.toastSuccess : styles.toastError}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
