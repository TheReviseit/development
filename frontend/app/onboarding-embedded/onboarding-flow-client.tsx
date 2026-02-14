/**
 * ONBOARDING FLOW CLIENT COMPONENT
 * ==================================
 * Full client-side onboarding flow with:
 * - Firebase authentication
 * - WhatsApp connection
 * - Pricing plan selection
 * - Razorpay payment integration
 *
 * Receives product and pricing from Server Component (no client-side domain detection!)
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import WhatsAppEmbeddedSignupForm from "../components/onboarding/WhatsAppEmbeddedSignupForm";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import {
  createSubscriptionWithRetry,
  openRazorpayCheckout,
  verifyPayment,
  clearPaymentRequestId,
} from "@/lib/api/razorpay";
import type { ProductDomain } from "@/lib/product/types";

// =============================================================================
// TYPES
// =============================================================================

type Step = "whatsapp" | "pricing" | "complete";
type PlanName = "starter" | "business" | "pro";

interface SerializedPlan {
  id: PlanName;
  planId: string; // Unique: "shop_starter"
  name: string;
  price: number;
  priceDisplay: string;
  description: string;
  tagline?: string;
  popular?: boolean;
  features: string[];
}

interface ProductInfo {
  id: ProductDomain;
  name: string;
  description: string;
  tagline?: string;
}

interface OnboardingFlowClientProps {
  productInfo: ProductInfo;
  plans: SerializedPlan[];
}

// =============================================================================
// CLIENT COMPONENT
// =============================================================================

export function OnboardingFlowClient({
  productInfo,
  plans,
}: OnboardingFlowClientProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("whatsapp");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [wabaData, setWabaData] = useState<{
    wabaId: string;
    phoneNumberId: string;
  } | null>(null);

  const router = useRouter();

  // =========================================================================
  // AUTHENTICATION
  // =========================================================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check onboarding status
        const shouldRedirect = await checkOnboardingStatus();
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
      if (onboardingResponse.ok) {
        const data = await onboardingResponse.json();
        if (data.onboarding_complete) {
          router.push("/dashboard");
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      return false;
    }
  };

  // =========================================================================
  // WHATSAPP CONNECTION HANDLERS
  // =========================================================================

  const handleConnectionSuccess = (data: {
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    wabaName: string;
  }) => {
    console.log("✅ WhatsApp connected successfully:", data);
    setWabaData({ wabaId: data.wabaId, phoneNumberId: data.phoneNumberId });
    setConnectionError(null);
    setStep("pricing");
  };

  const handleConnectionError = (error: string) => {
    console.error("❌ WhatsApp connection error:", error);
    setConnectionError(error);
  };

  // =========================================================================
  // PAYMENT HANDLERS
  // =========================================================================

  const handleSelectPlan = async (plan: SerializedPlan) => {
    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    // Reset stale payment state for fresh idempotency keys
    clearPaymentRequestId();

    setPaymentLoading(plan.planId);
    setPaymentError(null);

    try {
      console.log(
        `[Onboarding] Creating subscription for plan: ${plan.planId}`,
      );
      console.log(`[Onboarding] Product: ${productInfo.id}`);

      // ✅ Create subscription — domain resolved server-side from Host header
      const order = await createSubscriptionWithRetry(
        plan.id, // Plan tier: "starter", "business", "pro"
        user.email,
        user.displayName || undefined,
        undefined, // customerPhone
        user.uid,
        2, // maxRetries
      );

      if (!order.success) {
        // Handle error codes
        const errorCode = order.error_code;
        let errorMessage = order.error || "Failed to create subscription";

        if (errorCode === "DUPLICATE_SUBSCRIPTION") {
          errorMessage =
            "You already have an active subscription. Please check your account.";
        } else if (errorCode === "DATABASE_ERROR") {
          errorMessage =
            "We're experiencing technical difficulties. Please contact support.";
        } else if (errorCode === "RAZORPAY_SERVER_ERROR") {
          errorMessage =
            "Payment service is temporarily busy. Please try again in a moment.";
        } else if (errorCode === "RAZORPAY_BAD_REQUEST") {
          errorMessage = "Invalid payment information. Please contact support.";
        }

        setPaymentError(errorMessage);
        setPaymentLoading(null);
        return;
      }

      console.log("[Onboarding] Subscription created:", order.subscription_id);

      // Open Razorpay checkout
      await openRazorpayCheckout({
        subscriptionId: order.subscription_id,
        keyId: order.key_id,
        planName: order.plan_name,
        amount: order.amount,
        customerEmail: user.email,
        customerName: user.displayName || undefined,
        onSuccess: async (response) => {
          console.log("[Razorpay] Payment successful:", response);

          try {
            // Verify payment
            const verification = await verifyPayment(
              {
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              user.uid,
            );

            if (verification.success) {
              // Store onboarding data
              sessionStorage.setItem(
                "pending_onboarding",
                JSON.stringify({
                  whatsappConnected: true,
                  wabaId: wabaData?.wabaId,
                  phoneNumberId: wabaData?.phoneNumberId,
                  subscriptionPlan: plan.id,
                  productId: productInfo.id,
                }),
              );

              // Redirect to payment status page
              router.push(
                `/payment/status?subscription_id=${response.razorpay_subscription_id}`,
              );
            } else {
              setPaymentError(
                verification.error || "Payment verification failed",
              );
              setPaymentLoading(null);
            }
          } catch (error: any) {
            console.error("[Onboarding] Payment verification error:", error);
            setPaymentError(
              "Failed to verify payment. Please contact support.",
            );
            setPaymentLoading(null);
          }
        },
        onError: (err) => {
          console.error("Razorpay payment error:", err);
          const errorMsg =
            err?.description ||
            err?.reason ||
            err?.message ||
            "Payment failed. Please try again.";
          const errorCode = err?.code ? ` (${err.code})` : "";
          setPaymentError(errorMsg + errorCode);
          setPaymentLoading(null);
        },
        onClose: () => {
          console.log("[Razorpay] Payment modal dismissed");
          clearPaymentRequestId();
          setPaymentLoading(null);
        },
      });
    } catch (error: any) {
      console.error("[Onboarding] Error creating subscription:", error);
      setPaymentError(
        error.message || "Failed to create subscription. Please try again.",
      );
      setPaymentLoading(null);
    }
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  if (loading) {
    return (
      <div className="loading-container">
        <SpaceshipLoader />
      </div>
    );
  }

  return (
    <div className="onboarding-flow">
      {/* Header */}
      <div className="onboarding-header">
        <h1 className="onboarding-title">{productInfo.name}</h1>
        {productInfo.tagline && (
          <p className="onboarding-tagline">{productInfo.tagline}</p>
        )}
        <p className="onboarding-description">{productInfo.description}</p>
      </div>

      {/* Step Indicator */}
      <div className="steps-indicator">
        <div
          className={`step ${step === "whatsapp" ? "active" : step === "pricing" || step === "complete" ? "complete" : ""}`}
        >
          <div className="step-number">1</div>
          <div className="step-label">Connect WhatsApp</div>
        </div>
        <div className="step-divider"></div>
        <div
          className={`step ${step === "pricing" ? "active" : step === "complete" ? "complete" : ""}`}
        >
          <div className="step-number">2</div>
          <div className="step-label">Choose Plan</div>
        </div>
        <div className="step-divider"></div>
        <div className={`step ${step === "complete" ? "active" : ""}`}>
          <div className="step-number">3</div>
          <div className="step-label">Complete</div>
        </div>
      </div>

      {/* Step Content */}
      {step === "whatsapp" && (
        <div className="step-content whatsapp-step">
          <div className="step-card">
            <h2 className="step-title">Connect Your WhatsApp Business</h2>
            <p className="step-subtitle">
              Connect your WhatsApp Business account to start automating
              customer conversations
            </p>

            {connectionError && (
              <div className="error-banner">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{connectionError}</span>
              </div>
            )}

            <WhatsAppEmbeddedSignupForm
              onSuccess={handleConnectionSuccess}
              onError={handleConnectionError}
            />
          </div>
        </div>
      )}

      {step === "pricing" && (
        <div className="step-content pricing-step">
          <div className="step-card">
            <h2 className="step-title">Choose Your Plan</h2>
            <p className="step-subtitle">
              Select the perfect plan for your business needs
            </p>

            {paymentError && (
              <div className="error-banner">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{paymentError}</span>
              </div>
            )}

            <div className="pricing-cards-grid">
              {plans.map((plan) => (
                <div
                  key={plan.planId}
                  className={`pricing-card ${plan.popular ? "popular" : ""}`}
                >
                  {plan.popular && (
                    <div className="popular-badge">Most Popular</div>
                  )}

                  <div className="plan-header">
                    <h3 className="plan-name">{plan.name}</h3>
                    <div className="plan-price">
                      <span className="price-amount">{plan.priceDisplay}</span>
                      <span className="price-period">/month</span>
                    </div>
                    {plan.tagline && (
                      <p className="plan-tagline">{plan.tagline}</p>
                    )}
                    <p className="plan-description">{plan.description}</p>
                  </div>

                  <ul className="plan-features">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="feature-item">
                        <svg
                          className="feature-icon"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span className="feature-text">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`plan-button ${plan.popular ? "primary" : ""}`}
                    onClick={() => handleSelectPlan(plan)}
                    disabled={paymentLoading === plan.planId}
                  >
                    {paymentLoading === plan.planId ? (
                      <>
                        <span className="spinner"></span>
                        Processing...
                      </>
                    ) : (
                      `Select ${plan.name}`
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === "complete" && (
        <div className="step-content complete-step">
          <div className="success-message">
            <div className="success-icon">✅</div>
            <h2>Onboarding Complete!</h2>
            <p>Redirecting to your dashboard...</p>
          </div>
        </div>
      )}

      {/* Inline styles for step indicator */}
      <style jsx>{`
        .steps-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin: 40px 0;
          padding: 0 20px;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .step-number {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #e5e7eb;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .step.active .step-number {
          background: #22c15a;
          color: white;
        }

        .step.complete .step-number {
          background: #10b981;
          color: white;
        }

        .step-label {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }

        .step.active .step-label {
          color: #111;
          font-weight: 600;
        }

        .step-divider {
          width: 60px;
          height: 2px;
          background: #e5e7eb;
        }

        @media (max-width: 640px) {
          .step-label {
            display: none;
          }

          .step-divider {
            width: 30px;
          }
        }
      `}</style>
    </div>
  );
}
