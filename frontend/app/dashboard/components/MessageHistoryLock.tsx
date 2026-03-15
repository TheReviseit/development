"use client";

/**
 * MessageHistoryLock — Premium Lock Banner
 * ==========================================
 *
 * Appears between locked (blurred) and unlocked (visible) messages
 * when the user's plan has a message_history_days limit.
 *
 * Uses FeatureGateEngine data from /api/features/check endpoint.
 *
 * Plan limits:
 *   Starter  → 10 days
 *   Business → 50 days
 *   Pro      → Unlimited
 */

import { memo } from "react";
import msgStyles from "./MessagesView.module.css";

interface MessageHistoryLockProps {
  historyDays: number;
  planName?: string;
}

const MessageHistoryLock = memo(function MessageHistoryLock({
  historyDays,
  planName = "your plan",
}: MessageHistoryLockProps) {
  return (
    <div className={msgStyles.historyLockBanner}>
      <div className={msgStyles.historyLockContent}>
        {/* Lock Icon */}
        <div className={msgStyles.historyLockIcon}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* Text */}
        <div className={msgStyles.historyLockText}>
          <span className={msgStyles.historyLockTitle}>
            Message history locked
          </span>
          <span className={msgStyles.historyLockSubtitle}>
            {planName} includes {historyDays} days of history. Upgrade for more.
          </span>
        </div>

        {/* CTA */}
        <a href="/upgrade" className={msgStyles.historyLockCta}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          Upgrade
        </a>
      </div>
    </div>
  );
});

export default MessageHistoryLock;
