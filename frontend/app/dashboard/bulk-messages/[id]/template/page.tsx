"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import MessageComposer from "../../MessageComposer";

interface Contact {
  name: string;
  phone: string;
  email?: string;
  [key: string]: string | undefined;
}

interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  contactCount: number;
  status: "draft" | "sent" | "scheduled";
  contacts?: Contact[];
  message?: string;
}

const CAMPAIGNS_KEY = "bulkMessageCampaigns";

export default function TemplatePage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Load campaign data
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CAMPAIGNS_KEY);
      if (saved) {
        const campaigns: Campaign[] = JSON.parse(saved);
        const found = campaigns.find((c) => c.id === campaignId);
        if (found) {
          setCampaign(found);
          if (found.contacts && found.contacts.length > 0) {
            setContacts(found.contacts);
          } else {
            // No contacts, redirect back to data step
            router.push(`/dashboard/bulk-messages/${campaignId}/data`);
          }
        } else {
          router.push("/dashboard/bulk-messages");
        }
      }
    } catch (err) {
      console.error("Error loading campaign:", err);
    }
  }, [campaignId, router]);

  // Handle back to data step
  const handleBack = () => {
    router.push(`/dashboard/bulk-messages/${campaignId}/data`);
  };

  // Handle send message
  const handleSend = (message: string, mediaFiles: File[]) => {
    // Update campaign status to sent
    try {
      const saved = localStorage.getItem(CAMPAIGNS_KEY);
      if (saved) {
        const campaigns: Campaign[] = JSON.parse(saved);
        const idx = campaigns.findIndex((c) => c.id === campaignId);
        if (idx !== -1) {
          campaigns[idx].status = "sent";
          campaigns[idx].message = message;
          localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
        }
      }
    } catch (err) {
      console.error("Error updating campaign:", err);
    }

    console.log("Sending message:", message);
    console.log("Media files:", mediaFiles);
    console.log("To contacts:", contacts);

    // TODO: Implement actual sending logic via API
    alert(`Message sent to ${contacts.length} contacts!`);

    // Navigate to campaigns list where sent campaigns are shown
    router.push("/dashboard/campaigns");
  };

  if (!campaign || contacts.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <MessageComposer
      contacts={contacts}
      onBack={handleBack}
      onSend={handleSend}
    />
  );
}
