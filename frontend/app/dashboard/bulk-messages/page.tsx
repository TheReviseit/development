"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./bulk-messages.module.css";

const CAMPAIGNS_KEY = "bulkMessageCampaigns";

interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  contactCount: number;
  status: "draft" | "sent" | "scheduled";
  contacts?: any[];
}

export default function BulkMessagesPage() {
  const router = useRouter();
  const [campaignName, setCampaignName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Generate unique ID
  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  };

  // Create new campaign and navigate to data step
  const handleCreateCampaign = () => {
    if (!campaignName.trim()) return;

    setIsCreating(true);
    const campaignId = generateId();

    // Create campaign object
    const newCampaign: Campaign = {
      id: campaignId,
      name: campaignName.trim(),
      createdAt: new Date().toISOString(),
      contactCount: 0,
      status: "draft",
      contacts: [],
    };

    // Save to localStorage (same key as data page expects)
    try {
      const saved = localStorage.getItem(CAMPAIGNS_KEY);
      const campaigns: Campaign[] = saved ? JSON.parse(saved) : [];
      campaigns.push(newCampaign);
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    } catch (err) {
      console.error("Error saving campaign:", err);
    }

    // Navigate to data step
    router.push(`/dashboard/bulk-messages/${campaignId}/data`);
  };

  return (
    <div className={styles.bulkMessagesContainer}>
      <div className={styles.bulkMessagesHeader}>
        <div>
          <h1 className={styles.pageTitle}>Create Bulk Message</h1>
          <p className={styles.pageDescription}>
            Send bulk WhatsApp messages to your contacts
          </p>
        </div>
      </div>

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

      {/* Info Section */}
      <div className={styles.infoSection}>
        <h3>How it works</h3>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNumber}>1</span>
            <div>
              <strong>Name your campaign</strong>
              <p>Give your campaign a descriptive name</p>
            </div>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>2</span>
            <div>
              <strong>Upload contacts</strong>
              <p>Import contacts from an Excel file</p>
            </div>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>3</span>
            <div>
              <strong>Compose message</strong>
              <p>Write your message with personalized variables</p>
            </div>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>4</span>
            <div>
              <strong>Send</strong>
              <p>Review and send to all contacts</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
