"use client";

import { useState } from "react";
import styles from "../dashboard.module.css";

// Mock templates data
const mockTemplates = [
  {
    id: "1",
    name: "Welcome Message",
    category: "marketing",
    status: "approved",
    content:
      "Hello {{1}}! Welcome to our service. We're excited to have you on board!",
    language: "English",
    lastUpdated: "Dec 15, 2024",
  },
  {
    id: "2",
    name: "Order Confirmation",
    category: "utility",
    status: "approved",
    content: "Your order #{{1}} has been confirmed. Expected delivery: {{2}}",
    language: "English",
    lastUpdated: "Dec 14, 2024",
  },
  {
    id: "3",
    name: "Appointment Reminder",
    category: "utility",
    status: "pending",
    content: "Reminder: You have an appointment scheduled for {{1}} at {{2}}",
    language: "English",
    lastUpdated: "Dec 13, 2024",
  },
  {
    id: "4",
    name: "Promotional Offer",
    category: "marketing",
    status: "approved",
    content:
      "🎉 Special offer just for you! Get {{1}}% off on your next purchase. Use code: {{2}}",
    language: "English",
    lastUpdated: "Dec 12, 2024",
  },
  {
    id: "5",
    name: "OTP Verification",
    category: "authentication",
    status: "approved",
    content: "Your verification code is {{1}}. Valid for 10 minutes.",
    language: "English",
    lastUpdated: "Dec 10, 2024",
  },
  {
    id: "6",
    name: "Feedback Request",
    category: "marketing",
    status: "rejected",
    content: "Hi {{1}}, we'd love your feedback! Rate your experience with us.",
    language: "English",
    lastUpdated: "Dec 8, 2024",
  },
];

const categories = [
  { id: "all", label: "All Templates" },
  { id: "marketing", label: "Marketing" },
  { id: "utility", label: "Utility" },
  { id: "authentication", label: "Authentication" },
];

export default function TemplatesView() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = mockTemplates.filter((template) => {
    const matchesCategory =
      selectedCategory === "all" || template.category === selectedCategory;
    const matchesSearch = template.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
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
    switch (category) {
      case "marketing":
        return "📢";
      case "utility":
        return "🔧";
      case "authentication":
        return "🔐";
      default:
        return "📝";
    }
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

      {/* Templates Grid */}
      <div className={styles.templatesGrid}>
        {filteredTemplates.map((template) => (
          <div key={template.id} className={styles.templateCard}>
            <div className={styles.templateHeader}>
              <div className={styles.templateCategory}>
                <span className={styles.categoryIcon}>
                  {getCategoryIcon(template.category)}
                </span>
                <span className={styles.categoryName}>{template.category}</span>
              </div>
              <span
                className={`${styles.templateStatus} ${getStatusColor(
                  template.status
                )}`}
              >
                {template.status}
              </span>
            </div>

            <h3 className={styles.templateName}>{template.name}</h3>
            <p className={styles.templateContent}>{template.content}</p>

            <div className={styles.templateMeta}>
              <span className={styles.templateLanguage}>
                🌐 {template.language}
              </span>
              <span className={styles.templateDate}>
                Updated {template.lastUpdated}
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
              <button className={`${styles.templateBtn} ${styles.deleteBtn}`}>
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
    </div>
  );
}
