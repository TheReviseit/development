"use client";

import { useState, useRef, useCallback } from "react";
import { auth } from "@/src/firebase/firebase";
import styles from "./BulkUploadModal.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

interface ColumnMapping {
  phone: string;
  name: string;
  email: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

type ModalStep = "upload" | "mapping" | "importing" | "results";

// ─────────────────────────────────────────────────────────────────────────────
// Auto-detect CSV column mapping from header names
// ─────────────────────────────────────────────────────────────────────────────

function autoDetectMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());

  const phonePatterns = ["phone", "phone_number", "phonenumber", "mobile", "cell", "whatsapp", "number", "tel", "telephone", "contact"];
  const namePatterns = ["name", "full_name", "fullname", "customer_name", "contact_name", "first_name", "firstname"];
  const emailPatterns = ["email", "email_address", "emailaddress", "e-mail", "mail"];

  const findMatch = (patterns: string[]): string => {
    for (const pattern of patterns) {
      const idx = lower.findIndex((h) => h.includes(pattern));
      if (idx !== -1) return headers[idx];
    }
    return "";
  };

  return {
    phone: findMatch(phonePatterns),
    name: findMatch(namePatterns),
    email: findMatch(emailPatterns),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse CSV text into headers + rows
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], totalRows: 0 };

  // Simple CSV parsing (handles quoted fields)
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === "," && !inQuote) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows, totalRows: rows.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BulkUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkUploadModalProps) {
  const [step, setStep] = useState<ModalStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsedCSV, setParsedCSV] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ phone: "", name: "", email: "" });
  const [tagsStr, setTagsStr] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset state on close ──
  const handleClose = useCallback(() => {
    setStep("upload");
    setFile(null);
    setParsedCSV(null);
    setMapping({ phone: "", name: "", email: "" });
    setTagsStr("");
    setError("");
    setImportResult(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // ── File handling ──
  const processFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Only CSV files are supported.");
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      setError("File size must be under 10 MB.");
      return;
    }

    setError("");
    setFile(f);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("CSV file is empty or has no data rows.");
        return;
      }

      setParsedCSV(parsed);
      setMapping(autoDetectMapping(parsed.headers));
      setStep("mapping");
    };
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsText(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) processFile(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  // ── Import ──
  const handleImport = async () => {
    if (!file || !mapping.phone) {
      setError("Phone column mapping is required.");
      return;
    }

    setStep("importing");
    setError("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Authentication required.");

      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "mapping",
        JSON.stringify({
          phone: mapping.phone,
          name: mapping.name || undefined,
          email: mapping.email || undefined,
        }),
      );

      if (tagsStr.trim()) {
        formData.append("tags", tagsStr.trim());
      }

      console.log(`📤 Uploading ${parsedCSV?.totalRows || 0} contacts...`);

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "X-User-ID": user.uid },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Import failed.");
      }

      console.log(
        `✅ Imported ${data.imported}, skipped ${data.skipped}`,
      );

      setImportResult({
        imported: data.imported || 0,
        skipped: data.skipped || 0,
        errors: data.errors || [],
      });
      setStep("results");
    } catch (err: any) {
      console.error("❌ Import error:", err);
      setError(err.message || "Import failed. Please try again.");
      setStep("mapping");
    }
  };

  const handleDone = () => {
    onSuccess();
    handleClose();
  };

  // ── Render helpers ──
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {step === "upload" && "Import Contacts"}
            {step === "mapping" && "Map Columns"}
            {step === "importing" && "Importing..."}
            {step === "results" && "Import Complete"}
          </h2>
          <button className={styles.closeBtn} onClick={handleClose}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {error && <div className={styles.errorText}>{error}</div>}

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <>
              <div
                className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
                <svg className={styles.dropZoneIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className={styles.dropZoneTitle}>
                  Drop your CSV file here, or click to browse
                </p>
                <p className={styles.dropZoneHint}>
                  Supports .csv files up to 10 MB
                </p>
              </div>
            </>
          )}

          {/* ── Step 2: Column Mapping ── */}
          {step === "mapping" && parsedCSV && (
            <>
              {/* File info */}
              {file && (
                <div className={styles.fileInfo}>
                  <div className={styles.fileIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className={styles.fileDetails}>
                    <p className={styles.fileName}>{file.name}</p>
                    <p className={styles.fileMeta}>
                      {parsedCSV.totalRows} contacts • {formatFileSize(file.size)}
                    </p>
                  </div>
                  <button
                    className={styles.removeFileBtn}
                    onClick={() => {
                      setFile(null);
                      setParsedCSV(null);
                      setStep("upload");
                    }}
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Mapping */}
              <div className={styles.section}>
                <p className={styles.sectionTitle}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Column Mapping
                </p>
                <div className={styles.mappingGrid}>
                  {/* Phone (required) */}
                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Phone *</span>
                    <select
                      className={styles.mappingSelect}
                      value={mapping.phone}
                      onChange={(e) => setMapping((m) => ({ ...m, phone: e.target.value }))}
                    >
                      <option value="">— Select column —</option>
                      {parsedCSV.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Name */}
                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Name</span>
                    <select
                      className={styles.mappingSelect}
                      value={mapping.name}
                      onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value }))}
                    >
                      <option value="">— Skip —</option>
                      {parsedCSV.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Email */}
                  <div className={styles.mappingRow}>
                    <span className={styles.mappingLabel}>Email</span>
                    <select
                      className={styles.mappingSelect}
                      value={mapping.email}
                      onChange={(e) => setMapping((m) => ({ ...m, email: e.target.value }))}
                    >
                      <option value="">— Skip —</option>
                      {parsedCSV.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className={styles.inputGroup}>
                <label className={styles.label}>
                  Tags to apply (comma-separated, optional)
                </label>
                <input
                  type="text"
                  className={styles.inputField}
                  placeholder="e.g. imported, lead, newsletter"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                />
              </div>

              {/* Preview */}
              {parsedCSV.rows.length > 0 && (
                <div className={styles.previewSection}>
                  <p className={styles.sectionTitle}>
                    Preview
                    <span className={styles.previewCount}>
                      (showing first {Math.min(3, parsedCSV.rows.length)} of {parsedCSV.totalRows})
                    </span>
                  </p>
                  <table className={styles.previewTable}>
                    <thead>
                      <tr>
                        {parsedCSV.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedCSV.rows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Importing ── */}
          {step === "importing" && (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <div className={styles.spinner} style={{ width: 32, height: 32, margin: "0 auto 1rem", borderWidth: 3 }} />
              <p style={{ color: "#ffffff", fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.25rem" }}>
                Importing contacts...
              </p>
              <p style={{ color: "#808080", fontSize: "0.8125rem", margin: 0 }}>
                Processing {parsedCSV?.totalRows || 0} rows
              </p>
            </div>
          )}

          {/* ── Step 4: Results ── */}
          {step === "results" && importResult && (
            <div className={styles.results}>
              <div className={styles.resultItem}>
                <div className={`${styles.resultIcon} ${styles.resultSuccess}`}>✓</div>
                <span className={styles.resultText}>
                  <strong>{importResult.imported}</strong> contacts imported
                </span>
              </div>
              {importResult.skipped > 0 && (
                <div className={styles.resultItem}>
                  <div className={`${styles.resultIcon} ${styles.resultSkipped}`}>⊘</div>
                  <span className={styles.resultText}>
                    <strong>{importResult.skipped}</strong> skipped (duplicates or invalid)
                  </span>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className={styles.resultItem}>
                  <div className={`${styles.resultIcon} ${styles.resultError}`}>!</div>
                  <div>
                    <span className={styles.resultText}>
                      <strong>{importResult.errors.length}</strong> errors
                    </span>
                    <ul className={styles.errorList}>
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {step === "upload" && (
            <button className={styles.cancelBtn} onClick={handleClose}>
              Cancel
            </button>
          )}
          {step === "mapping" && (
            <>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setFile(null);
                  setParsedCSV(null);
                  setStep("upload");
                }}
              >
                ← Back
              </button>
              <button
                className={styles.submitBtn}
                onClick={handleImport}
                disabled={!mapping.phone}
              >
                Import {parsedCSV?.totalRows || 0} Contacts
              </button>
            </>
          )}
          {step === "results" && (
            <button className={styles.submitBtn} onClick={handleDone}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
