"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User, updateProfile } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
// import { getSignature } from "@/lib/cloudinary";
import styles from "./settings.module.css";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setDisplayName(currentUser.displayName || "");
        setLoading(false);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  /*
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    if (!file.type.startsWith("image/")) {
      setMessage({
        type: "error",
        text: "Please upload an image file (JPG, PNG, WebP)",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      setMessage({ type: "error", text: "File size should be less than 5MB" });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      // Get signature from server
      const { timestamp, signature } = await getSignature();

      // Upload to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "api_key",
        process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || "962159667733394"
      );
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", "reviseit/profile-pictures");
      // Use upload preset if configured, or relying on signed upload params
      // formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      );

      const data = await response.json();

      if (data.secure_url) {
        // Update user profile in Firebase
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, {
            photoURL: data.secure_url,
          });
          setUser({ ...auth.currentUser }); // Force re-render
          setMessage({
            type: "success",
            text: "Profile picture updated successfully!",
          });
        }
      } else {
        throw new Error(data.error?.message || "Upload failed");
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setMessage({
        type: "error",
        text: err.message || "Failed to upload image",
      });
    } finally {
      setUploading(false);
    }
  };
  */

  const handleSaveProfile = async () => {
    if (!auth.currentUser) return;

    setSaving(true);
    setMessage(null);

    try {
      await updateProfile(auth.currentUser, {
        displayName: displayName,
      });
      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch (err: any) {
      console.error("Update error:", err);
      setMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className={styles.settingsContainer}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div className={styles.settingsContainer}>
      {/* Header */}
      <header className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          ←
        </button>
        <h1 className={styles.headerTitle}>Settings</h1>
      </header>

      <main className={styles.mainContent}>
        <h2 className={styles.pageTitle}>Account Settings</h2>

        {message && (
          <div
            className={
              message.type === "success"
                ? styles.successMessage
                : styles.errorMessage
            }
          >
            {message.text}
          </div>
        )}

        <div className={styles.settingsCard}>
          <h3 className={styles.sectionTitle}>Profile Information</h3>

          {/* Profile Picture Upload */}
          <div className={styles.profileSection}>
            <div className={styles.avatarWrapper}>
              {/* Force initials even if photoURL exists, per user request to "use simple one" */}
              <div
                className={styles.avatarPlaceholder}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#007bff",
                  color: "white",
                  fontSize: "2rem",
                  width: "100%",
                  height: "100%",
                }}
              >
                {(() => {
                  const nameToUse = displayName || user?.email || "";
                  return nameToUse.substring(0, 2).toUpperCase();
                })()}
              </div>

              {/* Cloudinary upload commented out
              <label htmlFor="file-upload" className={styles.uploadOverlay}>
                {uploading ? (
                  <span style={{ fontSize: "10px", color: "#fff" }}>...</span>
                ) : (
                  <svg
                    className={styles.uploadIcon}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </label>
              <input
                id="file-upload"
                type="file"
                className={styles.fileInput}
                accept="image/*"
                onChange={handleFileChange}
                disabled={uploading}
                ref={fileInputRef}
              />
              */}
            </div>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
              {/* Click camera icon to change photo */}
            </p>
          </div>

          {/* Form Fields */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Display Name</label>
            <input
              type="text"
              className={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email Address</label>
            <input
              type="email"
              className={styles.input}
              value={user?.email || ""}
              disabled
            />
            <p
              style={{
                fontSize: "0.75rem",
                opacity: 0.5,
                marginTop: "0.25rem",
              }}
            >
              Email cannot be changed
            </p>
          </div>

          <div className={styles.buttonGroup}>
            <button
              className={styles.saveButton}
              onClick={handleSaveProfile}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              className={styles.cancelButton}
              onClick={() => router.back()}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Account Info Card */}
        <div className={styles.settingsCard}>
          <h3 className={styles.sectionTitle}>Subscription Plan</h3>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h4 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>
                Free Plan
              </h4>
              <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>Basic features</p>
            </div>
            <button
              className={styles.cancelButton}
              style={{ fontSize: "0.9rem", padding: "0.5rem 1rem" }}
              onClick={() => router.push("/#pricing")}
            >
              Upgrade
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
