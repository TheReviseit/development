"use client";

import { useRouter } from "next/navigation";
import styles from "./ContactDetailPanel.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  email: string;
  tags: string[];
  lifecycle_stage: string;
  lead_score: number;
  source: string;
  status: string;
  interaction_count: number;
  last_interaction_at: string;
  updated_at: string;
}

interface ContactDetailPanelProps {
  contact: Contact | null;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Never";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#eab308";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ContactDetailPanel({
  contact,
  onClose,
}: ContactDetailPanelProps) {
  const router = useRouter();

  if (!contact) return null;

  const score = contact.lead_score || 0;
  const scorePct = Math.min(100, Math.max(0, score));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Contact Details</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Hero */}
        <div className={styles.hero}>
          <div className={styles.avatar}>{getInitials(contact.name)}</div>
          <h3 className={styles.heroName}>
            {contact.name || "Unknown Contact"}
          </h3>
          <p className={styles.heroPhone}>{contact.phone_number}</p>
          <div className={styles.heroActions}>
            <button
              className={styles.heroBtn}
              onClick={() =>
                router.push(
                  `/dashboard/messages?phone=${contact.phone_number}`,
                )
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Message
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Basic Info */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Contact Information</h4>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Email</span>
                <span
                  className={
                    contact.email ? styles.infoValue : styles.infoValueMuted
                  }
                >
                  {contact.email || "Not provided"}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Source</span>
                <span
                  className={
                    contact.source ? styles.infoValue : styles.infoValueMuted
                  }
                >
                  {contact.source || "Unknown"}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Status</span>
                <span className={styles.infoValue}>
                  {contact.status || "active"}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Interactions</span>
                <span className={styles.infoValue}>
                  {contact.interaction_count || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Lifecycle */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Lifecycle Stage</h4>
            <span className={styles.lifecycleBadge}>
              {contact.lifecycle_stage || "lead"}
            </span>
          </div>

          {/* Lead Score */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Lead Score</h4>
            <div className={styles.scoreBar}>
              <div className={styles.scoreTrack}>
                <div
                  className={styles.scoreFill}
                  style={{
                    width: `${scorePct}%`,
                    background: getScoreColor(score),
                  }}
                />
              </div>
              <span className={styles.scoreValue}>{score}</span>
            </div>
          </div>

          {/* Tags */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Tags</h4>
            {(contact.tags || []).length > 0 ? (
              <div className={styles.tagList}>
                {contact.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <span className={styles.noTags}>No tags assigned</span>
            )}
          </div>

          {/* Activity */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Activity</h4>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Last Interaction</span>
                <span className={styles.infoValue}>
                  {formatDate(contact.last_interaction_at)}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Last Updated</span>
                <span className={styles.infoValue}>
                  {formatDate(contact.updated_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
