"use client";

import React, { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import styles from "../../booking.module.css";
import appointmentStyles from "./appointment.module.css";

// ============================================================
// Types
// ============================================================
interface AppointmentPageProps {
  params: Promise<{ bookingSlug: string; appointmentId: string }>;
}

interface AppointmentData {
  id: string;
  booking_id: string;
  status: string;
  service: string;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  notes?: string;
  store: {
    name: string;
    address?: string;
    phone?: string;
  };
}

// ============================================================
// Main Component
// ============================================================
export default function AppointmentPage({ params }: AppointmentPageProps) {
  const resolvedParams = React.use(params);
  const { bookingSlug, appointmentId } = resolvedParams;

  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Get shareable booking URL
  const bookingUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/booking/${bookingSlug}`
      : `/booking/${bookingSlug}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  useEffect(() => {
    const fetchAppointment = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/booking/${bookingSlug}/appointment/${appointmentId}`,
        );
        const result = await response.json();

        if (!response.ok || !result.success) {
          if (response.status === 404) {
            setError("not_found");
          } else {
            setError(result.error || "Failed to load appointment");
          }
          return;
        }

        setAppointment(result.data);
      } catch (err) {
        console.error("[AppointmentPage] Error:", err);
        setError("Failed to load appointment");
      } finally {
        setLoading(false);
      }
    };

    fetchAppointment();
  }, [bookingSlug, appointmentId]);

  if (error === "not_found") {
    notFound();
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
          <p>Loading appointment...</p>
        </div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <p>Unable to load appointment details.</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const startDate = new Date(appointment.starts_at);
  const endDate = new Date(appointment.ends_at);

  const statusColors: Record<string, string> = {
    confirmed: "#10b981",
    pending: "#f59e0b",
    cancelled: "#ef4444",
    completed: "#6b7280",
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerInfo}>
            <h1 className={styles.businessName}>{appointment.store.name}</h1>
            <p className={styles.tagline}>Appointment Details</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Status Badge */}
        <div className={appointmentStyles.statusSection}>
          <span
            className={appointmentStyles.statusBadge}
            style={{
              backgroundColor: statusColors[appointment.status] || "#6b7280",
            }}
          >
            {appointment.status.charAt(0).toUpperCase() +
              appointment.status.slice(1)}
          </span>
          <span className={appointmentStyles.bookingId}>
            #{appointment.booking_id}
          </span>
        </div>

        {/* Appointment Card */}
        <div className={appointmentStyles.card}>
          <div className={appointmentStyles.dateSection}>
            <div className={appointmentStyles.dateBox}>
              <span className={appointmentStyles.dayName}>
                {startDate.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className={appointmentStyles.dayNumber}>
                {startDate.getDate()}
              </span>
              <span className={appointmentStyles.monthName}>
                {startDate.toLocaleDateString("en-US", { month: "short" })}
              </span>
            </div>
            <div className={appointmentStyles.timeInfo}>
              <span className={appointmentStyles.time}>
                {startDate.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
              <span className={appointmentStyles.duration}>
                {Math.round((endDate.getTime() - startDate.getTime()) / 60000)}{" "}
                min
              </span>
            </div>
          </div>

          <div className={appointmentStyles.details}>
            <div className={appointmentStyles.detailRow}>
              <span className={appointmentStyles.label}>Service</span>
              <span className={appointmentStyles.value}>
                {appointment.service}
              </span>
            </div>
            <div className={appointmentStyles.detailRow}>
              <span className={appointmentStyles.label}>Customer</span>
              <span className={appointmentStyles.value}>
                {appointment.customer_name}
              </span>
            </div>
            {appointment.notes && (
              <div className={appointmentStyles.detailRow}>
                <span className={appointmentStyles.label}>Notes</span>
                <span className={appointmentStyles.value}>
                  {appointment.notes}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={appointmentStyles.actions}>
          <a
            href={`/api/booking/calendar/${appointment.id}.ics`}
            className={appointmentStyles.actionButton}
            download
          >
            📅 Add to Calendar
          </a>

          {appointment.status === "confirmed" && (
            <>
              <a
                href={`/booking/${bookingSlug}/reschedule/${appointmentId}`}
                className={appointmentStyles.actionButtonSecondary}
              >
                🔄 Reschedule
              </a>
              <button
                className={appointmentStyles.actionButtonDanger}
                onClick={() => {
                  if (
                    confirm("Are you sure you want to cancel this appointment?")
                  ) {
                    // Cancel logic here
                  }
                }}
              >
                ✕ Cancel
              </button>
            </>
          )}
        </div>

        {/* Shareable Booking URL */}
        <div className={appointmentStyles.shareSection}>
          <h3 className={appointmentStyles.shareTitle}>
            📤 Share Booking Page
          </h3>
          <p className={appointmentStyles.shareSubtitle}>
            Let others book appointments with {appointment.store.name}
          </p>
          <div className={appointmentStyles.urlBox}>
            <input
              type="text"
              readOnly
              value={bookingUrl}
              className={appointmentStyles.urlInput}
            />
            <button
              onClick={handleCopyUrl}
              className={appointmentStyles.copyButton}
            >
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          <div className={appointmentStyles.shareButtons}>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Book an appointment: ${bookingUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={appointmentStyles.shareButtonWhatsapp}
            >
              WhatsApp
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Book with ${appointment.store.name}`)}&body=${encodeURIComponent(`Book an appointment here: ${bookingUrl}`)}`}
              className={appointmentStyles.shareButtonEmail}
            >
              Email
            </a>
          </div>
        </div>

        {/* Back Link */}
        <a
          href={`/booking/${bookingSlug}`}
          className={appointmentStyles.backLink}
        >
          ← Book Another Appointment
        </a>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Powered by Flowauxi</p>
      </footer>
    </div>
  );
}
