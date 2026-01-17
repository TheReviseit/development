"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../add/add-product.module.css";

// Predefined size options
const PREDEFINED_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "Free Size",
];

// Predefined color options
const PREDEFINED_COLORS = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#EF4444" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Green", hex: "#22C55A" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Purple", hex: "#A855F7" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Orange", hex: "#F97316" },
  { name: "Gray", hex: "#6B7280" },
  { name: "Brown", hex: "#92400E" },
  { name: "Navy", hex: "#1E3A8A" },
];

interface ColorOption {
  name: string;
  hex: string;
}

export default function OptionsPage() {
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [newSize, setNewSize] = useState("");
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#3B82F6");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load options on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setSizes(result.data.sizeOptions || PREDEFINED_SIZES);
            setColors(result.data.colorOptions || PREDEFINED_COLORS);
          }
        }
      } catch (error) {
        console.error("Error loading options:", error);
        setSizes(PREDEFINED_SIZES);
        setColors(PREDEFINED_COLORS);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Save options
  const saveOptions = async (
    updatedSizes: string[],
    updatedColors: ColorOption[],
  ) => {
    setSaving(true);
    try {
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizeOptions: updatedSizes,
          colorOptions: updatedColors,
        }),
      });

      if (response.ok) {
        setSizes(updatedSizes);
        setColors(updatedColors);
        setMessage({ type: "success", text: "Options saved!" });
      } else {
        setMessage({ type: "error", text: "Failed to save options" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save options" });
    } finally {
      setSaving(false);
    }
  };

  // Add size
  const handleAddSize = () => {
    if (!newSize.trim()) return;
    if (sizes.includes(newSize.trim().toUpperCase())) {
      setMessage({ type: "error", text: "Size already exists" });
      return;
    }
    saveOptions([...sizes, newSize.trim().toUpperCase()], colors);
    setNewSize("");
  };

  // Delete size
  const handleDeleteSize = (sizeToDelete: string) => {
    saveOptions(
      sizes.filter((s) => s !== sizeToDelete),
      colors,
    );
  };

  // Add color
  const handleAddColor = () => {
    if (!newColorName.trim()) return;
    if (
      colors.some(
        (c) => c.name.toLowerCase() === newColorName.trim().toLowerCase(),
      )
    ) {
      setMessage({ type: "error", text: "Color already exists" });
      return;
    }
    saveOptions(sizes, [
      ...colors,
      { name: newColorName.trim(), hex: newColorHex },
    ]);
    setNewColorName("");
    setNewColorHex("#3B82F6");
  };

  // Delete color
  const handleDeleteColor = (colorName: string) => {
    saveOptions(
      sizes,
      colors.filter((c) => c.name !== colorName),
    );
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
          <h1 className={styles.pageTitle}>Manage Sizes and Colors</h1>
        </div>
      </div>

      {/* Sizes Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Size Options</h2>

        {/* Add Size */}
        <div className={styles.fieldsRow} style={{ marginBottom: "20px" }}>
          <div className={styles.field} style={{ flex: 1 }}>
            <input
              type="text"
              className={styles.input}
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              placeholder="Enter custom size (e.g., 2XS, 4XL)"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSize();
              }}
            />
          </div>
          <button
            type="button"
            className={styles.scheduleBtn}
            onClick={handleAddSize}
            disabled={saving || !newSize.trim()}
            style={{ height: "auto", padding: "12px 24px" }}
          >
            Add Size
          </button>
        </div>

        {/* Size List */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {sizes.map((size) => (
            <div
              key={size}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                color: "#fff",
              }}
            >
              {size}
              <button
                onClick={() => handleDeleteSize(size)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "18px",
                  height: "18px",
                  background: "transparent",
                  border: "none",
                  borderRadius: "50%",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.4)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#ef4444";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                }}
              >
                <svg
                  width="10"
                  height="10"
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
      </div>

      {/* Colors Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Color Options</h2>

        {/* Add Color */}
        <div className={styles.fieldsRow} style={{ marginBottom: "20px" }}>
          <div className={styles.field} style={{ flex: 1 }}>
            <input
              type="text"
              className={styles.input}
              value={newColorName}
              onChange={(e) => setNewColorName(e.target.value)}
              placeholder="Color name (e.g., Sky Blue, Coral)"
            />
          </div>
          <div className={styles.field} style={{ width: "100px" }}>
            <input
              type="color"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              style={{
                width: "100%",
                height: "48px",
                padding: "4px",
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                cursor: "pointer",
              }}
            />
          </div>
          <button
            type="button"
            className={styles.scheduleBtn}
            onClick={handleAddColor}
            disabled={saving || !newColorName.trim()}
            style={{ height: "auto", padding: "12px 24px" }}
          >
            Add Color
          </button>
        </div>

        {/* Color List */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {colors.map((color) => (
            <div
              key={color.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                fontSize: "14px",
                color: "#fff",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  background: color.hex,
                  border: "2px solid rgba(255,255,255,0.2)",
                }}
              />
              <span>{color.name}</span>
              <button
                onClick={() => handleDeleteColor(color.name)}
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
                  color: "rgba(255,255,255,0.4)",
                  transition: "all 0.2s ease",
                  marginLeft: "4px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#ef4444";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                }}
              >
                <svg
                  width="10"
                  height="10"
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
