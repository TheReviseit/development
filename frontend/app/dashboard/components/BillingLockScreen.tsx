"use client";

/**
 * BillingLockScreen — Full-page dashboard suspension wall
 * =========================================================
 * Shown when:
 *   - Free trial expired (trial_expired)
 *   - Subscription is suspended / past_due / halted / cancelled
 *   - Subscription not found (no plan selected)
 *   - Server cannot confirm billing status
 *
 * Architecture:
 *   - Dashboard layout early-returns ONLY this component
 *   - ZERO dashboard content behind it — nothing to bypass via DevTools
 *   - Single CTA → /payment (billing / resubscribe page)
 *
 * CRITICAL: This is the ONLY paywall path for expired trials.
 * TrialExpiredModal is DEPRECATED — it rendered over mounted dashboard
 * content (bypassable via DevTools). This component replaces the entire
 * dashboard via early-return (zero DOM leakage).
 */

import { memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./BillingLockScreen.module.css";

// ─── Billing status → copy map ────────────────────────────────────────────────
export type BillingLockReason =
  | "trial_expired"
  | "suspended"
  | "past_due"
  | "halted"
  | "cancelled"
  | "expired"
  | "no_subscription"
  | "unknown";

interface StatusCopy {
  headline: string;
  subtext: string;
  ctaLabel: string;
  badge: string;
  badgeVariant: "red" | "amber" | "grey";
}

/** Trial metadata returned from billing-status API */
export interface TrialInfo {
  id: string;
  status: string;
  expires_at: string;
  started_at: string;
  plan: string;
}

const STATUS_COPY: Record<BillingLockReason, StatusCopy> = {
  trial_expired: {
    headline: "Your Free Trial Has Ended",
    subtext:
      "Upgrade your plan to continue using all features. Your products, data, and settings are safe and will be fully restored when you subscribe.",
    ctaLabel: "Upgrade Now",
    badge: "Trial Ended",
    badgeVariant: "amber",
  },
  suspended: {
    headline: "Your account has been suspended",
    subtext:
      "Your subscription payment has not been received. Renew now to restore full access to your dashboard and all features.",
    ctaLabel: "Renew Subscription",
    badge: "Suspended",
    badgeVariant: "red",
  },
  past_due: {
    headline: "Your payment is overdue",
    subtext:
      "Your subscription period has ended and payment has not been collected. Update your payment details to continue using Flowauxi.",
    ctaLabel: "Update Payment",
    badge: "Payment Overdue",
    badgeVariant: "amber",
  },
  halted: {
    headline: "Your subscription has been halted",
    subtext:
      "Razorpay has halted your subscription due to repeated payment failures. Please contact support or start a new subscription.",
    ctaLabel: "Restart Subscription",
    badge: "Halted",
    badgeVariant: "red",
  },
  cancelled: {
    headline: "Your subscription is cancelled",
    subtext:
      "Your subscription has been cancelled. Choose a plan to regain access to all your dashboard features and data.",
    ctaLabel: "Choose a Plan",
    badge: "Cancelled",
    badgeVariant: "grey",
  },
  expired: {
    headline: "Your subscription has expired",
    subtext:
      "Your subscription period has ended. Renew to continue sending messages, managing campaigns, and growing your business.",
    ctaLabel: "Renew Now",
    badge: "Expired",
    badgeVariant: "red",
  },
  no_subscription: {
    headline: "No active subscription found",
    subtext:
      "You don't have an active Flowauxi subscription. Pick a plan to unlock all features and start growing with WhatsApp automation.",
    ctaLabel: "Choose a Plan",
    badge: "No Plan",
    badgeVariant: "grey",
  },
  unknown: {
    headline: "Dashboard access restricted",
    subtext:
      "We couldn't verify your subscription status. Please refresh or contact support if this persists.",
    ctaLabel: "Go to Billing",
    badge: "Access Restricted",
    badgeVariant: "grey",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diffDays = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateStr);
  } catch {
    return dateStr;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface BillingLockScreenProps {
  reason: BillingLockReason;
  userEmail?: string;
  trial?: TrialInfo | null;
}

// ─── Component ────────────────────────────────────────────────────────────────
const BillingLockScreen = memo(function BillingLockScreen({
  reason,
  userEmail,
  trial,
}: BillingLockScreenProps) {
  const router = useRouter();
  const copy = STATUS_COPY[reason] ?? STATUS_COPY.unknown;

  // Trial timeline dates (only for trial_expired)
  const trialStarted = useMemo(
    () => (trial?.started_at ? formatDate(trial.started_at) : null),
    [trial?.started_at]
  );
  const trialEnded = useMemo(
    () => (trial?.expires_at ? formatDate(trial.expires_at) : null),
    [trial?.expires_at]
  );
  const trialEndedRelative = useMemo(
    () => (trial?.expires_at ? formatRelativeTime(trial.expires_at) : null),
    [trial?.expires_at]
  );

  const handleCTA = useCallback(() => {
    // Log paywall CTA click for observability
    console.info(`[BillingLock] upgrade_clicked reason=${reason}`);
    router.push(`/payment?reason=${reason}`);
  }, [router, reason]);

  const handleSupport = useCallback(() => {
    console.info(`[BillingLock] support_clicked reason=${reason}`);
    window.open("mailto:support@flowauxi.com", "_blank");
  }, [reason]);

  // Log paywall_shown event on mount
  useMemo(() => {
    console.info(
      `[BillingLock] paywall_shown reason=${reason} trial_id=${trial?.id ?? "none"}`
    );
  }, [reason, trial?.id]);

  // ─── Icons ─────────────────────────────────────────────────────────────────

  const ShieldIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4"
      />
    </svg>
  );

  const LockIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );

  const ArrowIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );

  const MailIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline strokeLinecap="round" strokeLinejoin="round" points="22,6 12,13 2,6" />
    </svg>
  );

  const CalendarIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  const ClockIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );

  return (
    <div className={styles.lockOverlay}>
      {/* Ambient background rings */}
      <div className={styles.ambientRing1} />
      <div className={styles.ambientRing2} />

      <div className={styles.lockCard}>
        {/* Top shimmer line */}
        <div className={styles.cardShimmer} />

        <div className={styles.cardBody}>
          {/* Icon + Lock Badge */}
          <div className={styles.iconWrapper}>
            <div className={styles.iconInner}>{ShieldIcon}</div>
            <span className={styles.lockBadge}>{LockIcon}</span>
          </div>

          {/* Status Badge */}
          <div className={`${styles.statusBadge} ${styles[`badge_${copy.badgeVariant}`]}`}>
            <span className={styles.statusDot} />
            {copy.badge}
          </div>

          {/* Headline */}
          <h1 className={styles.headline}>{copy.headline}</h1>

          {/* Subtext */}
          <p className={styles.subtext}>{copy.subtext}</p>

          {/* Trial Timeline — only shown for trial_expired with trial data */}
          {reason === "trial_expired" && trial && (
            <div className={styles.trialTimeline}>
              <div className={styles.trialTimelineItem}>
                <span className={styles.trialTimelineIcon}>{CalendarIcon}</span>
                <div className={styles.trialTimelineContent}>
                  <span className={styles.trialTimelineLabel}>Trial started</span>
                  <span className={styles.trialTimelineValue}>{trialStarted}</span>
                </div>
              </div>
              <div className={styles.trialTimelineDivider} />
              <div className={styles.trialTimelineItem}>
                <span className={styles.trialTimelineIcon}>{ClockIcon}</span>
                <div className={styles.trialTimelineContent}>
                  <span className={styles.trialTimelineLabel}>Trial ended</span>
                  <span className={styles.trialTimelineValue}>
                    {trialEnded}
                    {trialEndedRelative && (
                      <span className={styles.trialTimelineRelative}>
                        {" "}({trialEndedRelative})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className={styles.divider} />

          {/* What's affected */}
          <div className={styles.lockedFeatures}>
            <p className={styles.lockedLabel}>
              {reason === "trial_expired"
                ? "What happens now:"
                : "Features locked until renewal:"}
            </p>
            {reason === "trial_expired" ? (
              <div className={styles.trialInfoList}>
                <div className={styles.trialInfoItem}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.trialInfoIconGreen}>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Your products and data are <strong>safe</strong> and retained</span>
                </div>
                <div className={styles.trialInfoItem}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.trialInfoIconGreen}>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>You can <strong>upgrade anytime</strong> to restore access</span>
                </div>
                <div className={styles.trialInfoItem}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className={styles.trialInfoIconRed}>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>Dashboard access is <strong>restricted</strong> until upgrade</span>
                </div>
              </div>
            ) : (
              <div className={styles.lockedGrid}>
                {["Messages", "Campaigns", "Templates", "Analytics", "AI Bot", "Store"].map((f) => (
                  <div key={f} className={styles.lockedChip}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.chipLock}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Primary CTA */}
          <button
            id="billing-lock-cta"
            className={styles.ctaButton}
            onClick={handleCTA}
          >
            {copy.ctaLabel}
            {ArrowIcon}
          </button>

          {/* Secondary: Contact support */}
          <button className={styles.supportLink} onClick={handleSupport}>
            <span className={styles.supportIcon}>{MailIcon}</span>
            Contact support
          </button>
        </div>

        {/* Footer */}
        <div className={styles.cardFooter}>
          <p className={styles.footerText}>
            Signed in as{" "}
            <span className={styles.footerEmail}>{userEmail || "your account"}</span>
            {" "}· Flowauxi Billing
          </p>
        </div>
      </div>
    </div>
  );
});

export default BillingLockScreen;
