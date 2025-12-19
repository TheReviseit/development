"use client";

import { useState } from "react";
import styles from "../dashboard.module.css";

// Mock campaigns data
const mockCampaigns = [
  {
    id: "1",
    name: "Holiday Sale 2024",
    status: "active",
    type: "broadcast",
    recipients: 2500,
    sent: 2450,
    delivered: 2398,
    read: 1876,
    startDate: "Dec 15, 2024",
    endDate: "Dec 25, 2024",
  },
  {
    id: "2",
    name: "New Year Promotion",
    status: "scheduled",
    type: "broadcast",
    recipients: 5000,
    sent: 0,
    delivered: 0,
    read: 0,
    startDate: "Dec 31, 2024",
    endDate: "Jan 5, 2025",
  },
  {
    id: "3",
    name: "Welcome Series",
    status: "active",
    type: "drip",
    recipients: 850,
    sent: 720,
    delivered: 715,
    read: 580,
    startDate: "Nov 1, 2024",
    endDate: "Ongoing",
  },
  {
    id: "4",
    name: "Black Friday Deals",
    status: "completed",
    type: "broadcast",
    recipients: 8000,
    sent: 7950,
    delivered: 7820,
    read: 5640,
    startDate: "Nov 24, 2024",
    endDate: "Nov 27, 2024",
  },
  {
    id: "5",
    name: "Customer Feedback",
    status: "draft",
    type: "broadcast",
    recipients: 1200,
    sent: 0,
    delivered: 0,
    read: 0,
    startDate: "-",
    endDate: "-",
  },
];

const statusFilters = [
  { id: "all", label: "All Campaigns" },
  { id: "active", label: "Active" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
  { id: "draft", label: "Draft" },
];

export default function CampaignsView() {
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCampaigns = mockCampaigns.filter((campaign) => {
    const matchesStatus =
      selectedStatus === "all" || campaign.status === selectedStatus;
    const matchesSearch = campaign.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "active":
        return styles.campaignActive;
      case "scheduled":
        return styles.campaignScheduled;
      case "completed":
        return styles.campaignCompleted;
      case "draft":
        return styles.campaignDraft;
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
        <button className={styles.primaryBtn}>
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
            <span className={styles.campaignStatValue}>
              {mockCampaigns.length}
            </span>
            <span className={styles.campaignStatLabel}>Total Campaigns</span>
          </div>
        </div>
        <div className={styles.campaignStatCard}>
          <div className={styles.campaignStatIcon}>🚀</div>
          <div className={styles.campaignStatContent}>
            <span className={styles.campaignStatValue}>
              {mockCampaigns.filter((c) => c.status === "active").length}
            </span>
            <span className={styles.campaignStatLabel}>Active</span>
          </div>
        </div>
        <div className={styles.campaignStatCard}>
          <div className={styles.campaignStatIcon}>⏰</div>
          <div className={styles.campaignStatContent}>
            <span className={styles.campaignStatValue}>
              {mockCampaigns.filter((c) => c.status === "scheduled").length}
            </span>
            <span className={styles.campaignStatLabel}>Scheduled</span>
          </div>
        </div>
        <div className={styles.campaignStatCard}>
          <div className={styles.campaignStatIcon}>✅</div>
          <div className={styles.campaignStatContent}>
            <span className={styles.campaignStatValue}>
              {mockCampaigns.filter((c) => c.status === "completed").length}
            </span>
            <span className={styles.campaignStatLabel}>Completed</span>
          </div>
        </div>
      </div>

      {/* Filters */}
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
                  <span className={styles.campaignType}>
                    {campaign.type === "broadcast"
                      ? "📡 Broadcast"
                      : "💧 Drip Campaign"}
                  </span>
                  <span className={styles.campaignDates}>
                    📅 {campaign.startDate} - {campaign.endDate}
                  </span>
                </div>
              </div>

              <div className={styles.campaignMetrics}>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>
                    {campaign.recipients.toLocaleString()}
                  </span>
                  <span className={styles.metricLabel}>Recipients</span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>
                    {campaign.sent.toLocaleString()}
                  </span>
                  <span className={styles.metricLabel}>Sent</span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>
                    {getDeliveryRate(campaign.sent, campaign.delivered)}
                  </span>
                  <span className={styles.metricLabel}>Delivery Rate</span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>
                    {getReadRate(campaign.delivered, campaign.read)}
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
                <button className={styles.campaignBtn} title="Edit">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button className={styles.campaignBtn} title="Duplicate">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                <button
                  className={`${styles.campaignBtn} ${styles.deleteBtn}`}
                  title="Delete"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Progress bar for active campaigns */}
            {campaign.status === "active" && campaign.recipients > 0 && (
              <div className={styles.campaignProgress}>
                <div
                  className={styles.progressBar}
                  style={{
                    width: `${(campaign.sent / campaign.recipients) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
