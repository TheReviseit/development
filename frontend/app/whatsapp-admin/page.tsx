"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import styles from "./whatsapp-admin.module.css";

export default function WhatsAppAdmin() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "";
    message: string;
  }>({ type: "", message: "" });
  const [backendStatus, setBackendStatus] = useState<{
    online: boolean;
    configured: boolean;
  }>({ online: false, configured: false });
  const router = useRouter();

  // Check authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Check backend status
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const healthResponse = await fetch("/api/whatsapp/health");
        const statusResponse = await fetch("/api/whatsapp/status");

        if (healthResponse.ok && statusResponse.ok) {
          const statusData = await statusResponse.json();
          setBackendStatus({
            online: true,
            configured: statusData.configured,
          });
        } else {
          setBackendStatus({ online: false, configured: false });
        }
      } catch (error) {
        setBackendStatus({ online: false, configured: false });
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification({ type: "", message: "" });
    }, 5000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber || !message) {
      showNotification("error", "Please fill in all fields");
      return;
    }

    if (!backendStatus.online) {
      showNotification(
        "error",
        "Backend is offline. Please start the Flask server."
      );
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phoneNumber.replace(/\s+/g, ""),
          message: message,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showNotification(
          "success",
          `Message sent successfully! ID: ${data.message_id}`
        );
        setMessage(""); // Clear message field
      } else {
        showNotification("error", data.error || "Failed to send message");
      }
    } catch (error) {
      showNotification(
        "error",
        "Network error. Make sure the backend is running."
      );
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <button
            onClick={() => router.push("/dashboard")}
            className={styles.backButton}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 12H5M12 19l-7-7 7-7"
              />
            </svg>
            Back to Dashboard
          </button>
          <h1 className={styles.title}>WhatsApp Admin</h1>
          <div className={styles.statusBadge}>
            <span
              className={`${styles.statusDot} ${
                backendStatus.online ? styles.online : styles.offline
              }`}
            ></span>
            {backendStatus.online ? (
              backendStatus.configured ? (
                <span>Connected</span>
              ) : (
                <span>Not Configured</span>
              )
            ) : (
              <span>Backend Offline</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Notification */}
        {notification.type && (
          <div
            className={`${styles.notification} ${styles[notification.type]}`}
          >
            <div className={styles.notificationIcon}>
              {notification.type === "success" ? "✓" : "✕"}
            </div>
            <p>{notification.message}</p>
          </div>
        )}

        {/* Backend Status Warning */}
        {!backendStatus.online && (
          <div className={styles.warningCard}>
            <div className={styles.warningIcon}>⚠️</div>
            <div className={styles.warningContent}>
              <h3>Backend Server Not Running</h3>
              <p>Please start the Flask backend server:</p>
              <code className={styles.codeBlock}>
                cd backend
                <br />
                python app.py
              </code>
            </div>
          </div>
        )}

        {backendStatus.online && !backendStatus.configured && (
          <div className={styles.warningCard}>
            <div className={styles.warningIcon}>⚙️</div>
            <div className={styles.warningContent}>
              <h3>WhatsApp API Not Configured</h3>
              <p>
                Please add your WhatsApp Cloud API credentials to the backend
                .env file
              </p>
            </div>
          </div>
        )}

        {/* Send Message Form */}
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <div className={styles.formIcon}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <div>
              <h2>Send Test Message</h2>
              <p className={styles.formSubtitle}>
                Send a WhatsApp message via Cloud API
              </p>
            </div>
          </div>

          <form onSubmit={handleSendMessage} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="phoneNumber" className={styles.label}>
                Recipient Phone Number
                <span className={styles.required}>*</span>
              </label>
              <input
                type="tel"
                id="phoneNumber"
                className={styles.input}
                placeholder="919876543210 (include country code, no + sign)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={sending}
                required
              />
              <small className={styles.hint}>
                Format: Country code + number (e.g., 919876543210 for India)
              </small>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="message" className={styles.label}>
                Message
                <span className={styles.required}>*</span>
              </label>
              <textarea
                id="message"
                className={styles.textarea}
                placeholder="Enter your message here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                disabled={sending}
                required
              />
              <small className={styles.hint}>{message.length} characters</small>
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={sending || !backendStatus.online}
            >
              {sending ? (
                <>
                  <span className={styles.spinner}></span>
                  Sending...
                </>
              ) : (
                <>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  Send Message
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info Cards */}
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>📱</div>
            <h3>Phone Number Format</h3>
            <p>Include country code without + sign, spaces, or dashes</p>
            <code>Example: 919876543210</code>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>🔐</div>
            <h3>Test Numbers Only</h3>
            <p>
              You can only send to verified test numbers in your WhatsApp
              Business account
            </p>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>⚡</div>
            <h3>Quick Setup</h3>
            <p>
              Get credentials from Meta for Developers and add them to
              backend/.env
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
