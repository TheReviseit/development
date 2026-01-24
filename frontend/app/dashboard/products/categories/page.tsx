"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../add/add-product.module.css";

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
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <Link href="/dashboard/products" className={styles.backLink}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to products
          </Link>
          <h1 className={styles.pageTitle}>Manage Categories</h1>
        </div>
      </div>

      {/* Add Category Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Add New Category</h2>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className={styles.field} style={{ flex: 1, marginBottom: 0 }}>
            <input
              type="text"
              className={styles.input}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Enter category name (e.g., Electronics, Clothing)"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory();
              }}
            />
          </div>
          <button
            type="button"
            className={styles.addProductBtn}
            onClick={handleAddCategory}
            disabled={saving || !newCategory.trim()}
            style={{
              height: "auto",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#000000"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Category
          </button>
        </div>
      </div>

      {/* Existing Categories */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Existing Categories ({categories.length})
        </h2>

        {categories.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
            No categories yet. Add your first category above.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            {categories.map((category) => (
              <div
                key={category}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 16px",
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "24px",
                  fontSize: "14px",
                  color: "#ffffff",
                }}
              >
                {category}
                <button
                  onClick={() => handleDeleteCategory(category)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "20px",
                    height: "20px",
                    background: "transparent",
                    border: "none",
                    borderRadius: "50%",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.5)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#ef4444";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "rgba(255,255,255,0.5)";
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
        <div
          className={`${styles.toast} ${
            message.type === "success" ? styles.toastSuccess : styles.toastError
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
