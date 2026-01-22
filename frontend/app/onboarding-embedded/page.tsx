/**
 * Simplified Onboarding Page - WhatsApp Connection + Pricing Flow
 *
 * Flow:
 * 1. Connect WhatsApp Business (Embedded Signup)
 * 2. Choose pricing plan and pay
 * 3. Redirect to dashboard
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import WhatsAppEmbeddedSignupForm from "../components/onboarding/WhatsAppEmbeddedSignupForm";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import {
  createSubscription,
  openRazorpayCheckout,
  verifyPayment,
} from "../../lib/api/razorpay";
import "../onboarding/onboarding.css";
import "./onboarding-embedded.css";

type Step = "whatsapp" | "pricing" | "complete";
type PlanName = "starter" | "business" | "pro";

const PLANS = [
  {
    id: "starter" as PlanName,
    name: "Starter",
    price: 1,
    priceDisplay: "₹1",
    description: "Perfect for solo entrepreneurs",
    features: [
      "2,500 AI Responses / month",
      "1 WhatsApp Number",
      "Up to 50 FAQs Training",
      "Basic Auto-Replies",
      "Live Chat Dashboard",
      "Email Support",
    ],
  },
  {
    id: "business" as PlanName,
    name: "Business",
    price: 3999,
    priceDisplay: "₹3,999",
    description: "For growing businesses",
    popular: true,
    features: [
      "8,000 AI Responses / month",
      "Up to 2 WhatsApp Numbers",
      "Up to 200 FAQs Training",
      "Broadcast Campaigns",
      "Template Builder",
      "Basic Analytics",
      "Chat Support",
    ],
  },
  {
    id: "pro" as PlanName,
    name: "Pro",
    price: 8999,
    priceDisplay: "₹8,999",
    description: "Full automation power",
    features: [
      "25,000 AI Responses / month",
      "Unlimited WhatsApp Numbers",
      "Unlimited FAQs Training",
      "Multi-Agent Inbox",
      "Advanced Analytics",
      "API Access",
      "Priority Support",
    ],
  },
];

export default function OnboardingPageEmbedded() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("whatsapp");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<PlanName | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [wabaData, setWabaData] = useState<{
    wabaId: string;
    phoneNumberId: string;
  } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check onboarding status before showing the page
        const shouldRedirect = await checkOnboardingStatus();
        // Only stop loading if we're not redirecting
        if (!shouldRedirect) {
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const checkOnboardingStatus = async (): Promise<boolean> => {
    try {
      const onboardingResponse = await fetch("/api/onboarding/check");
      const onboardingData = await onboardingResponse.json();

      if (onboardingData.onboardingCompleted) {
        // Fully onboarded - go to dashboard
        router.push("/dashboard");
        return true; // Indicate that we're redirecting
      }

      // Check if WhatsApp is already connected
      if (onboardingData.whatsappConnected) {
        // WhatsApp connected but onboarding not complete
        // Show pricing step instead of connection step
        console.log("✅ WhatsApp already connected, showing pricing step");
        setStep("pricing");
      } else {
        // No WhatsApp connection, show connection step
        console.log("⚪ No WhatsApp connection, showing connection step");
        setStep("whatsapp");
      }

      return false; // Not redirecting, show onboarding
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      return false; // On error, show onboarding page
    }
  };

  const handleConnectionSuccess = async (data: {
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    wabaName: string;
  }) => {
    console.log("✅ WhatsApp connected successfully:", data);
    setWabaData({ wabaId: data.wabaId, phoneNumberId: data.phoneNumberId });
    setConnectionError(null);
    // Move to pricing step instead of redirecting to dashboard
    setStep("pricing");
  };

  const handleConnectionError = (error: string) => {
    console.error("❌ WhatsApp connection error:", error);
    setConnectionError(error);
  };

  const handleSelectPlan = async (planId: PlanName) => {
    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    setPaymentLoading(planId);
    setPaymentError(null);

    try {
      // Create subscription order
      const order = await createSubscription(
        planId,
        user.email,
        user.displayName || undefined,
        undefined,
        user.uid,
      );

      if (!order.success) {
        setPaymentError(order.error || "Failed to create subscription");
        setPaymentLoading(null);
        return;
      }

      // Open Razorpay checkout
      await openRazorpayCheckout({
        subscriptionId: order.subscription_id,
        keyId: order.key_id,
        planName: order.plan_name,
        amount: order.amount,
        customerEmail: user.email,
        customerName: user.displayName || undefined,
        onSuccess: async (response) => {
          // Verify payment (sets status to PROCESSING)
          const verification = await verifyPayment(
            {
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
            user.uid,
          );

          if (verification.success) {
            // Store onboarding data in sessionStorage for completion after payment confirmed
            sessionStorage.setItem(
              "pending_onboarding",
              JSON.stringify({
                whatsappConnected: true,
                wabaId: wabaData?.wabaId,
                phoneNumberId: wabaData?.phoneNumberId,
                subscriptionPlan: planId,
              }),
            );

            // Redirect to payment status page (don't trust client-side success)
            // Status page will poll until webhook confirms COMPLETED
            router.push(
              `/payment/status?subscription_id=${response.razorpay_subscription_id}`,
            );
          } else {
            setPaymentError(
              verification.error || "Payment verification failed",
            );
            setPaymentLoading(null);
          }
        },
        onError: (err) => {
          console.error(
            "Razorpay payment error:",
            JSON.stringify(err, null, 2),
          );
          const errorMsg =
            err?.description ||
            err?.reason ||
            err?.message ||
            "Payment failed. Please try again.";
          const errorCode = err?.code ? ` (${err.code})` : "";
          setPaymentError(`${errorMsg}${errorCode}`);
          setPaymentLoading(null);
        },
        onClose: () => {
          // User closed the modal without completing payment
          // This is intentional, not an error - don't show error message
          console.log(
            "Payment modal closed by user without completing payment",
          );
          setPaymentLoading(null);
        },
      });
    } catch (err) {
      console.error("Payment error:", err);
      setPaymentError("Something went wrong. Please try again.");
      setPaymentLoading(null);
    }
  };

  if (loading) {
    return <SpaceshipLoader text="Loading" />;
  }

  return (
    <div className="onboarding-container onboarding-two-step">
      {/* Left Sidebar */}
      <div className="onboarding-sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Flowauxi Logo" />
          <span>Flowauxi</span>
        </div>

        <div className="sidebar-header">
          <h1>
            {step === "whatsapp" && "Connect WhatsApp Business"}
            {step === "pricing" && "Choose Your Plan"}
            {step === "complete" && "Setup Complete!"}
          </h1>
          <p className="sidebar-description">
            {step === "whatsapp" &&
              "Connect your WhatsApp Business Account in one simple step using Meta's official Embedded Signup flow."}
            {step === "pricing" &&
              "Select a plan that fits your business needs. You can upgrade or downgrade anytime."}
            {step === "complete" &&
              "Your account is ready! Redirecting to your dashboard..."}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="onboarding-steps">
          <div
            className={`step-item ${step === "whatsapp" ? "active" : "completed"}`}
          >
            <div className="step-number">{step === "whatsapp" ? "1" : "✓"}</div>
            <span>Connect WhatsApp</span>
          </div>
          <div
            className={`step-item ${step === "pricing" ? "active" : step === "complete" ? "completed" : ""}`}
          >
            <div className="step-number">{step === "complete" ? "✓" : "2"}</div>
            <span>Choose Plan</span>
          </div>
          <div className={`step-item ${step === "complete" ? "active" : ""}`}>
            <div className="step-number">3</div>
            <span>Start Using</span>
          </div>
        </div>

        <div className="sidebar-note">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <p>
            {step === "whatsapp" &&
              "Your WhatsApp Business Account credentials remain with Meta. We only access what you explicitly authorize."}
            {step === "pricing" &&
              "Secure payments powered by Razorpay. All plans include WhatsApp API costs."}
            {step === "complete" &&
              "You can manage your subscription from the dashboard settings."}
          </p>
        </div>
      </div>

      {/* Right Panel - Dynamic Content Based on Step */}
      <div className="onboarding-main onboarding-main-embedded">
        {/* Mobile Header */}
        <div className="mobile-header">
          <img src="/logo.png" alt="Flowauxi Logo" />
          <span>Flowauxi</span>
        </div>

        {/* Main Content */}
        <div className="embedded-content">
          {step === "whatsapp" && (
            <WhatsAppEmbeddedSignupForm
              onSuccess={handleConnectionSuccess}
              onError={handleConnectionError}
            />
          )}

          {step === "pricing" && (
            <div className="pricing-step">
              <h2>Select Your Plan</h2>
              <p className="pricing-subtitle">
                WhatsApp connected! Now choose a plan to activate your AI
                assistant.
              </p>

              {paymentError && (
                <div className="payment-error">
                  <p>{paymentError}</p>
                  <button onClick={() => setPaymentError(null)}>✕</button>
                </div>
              )}

              <div className="pricing-cards-grid">
                {PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    className={`pricing-card ${plan.popular ? "popular" : ""}`}
                  >
                    {plan.popular && (
                      <div className="popular-badge">Most Popular</div>
                    )}
                    <h3>{plan.name}</h3>
                    <p className="plan-description">{plan.description}</p>
                    <div className="plan-price">
                      <span className="price">{plan.priceDisplay}</span>
                      <span className="period">/month</span>
                    </div>
                    <ul className="plan-features">
                      {plan.features.map((feature, idx) => (
                        <li key={idx}>
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      className={`plan-button ${plan.popular ? "primary" : ""}`}
                      onClick={() => handleSelectPlan(plan.id)}
                      disabled={paymentLoading !== null}
                    >
                      {paymentLoading === plan.id
                        ? "Processing..."
                        : "Select Plan"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "complete" && (
            <div className="success-message">
              <div className="success-icon">🎉</div>
              <h2>You're All Set!</h2>
              <p>
                Your WhatsApp AI assistant is ready. Redirecting to dashboard...
              </p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .onboarding-steps {
          margin-top: 40px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .step-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
        }

        .step-item.active {
          background: rgba(34, 193, 90, 0.15);
          border: 1px solid rgba(34, 193, 90, 0.3);
        }

        .step-item.completed {
          opacity: 0.7;
        }

        .step-number {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          color: white;
        }

        .step-item.active .step-number {
          background: #22c15a;
        }

        .step-item.completed .step-number {
          background: #22c15a;
        }

        .step-item span {
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
        }

        .sidebar-note {
          position: absolute;
          bottom: 30px;
          left: 0;
          right: 0;
          padding: 0 2.5rem;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .sidebar-note svg {
          flex-shrink: 0;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 2px;
        }

        .sidebar-note p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.6);
        }

        .pricing-step {
          width: 100%;
          max-width: 1200px;
          padding: 40px 20px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .pricing-step h2 {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 12px;
          color: var(--text-primary, #111);
          text-align: center;
        }

        .pricing-subtitle {
          color: var(--text-secondary, #6b7280);
          margin: 0 0 40px;
          font-size: 16px;
          text-align: center;
        }

        .payment-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 24px;
        }

        .payment-error p {
          margin: 0;
          color: #dc2626;
          font-size: 14px;
        }

        .payment-error button {
          background: none;
          border: none;
          color: #dc2626;
          cursor: pointer;
          font-size: 18px;
        }

        .pricing-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          max-width: 1100px;
          margin: 0 auto;
        }

        @media (max-width: 1024px) {
          .pricing-cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
          }
        }

        @media (max-width: 768px) {
          .onboarding-main-embedded {
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            height: auto !important;
            min-height: auto !important;
          }

          .embedded-content {
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            align-items: flex-start;
            display: block;
            padding-bottom: 40px;
          }

          .pricing-step {
            padding: 20px 16px 40px;
            width: 100%;
            min-height: auto !important;
          }

          .pricing-step h2 {
            font-size: 24px;
          }

          .pricing-cards-grid {
            grid-template-columns: 1fr;
            gap: 20px;
            width: 100%;
            display: flex !important;
            flex-direction: column;
          }

          .pricing-card {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto;
          }
        }

        .pricing-card {
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 20px;
          padding: 32px 28px;
          position: relative;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          min-width: 280px;
        }

        .pricing-card:hover {
          border-color: #22c15a;
          transform: translateY(-6px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
        }

        .pricing-card.popular {
          border-color: #22c15a;
          background: linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%);
        }

        .popular-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #22c15a 0%, #10b981 100%);
          color: white;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .pricing-card h3 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 4px;
          color: #111;
        }

        .plan-description {
          color: #6b7280;
          font-size: 15px;
          margin: 0 0 20px;
          line-height: 1.4;
        }

        .plan-price {
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid #f3f4f6;
        }

        .plan-price .price {
          font-size: 36px;
          font-weight: 800;
          color: #111;
          letter-spacing: -0.02em;
        }

        .plan-price .period {
          font-size: 16px;
          color: #6b7280;
          font-weight: 500;
        }

        .plan-features {
          list-style: none;
          padding: 0;
          margin: 0 0 28px;
          flex: 1;
        }

        .plan-features li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 0;
          font-size: 14px;
          color: #374151;
          line-height: 1.5;
        }

        .plan-features li svg {
          width: 16px;
          height: 16px;
          color: #22c15a;
          flex-shrink: 0;
        }

        .plan-button {
          width: 100%;
          padding: 14px;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          background: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .plan-button:hover {
          border-color: #22c15a;
          background: #f0fdf4;
        }

        .plan-button.primary {
          background: #111;
          border-color: #111;
          color: white;
        }

        .plan-button.primary:hover {
          background: #22c15a;
          border-color: #22c15a;
        }

        .plan-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .success-message {
          text-align: center;
          padding: 60px 40px;
          background: var(--card-bg, rgba(255, 255, 255, 0.05));
          border-radius: 16px;
          border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        }

        .success-icon {
          font-size: 64px;
          margin-bottom: 24px;
        }

        .success-message h2 {
          color: #10b981;
          margin: 0 0 12px;
          font-size: 24px;
        }

        .success-message p {
          color: var(--text-secondary);
          margin: 0;
        }
      `}</style>
    </div>
  );
}
