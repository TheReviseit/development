"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "../dashboard.module.css";
import { useAuth } from "@/app/components/auth/AuthProvider";
import {
  fetchTemplates,
  syncTemplates,
  deleteTemplate,
  Template,
} from "@/lib/api/whatsapp";
import CreateTemplateModal from "./CreateTemplateModal";
import SendTemplateModal from "./SendTemplateModal";

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  );
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userId =
    user?.id ||
    process.env.NEXT_PUBLIC_DEV_USER_ID ||
    "7944b72f-2bc1-4cc1-9714-215c2e177b51";

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

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
    const iconStyle = {
      width: 16,
      height: 16,
      stroke: "currentColor",
      fill: "none",
      strokeWidth: 2,
    };
    switch (category.toUpperCase()) {
      case "MARKETING":
        return (
          <svg {...iconStyle} viewBox="0 0 24 24">
            <path d="M22 12h-4l-3 9-6-18-3 9H2" />
          </svg>
        );
      case "UTILITY":
        return (
          <svg {...iconStyle} viewBox="0 0 24 24">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        );
      case "AUTHENTICATION":
        return (
          <svg {...iconStyle} viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        );
      default:
        return (
          <svg {...iconStyle} viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        );
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
        <div className={styles.headerButtons}>
          <button
            className={styles.secondaryBtn}
            onClick={handleSync}
            disabled={syncing}
            style={{ opacity: syncing ? 0.7 : 1, whiteSpace: "nowrap" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                animation: syncing ? "spin 1s linear infinite" : "none",
                flexShrink: 0,
              }}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <button
            className={styles.primaryBtn}
            onClick={() => setShowCreateModal(true)}
            style={{ whiteSpace: "nowrap" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ flexShrink: 0 }}
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
        {/* Desktop: Category Tabs */}
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

        {/* Mobile: Custom Category Dropdown */}
        <div className={styles.customDropdown} ref={dropdownRef}>
          <button
            className={styles.dropdownTrigger}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span>
              {categories.find((c) => c.id === selectedCategory)?.label ||
                "All Templates"}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {dropdownOpen && (
            <div className={styles.dropdownMenu}>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`${styles.dropdownItem} ${
                    selectedCategory === cat.id ? styles.dropdownItemActive : ""
                  }`}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setDropdownOpen(false);
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
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
                    fontSize: "13px",
                    color: "var(--dash-text-secondary)",
                    padding: "10px 14px",
                    background: "var(--dash-bg-tertiary)",
                    borderRadius: "10px",
                    border: "1px solid var(--dash-border)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {template.header_type === "IMAGE" ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  )}
                  {template.header_type === "IMAGE"
                    ? "Image Header"
                    : template.header_content}
                </div>
              )}

              <p className={styles.templateContent}>{template.body_text}</p>

              {/* Footer */}
              {template.footer_text && (
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--dash-text-muted)",
                    fontStyle: "italic",
                    padding: "8px 0",
                    borderTop: "1px dashed var(--dash-border-light)",
                  }}
                >
                  {template.footer_text}
                </div>
              )}

              {/* Buttons */}
              {template.buttons && template.buttons.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  {template.buttons.map((btn, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: "12px",
                        padding: "6px 12px",
                        background: "rgba(34, 193, 90, 0.1)",
                        color: "var(--dash-accent)",
                        borderRadius: "8px",
                        border: "1px solid rgba(34, 193, 90, 0.2)",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      {btn.text}
                    </span>
                  ))}
                </div>
              )}

              {/* Variables */}
              {template.variables && template.variables.length > 0 && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--dash-cyan)",
                    padding: "8px 12px",
                    background: "rgba(34, 211, 238, 0.08)",
                    borderRadius: "8px",
                    border: "1px solid rgba(34, 211, 238, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  {template.variables.length} variable
                  {template.variables.length > 1 ? "s" : ""}:
                  {template.variables.map((v) => ` {{${v.index}}}`).join(",")}
                </div>
              )}

              <div className={styles.templateMeta}>
                <span className={styles.templateLanguage}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {template.language}
                </span>
                <span className={styles.templateDate}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatDate(template.updated_at)}
                </span>
              </div>

              <div className={styles.templateActions}>
                <button
                  className={styles.templateBtn}
                  onClick={() => {
                    setSelectedTemplate(template);
                    setShowCreateModal(true);
                  }}
                >
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
                <button
                  className={styles.templateBtn}
                  onClick={() => {
                    setSelectedTemplate(template);
                    setViewModalOpen(true);
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  View
                </button>
                {template.status === "APPROVED" && (
                  <button
                    className={`${styles.templateBtn} ${styles.sendBtn}`}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setSendModalOpen(true);
                    }}
                  >
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
                    Send
                  </button>
                )}
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
          className={styles.statsFooter}
          style={{
            marginTop: "24px",
            padding: "12px 16px",
            background: "var(--dash-bg-secondary)",
            border: "1px solid var(--dash-border)",
            borderRadius: "12px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            fontSize: "13px",
            color: "var(--dash-text-secondary)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            Total: {templates.length} templates
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
            Approved: {templates.filter((t) => t.status === "APPROVED").length}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Pending: {templates.filter((t) => t.status === "PENDING").length}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Rejected: {templates.filter((t) => t.status === "REJECTED").length}
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

      {/* Create Template Modal */}
      <CreateTemplateModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedTemplate(null);
        }}
        onSuccess={() => {
          loadTemplates();
          setShowCreateModal(false);
          setSelectedTemplate(null);
        }}
        userId={userId}
        editTemplate={selectedTemplate}
      />

      {/* View Template Modal */}
      {viewModalOpen && selectedTemplate && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setViewModalOpen(false);
            setSelectedTemplate(null);
          }}
        >
          <div
            className={styles.viewModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.viewModalHeader}>
              <h2>{selectedTemplate.template_name}</h2>
              <button
                className={styles.closeModalBtn}
                onClick={() => {
                  setViewModalOpen(false);
                  setSelectedTemplate(null);
                }}
              >
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

            <div className={styles.viewModalContent}>
              <div className={styles.viewModalMeta}>
                <span
                  className={`${styles.templateStatus} ${
                    selectedTemplate.status === "APPROVED"
                      ? styles.statusApproved
                      : selectedTemplate.status === "PENDING"
                      ? styles.statusPending
                      : styles.statusRejected
                  }`}
                >
                  {selectedTemplate.status}
                </span>
                <span>{selectedTemplate.category}</span>
                <span>{selectedTemplate.language}</span>
              </div>

              {selectedTemplate.header_content && (
                <div className={styles.viewModalSection}>
                  <h4>Header</h4>
                  <p>
                    {selectedTemplate.header_type === "IMAGE"
                      ? "📷 Image Header"
                      : selectedTemplate.header_content}
                  </p>
                </div>
              )}

              <div className={styles.viewModalSection}>
                <h4>Body</h4>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {selectedTemplate.body_text}
                </p>
              </div>

              {selectedTemplate.footer_text && (
                <div className={styles.viewModalSection}>
                  <h4>Footer</h4>
                  <p>{selectedTemplate.footer_text}</p>
                </div>
              )}

              {selectedTemplate.buttons &&
                selectedTemplate.buttons.length > 0 && (
                  <div className={styles.viewModalSection}>
                    <h4>Buttons</h4>
                    <div
                      style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                    >
                      {selectedTemplate.buttons.map((btn, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: "6px 12px",
                            background: "var(--dash-bg-tertiary)",
                            borderRadius: "6px",
                            fontSize: "13px",
                          }}
                        >
                          {btn.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {selectedTemplate.variables &&
                selectedTemplate.variables.length > 0 && (
                  <div className={styles.viewModalSection}>
                    <h4>Variables</h4>
                    <p>
                      {selectedTemplate.variables
                        .map((v) => `{{${v.index}}}`)
                        .join(", ")}
                    </p>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Send Template Modal */}
      <SendTemplateModal
        isOpen={sendModalOpen}
        onClose={() => {
          setSendModalOpen(false);
          setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        userId={userId}
      />
    </div>
  );
}
