"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import InvoiceSettings from '../InvoiceSettings';
import Toast from "@/app/components/Toast/Toast";
import styles from "../profile.module.css";

export default function InvoiceSettingsPage() {
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [canAccessInvoice, setCanAccessInvoice] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const checkInvoiceFeature = async () => {
      try {
        const response = await fetch("/api/features/check?feature=invoice_customization");
        if (response.ok) {
          const data = await response.json();
          setCanAccessInvoice(data.allowed === true);
        } else {
          setCanAccessInvoice(false);
        }
      } catch (error) {
        console.error("Error checking invoice feature:", error);
        setCanAccessInvoice(false);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      checkInvoiceFeature();
    }
  }, [authLoading]);

  if (loading || authLoading) {
    return <div className={styles.loading}>Loading invoice settings...</div>;
  }

  return (
    <>
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
          duration={3000}
        />
      )}
      <InvoiceSettings
        showToast={(text: string, type: "success" | "error") => setMessage({ text, type })}
        canCustomize={canAccessInvoice === true}
      />
    </>
  );
}
