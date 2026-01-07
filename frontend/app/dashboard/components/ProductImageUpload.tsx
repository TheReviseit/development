"use client";

import React, { useState, useRef, useCallback } from "react";
import styles from "./ProductImageUpload.module.css";

interface UploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  original_size?: number;
}

interface ProductImageUploadProps {
  productId: string;
  imageUrl: string;
  imagePublicId?: string;
  onUpload: (result: UploadResult) => void;
  onDelete: () => void;
}

/**
 * Client-side image compression utility.
 * Compresses images to max 1200px and ~80% quality before upload.
 */
async function compressImage(
  file: File,
  maxSize = 1200,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      let { width, height } = img;

      // Scale down if larger than maxSize
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
        quality
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

export default function ProductImageUpload({
  productId,
  imageUrl,
  imagePublicId,
  onUpload,
  onDelete,
}: ProductImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      // Max 5MB original file
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be less than 5MB");
        return;
      }

      setIsUploading(true);
      setError(null);
      setUploadProgress(10);

      try {
        const originalSize = file.size;

        // Compress image client-side
        setUploadProgress(20);
        const compressedBlob = await compressImage(file);
        setUploadProgress(40);

        // Get signature from API (userId from session)
        const signatureRes = await fetch("/api/upload-product-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });

        if (!signatureRes.ok) {
          const errText = await signatureRes.text();
          console.error("Signature API error:", errText);
          throw new Error("Failed to get upload signature");
        }

        const { timestamp, signature, folder, cloudName, apiKey } =
          await signatureRes.json();

        setUploadProgress(50);

        // Upload to Cloudinary with only signed params
        const formData = new FormData();
        formData.append("file", compressedBlob, file.name);
        formData.append("timestamp", timestamp.toString());
        formData.append("signature", signature);
        formData.append("folder", folder);
        formData.append("api_key", apiKey);

        const uploadRes = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        setUploadProgress(90);

        const result = await uploadRes.json();

        if (!uploadRes.ok) {
          console.error("Cloudinary upload error:", result);
          throw new Error(result.error?.message || "Upload failed");
        }

        // Use the direct Cloudinary URL (already optimized by their CDN)
        const imageUrl = result.secure_url;

        setUploadProgress(100);

        // Set local preview immediately with direct URL
        setLocalPreviewUrl(imageUrl);

        console.log("Upload success:", imageUrl);

        onUpload({
          secure_url: imageUrl,
          public_id: result.public_id,
          bytes: result.bytes,
          original_size: originalSize,
        });
      } catch (err) {
        console.error("Upload error:", err);
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [productId, onUpload]
  );

  const handleCancel = () => {
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false);

    if (imagePublicId) {
      try {
        await fetch("/api/upload-product-image", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId: imagePublicId }),
        });
      } catch (err) {
        console.error("Delete error:", err);
      }
    }

    setLocalPreviewUrl(null);
    onDelete();
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  // Display image from local preview or prop
  const displayUrl = localPreviewUrl || imageUrl;

  // If image exists, show preview with delete confirmation
  if (displayUrl && !isUploading) {
    return (
      <div className={styles.imagePreviewContainer}>
        <img src={displayUrl} alt="Product" className={styles.imagePreview} />

        {showDeleteConfirm ? (
          <div className={styles.deleteConfirm}>
            <span>Delete image?</span>
            <div className={styles.deleteConfirmButtons}>
              <button
                type="button"
                className={styles.confirmYes}
                onClick={handleDeleteConfirm}
              >
                Yes
              </button>
              <button
                type="button"
                className={styles.confirmNo}
                onClick={handleDeleteCancel}
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleDeleteClick}
            title="Remove image"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${styles.uploadZone} ${isDragging ? styles.dragging : ""} ${
        isUploading ? styles.uploading : ""
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
      />

      {isUploading ? (
        <div className={styles.uploadingState}>
          <div className={styles.spinner} />
          <span>Uploading... {uploadProgress}%</span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={(e) => {
              e.stopPropagation();
              handleCancel();
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.uploadPrompt}>
          <span className={styles.uploadIcon}>📷</span>
          <span>Drop image here or click to upload</span>
          <span className={styles.hint}>
            Max 5MB • Auto-optimized for fast delivery
          </span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
