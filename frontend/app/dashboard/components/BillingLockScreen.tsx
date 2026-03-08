"use client";

/**
 * BillingLockScreen — Full-page dashboard suspension wall
 * =========================================================
 * Shown when:
 *   - Subscription is suspended / past_due / halted / cancelled
 *   - Subscription not found (no plan selected)
 *   - Server cannot confirm billing status
 *
 * Architecture (same as SubscriptionGateOverlay):
 *   - Dashboard layout early-returns ONLY this component
 *   - ZERO dashboard content behind it — nothing to bypass via DevTools
 *   - Single CTA → /payment (billing / resubscribe page)
 */

import { memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./BillingLockScreen.module.css";

// ─── Billing status → copy map ────────────────────────────────────────────────
export type BillingLockReason =
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

const STATUS_COPY: Record<BillingLockReason, StatusCopy> = {
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface BillingLockScreenProps {
  reason: BillingLockReason;
  userEmail?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
const BillingLockScreen = memo(function BillingLockScreen({
  reason,
  userEmail,
}: BillingLockScreenProps) {
  const router = useRouter();
  const copy = STATUS_COPY[reason] ?? STATUS_COPY.unknown;

  const handleCTA = useCallback(() => {
    router.push(`/payment?reason=${reason}`);
  }, [router, reason]);

  const handleSupport = useCallback(() => {
    window.open("mailto:support@flowauxi.com", "_blank");
  }, []);

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

          {/* Divider */}
          <div className={styles.divider} />

          {/* What's locked */}
          <div className={styles.lockedFeatures}>
            <p className={styles.lockedLabel}>Features locked until renewal:</p>
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
