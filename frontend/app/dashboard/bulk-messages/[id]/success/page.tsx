"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import styles from "../../bulk-messages.module.css";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
}

const CAMPAIGNS_KEY = "bulkMessageCampaigns";

export default function SuccessPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);

  // Load campaign data from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CAMPAIGNS_KEY);
      if (saved) {
        const campaigns = JSON.parse(saved);
        const found = campaigns.find((c: Campaign) => c.id === campaignId);
        if (found) {
          setCampaign(found);
        }
      }
    } catch (err) {
      console.error("Error loading campaign:", err);
    }
  }, [campaignId]);

  return (
    <div className={styles.bulkMessagesContainer}>
      <div className={styles.successPage}>
        {/* Success Icon */}
        <div className={styles.successIcon}>
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        {/* Success Message */}
        <h1 className={styles.successTitle}>Campaign Sent Successfully! 🎉</h1>
        <p className={styles.successSubtitle}>
          Your bulk message campaign has been sent.
        </p>

        {/* Campaign Summary */}
        {campaign && (
          <div className={styles.successSummary}>
            <h3>{campaign.name}</h3>
            <div className={styles.successStats}>
              <div className={styles.successStat}>
                <span className={styles.successStatValue}>
                  {campaign.sent_count || campaign.total_contacts || 0}
                </span>
                <span className={styles.successStatLabel}>Messages Sent</span>
              </div>
              {campaign.failed_count > 0 && (
                <div className={styles.successStat}>
                  <span
                    className={`${styles.successStatValue} ${styles.failedStat}`}
                  >
                    {campaign.failed_count}
                  </span>
                  <span className={styles.successStatLabel}>Failed</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.successActions}>
          <Link
            href="/dashboard/bulk-messages"
            className={styles.successBtnPrimary}
          >
            Create Another Campaign
          </Link>
          <Link
            href="/dashboard/campaigns"
            className={styles.successBtnSecondary}
          >
            View All Campaigns
          </Link>
        </div>
      </div>
    </div>
  );
}
