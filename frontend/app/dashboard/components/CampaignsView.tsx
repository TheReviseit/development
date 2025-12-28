"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "../dashboard.module.css";
import { fetchBulkCampaigns, BulkCampaign } from "@/lib/api/whatsapp";
import { useAuth } from "@/app/components/auth/AuthProvider";

const statusFilters = [
  { id: "all", label: "All Campaigns" },
  { id: "sending", label: "Active" },
  { id: "scheduled", label: "Scheduled" },
  { id: "sent", label: "Completed" },
  { id: "draft", label: "Draft" },
];

export default function CampaignsView() {
  const router = useRouter();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<BulkCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Get user ID from auth context
  const userId = user?.id || "";

  useEffect(() => {
    async function loadCampaigns() {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await fetchBulkCampaigns(userId);
        setCampaigns(data || []);
      } catch (err: any) {
        console.error("Error fetching campaigns:", err);
        setError(err.message || "Failed to load campaigns");
        // Keep empty array for now
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    }

    loadCampaigns();
  }, [userId]);

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesStatus =
      selectedStatus === "all" || campaign.status === selectedStatus;
    const matchesSearch = campaign.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "sending":
        return styles.campaignActive;
      case "scheduled":
        return styles.campaignScheduled;
      case "sent":
        return styles.campaignCompleted;
      case "draft":
        return styles.campaignDraft;
      case "failed":
        return styles.campaignFailed || "";
      default:
        return "";
    }
  };

  const getDeliveryRate = (sent: number, delivered: number) => {
    if (sent === 0) return "0%";
    return ((delivered / sent) * 100).toFixed(1) + "%";
  };

  const getReadRate = (delivered: number, read: number) => {
    if (delivered === 0) return "0%";
    return ((read / delivered) * 100).toFixed(1) + "%";
  };

  // Navigate to bulk messages to create a new campaign
  const handleCreateCampaign = () => {
    router.push("/dashboard/bulk-messages");
  };

  // Stats counts
  const totalCount = campaigns.length;
  const activeCount = campaigns.filter((c) => c.status === "sending").length;
  const scheduledCount = campaigns.filter(
    (c) => c.status === "scheduled"
  ).length;
  const completedCount = campaigns.filter((c) => c.status === "sent").length;

  return (
    <div className={styles.campaignsView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>Campaigns</h1>
          <p className={styles.viewSubtitle}>
            Create and manage your WhatsApp marketing campaigns
          </p>
        </div>
        <button className={styles.primaryBtn} onClick={handleCreateCampaign}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Campaign
        </button>
      </div>

      {/* Stats Overview */}
      <div className={styles.campaignStats}>
        <div className={styles.campaignStatCard}>
          <div className={styles.campaignStatIcon}>📊</div>
          <div className={styles.campaignStatContent}>
            <span className={styles.campaignStatValue}>{totalCount}</span>
            <span className={styles.campaignStatLabel}>Total Campaigns</span>
          </div>
        </div>
        <div className={styles.campaignStatCard}>
          <div className={styles.campaignStatIcon}>🚀</div>
          <div className={styles.campaignStatContent}>
            <span className={styles.campaignStatValue}>{activeCount}</span>
            <span className={styles.campaignStatLabel}>Active</span>
          </div>
        </div>
        <div className={styles.campaignStatCard}>
          <div className={styles.campaignStatIcon}>⏰</div>
          <div className={styles.campaignStatContent}>
            <span className={styles.campaignStatValue}>{scheduledCount}</span>
            <span className={styles.campaignStatLabel}>Scheduled</span>
          </div>
        </div>
        <div className={styles.campaignStatCard}>
          <div className={styles.campaignStatIcon}>✅</div>
          <div className={styles.campaignStatContent}>
            <span className={styles.campaignStatValue}>{completedCount}</span>
            <span className={styles.campaignStatLabel}>Completed</span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading campaigns...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className={styles.errorBanner}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && campaigns.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📨</div>
          <h2>No campaigns yet</h2>
          <p>Create your first bulk message campaign to get started</p>
          <button className={styles.primaryBtn} onClick={handleCreateCampaign}>
            + Create Campaign
          </button>
        </div>
      )}

      {/* Filters */}
      {!loading && campaigns.length > 0 && (
        <>
          <div className={styles.campaignsFilters}>
            <div className={styles.statusTabs}>
              {statusFilters.map((filter) => (
                <button
                  key={filter.id}
                  className={`${styles.statusTab} ${
                    selectedStatus === filter.id ? styles.statusTabActive : ""
                  }`}
                  onClick={() => setSelectedStatus(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className={styles.searchWrapper}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>

          {/* Campaigns List */}
          <div className={styles.campaignsList}>
            {filteredCampaigns.map((campaign) => (
              <div key={campaign.id} className={styles.campaignCard}>
                <div className={styles.campaignMain}>
                  <div className={styles.campaignInfo}>
                    <div className={styles.campaignTitleRow}>
                      <h3 className={styles.campaignName}>{campaign.name}</h3>
                      <span
                        className={`${styles.campaignStatus} ${getStatusStyle(
                          campaign.status
                        )}`}
                      >
                        {campaign.status}
                      </span>
                    </div>
                    <div className={styles.campaignMeta}>
                      <span className={styles.campaignType}>📡 Broadcast</span>
                      <span className={styles.campaignDates}>
                        📅{" "}
                        {campaign.started_at
                          ? new Date(campaign.started_at).toLocaleDateString()
                          : "Not started"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.campaignMetrics}>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>
                        {(campaign.total_contacts || 0).toLocaleString()}
                      </span>
                      <span className={styles.metricLabel}>Recipients</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>
                        {(campaign.sent_count || 0).toLocaleString()}
                      </span>
                      <span className={styles.metricLabel}>Sent</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>
                        {getDeliveryRate(
                          campaign.sent_count || 0,
                          campaign.delivered_count || 0
                        )}
                      </span>
                      <span className={styles.metricLabel}>Delivery Rate</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>
                        {getReadRate(
                          campaign.delivered_count || 0,
                          campaign.read_count || 0
                        )}
                      </span>
                      <span className={styles.metricLabel}>Read Rate</span>
                    </div>
                  </div>

                  <div className={styles.campaignActions}>
                    <button className={styles.campaignBtn} title="View Details">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Progress bar for active campaigns */}
                {campaign.status === "sending" &&
                  (campaign.total_contacts || 0) > 0 && (
                    <div className={styles.campaignProgress}>
                      <div
                        className={styles.progressBar}
                        style={{
                          width: `${
                            ((campaign.sent_count || 0) /
                              (campaign.total_contacts || 1)) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
