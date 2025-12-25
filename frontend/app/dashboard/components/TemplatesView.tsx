"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../dashboard.module.css";
import { useAuth } from "@/app/components/auth/AuthProvider";
import {
  fetchTemplates,
  syncTemplates,
  deleteTemplate,
  Template,
} from "@/lib/api/whatsapp";

const categories = [
  { id: "all", label: "All Templates" },
  { id: "MARKETING", label: "Marketing" },
  { id: "UTILITY", label: "Utility" },
  { id: "AUTHENTICATION", label: "Authentication" },
];

export default function TemplatesView() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Use user.id or fallback to development user ID
  // TODO: Remove fallback once auth sync is fixed
  const userId =
    user?.id ||
    process.env.NEXT_PUBLIC_DEV_USER_ID ||
    "7944b72f-2bc1-4cc1-9714-215c2e177b51";

  // Fetch templates from API
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTemplates(userId, {
        category: selectedCategory !== "all" ? selectedCategory : undefined,
        search: searchQuery || undefined,
      });
      setTemplates(data);
    } catch (err: any) {
      console.error("Failed to fetch templates:", err);
      setError(err.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [userId, selectedCategory, searchQuery]);

  // Load templates on mount and when filters change
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Sync templates from Meta
  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      const result = await syncTemplates(userId);
      console.log(`✅ ${result.message}`);
      // Reload templates after sync
      await loadTemplates();
    } catch (err: any) {
      console.error("Failed to sync templates:", err);
      setError(err.message || "Failed to sync templates");
    } finally {
      setSyncing(false);
    }
  };

  // Delete template
  const handleDelete = async (templateId: string, templateName: string) => {
    if (!confirm(`Are you sure you want to delete "${templateName}"?`)) return;

    try {
      await deleteTemplate(userId, templateId);
      setTemplates(templates.filter((t) => t.id !== templateId));
    } catch (err: any) {
      console.error("Failed to delete template:", err);
      setError(err.message || "Failed to delete template");
    }
  };

  // Filter templates client-side for instant search
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch = template.template_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
        return styles.statusApproved;
      case "pending":
        return styles.statusPending;
      case "rejected":
        return styles.statusRejected;
      default:
        return "";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toUpperCase()) {
      case "MARKETING":
        return "📢";
      case "UTILITY":
        return "🔧";
      case "AUTHENTICATION":
        return "🔐";
      default:
        return "📝";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className={styles.templatesView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Message Templates</h1>
          <p className={styles.viewSubtitle}>
            Create and manage your WhatsApp message templates
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            className={styles.secondaryBtn}
            onClick={handleSync}
            disabled={syncing}
            style={{ opacity: syncing ? 0.7 : 1 }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                animation: syncing ? "spin 1s linear infinite" : "none",
              }}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            {syncing ? "Syncing..." : "Sync from Meta"}
          </button>
          <button className={styles.primaryBtn}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Template
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          className={styles.errorBanner}
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            color: "#dc2626",
          }}
        >
          ⚠️ {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div className={styles.templatesFilters}>
        <div className={styles.categoryTabs}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`${styles.categoryTab} ${
                selectedCategory === cat.id ? styles.categoryActive : ""
              }`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className={styles.searchWrapper}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
          <div style={{ fontSize: "24px", marginBottom: "12px" }}>⏳</div>
          Loading templates...
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTemplates.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "#6b7280",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
          <h3
            style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}
          >
            No templates found
          </h3>
          <p style={{ marginBottom: "20px" }}>
            {templates.length === 0
              ? "Sync your templates from Meta to get started."
              : "Try adjusting your search or filters."}
          </p>
          {templates.length === 0 && (
            <button
              className={styles.primaryBtn}
              onClick={handleSync}
              disabled={syncing}
            >
              Sync Templates from Meta
            </button>
          )}
        </div>
      )}

      {/* Templates Grid */}
      {!loading && filteredTemplates.length > 0 && (
        <div className={styles.templatesGrid}>
          {filteredTemplates.map((template) => (
            <div key={template.id} className={styles.templateCard}>
              <div className={styles.templateHeader}>
                <div className={styles.templateCategory}>
                  <span className={styles.categoryIcon}>
                    {getCategoryIcon(template.category)}
                  </span>
                  <span className={styles.categoryName}>
                    {template.category.toLowerCase()}
                  </span>
                </div>
                <span
                  className={`${styles.templateStatus} ${getStatusColor(
                    template.status
                  )}`}
                >
                  {template.status.toLowerCase()}
                </span>
              </div>

              <h3 className={styles.templateName}>{template.template_name}</h3>

              {/* Header content if exists */}
              {template.header_content && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "8px",
                    padding: "8px",
                    background: "#f3f4f6",
                    borderRadius: "4px",
                  }}
                >
                  {template.header_type === "IMAGE"
                    ? "🖼️ Image Header"
                    : `📌 ${template.header_content}`}
                </div>
              )}

              <p className={styles.templateContent}>{template.body_text}</p>

              {/* Footer */}
              {template.footer_text && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#9ca3af",
                    marginTop: "8px",
                    fontStyle: "italic",
                  }}
                >
                  {template.footer_text}
                </div>
              )}

              {/* Buttons */}
              {template.buttons && template.buttons.length > 0 && (
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  {template.buttons.map((btn, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: "11px",
                        padding: "4px 8px",
                        background: "#e0f2fe",
                        color: "#0369a1",
                        borderRadius: "4px",
                      }}
                    >
                      🔗 {btn.text}
                    </span>
                  ))}
                </div>
              )}

              {/* Variables */}
              {template.variables && template.variables.length > 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "11px",
                    color: "#8b5cf6",
                  }}
                >
                  📊 {template.variables.length} variable
                  {template.variables.length > 1 ? "s" : ""}:
                  {template.variables.map((v) => ` {{${v.index}}}`).join(",")}
                </div>
              )}

              <div className={styles.templateMeta}>
                <span className={styles.templateLanguage}>
                  🌐 {template.language}
                </span>
                <span className={styles.templateDate}>
                  Updated {formatDate(template.updated_at)}
                </span>
              </div>

              <div className={styles.templateActions}>
                <button className={styles.templateBtn}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
                <button className={styles.templateBtn}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Duplicate
                </button>
                <button
                  className={`${styles.templateBtn} ${styles.deleteBtn}`}
                  onClick={() =>
                    handleDelete(template.id, template.template_name)
                  }
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats footer */}
      {!loading && templates.length > 0 && (
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            background: "#f9fafb",
            borderRadius: "8px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "14px",
            color: "#6b7280",
          }}
        >
          <span>📊 Total: {templates.length} templates</span>
          <span>
            ✅ Approved:{" "}
            {templates.filter((t) => t.status === "APPROVED").length}
          </span>
          <span>
            ⏳ Pending: {templates.filter((t) => t.status === "PENDING").length}
          </span>
          <span>
            ❌ Rejected:{" "}
            {templates.filter((t) => t.status === "REJECTED").length}
          </span>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
