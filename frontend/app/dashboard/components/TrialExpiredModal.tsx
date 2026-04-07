"use client";

/**
 * TrialExpiredModal — Production-Grade Trial Expiry Notice
 * =========================================================
 * 
 * FAANG-LEVEL QUALITY: This modal handles the critical moment when a user's
 * free trial has ended. It provides clear, non-ambiguous messaging about:
 * - What happened (trial ended)
 * - When it happened (start date and end date)
 * - What they need to do (upgrade to continue)
 * 
 * Architecture:
 * - Full-screen modal, no dashboard content behind it
 * - Cannot be dismissed without upgrading or logging out
 * - Shows trial details for transparency
 * - Single CTA to upgrade page
 * 
 * Design principles (Stripe-grade):
 * - Clarity over cleverness
 * - No ambiguity about what action is needed
 * - Professional, trustworthy appearance
 * - Accessible contrast ratios
 */

import { memo, useCallback, useEffect, useMemo } from "react";
import styles from "./TrialExpiredModal.module.css";

interface TrialDetails {
  startedAt: string;
  expiresAt: string;
  planSlug: string;
}

interface TrialExpiredModalProps {
  trialDetails: TrialDetails;
  userEmail?: string;
  onUpgrade?: () => void;
  onLogout?: () => void;
}

/**
 * Format a date string into human-readable format
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a date into relative time (e.g., "5 days ago")
 */
function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateStr);
  } catch {
    return dateStr;
  }
}

/**
 * Calculate days between two dates
 */
function daysBetween(startStr: string, endStr: string): number {
  try {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 7;
  }
}

const TrialExpiredModal = memo(function TrialExpiredModal({
  trialDetails,
  userEmail,
  onUpgrade,
  onLogout,
}: TrialExpiredModalProps) {
  const { startedAt, expiresAt, planSlug } = trialDetails;

  // Format dates for display
  const formattedStartedAt = useMemo(() => formatDate(startedAt), [startedAt]);
  const formattedExpiresAt = useMemo(() => formatDate(expiresAt), [expiresAt]);
  const relativeExpiry = useMemo(() => formatRelativeTime(expiresAt), [expiresAt]);
  const trialDuration = useMemo(
    () => daysBetween(startedAt, expiresAt),
    [startedAt, expiresAt]
  );

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, []);

  // Handle upgrade button click
  const handleUpgrade = useCallback(() => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Default: redirect to pricing page
      if (typeof window !== "undefined") {
        window.location.href = "/onboarding-embedded?domain=shop&step=pricing&trial_expired=true";
      }
    }
  }, [onUpgrade]);

  // Handle logout button click
  const handleLogout = useCallback(() => {
    if (onLogout) {
      onLogout();
    } else {
      // Default: clear session and redirect to login
      if (typeof window !== "undefined") {
        document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.href = "/login?reason=trial_expired";
      }
    }
  }, [onLogout]);

  // Calendar icon
  const CalendarIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  // Clock icon
  const ClockIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );

  // Alert triangle icon
  const AlertIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  // Arrow right icon
  const ArrowIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );

  // Logout icon
  const LogoutIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        {/* Warning Banner */}
        <div className={styles.warningBanner}>
          <span className={styles.warningIcon}>{AlertIcon}</span>
          <span className={styles.warningText}>Your free trial has ended</span>
        </div>

        {/* Content */}
        <div className={styles.modalContent}>
          {/* Plan Badge */}
          <div className={styles.planBadge}>
            <span className={styles.planIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
              </svg>
            </span>
            <span className={styles.planName}>{planSlug || "Starter"} Plan</span>
          </div>

          {/* Main Message */}
          <h1 className={styles.title}>
            Time&apos;s up on your free trial
          </h1>
          <p className={styles.subtitle}>
            Your {trialDuration}-day free trial has ended. Upgrade now to continue
            accessing all features and keep your data.
          </p>

          {/* Trial Timeline */}
          <div className={styles.timeline}>
            <div className={styles.timelineItem}>
              <span className={styles.timelineIcon}>{CalendarIcon}</span>
              <div className={styles.timelineContent}>
                <span className={styles.timelineLabel}>Trial started</span>
                <span className={styles.timelineValue}>{formattedStartedAt}</span>
              </div>
            </div>
            <div className={styles.timelineDivider} />
            <div className={styles.timelineItem}>
              <span className={styles.timelineIcon}>{ClockIcon}</span>
              <div className={styles.timelineContent}>
                <span className={styles.timelineLabel}>Trial ended</span>
                <span className={styles.timelineValue}>
                  {formattedExpiresAt}
                  <span className={styles.timelineRelative}>({relativeExpiry})</span>
                </span>
              </div>
            </div>
          </div>

          {/* What You Lose Section */}
          <div className={styles.whatYouLose}>
            <h3 className={styles.whatYouLoseTitle}>What happens now?</h3>
            <ul className={styles.whatYouLoseList}>
              <li>
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Your products and data are <strong>safe</strong> and retained</span>
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>You can <strong>upgrade anytime</strong> to restore access</span>
              </li>
              <li className={styles.negative}>
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>Access to create new products is <strong>restricted</strong></span>
              </li>
            </ul>
          </div>
        </div>

        {/* CTA Section */}
        <div className={styles.ctaSection}>
          <button
            className={styles.ctaButton}
            onClick={handleUpgrade}
            id="trial-expired-upgrade-button"
          >
            Upgrade to Continue
            {ArrowIcon}
          </button>
          <p className={styles.ctaSubtext}>
            Choose from Starter, Business, or Pro plans
          </p>
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <div className={styles.footerContent}>
            <span className={styles.footerEmail}>
              {userEmail || "your email"}
            </span>
            <span className={styles.footerDivider}>·</span>
            <button className={styles.logoutButton} onClick={handleLogout}>
              {LogoutIcon}
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Background overlay (clicking does nothing - must take action) */}
      <div className={styles.overlayClickBlocker} />
    </div>
  );
});

export default TrialExpiredModal;
