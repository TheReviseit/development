"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/auth/AuthProvider";
import {
  createBulkCampaign,
  fetchBulkCampaigns,
  BulkCampaign,
} from "@/lib/api/whatsapp";
import styles from "./bulk-messages.module.css";

const CAMPAIGNS_KEY = "bulkMessageCampaigns";

interface LocalCampaign {
  id: string;
  name: string;
  createdAt: string;
  contactCount: number;
  status: "draft" | "sent" | "scheduled";
  contacts?: any[];
}

export default function BulkMessagesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [campaignName, setCampaignName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<BulkCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // Fetch recent campaigns
  useEffect(() => {
    async function loadCampaigns() {
      if (!user?.id) {
        setLoadingCampaigns(false);
        return;
      }

      try {
        const campaigns = await fetchBulkCampaigns(user.id);
        // Show only last 5 campaigns
        setRecentCampaigns((campaigns || []).slice(0, 5));
      } catch (err) {
        console.error("Error fetching campaigns:", err);
      } finally {
        setLoadingCampaigns(false);
      }
    }

    loadCampaigns();
  }, [user?.id]);

  // Create new campaign via API and navigate to data step
  const handleCreateCampaign = async () => {
    if (!campaignName.trim()) return;
    if (!user?.id) {
      setError("Please log in to create a campaign");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Call backend API to create campaign in database
      const campaign = await createBulkCampaign(user.id, campaignName.trim());
      const campaignId = campaign.id;

      // Also save to localStorage as cache
      const localCampaign: LocalCampaign = {
        id: campaignId,
        name: campaignName.trim(),
        createdAt: new Date().toISOString(),
        contactCount: 0,
        status: "draft",
        contacts: [],
      };

      try {
        const saved = localStorage.getItem(CAMPAIGNS_KEY);
        const campaigns: LocalCampaign[] = saved ? JSON.parse(saved) : [];
        campaigns.push(localCampaign);
        localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
      } catch (err) {
        console.error("Error saving to localStorage:", err);
      }

      // Navigate to data step
      router.push(`/dashboard/bulk-messages/${campaignId}/data`);
    } catch (err: any) {
      console.error("Error creating campaign:", err);
      setError(err.message || "Failed to create campaign. Please try again.");
      setIsCreating(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "sent":
        return styles.statusSent;
      case "sending":
        return styles.statusSending;
      case "scheduled":
        return styles.statusScheduled;
      default:
        return styles.statusDraft;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className={styles.bulkMessagesContainer}>
      <div className={styles.bulkMessagesHeader}>
        <div>
          <h1 className={styles.pageTitle}>Bulk Messages</h1>
          <p className={styles.pageDescription}>
            Create and send bulk WhatsApp messages to your contacts
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.errorState}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Create Campaign Card */}
      <div className={styles.createCampaignCard}>
        <h2 className={styles.createTitle}>New Campaign</h2>
        <p className={styles.createSubtitle}>
          Enter a name for your bulk message campaign
        </p>
        <div className={styles.createForm}>
          <input
            type="text"
            className={styles.campaignInput}
            placeholder="e.g., New Year Promotion, Customer Update..."
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateCampaign()}
            autoFocus
          />
          <div className={styles.createFormActions}>
            <button
              className={styles.createBtn}
              onClick={handleCreateCampaign}
              disabled={!campaignName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create & Continue →"}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Campaigns Section */}
      <div className={styles.recentCampaignsSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Recent Campaigns</h3>
          <Link href="/dashboard/campaigns" className={styles.viewAllLink}>
            View All →
          </Link>
        </div>

        {loadingCampaigns ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
          </div>
        ) : recentCampaigns.length > 0 ? (
          <div className={styles.recentCampaignsList}>
            {recentCampaigns.map((campaign) => (
              <div key={campaign.id} className={styles.recentCampaignCard}>
                <div className={styles.recentCampaignInfo}>
                  <span className={styles.recentCampaignName}>
                    {campaign.name}
                  </span>
                  <span className={styles.recentCampaignMeta}>
                    {campaign.total_contacts} contacts •{" "}
                    {formatDate(campaign.created_at)}
                  </span>
                </div>
                <span
                  className={`${styles.recentCampaignStatus} ${getStatusStyle(
                    campaign.status
                  )}`}
                >
                  {campaign.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.noCampaigns}>
            No campaigns yet. Create your first one above!
          </div>
        )}
      </div>
    </div>
  );
}
