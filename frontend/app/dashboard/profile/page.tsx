"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import Toast from "@/app/components/Toast/Toast";
import PaymentSettings from "./PaymentSettings";
import InvoiceSettings from "./InvoiceSettings";
import styles from "./profile.module.css";

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

export default function ProfilePage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>({
    businessName: "",
    logoUrl: "",
    logoPublicId: "",
  });
  const [activeTab, setActiveTab] = useState<"profile" | "payment" | "invoice">(
    "profile",
  );
  const [paymentData, setPaymentData] = useState({
    razorpayKeyId: "",
    razorpayKeySecret: "",
    paymentsEnabled: false,
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

  // ✅ Slug management state
  const [originalBusinessName, setOriginalBusinessName] = useState("");
  const [urlSlug, setUrlSlug] = useState("");
  const [showSlugWarning, setShowSlugWarning] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [suggestedSlug, setSuggestedSlug] = useState("");

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setProfile({
              businessName: result.data.businessName || "",
              logoUrl: result.data.logoUrl || "",
              logoPublicId: result.data.logoPublicId || "",
            });
            setPaymentData({
              razorpayKeyId: result.data.razorpayKeyId || "",
              razorpayKeySecret: result.data.razorpayKeySecret || "",
              paymentsEnabled: result.data.paymentsEnabled || false,
            });
            // ✅ Store original business name and slug for comparison
            setOriginalBusinessName(result.data.businessName || "");
            setUrlSlug(result.data.urlSlug || "");
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      loadProfile();
    }
  }, [authLoading]);

  // ✅ Generate URL-safe slug from business name
  const generateSlug = useCallback((name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);
  }, []);

  // ✅ Debounced slug availability check
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

  // ✅ Trigger availability check when business name changes
  useEffect(() => {
    if (profile.businessName && profile.businessName !== originalBusinessName) {
      // Debounce the check
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

  // ✅ Save profile with optional slug update consent
  const saveProfile = async (allowSlugUpdate: boolean) => {
    setSaving(true);
    try {
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          allow_slug_update: allowSlugUpdate, // ✅ Explicit consent flag
        }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Profile saved successfully!" });
        // Update original name after successful save
        setOriginalBusinessName(profile.businessName);
      } else {
        setMessage({ type: "error", text: "Failed to save profile" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  // ✅ Handle save - check if slug will change
  const handleSave = async () => {
    // Check if business name changed
    if (profile.businessName !== originalBusinessName) {
      setShowSlugWarning(true);
      return; // Wait for user confirmation
    }
    await saveProfile(false); // No slug update
  };

  // ✅ Confirm slug change
  const confirmSlugChange = async () => {
    setShowSlugWarning(false);
    await saveProfile(true); // ✅ EXPLICIT: User confirmed slug update
  };

  // Compress image client-side
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

  // Upload file handler
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
      // Compress image
      const compressedBlob = await compressImage(file);

      // Get signature from API
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

      // Upload to Cloudinary
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

      // Update profile with new logo
      const updatedProfile = {
        ...profile,
        logoUrl: result.secure_url,
        logoPublicId: result.public_id,
      };
      setProfile(updatedProfile);

      // Auto-save
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

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  // Drag and drop handlers
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

  // Handle logo delete
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

  // Toast component handles auto-dismiss internally

  if (loading || authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading profile...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Store Settings</h1>
        <p className={styles.subtitle}>
          Manage your store profile and payment settings
        </p>
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tab} ${activeTab === "profile" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Store Profile
        </button>
        <button
          className={`${styles.tab} ${activeTab === "payment" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("payment")}
        >
          Payment Gateway
        </button>
        <button
          className={`${styles.tab} ${activeTab === "invoice" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("invoice")}
        >
          Invoice
        </button>
      </div>

      {/* Toast Notification */}
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
          duration={3000}
        />
      )}

      {/* Profile Tab Content */}
      {activeTab === "profile" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Shop Logo & Name</h2>
            <p className={styles.cardDescription}>
              Your store logo will appear on your public store page
            </p>
          </div>

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

              {/* ✅ Live Slug Preview */}
              {profile.businessName && (
                <div className={styles.slugPreview}>
                  <span className={styles.slugIcon}>🔗</span>
                  <span className={styles.slugLabel}>Your store URL: </span>
                  <code className={styles.slugUrl}>
                    {typeof window !== "undefined" &&
                      `${window.location.origin}/store/${generateSlug(profile.businessName) || "your-store-name"}`}
                  </code>

                  {/* Availability indicator */}
                  {profile.businessName !== originalBusinessName && (
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

          <div className={styles.cardFooter}>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Payment Gateway Tab Content */}
      {activeTab === "payment" && (
        <PaymentSettings
          initialData={paymentData}
          showToast={(text, type) => setMessage({ text, type })}
        />
      )}

      {/* Invoice Tab Content */}
      {activeTab === "invoice" && (
        <InvoiceSettings
          showToast={(text, type) => setMessage({ text, type })}
        />
      )}

      {/* ✅ URL Change Warning Modal */}
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
    </div>
  );
}
