"use client";

import { useState } from "react";
import styles from "../dashboard.module.css";

// WhatsApp-specific analytics data with icons
const stats = [
  {
    id: "sent",
    label: "Messages Sent",
    value: "24.7K",
    change: "+20%",
    isPositive: true,
    subtitle: "Vs last month",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line
          x1="22"
          y1="2"
          x2="11"
          y2="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon
          points="22 2 15 22 11 13 2 9 22 2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    color: "#4ade80",
  },
  {
    id: "delivered",
    label: "Messages Delivered",
    value: "23.8K",
    change: "+18%",
    isPositive: true,
    subtitle: "Vs last month",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="22 4 12 14.01 9 11.01"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    color: "#60a5fa",
  },
  {
    id: "read",
    label: "Read Rate",
    value: "89%",
    change: "+5.2%",
    isPositive: true,
    subtitle: "Vs last month",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="12"
          r="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    color: "#a78bfa",
  },
  {
    id: "response",
    label: "Response Rate",
    value: "67%",
    change: "+12%",
    isPositive: true,
    subtitle: "Vs last month",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    color: "#f472b6",
  },
];

// Chart data for different periods
const chartDataByPeriod = {
  daily: [
    820, 1200, 950, 1450, 780, 890, 1320, 560, 980, 1580, 1200, 650, 720, 1100,
    1350, 890, 1480, 720, 540, 1650, 980, 1050, 1280, 780, 1150, 620, 680, 1420,
    1550, 1680,
  ],
  weekly: [
    5200, 6800, 5950, 7200, 6100, 5800, 7500, 6900, 7200, 6500, 7800, 8100,
  ],
  monthly: [
    24500, 28000, 26500, 31000, 29500, 27800, 32000, 30500, 33000, 29000, 34500,
    36000,
  ],
};

const chartLabels = {
  daily: Array.from({ length: 30 }, (_, i) => (i + 1).toString()),
  weekly: [
    "W1",
    "W2",
    "W3",
    "W4",
    "W5",
    "W6",
    "W7",
    "W8",
    "W9",
    "W10",
    "W11",
    "W12",
  ],
  monthly: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
};

const chartMaxValues = {
  daily: 2000,
  weekly: 10000,
  monthly: 40000,
};

const chartYAxisLabels = {
  daily: ["2K", "1.5K", "1K", "500", "0"],
  weekly: ["10K", "7.5K", "5K", "2.5K", "0"],
  monthly: ["40K", "30K", "20K", "10K", "0"],
};

const topTemplates = [
  { name: "Welcome Message", sent: "5.2K", trend: "+12%" },
  { name: "Order Confirmation", sent: "3.8K", trend: "+8%" },
  { name: "Appointment Reminder", sent: "2.1K", trend: "+5%" },
];

const topCampaigns = [
  { name: "Holiday Promo", delivered: "8.5K", status: "Active" },
  { name: "New Year Sale", delivered: "6.2K", status: "Active" },
  { name: "Weekly Newsletter", delivered: "4.8K", status: "Completed" },
];

const newMessages = [
  {
    name: "Leslie Alexander",
    message: "Thanks for the quick response!",
    time: "2m ago",
    unread: true,
  },
  {
    name: "Savannah Nguyen",
    message: "When will my order arrive?",
    time: "5m ago",
    unread: true,
  },
  {
    name: "Kristin Watson",
    message: "I'd like to schedule a call",
    time: "12m ago",
    unread: false,
  },
  {
    name: "Cameron Wilson",
    message: "Perfect, that works for me!",
    time: "18m ago",
    unread: false,
  },
];

export default function AnalyticsView() {
  const [chartPeriod, setChartPeriod] = useState<
    "daily" | "weekly" | "monthly"
  >("daily");

  const currentChartData = chartDataByPeriod[chartPeriod];
  const currentLabels = chartLabels[chartPeriod];
  const currentMaxValue = chartMaxValues[chartPeriod];
  const currentYAxisLabels = chartYAxisLabels[chartPeriod];

  return (
    <div className={styles.analyticsView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>WhatsApp Analytics</h1>
          <p className={styles.viewSubtitle}>
            Monitor your messaging performance and engagement
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <select className={styles.periodSelect}>
            <option>Last 30 days</option>
            <option>Last 7 days</option>
            <option>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsCardsRow}>
        {stats.map((stat) => (
          <div
            key={stat.id}
            className={styles.statsCard}
            style={{ "--card-accent": stat.color } as React.CSSProperties}
          >
            <div
              className={styles.statsCardIcon}
              style={{ background: `${stat.color}15`, color: stat.color }}
            >
              {stat.icon}
            </div>
            <div className={styles.statsCardContent}>
              <span className={styles.statsCardLabel}>{stat.label}</span>
              <div className={styles.statsCardValueRow}>
                <span className={styles.statsCardValue}>{stat.value}</span>
                <span
                  className={`${styles.statsCardBadge} ${
                    stat.isPositive
                      ? styles.badgePositive
                      : styles.badgeNegative
                  }`}
                >
                  {stat.isPositive ? "↑" : "↓"} {stat.change}
                </span>
              </div>
              <span className={styles.statsCardSubtitle}>{stat.subtitle}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Chart */}
      <div className={styles.mainChartSection}>
        <div className={styles.mainChartHeader}>
          <div>
            <h2 className={styles.chartTitle}>Message Activity</h2>
            <p className={styles.chartSubtitle}>
              {chartPeriod === "daily" && "Messages sent in the last 30 days"}
              {chartPeriod === "weekly" && "Messages sent in the last 12 weeks"}
              {chartPeriod === "monthly" &&
                "Messages sent in the last 12 months"}
            </p>
          </div>
          <div className={styles.chartTabs}>
            <button
              className={`${styles.chartTab} ${
                chartPeriod === "daily" ? styles.chartTabActive : ""
              }`}
              onClick={() => setChartPeriod("daily")}
            >
              Daily
            </button>
            <button
              className={`${styles.chartTab} ${
                chartPeriod === "weekly" ? styles.chartTabActive : ""
              }`}
              onClick={() => setChartPeriod("weekly")}
            >
              Weekly
            </button>
            <button
              className={`${styles.chartTab} ${
                chartPeriod === "monthly" ? styles.chartTabActive : ""
              }`}
              onClick={() => setChartPeriod("monthly")}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className={styles.mainChartContainer}>
          <div className={styles.chartYAxis}>
            {currentYAxisLabels.map((label, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          <div className={styles.mainChartBars} key={chartPeriod}>
            {currentChartData.map((value, index) => (
              <div key={index} className={styles.mainChartBarWrapper}>
                <div
                  className={styles.mainChartBar}
                  style={{
                    height: `${(value / currentMaxValue) * 100}%`,
                    animationDelay: `${index * 0.03}s`,
                  }}
                >
                  <span className={styles.barTooltip}>
                    {value.toLocaleString()} messages
                  </span>
                </div>
                <span className={styles.mainChartLabel}>
                  {currentLabels[index]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Cards */}
      <div className={styles.bottomCardsRow}>
        {/* Top Templates */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>
            <h3 className={styles.infoCardTitle}>Top Templates</h3>
            <button className={styles.viewAllBtn}>View All →</button>
          </div>
          <div className={styles.infoCardList}>
            {topTemplates.map((template, index) => (
              <div key={index} className={styles.infoCardItem}>
                <div className={styles.infoCardItemIcon}>📝</div>
                <div className={styles.infoCardItemContent}>
                  <span className={styles.infoCardItemName}>
                    {template.name}
                  </span>
                  <span className={styles.infoCardItemMeta}>
                    {template.sent} sent
                  </span>
                </div>
                <span className={styles.infoCardItemTrend}>
                  {template.trend}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Campaigns */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>
            <h3 className={styles.infoCardTitle}>Top Campaigns</h3>
            <button className={styles.viewAllBtn}>View All →</button>
          </div>
          <div className={styles.infoCardList}>
            {topCampaigns.map((campaign, index) => (
              <div key={index} className={styles.infoCardItem}>
                <div className={styles.infoCardItemIcon}>📢</div>
                <div className={styles.infoCardItemContent}>
                  <span className={styles.infoCardItemName}>
                    {campaign.name}
                  </span>
                  <span className={styles.infoCardItemMeta}>
                    {campaign.delivered} delivered
                  </span>
                </div>
                <span
                  className={`${styles.campaignStatus} ${
                    campaign.status === "Active"
                      ? styles.statusActive
                      : styles.statusCompleted
                  }`}
                >
                  {campaign.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Chats */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>
            <h3 className={styles.infoCardTitle}>Recent Chats</h3>
            <button className={styles.viewAllBtn}>View All →</button>
          </div>
          <div className={styles.newMessagesList}>
            {newMessages.map((msg, index) => (
              <div
                key={index}
                className={`${styles.newMessageItem} ${
                  msg.unread ? styles.unread : ""
                }`}
              >
                <div className={styles.newMessageAvatar}>
                  {msg.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className={styles.newMessageContent}>
                  <div className={styles.newMessageTop}>
                    <span className={styles.newMessageName}>{msg.name}</span>
                    <span className={styles.newMessageTime}>{msg.time}</span>
                  </div>
                  <p className={styles.newMessageText}>{msg.message}</p>
                </div>
                {msg.unread && <div className={styles.unreadDot} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
