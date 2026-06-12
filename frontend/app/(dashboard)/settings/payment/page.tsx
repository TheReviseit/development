"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import PaymentSettings from "../PaymentSettings";
import Toast from "@/app/components/Toast/Toast";
import styles from "../profile.module.css";

export default function PaymentSettingsPage() {
  const { loading: authLoading } = useAuth();
  const [paymentData, setPaymentData] = useState({
    razorpayKeyId: "",
    razorpayKeySecret: "",
    paymentsEnabled: false,
    codAvailable: false,
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            const ep = result.data.ecommercePolicies || result.data.ecommerce_policies || {};
            setPaymentData({
              razorpayKeyId: result.data.razorpayKeyId || "",
              razorpayKeySecret: result.data.razorpayKeySecret || "",
              paymentsEnabled: result.data.paymentsEnabled || false,
              codAvailable: ep.codAvailable ?? ep.cod_available ?? false,
            });
          }
        }
      } catch (error) {
        console.error("Error loading payment data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      loadProfile();
    }
  }, [authLoading]);

  if (loading || authLoading) {
    return <div className={styles.loading}>Loading payment settings...</div>;
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
      <PaymentSettings
        initialData={paymentData}
        showToast={(text: string, type: "success" | "error") => setMessage({ text, type })}
      />
    </>
  );
}
