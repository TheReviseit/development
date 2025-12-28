"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { sendBulkCampaign } from "@/lib/api/whatsapp";
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
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

  // Handle send message via API
  const handleSend = async (message: string, mediaFiles: File[]) => {
    if (!user?.id) {
      setSendError("Please log in to send messages");
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      // TODO: Handle media file upload if needed
      // For now, we only send text messages
      const result = await sendBulkCampaign(
        user.id,
        campaignId,
        message,
        undefined, // media_url
        undefined // media_type
      );

      console.log("✅ Campaign sent:", result);

      // Update localStorage
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
        console.error("Error updating localStorage:", err);
      }

      // Navigate to success page
      router.push(`/dashboard/bulk-messages/${campaignId}/success`);
    } catch (err: any) {
      console.error("Error sending campaign:", err);
      setSendError(err.message || "Failed to send campaign. Please try again.");
      setIsSending(false);
    }
  };

  if (!campaign || contacts.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (isSending) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
        <div style={{ marginBottom: "1rem" }}>
          <div
            className="spinner"
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid rgba(255,255,255,0.2)",
              borderTop: "4px solid #22c55e",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto",
            }}
          ></div>
        </div>
        <p>Sending messages to {contacts.length} contacts...</p>
        <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.6)" }}>
          Please wait, this may take a moment
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {sendError && (
        <div
          style={{
            padding: "1rem",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "8px",
            margin: "1rem",
            color: "#ef4444",
          }}
        >
          ⚠️ {sendError}
        </div>
      )}
      <MessageComposer
        contacts={contacts}
        onBack={handleBack}
        onSend={handleSend}
      />
    </>
  );
}
