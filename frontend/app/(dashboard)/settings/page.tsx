"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import Toast from "@/app/components/Toast/Toast";
import styles from "./profile.module.css";
import sharedStyles from "./settings.module.css";
import { useRouter } from "next/navigation";

interface BusinessProfile {
  businessName: string;
  logoUrl: string;
  logoPublicId: string;
}

interface SlugCheckResponse {
  available: boolean;
  suggested: string;
  checked: string;
}

export default function StoreProfileSettings() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>({
    businessName: "",
    logoUrl: "",
    logoPublicId: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slug management state
  const [originalBusinessName, setOriginalBusinessName] = useState("");
  const [urlSlug, setUrlSlug] = useState("");
  const [showSlugWarning, setShowSlugWarning] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [suggestedSlug, setSuggestedSlug] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  // Feature gate: custom_domain (slug editing)
  const [canEditSlug, setCanEditSlug] = useState<boolean | null>(null);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [profileRes, slugFeatureRes] = await Promise.all([
          fetch("/api/business/get"),
          fetch("/api/features/check?feature=custom_domain"),
        ]);

        if (profileRes.ok) {
          const result = await profileRes.json();
          if (result.data) {
            setProfile({
              businessName: result.data.businessName || "",
              logoUrl: result.data.logoUrl || "",
              logoPublicId: result.data.logoPublicId || "",
            });
            setOriginalBusinessName(result.data.businessName || "");
            setUrlSlug(result.data.urlSlug || "");
          }
        }

        if (slugFeatureRes.ok) {
          const data = await slugFeatureRes.json();
          setCanEditSlug(data.allowed === true);
        } else {
          setCanEditSlug(false);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        setCanEditSlug(false);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      loadAll();
    }
  }, [authLoading]);

  const generateSlug = useCallback((name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);
  }, []);

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/store/${urlSlug || generateSlug(profile.businessName) || "your-store-name"}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  const checkSlugDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const checkSlugAvailability = useCallback(
    async (businessName: string) => {
      if (!businessName) {
        setSlugAvailable(null);
        return;
      }

      const slug = generateSlug(businessName);

      try {
        const response = await fetch(
          `/api/business/check-slug?slug=${encodeURIComponent(slug)}`,
        );
        const data: SlugCheckResponse = await response.json();

        setSlugAvailable(data.available);
        if (!data.available) {
          setSuggestedSlug(data.suggested);
        }
      } catch (error) {
        console.error("Error checking slug:", error);
        setSlugAvailable(null);
      }
    },
    [generateSlug],
  );

  useEffect(() => {
    if (profile.businessName && profile.businessName !== originalBusinessName) {
      if (checkSlugDebounceRef.current) {
        clearTimeout(checkSlugDebounceRef.current);
      }
      checkSlugDebounceRef.current = setTimeout(() => {
        checkSlugAvailability(profile.businessName);
      }, 500);
    } else {
      setSlugAvailable(null);
    }
  }, [profile.businessName, originalBusinessName, checkSlugAvailability]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Profile saved successfully!" });
        setOriginalBusinessName(profile.businessName);
        setShowSlugWarning(false);
        try {
          const refreshRes = await fetch("/api/business/get");
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.data?.urlSlug) {
              setUrlSlug(refreshData.data.urlSlug);
            }
          }
        } catch { }
      } else {
        const data = await response.json().catch(() => ({}));
        if (response.status === 403 && data.error === "FEATURE_GATED") {
          setMessage({
            type: "error",
            text: "Custom store URL requires Business or Pro plan. Upgrade to change your URL.",
          });
        } else if (response.status === 409 && data.error === "SLUG_TAKEN") {
          setMessage({
            type: "error",
            text: data.message || "This store URL is already taken.",
          });
        } else {
          setMessage({ type: "error", text: "Failed to save profile" });
        }
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (
      canEditSlug &&
      profile.businessName !== originalBusinessName &&
      originalBusinessName !== ""
    ) {
      setShowSlugWarning(true);
      return;
    }
    await saveProfile();
  };

  const confirmSlugChange = async () => {
    setShowSlugWarning(false);
    await saveProfile();
  };

  const compressImage = useCallback(
    async (file: File, maxSize = 400, quality = 0.85): Promise<Blob> => {
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

  const uploadFile = async (file: File) => {
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
        body: JSON.stringify({ productId: "logo" }),
      });

      if (!signatureRes.ok) {
        throw new Error("Failed to get upload signature");
      }

      const { timestamp, signature, folder, cloudName, apiKey } =
        await signatureRes.json();

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

      const result = await uploadRes.json();

      if (!uploadRes.ok) {
        throw new Error(result.error?.message || "Upload failed");
      }

      const updatedProfile = {
        ...profile,
        logoUrl: result.secure_url,
        logoPublicId: result.public_id,
      };
      setProfile(updatedProfile);

      await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile),
      });

      setMessage({ type: "success", text: "Logo uploaded successfully!" });
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleLogoDelete = async () => {
    if (!profile.logoPublicId) return;

    try {
      await fetch("/api/upload-product-image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: profile.logoPublicId }),
      });

      const updatedProfile = {
        ...profile,
        logoUrl: "",
        logoPublicId: "",
      };
      setProfile(updatedProfile);

      await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile),
      });

      setMessage({ type: "success", text: "Logo removed" });
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  if (loading || authLoading) {
    return (
      <div className={styles.loading}>Loading profile...</div>
    );
  }

  return (
    <>
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
          duration={3000}
        />
      )}

      <div className={sharedStyles.card}>
        <div className={sharedStyles.cardHeader}>
          <h2 className={sharedStyles.cardTitle}>Store Profile</h2>
          <p className={sharedStyles.cardDescription}>
            Your store logo and business name will appear on your public store page
          </p>
        </div>

        <div className={sharedStyles.cardBody}>
          <div className={styles.profileSection}>
            {/* Logo Upload with Drag & Drop */}
            <div
              className={`${styles.logoUpload} ${isDragging ? styles.dragging : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {uploading ? (
                <div className={styles.uploadingState}>
                  <div className={styles.spinner} />
                  <span>Uploading...</span>
                </div>
              ) : profile.logoUrl ? (
                <img
                  src={profile.logoUrl}
                  alt="Store Logo"
                  className={styles.logoPreview}
                />
              ) : (
                <div className={styles.logoPlaceholder}>
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Drop image here or click</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className={styles.hiddenInput}
              />
            </div>

            {profile.logoUrl && (
              <button
                className={styles.removeLogoBtn}
                onClick={handleLogoDelete}
                type="button"
              >
                Remove Logo
              </button>
            )}

            {/* Business Name */}
            <div className={styles.nameSection}>
              <label className={styles.label}>Business Name</label>
              <input
                type="text"
                className={styles.input}
                value={profile.businessName}
                onChange={(e) =>
                  setProfile({ ...profile, businessName: e.target.value })
                }
                placeholder="Your store name"
              />

              {profile.businessName && (
                <div className={styles.slugPreview}>
                  <span className={styles.slugLabel}>Your store URL: </span>
                  <code className={styles.slugUrl}>
                    {typeof window !== "undefined" &&
                      `${window.location.origin}/store/${urlSlug || generateSlug(profile.businessName) || "your-store-name"}`}
                  </code>

                  <button
                    onClick={handleCopyUrl}
                    className={`${styles.copyButton} ${copySuccess ? styles.copyButtonSuccess : ""}`}
                    type="button"
                  >
                    {copySuccess ? (
                      <>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>

                  {canEditSlug &&
                    profile.businessName !== originalBusinessName && (
                      <span className={styles.slugStatus}>
                        {slugAvailable === null && (
                          <span className={styles.checking}>Checking...</span>
                        )}
                        {slugAvailable === true && (
                          <span className={styles.available}>✅ Available</span>
                        )}
                        {slugAvailable === false && (
                          <span className={styles.taken}>
                            ⚠️ Taken - will use {suggestedSlug}
                          </span>
                        )}
                      </span>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={sharedStyles.cardFooter}>
          <button
            className={sharedStyles.primaryButton}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {showSlugWarning && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>⚠️ Public URL Will Change</h3>
            </div>

            <div className={styles.modalContent}>
              <p>Changing your store name will update your public URLs:</p>

              <div className={styles.urlComparison}>
                <div className={styles.urlRow}>
                  <span className={styles.urlLabel}>Old:</span>
                  <code className={styles.oldUrl}>
                    /store/{generateSlug(originalBusinessName)}
                  </code>
                </div>
                <div className={styles.arrow}>→</div>
                <div className={styles.urlRow}>
                  <span className={styles.urlLabel}>New:</span>
                  <code className={styles.newUrl}>
                    /store/{generateSlug(profile.businessName)}
                  </code>
                </div>
              </div>

              <p className={styles.warningText}>
                <strong>This may break existing links.</strong> Old URLs will
                redirect automatically, but please update any:
              </p>
              <ul className={styles.impactList}>
                <li>Marketing materials</li>
                <li>Social media bios</li>
                <li>QR codes</li>
                <li>Email signatures</li>
              </ul>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowSlugWarning(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.confirmBtn}
                onClick={confirmSlugChange}
                type="button"
              >
                Confirm URL Change
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
