"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import "../../console.css";
import "../billing.css";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface OrderInfo {
  subscription_id: string;
  key_id: string;
  amount: number;
  currency: string;
  plan_name: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "processing" | "success" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Load Razorpay script on mount - more reliable than Next.js Script
  useEffect(() => {
    // Check if already loaded (global object or script element)
    if (typeof window !== "undefined" && window.Razorpay) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial sync with external state
      setRazorpayLoaded(true);
      return;
    }

    // Prevent duplicate script loading
    if (document.getElementById("razorpay-sdk")) {
      // Script exists but Razorpay not ready yet, wait for it
      const checkInterval = setInterval(() => {
        if (window.Razorpay) {
          setRazorpayLoaded(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // Create and append script
    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () =>
      setError("Failed to load payment system. Please refresh the page.");
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    // Get order from session storage
    const orderData = sessionStorage.getItem("billing_order");
    if (!orderData) {
      router.push("/console/otp");
      return;
    }

    try {
      const parsed = JSON.parse(orderData);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial sync with sessionStorage
      setOrder(parsed);
      setStatus("ready");
    } catch {
      router.push("/console/otp");
    }
  }, [router]);

  const openRazorpay = () => {
    if (!order || !razorpayLoaded || !window.Razorpay) {
      setError("Payment system not ready. Please refresh and try again.");
      return;
    }

    setStatus("processing");

    const options = {
      key: order.key_id,
      subscription_id: order.subscription_id,
      name: "Flowauxi OTP API",
      description: `${order.plan_name} Plan Subscription`,
      image: "/logo.png",
      handler: async function (response: any) {
        // Verify payment
        try {
          const res = await fetch("/api/console/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const data = await res.json();

          if (data.success) {
            setStatus("success");
            sessionStorage.removeItem("billing_order");

            // Redirect to dashboard after short delay
            setTimeout(() => {
              router.push("/console");
            }, 2000);
          } else {
            setError(data.message || "Payment verification failed");
            setStatus("error");
          }
        } catch (err) {
          console.error("Verification error:", err);
          // Even if verify fails, payment may have succeeded
          // Poll status to check
          pollStatus();
        }
      },
      modal: {
        ondismiss: function () {
          setStatus("ready");
        },
      },
      theme: {
        color: "#ffffff",
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const pollStatus = async () => {
    // Poll for up to 30 seconds
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        const res = await fetch("/api/console/billing/status", {
          credentials: "include",
        });
        const data = await res.json();

        if (data.success && data.ready) {
          setStatus("success");
          sessionStorage.removeItem("billing_order");
          setTimeout(() => {
            router.push("/console");
          }, 2000);
          return;
        }
      } catch {
        // Continue polling
      }
    }

    setError("Payment status unknown. Please check your dashboard.");
    setStatus("error");
  };

  if (status === "loading") {
    return (
      <div className="checkout-page">
        <div className="checkout-loading">Loading...</div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="checkout-page">
        <div className="checkout-success">
          <div className="success-icon">✓</div>
          <h2>Payment Successful!</h2>
          <p>Your subscription is now active. Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="checkout-page">
        <div className="checkout-card">
          <h1>Complete Your Subscription</h1>

          {order && (
            <div className="checkout-summary">
              <div className="summary-row">
                <span>Plan</span>
                <span className="value">{order.plan_name}</span>
              </div>
              <div className="summary-row">
                <span>Amount</span>
                <span className="value amount">
                  ₹{(order.amount / 100).toLocaleString()}/month
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="checkout-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            className="checkout-btn"
            onClick={openRazorpay}
            disabled={status === "processing" || !razorpayLoaded}
          >
            {status === "processing"
              ? "Processing..."
              : !razorpayLoaded
                ? "Loading..."
                : "Pay Now"}
          </button>

          <button
            className="checkout-back"
            onClick={() => router.push("/console/otp")}
          >
            ← Back to Plans
          </button>

          <p className="checkout-security">
            🔒 Secure payment powered by Razorpay
          </p>
        </div>
      </div>
    </>
  );
}
