"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Toast from "@/app/components/Toast/Toast";
import styles from "./banners.module.css";

interface Banner {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  imageUrl: string;
  imagePublicId: string;
  gradientFrom: string;
  gradientTo: string;
}

const emptyBanner: Banner = {
  id: "",
  title: "",
  subtitle: "",
  description: "",
  buttonText: "Shop Now",
  buttonLink: "#",
  imageUrl: "",
  imagePublicId: "",
  gradientFrom: "#22c15a",
  gradientTo: "#2dd4ff",
};

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [formData, setFormData] = useState<Banner>(emptyBanner);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load banners
  useEffect(() => {
    const loadBanners = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data?.banners) {
            setBanners(result.data.banners);
          }
        }
      } catch (error) {
        console.error("Error loading banners:", error);
      } finally {
        setLoading(false);
      }
    };
    loadBanners();
  }, []);

  // Save banners to backend
  const saveBanners = async (updatedBanners: Banner[]) => {
    setSaving(true);
    try {
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banners: updatedBanners }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Banners saved successfully!" });
      } else {
        setMessage({ type: "error", text: "Failed to save banners" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save banners" });
    } finally {
      setSaving(false);
    }
  };

  // Compress image
  const compressImage = useCallback(
    async (file: File, maxSize = 1200, quality = 0.85): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        img.onload = () => {
          let { width, height } = img;

          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Failed to compress image"));
              }
            },
            "image/jpeg",
            quality,
          );
        };

        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = URL.createObjectURL(file);
      });
    },
    [],
  );

  // Upload image
  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please select an image file" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image must be less than 5MB" });
      return;
    }

    setUploading(true);
    try {
      const compressedBlob = await compressImage(file);

      const signatureRes = await fetch("/api/upload-product-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "banner" }),
      });

      if (!signatureRes.ok) {
        throw new Error("Failed to get upload signature");
      }

      const { timestamp, signature, folder, cloudName, apiKey } =
        await signatureRes.json();

      const formDataUpload = new FormData();
      formDataUpload.append("file", compressedBlob, file.name);
      formDataUpload.append("timestamp", timestamp.toString());
      formDataUpload.append("signature", signature);
      formDataUpload.append("folder", folder);
      formDataUpload.append("api_key", apiKey);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formDataUpload,
        },
      );

      const result = await uploadRes.json();

      if (!uploadRes.ok) {
        throw new Error(result.error?.message || "Upload failed");
      }

      setFormData({
        ...formData,
        imageUrl: result.secure_url,
        imagePublicId: result.public_id,
      });
    } catch (error) {
      console.error("Upload error:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  };

  // Handle file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImage(file);
  };

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file);
  };

  // Open form for new banner
  const openAddForm = () => {
    setEditingBanner(null);
    setFormData({ ...emptyBanner, id: Date.now().toString() });
    setIsFormOpen(true);
  };

  // Open form for edit
  const openEditForm = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({ ...banner });
    setIsFormOpen(true);
  };

  // Close form
  const closeForm = () => {
    setIsFormOpen(false);
    setEditingBanner(null);
    setFormData(emptyBanner);
  };

  // Save form
  const handleSave = async () => {
    if (!formData.title.trim()) {
      setMessage({ type: "error", text: "Please enter a title" });
      return;
    }

    let updatedBanners: Banner[];
    if (editingBanner) {
      updatedBanners = banners.map((b) =>
        b.id === formData.id ? formData : b,
      );
    } else {
      updatedBanners = [...banners, formData];
    }

    setBanners(updatedBanners);
    closeForm();
    await saveBanners(updatedBanners);
  };

  // Delete banner
  const deleteBanner = async (id: string) => {
    const updatedBanners = banners.filter((b) => b.id !== id);
    setBanners(updatedBanners);
    await saveBanners(updatedBanners);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading banners...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Store Banners</h1>
        <p className={styles.subtitle}>
          Create carousel banners to showcase promotions on your store page
        </p>
      </div>

      {/* Toast */}
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
          duration={3000}
        />
      )}

      {/* Banners Grid */}
      <div className={styles.bannersGrid}>
        {/* Add Banner Card */}
        <div className={styles.addBannerCard} onClick={openAddForm}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          <span>Add Banner</span>
        </div>

        {/* Existing Banners */}
        {banners.map((banner) => (
          <div key={banner.id} className={styles.bannerCard}>
            <div
              className={styles.bannerPreview}
              style={
                {
                  "--gradient-from": banner.gradientFrom,
                  "--gradient-to": banner.gradientTo,
                } as React.CSSProperties
              }
            >
              {banner.imageUrl && (
                <img
                  src={banner.imageUrl}
                  alt={banner.title}
                  className={styles.bannerImage}
                />
              )}
              <div className={styles.bannerOverlay}>
                <h3 className={styles.bannerTitle}>{banner.title}</h3>
                {banner.subtitle && (
                  <p className={styles.bannerSubtitle}>{banner.subtitle}</p>
                )}
              </div>
            </div>
            <div className={styles.bannerActions}>
              <button
                className={styles.editBtn}
                onClick={() => openEditForm(banner)}
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
                className={styles.deleteBtn}
                onClick={() => deleteBanner(banner.id)}
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
                Delete
              </button>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {banners.length === 0 && (
          <div className={styles.emptyState}>
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <h3>No banners yet</h3>
            <p>Add banners to display on your store carousel</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className={styles.formOverlay} onClick={closeForm}>
          <div
            className={styles.formPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.formHeader}>
              <h2 className={styles.formTitle}>
                {editingBanner ? "Edit Banner" : "Add Banner"}
              </h2>
              <button className={styles.closeBtn} onClick={closeForm}>
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

            {/* Image Upload */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Banner Image</label>
              <div
                className={`${styles.imageUpload} ${isDragging ? styles.dragging : ""} ${uploading ? styles.uploading : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {uploading ? (
                  <>
                    <div className={styles.spinner} />
                    <span className={styles.uploadText}>Uploading...</span>
                  </>
                ) : formData.imageUrl ? (
                  <img
                    src={formData.imageUrl}
                    alt="Banner"
                    className={styles.uploadedImage}
                  />
                ) : (
                  <>
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className={styles.uploadText}>
                      Drop image or click to upload
                    </span>
                    <span className={styles.uploadHint}>
                      Recommended: 1200x600px
                    </span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className={styles.hiddenInput}
                />
              </div>
            </div>

            {/* Title */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Title *</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., Summer Sale"
              />
            </div>

            {/* Subtitle */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Subtitle</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.subtitle}
                onChange={(e) =>
                  setFormData({ ...formData, subtitle: e.target.value })
                }
                placeholder="e.g., Up to 50% Off"
              />
            </div>

            {/* Description */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                className={`${styles.formInput} ${styles.formTextarea}`}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Short description for the banner"
              />
            </div>

            {/* Button Text */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Button Text</label>
              <input
                type="text"
                className={styles.formInput}
                value={formData.buttonText}
                onChange={(e) =>
                  setFormData({ ...formData, buttonText: e.target.value })
                }
                placeholder="e.g., Shop Now"
              />
            </div>

            {/* Gradient Colors */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Background Gradient</label>
              <div className={styles.gradientRow}>
                <div className={styles.colorPickerWrapper}>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={formData.gradientFrom}
                    onChange={(e) =>
                      setFormData({ ...formData, gradientFrom: e.target.value })
                    }
                  />
                  <span className={styles.colorValue}>
                    {formData.gradientFrom}
                  </span>
                </div>
                <div className={styles.colorPickerWrapper}>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={formData.gradientTo}
                    onChange={(e) =>
                      setFormData({ ...formData, gradientTo: e.target.value })
                    }
                  />
                  <span className={styles.colorValue}>
                    {formData.gradientTo}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={closeForm}>
                Cancel
              </button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Banner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
