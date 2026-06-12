"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertToast } from "@/components/ui/alert-toast";
import styles from "./categories.module.css";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load categories on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/products/categories");
        if (response.ok) {
          const result = await response.json();
          if (result.categories) {
            setCategories(
              result.categories.map((c: { name: string }) => c.name),
            );
          }
        }
      } catch (error) {
        console.error("Error loading categories:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Add category - uses new normalized API
  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    if (categories.includes(newCategory.trim())) {
      setMessage({ type: "error", text: "Category already exists" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/products/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategory.trim() }),
      });

      if (response.ok) {
        setCategories([...categories, newCategory.trim()]);
        setNewCategory("");
        setMessage({ type: "success", text: "Category added!" });
      } else {
        const error = await response.json();
        setMessage({
          type: "error",
          text: error.error || "Failed to add category",
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to add category" });
    } finally {
      setSaving(false);
    }
  };

  // Delete category - uses new normalized API
  const handleDeleteCategory = async (categoryToDelete: string) => {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/products/categories?name=${encodeURIComponent(categoryToDelete)}`,
        { method: "DELETE" },
      );

      if (response.ok) {
        setCategories(categories.filter((cat) => cat !== categoryToDelete));
        setMessage({ type: "success", text: "Category deleted!" });
      } else {
        setMessage({ type: "error", text: "Failed to delete category" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to delete category" });
    } finally {
      setSaving(false);
    }
  };

  // Auto-dismiss message
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading categories...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <h1 className={`${styles.title} ${styles.desktopOnlyTitle}`}>Manage Categories</h1>
          <p className={`${styles.subtitle} ${styles.desktopOnlyTitle}`}>Organize your products into categories.</p>
        </div>
      </div>

      {/* Add Category Section */}
      <div className={styles.addCard}>
        <div className={styles.addSectionWrapper}>
          <div className={styles.addInputGroup}>
            <h2 className={styles.sectionSubtitle}>Add New Category</h2>
            <div className={styles.inputWithIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className={styles.inputIcon}>
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <input
                type="text"
                className={styles.sleekInput}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Type your category and press Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCategory();
                }}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <div className={styles.divider}></div>

        <h2 className={styles.sectionSubtitle}>Existing Categories</h2>

        {categories.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
                <path d="M4 10h16" />
                <path d="M10 10v10" />
              </svg>
            </div>
            <h3>No categories</h3>
            <p>Create a category to better organize your store's items.</p>
          </div>
        ) : (
          <div className={styles.twoColumnGrid}>
            {categories.map((category) => (
              <div key={category} className={styles.sleekListItem}>
                <div className={styles.listItemContent}>
                  <span className={styles.categoryName}>{category}</span>
                </div>
                <button
                  onClick={() => handleDeleteCategory(category)}
                  className={styles.deleteIconBtn}
                  aria-label="Delete category"
                >
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
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {message && (
        <div style={{ position: "fixed", top: "24px", right: "24px", zIndex: 9999 }}>
          <AlertToast 
            variant={message.type === "error" ? "error" : "success"}
            title={message.type === "error" ? "Error" : "Success"}
            description={message.text}
            onClose={() => setMessage(null)}
          />
        </div>
      )}
    </div>
  );
}
