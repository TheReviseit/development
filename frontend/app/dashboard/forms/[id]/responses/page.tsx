"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { AlertToast } from "@/components/ui/alert-toast";
import styles from "../../forms.module.css";

interface FormField {
  id: string;
  field_type: string;
  label: string;
  position: number;
}

interface FormResponse {
  id: string;
  form_id: string;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: string;
  submitted_at: string;
  values: Record<string, string>;
}

interface FormData {
  id: string;
  title: string;
  slug: string | null;
  response_count: number;
  settings?: any;
}

export default function FormResponsesPage() {
  const router = useRouter();
  const { id: formId } = useParams<{ id: string }>();
  const [form, setForm] = useState<FormData | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [sheetModalOpen, setSheetModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetConnecting, setSheetConnecting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const perPage = 25;

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const fetchData = useCallback(async () => {
    try {
      // Fetch form info
      const formRes = await fetch(`/api/forms/${formId}`, {
        credentials: "include",
      });
      const formData = await formRes.json();
      if (formData.success && formData.form) {
        setForm(formData.form);
        setFields(
          (formData.form.fields || [])
            .filter(
              (f: FormField) =>
                !["heading", "divider", "hidden"].includes(f.field_type),
            )
            .sort((a: FormField, b: FormField) => a.position - b.position),
        );
      }

      // Fetch responses
      const respRes = await fetch(
        `/api/forms/${formId}/responses?page=${page}&per_page=${perPage}`,
        { credentials: "include" },
      );
      const respData = await respRes.json();
      if (respData.success) {
        setResponses(respData.responses || []);
        setTotal(respData.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch responses:", err);
    } finally {
      setLoading(false);
    }
  }, [formId, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = Math.ceil(total / perPage);

  const exportData = (format: "csv" | "xlsx") => {
    if (!fields.length || !responses.length) return;
    const headers = [
      "Submitted At",
      ...fields.map((f) => f.label),
      "IP Address",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
    ];
    const rows = responses.map((r) => [
      r.submitted_at ? formatDate(r.submitted_at) : "",
      ...fields.map((f) => r.values?.[f.id] || ""),
      r.ip_address || "",
      r.utm_source || "",
      r.utm_medium || "",
      r.utm_campaign || "",
    ]);

    if (format === "csv") {
      const csvRows = responses.map((r) => [
        r.submitted_at ? formatDate(r.submitted_at) : "",
        ...fields.map((f) => (r.values?.[f.id] || "").replace(/,/g, ";")),
        r.ip_address || "",
        r.utm_source || "",
        r.utm_medium || "",
        r.utm_campaign || "",
      ]);
      const csv = [
        headers.join(","),
        ...csvRows.map((row) => row.map((v) => `"${v}"`).join(",")),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form?.title || "form"}-responses.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      import("xlsx").then((XLSX) => {
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Responses");
        XLSX.writeFile(workbook, `${form?.title || "form"}-responses.xlsx`);
      });
    }
    setExportOpen(false);
  };

  const handleConnectSheet = async () => {
    if (!sheetUrl) return alert("Please enter a Google Sheet URL");
    setSheetConnecting(true);
    try {
      const res = await fetch(`/api/forms/${formId}/sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: sheetUrl }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Success! Form responses will now sync to this Google Sheet.");
        setSheetModalOpen(false);
        fetchData(); // Refresh form data to show it's connected
      } else {
        alert(
          data.error ||
            "Failed to connect sheet. Make sure you shared it with the service account.",
        );
      }
    } catch (err) {
      alert("Error connecting sheet.");
    } finally {
      setSheetConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading responses...</p>
      </div>
    );
  }

  return (
    <div className={styles.formsContainer}>
      {/* Header */}
      <div className={styles.formsHeader}>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 4,
            }}
          >
            <Link
              href="/dashboard/forms"
              style={{
                background: "#fff",
                border: "1px solid #fff",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "#000",
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back
            </Link>
          </div>
          <h1 className={styles.formsTitle}>
            {form?.title || "Form"} — Responses
          </h1>
          <p className={styles.formsSubtitle}>
            {total} total response{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={styles.createFormBtn}
            onClick={() => {
              setSheetUrl(form?.settings?.google_sheet_url || "");
              setSheetModalOpen(true);
            }}
            style={{
              background: form?.settings?.google_sheet_url
                ? "#ffffffff"
                : "#ffffffffff",
              color: form?.settings?.google_sheet_url
                ? "#000000ff"
                : "#000000ff",
              border: "1px solid #e5e7eb",
            }}
          >
            {form?.settings?.google_sheet_url
              ? "Sheet Connected"
              : "Connect Sheet"}
          </button>
          <div style={{ position: "relative" }}>
            <button
              className={styles.createFormBtn}
              onClick={() => setExportOpen(!exportOpen)}
              style={{
                background: "#111",
                color: "#fff",
                border: "1px solid #333",
              }}
            >
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export
              <svg
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ marginLeft: 4 }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {exportOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 8,
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  overflow: "hidden",
                  zIndex: 10,
                  width: 140,
                }}
              >
                <button
                  onClick={() => exportData("csv")}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    color: "#eee",
                    fontSize: 13,
                    cursor: "pointer",
                    borderBottom: "1px solid #222",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#222")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  Export as CSV
                </button>
                <button
                  onClick={() => exportData("xlsx")}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    color: "#eee",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#222")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  Export as Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {responses.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg
              width="36"
              height="36"
              fill="none"
              stroke="#fff"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h3 className={styles.emptyTitle}>No responses yet</h3>
          <p className={styles.emptySubtitle}>
            Share your form link to start collecting responses. They&apos;ll
            appear here in real time.
          </p>
          {form?.slug && (
            <button
              className={styles.createFormBtn}
              style={{
                marginTop: 20,
                background: "#111",
                color: "#fff",
                border: "1px solid #333",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/form/${form.slug}`,
                );
                setToastMessage("Link copied!");
              }}
            >
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                />
              </svg>
              Copy Form Link
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Responses Table */}
          <div
            style={{
              background: "#111",
              borderRadius: 16,
              border: "1px solid #333",
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                  minWidth: fields.length > 3 ? 800 : "auto",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#000",
                      borderBottom: "1px solid #333",
                    }}
                  >
                    <th style={thStyle}>S.NO</th>
                    <th style={thStyle}>Submitted</th>
                    {fields.map((f) => (
                      <th key={f.id} style={thStyle}>
                        {f.label}
                      </th>
                    ))}
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>UTM Source</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((resp, idx) => (
                    <tr
                      key={resp.id}
                      style={{
                        borderBottom: "1px solid #222",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#222")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={tdStyle}>
                        <span style={{ color: "#777", fontSize: 12 }}>
                          {(page - 1) * perPage + idx + 1}
                        </span>
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          whiteSpace: "nowrap",
                          fontSize: 13,
                          color: "#ccc",
                        }}
                      >
                        {resp.submitted_at
                          ? formatDate(resp.submitted_at)
                          : "—"}
                      </td>
                      {fields.map((f) => (
                        <td key={f.id} style={tdStyle}>
                          <span
                            style={{
                              maxWidth: 250,
                              display: "inline-block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "#eee",
                            }}
                          >
                            {resp.values?.[f.id] || (
                              <span style={{ color: "#555" }}>—</span>
                            )}
                          </span>
                        </td>
                      ))}
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: 12,
                          color: "#777",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {resp.ip_address || "—"}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "#777" }}>
                        {resp.utm_source || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 20px",
                  borderTop: "1px solid #333",
                  fontSize: 13,
                  color: "#aaa",
                }}
              >
                <span>
                  Showing {(page - 1) * perPage + 1}–
                  {Math.min(page * perPage, total)} of {total}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={paginationBtnStyle}
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={paginationBtnStyle}
                  >
                    Next
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Sheet Connection Modal */}
      {sheetModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: "var(--dash-sidebar-width, 280px)",
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#111",
              width: 440,
              borderRadius: 16,
              padding: 24,
              border: "1px solid #333",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", color: "#fff", fontSize: 18 }}>
              Connect to Google Sheets
            </h3>
            <p
              style={{
                color: "#aaa",
                fontSize: 13,
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              Automatically sync new responses to a Google Sheet. Follow these
              steps:
            </p>
            <ol
              style={{
                color: "#eee",
                fontSize: 13,
                marginBottom: 20,
                paddingLeft: 16,
                lineHeight: 1.6,
              }}
            >
              <li>Create a new Google Sheet (or open an existing one).</li>
              <li>
                Click <b>Share</b> in the top right.
              </li>
              <li>
                Share it with: <br />
                <code
                  style={{
                    background: "#222",
                    padding: "2px 4px",
                    borderRadius: 4,
                    userSelect: "all",
                    color: "#22c15a",
                  }}
                >
                  flowauxi@flowauxi.iam.gserviceaccount.com
                </code>
                <br /> and set permissions to <b>Editor</b>.
              </li>
              <li>Paste the URL of your Google Sheet below:</li>
            </ol>

            <input
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "#000",
                color: "#fff",
                marginBottom: 20,
                fontSize: 13,
                outline: "none",
              }}
            />

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              {form?.settings?.google_sheet_url && (
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        "Are you sure you want to disconnect this Google Sheet?",
                      )
                    ) {
                      setSheetUrl("");
                      await handleConnectSheet();
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "transparent",
                    color: "#ff4444",
                    border: "1px solid #ff4444",
                    cursor: "pointer",
                    fontSize: 13,
                    marginRight: "auto",
                  }}
                >
                  Disconnect
                </button>
              )}
              <button
                onClick={() => setSheetModalOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#aaa",
                  border: "1px solid #333",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConnectSheet}
                disabled={sheetConnecting || !sheetUrl}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "#fff",
                  color: "#000",
                  border: "none",
                  cursor: sheetConnecting ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {sheetConnecting
                  ? "Connecting..."
                  : form?.settings?.google_sheet_url
                    ? "Update Sheet"
                    : "Connect Sheet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className={styles.toastWrapper}>
          <AlertToast
            variant="success"
            styleVariant="minimal"
            title="Link Copied!"
            description=""
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  color: "#eee",
};

const paginationBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  border: "1px solid #333",
  borderRadius: 6,
  background: "#111",
  fontSize: 13,
  cursor: "pointer",
  color: "#ddd",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};
