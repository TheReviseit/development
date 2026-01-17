"use client";

import React, { useState, useRef, useCallback } from "react";
import styles from "./ProductImageUpload.module.css";
import ImageModal from "./ImageModal";

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
  quality = 0.8,
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
        quality,
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset local preview when imageUrl or productId changes
  // This ensures we always show the correct image from props
  React.useEffect(() => {
    setLocalPreviewUrl(null);
    setShowDeleteConfirm(false);
  }, [productId, imageUrl]);

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
          },
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
    [productId, onUpload],
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
    [handleUpload],
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
        <img
          src={displayUrl}
          alt="Product"
          className={styles.imagePreview}
          onClick={() => setIsModalOpen(true)}
          style={{ cursor: "zoom-in" }}
          title="Click to enlarge"
        />

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

        <ImageModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          imageUrl={displayUrl}
        />
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
          <span className={styles.uploadIcon}>
            <svg
              fill="currentColor"
              height="40px"
              width="40px"
              viewBox="0 0 486.3 486.3"
            >
              <g>
                <g>
                  <path
                    d="M395.5,135.8c-5.2-30.9-20.5-59.1-43.9-80.5c-26-23.8-59.8-36.9-95-36.9c-27.2,0-53.7,7.8-76.4,22.5
			c-18.9,12.2-34.6,28.7-45.7,48.1c-4.8-0.9-9.8-1.4-14.8-1.4c-42.5,0-77.1,34.6-77.1,77.1c0,5.5,0.6,10.8,1.6,16
			C16.7,200.7,0,232.9,0,267.2c0,27.7,10.3,54.6,29.1,75.9c19.3,21.8,44.8,34.7,72,36.2c0.3,0,0.5,0,0.8,0h86
			c7.5,0,13.5-6,13.5-13.5s-6-13.5-13.5-13.5h-85.6C61.4,349.8,27,310.9,27,267.1c0-28.3,15.2-54.7,39.7-69
			c5.7-3.3,8.1-10.2,5.9-16.4c-2-5.4-3-11.1-3-17.2c0-27.6,22.5-50.1,50.1-50.1c5.9,0,11.7,1,17.1,3c6.6,2.4,13.9-0.6,16.9-6.9
			c18.7-39.7,59.1-65.3,103-65.3c59,0,107.7,44.2,113.3,102.8c0.6,6.1,5.2,11,11.2,12c44.5,7.6,78.1,48.7,78.1,95.6
			c0,49.7-39.1,92.9-87.3,96.6h-73.7c-7.5,0-13.5,6-13.5,13.5s6,13.5,13.5,13.5h74.2c0.3,0,0.6,0,1,0c30.5-2.2,59-16.2,80.2-39.6
			c21.1-23.2,32.6-53,32.6-84C486.2,199.5,447.9,149.6,395.5,135.8z"
                  />
                  <path
                    d="M324.2,280c5.3-5.3,5.3-13.8,0-19.1l-71.5-71.5c-2.5-2.5-6-4-9.5-4s-7,1.4-9.5,4l-71.5,71.5c-5.3,5.3-5.3,13.8,0,19.1
			c2.6,2.6,6.1,4,9.5,4s6.9-1.3,9.5-4l48.5-48.5v222.9c0,7.5,6,13.5,13.5,13.5s13.5-6,13.5-13.5V231.5l48.5,48.5
			C310.4,285.3,318.9,285.3,324.2,280z"
                  />
                </g>
              </g>
            </svg>
          </span>
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
