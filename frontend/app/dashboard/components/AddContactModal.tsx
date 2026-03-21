"use client";

import { useState } from "react";
import { auth } from "@/src/firebase/firebase";
import styles from "./AddContactModal.module.css";

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddContactModal({
  isOpen,
  onClose,
  onSuccess,
}: AddContactModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tagsStr, setTagsStr] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setErrorText("Phone number is required.");
      return;
    }

    setIsLoading(true);
    setErrorText("");

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be logged in to add a contact.");
      }

      const tagsArray = tagsStr
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const payload = {
        name: name.trim(),
        phone_number: phone.trim(),
        email: email.trim(),
        tags: tagsArray,
      };

      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": user.uid,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add contact.");
      }

      // Reset form
      setName("");
      setPhone("");
      setEmail("");
      setTagsStr("");

      // Notify parent to refetch
      onSuccess();
    } catch (err: any) {
      console.error("Error adding contact:", err);
      setErrorText(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Add New Contact</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            {errorText && <div className={styles.errorText}>{errorText}</div>}

            <div className={styles.inputGroup}>
              <label className={styles.label}>Name</label>
              <input
                type="text"
                className={styles.inputField}
                placeholder="e.g. Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>
                Phone Number <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className={styles.inputField}
                placeholder="e.g. 919876543210 (include country code)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Email Address</label>
              <input
                type="email"
                className={styles.inputField}
                placeholder="e.g. jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Tags (comma-separated)</label>
              <input
                type="text"
                className={styles.inputField}
                placeholder="e.g. vip, lead, new"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isLoading || !phone.trim()}
            >
              {isLoading ? <div className={styles.spinner} /> : "Save Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
