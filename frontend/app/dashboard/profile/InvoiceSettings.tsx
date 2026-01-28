"use client";

import React, { useState, useEffect } from "react";
import styles from "./invoiceSettings.module.css";
import InvoiceTemplate from "./invoice/InvoiceTemplate";
import { InvoiceData, BusinessInfo } from "@/lib/invoice-utils";

interface InvoiceSettingsProps {
  showToast: (text: string, type: "success" | "error") => void;
}

/**
 * InvoiceSettings - Shows sample invoice preview
 *
 * This tab displays what invoices look like when sent to customers
 * Invoices are auto-sent at checkout when customer provides email
 */
export default function InvoiceSettings({ showToast }: InvoiceSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [businessProfile, setBusinessProfile] = useState<BusinessInfo>({
    name: "My Store",
    logoUrl: "",
    phone: "+91 98765 43210",
    address: "123, Business Street, Tech Park, Chennai - 600001",
    brandColor: "#22c55e",
  });

  // Load business profile
  useEffect(() => {
    const loadBusinessProfile = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const data = await response.json();
          if (data.data) {
            const contact = data.data.contact || {};
            const location = data.data.location || {};

            setBusinessProfile({
              name: data.data.businessName || "My Store",
              logoUrl: data.data.logoUrl || "",
              email: contact.email,
              phone: contact.phone || "",
              address:
                [
                  location.address,
                  location.city,
                  location.state,
                  location.pincode,
                ]
                  .filter(Boolean)
                  .join(", ") || "",
              storeSlug: data.data.businessId || "my-store",
              brandColor: data.data.brandColor || "#22c55e",
            });
          }
        }
      } catch (error) {
        console.error("Failed to load business profile", error);
      } finally {
        setLoading(false);
      }
    };

    loadBusinessProfile();
  }, []);

  // Sample invoice data to show what it looks like
  const sampleInvoiceData: InvoiceData = {
    invoiceNumber: "INV-SAMPLE01",
    orderId: "sample-order-id",
    date: new Date().toISOString(),
    customer: {
      name: "Sample Customer",
      phone: "9876543210",
      email: "customer@example.com",
      address: "123 Sample Street, City, State - 123456",
    },
    items: [
      {
        id: "1",
        name: "Sample Product",
        quantity: 2,
        price: 999,
        size: "M",
        color: "Black",
      },
      {
        id: "2",
        name: "Another Product",
        quantity: 1,
        price: 1499,
        size: "L",
        color: "Blue",
      },
    ],
    subtotal: 3497,
    shipping: 0,
    total: 3497,
    paymentStatus: "cod",
  };

  const [saving, setSaving] = useState(false);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBusinessProfile((prev) => ({
      ...prev,
      brandColor: e.target.value,
    }));
  };

  const handleSaveColor = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandColor: businessProfile.brandColor,
        }),
      });

      if (response.ok) {
        showToast("Brand color saved successfully", "success");
      } else {
        showToast("Failed to save brand color", "error");
      }
    } catch (error) {
      console.error("Error saving brand color:", error);
      showToast("An error occurred while saving", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading invoice preview...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Invoice Preview</h2>
        </div>
      </div>

      {/* Sample Invoice Preview */}
      <div className={styles.previewSection}>
        {/* Color Setting */}
        <div
          style={{
            marginBottom: "20px",
            marginTop: "10px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "white",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              overflow: "hidden",
              border: "2px solid #e5e7eb",
              flexShrink: 0,
            }}
          >
            <input
              type="color"
              value={businessProfile.brandColor || "#22c55e"}
              onChange={handleColorChange}
              style={{
                width: "150%",
                height: "150%",
                transform: "translate(-25%, -25%)",
                cursor: "pointer",
                border: "none",
                padding: 0,
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#1a1a1a",
                marginBottom: "2px",
              }}
            >
              Brand Color
            </label>
            <p style={{ fontSize: "12px", color: "#666", margin: 0 }}>
              Pick a color for your invoice header and accents
            </p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={handleSaveColor}
              disabled={saving}
              style={{
                background: "#000000",
                color: "#ffffff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {saving ? "Saving..." : "Save Color"}
            </button>
          </div>
        </div>

        <InvoiceTemplate
          invoice={sampleInvoiceData}
          business={businessProfile}
          showActions={false}
        />
      </div>
    </div>
  );
}
