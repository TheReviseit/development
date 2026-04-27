/**
 * Simplified Onboarding Page - WhatsApp Connection + Pricing Flow
 *
 * Flow:
 * 1. Connect WhatsApp Business (Embedded Signup)
 * 2. Choose pricing plan and pay
 * 3. Redirect to dashboard
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import WhatsAppEmbeddedSignupForm from "../components/onboarding/WhatsAppEmbeddedSignupForm";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import {
  createSubscription,
  createSubscriptionWithRetry,
  openRazorpayCheckout,
  verifyPayment,
  clearPaymentRequestId,
} from "../../lib/api/razorpay";
import { detectDomainFromWindow } from "@/lib/pricing/domain-detection";
import { getPricingForDomain } from "@/lib/pricing/pricing-engine";
import { getDomainVisibility } from "@/lib/domain/config";
import type { ProductDomain } from "@/lib/pricing/pricing-config";
import "../onboarding/onboarding.css";
import "./onboarding-embedded.css";
import OnboardingPricingReplica, {
  type OnboardingPricingPlan,
} from "./OnboardingPricingReplica";

type Step = "whatsapp" | "pricing" | "complete";
type PlanName = OnboardingPricingPlan["id"];

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

  // Domain-based pricing
  const [currentDomain, setCurrentDomain] =
    useState<ProductDomain>("dashboard");
  const [PLANS, setPLANS] = useState<OnboardingPricingPlan[]>([]);
  // Whether the current domain requires WhatsApp connection
  // Read from lib/domain/config.ts — single source of truth
  const [whatsappRequired, setWhatsappRequired] = useState(true);
  // Whether to show the WhatsApp connect step even if optional (shop)
  const [showWhatsappStep, setShowWhatsappStep] = useState(true);

  // Guard: prevent concurrent/duplicate trial start API calls
  const trialStartInProgressRef = useRef(false);

  const router = useRouter();

  // Detect domain and load pricing on mount
  useEffect(() => {
    const domain = detectDomainFromWindow();
    setCurrentDomain(domain);

    // Read WhatsApp requirement from centralized config
    const domainConfig = getDomainVisibility(domain as any);
    const domainRequiresWhatsApp = domainConfig.requiresWhatsApp;
    setWhatsappRequired(domainRequiresWhatsApp);
    // Offer WhatsApp connect step for shop onboarding even if optional
    setShowWhatsappStep(domainRequiresWhatsApp || domain === "shop");

    const domainPricing = getPricingForDomain(domain);
    const plans: OnboardingPricingPlan[] = domainPricing.plans.map((plan) => ({
      id: plan.id as PlanName,
      name: plan.name,
      priceDisplay: plan.priceDisplay,
      description: plan.description,
      popular: plan.popular,
      features: plan.features as string[],
      tagline: plan.tagline,
    }));
    setPLANS(plans);
  }, []);

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
    // CACHE BUST: v6-domain-aware-whatsapp — domain-aware WhatsApp check
    console.log(
      "[onboarding-embedded] checkOnboardingStatus START - v6-domain-aware",
    );
    try {
      const onboardingResponse = await fetch("/api/onboarding/check");

      // Handle 503 Service Unavailable - server can't verify, retry with backoff
      if (onboardingResponse.status === 503) {
        console.warn("[onboarding-embedded] Onboarding check 503, retrying...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return checkOnboardingStatus(); // Simple retry once
      }

      if (!onboardingResponse.ok) {
        console.error(
          "[onboarding-embedded] Onboarding check failed:",
          onboardingResponse.status,
        );
        return false; // Show onboarding page on error
      }

      const onboardingData = await onboardingResponse.json();

      // Read domain config for WhatsApp requirement
      const domain = detectDomainFromWindow();
      const domainConfig = getDomainVisibility(domain as any);
      const domainRequiresWhatsApp = domainConfig.requiresWhatsApp;
      const shouldShowWhatsappStep = domainRequiresWhatsApp || domain === "shop";

      console.log("[onboarding-embedded] Received data:", {
        onboardingCompleted: onboardingData.onboardingCompleted,
        hasActiveSubscription: onboardingData.hasActiveSubscription,
        hasActiveTrial: onboardingData.hasActiveTrial,
        whatsappConnected: onboardingData.whatsappConnected,
        currentDomain: domain,
        domainRequiresWhatsApp,
      });

      // v4: Handle "error" as explicit third state
      const hasErrors =
        onboardingData.whatsappConnected === "error" ||
        onboardingData.hasActiveSubscription === "error" ||
        onboardingData.hasActiveTrial === "error";

      if (hasErrors) {
        console.error("[onboarding-embedded] Errors in response:", {
          whatsappConnected: onboardingData.whatsappConnected,
          hasActiveSubscription: onboardingData.hasActiveSubscription,
          hasActiveTrial: onboardingData.hasActiveTrial,
        });
        setStep(shouldShowWhatsappStep ? "whatsapp" : "pricing");
        return false;
      }

      // v4: Use trial as equivalent to subscription for dashboard access
      const hasProductAccess =
        onboardingData.hasActiveSubscription === true ||
        onboardingData.hasActiveTrial === true;

      // Determine if WhatsApp requirement is satisfied
      const whatsappSatisfied = !domainRequiresWhatsApp || onboardingData.whatsappConnected === true;

      console.log("[onboarding-embedded] Decision values:", {
        hasProductAccess,
        hasActiveSubscription: onboardingData.hasActiveSubscription,
        hasActiveTrial: onboardingData.hasActiveTrial,
        whatsappConnected: onboardingData.whatsappConnected,
        domainRequiresWhatsApp,
        whatsappSatisfied,
      });

      // CRITICAL FIX (v6): For domains that DON'T require WhatsApp,
      // redirect to dashboard if user has product access — don't check WhatsApp.
      if (hasProductAccess && whatsappSatisfied) {
        console.log(
          "[onboarding-embedded] Has product access AND WhatsApp satisfied, redirecting to dashboard",
        );
        router.push("/dashboard");
        return true;
      }

      console.log("[onboarding-embedded] NOT redirecting - showing onboarding");

      // Decide which step to show:
      // - If WhatsApp step is not shown for this domain: pricing
      // - If shown and already connected: pricing
      // - If shown and not connected: WhatsApp connect (required or optional)
      if (!shouldShowWhatsappStep) {
        setStep("pricing");
      } else if (onboardingData.whatsappConnected === true) {
        setStep("pricing");
      } else {
        setStep("whatsapp");
      }

      return false;
    } catch (error) {
      console.error("[onboarding-embedded] Error:", error);
      // Fail-safe: keep user on a deterministic step instead of blank UI
      setStep(showWhatsappStep ? "whatsapp" : "pricing");
      return false;
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

  const handleSelectFreeTrial = async () => {
    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    // Guard: prevent concurrent/duplicate calls (e.g., double-click,
    // React StrictMode double-invoke, or redirect-loop re-mount)
    if (trialStartInProgressRef.current) {
      console.warn(
        "[trial] Start already in progress, ignoring duplicate call",
      );
      return;
    }
    trialStartInProgressRef.current = true;

    setPaymentLoading("starter");
    setPaymentError(null);

    try {
      // Start the free trial via internal API
      const response = await fetch("/api/trials/internal/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Api-Key": process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "",
        },
        body: JSON.stringify({
          user_id: user.uid,
          org_id: user.uid,
          email: user.email,
          plan_slug: "starter",
          domain: currentDomain,
          source: "shop",
        }),
      });

      const result = await response.json();

      // Both new trials AND existing trials (is_existing) are success cases.
      // The backend returns is_existing: true when the trial already exists
      // and access_granted: true when user_products was written atomically.
      if (result.success && (result.trial || result.is_existing)) {
        // Store onboarding data
        sessionStorage.setItem(
          "pending_onboarding",
          JSON.stringify({
            whatsappConnected: true,
            wabaId: wabaData?.wabaId,
            phoneNumberId: wabaData?.phoneNumberId,
            subscriptionPlan: "starter",
            trialStarted: true,
          }),
        );

        // Redirect to dashboard with success message
        router.push("/dashboard?trial_started=true");
      } else if (result.error === "TRIAL_EXISTS") {
        // Legacy fallback for older backend responses
        // Still a success case — user has a trial, just go to dashboard
        router.push("/dashboard?trial_started=true");
      } else {
        setPaymentError(
          result.message || "Failed to start free trial. Please try again.",
        );
        setPaymentLoading(null);
        // Allow retry on terminal failure
        trialStartInProgressRef.current = false;
      }
    } catch (err) {
      console.error("Free trial error:", err);
      setPaymentError("Something went wrong. Please try again.");
      setPaymentLoading(null);
      // Allow retry on terminal failure
      trialStartInProgressRef.current = false;
    }
  };

  const handleSelectPlan = async (planId: PlanName) => {
    // Handle free trial for Starter plan
    if (planId === "starter") {
      return handleSelectFreeTrial();
    }

    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    // Reset stale payment state so each plan selection gets fresh idempotency keys
    clearPaymentRequestId();

    setPaymentLoading(planId);
    setPaymentError(null);

    try {
      // Create subscription order with automatic retry for transient errors
      const order = await createSubscriptionWithRetry(
        planId,
        user.email,
        user.displayName || undefined,
        undefined, // customerPhone
        user.uid,
        2, // maxRetries - Max 2 retries (total 3 attempts)
      );

      if (!order.success) {
        // Provide user-friendly error messages based on error code
        const errorCode = order.error_code;
        let errorMessage = order.error || "Failed to create subscription";

        // Customize message based on error type
        if (errorCode === "USER_NOT_FOUND") {
          errorMessage =
            "Your account setup is incomplete. Please sign out and sign in again to complete setup.";
        } else if (errorCode === "DUPLICATE_SUBSCRIPTION") {
          errorMessage =
            "You already have an active subscription for this plan. Please check your account.";
        } else if (errorCode === "USE_UPGRADE_FLOW") {
          errorMessage =
            "You already have an active subscription. Please use the upgrade flow to change plans.";
        } else if (errorCode === "DATABASE_ERROR") {
          errorMessage =
            "We're experiencing technical difficulties. Please contact support.";
        } else if (errorCode === "RAZORPAY_SERVER_ERROR") {
          errorMessage =
            "Payment service is temporarily busy. Please try again in a moment.";
        } else if (errorCode === "RAZORPAY_BAD_REQUEST") {
          errorMessage = "Invalid payment information. Please contact support.";
        } else if (
          errorCode === "PLAN_NOT_FOUND" ||
          errorCode === "PRICING_UNAVAILABLE"
        ) {
          errorMessage =
            "This plan is not available yet. Please contact support or try again later.";
        }

        setPaymentError(errorMessage);
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
          // Clear payment state so they can select a different plan
          console.log(
            "Payment modal closed by user without completing payment",
          );
          clearPaymentRequestId();
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

  const isPricingStep = step === "pricing";

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
            {step === "whatsapp" &&
              showWhatsappStep &&
              (whatsappRequired
                ? "Connect WhatsApp Business"
                : "Connect WhatsApp (Optional)")}
            {step === "pricing" && "Choose Your Plan"}
            {step === "complete" && "Setup Complete!"}
          </h1>
          <p className="sidebar-description">
            {step === "whatsapp" && showWhatsappStep &&
              "Connect your WhatsApp Business Account in one simple step using Meta's official Embedded Signup flow."}
            {step === "pricing" &&
              "Select a plan that fits your business needs. You can upgrade or downgrade anytime."}
            {step === "complete" &&
              "Your account is ready! Redirecting to your dashboard..."}
          </p>
        </div>

        {/* Step Indicator — adapts dynamically based on domain */}
        <div className="onboarding-steps">
          {showWhatsappStep && (
            <div
              className={`step-item ${step === "whatsapp" ? "active" : "completed"}`}
            >
              <div className="step-number">{step === "whatsapp" ? "1" : "✓"}</div>
              <span>
                {whatsappRequired
                  ? "Connect WhatsApp"
                  : "Connect WhatsApp (Optional)"}
              </span>
            </div>
          )}
          <div
            className={`step-item ${step === "pricing" ? "active" : step === "complete" ? "completed" : ""}`}
          >
            <div className="step-number">{step === "complete" ? "✓" : showWhatsappStep ? "2" : "1"}</div>
            <span>Choose Plan</span>
          </div>
          <div className={`step-item ${step === "complete" ? "active" : ""}`}>
            <div className="step-number">{showWhatsappStep ? "3" : "2"}</div>
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
            {step === "whatsapp" && showWhatsappStep &&
              "Your WhatsApp Business Account credentials remain with Meta. We only access what you explicitly authorize."}
            {step === "pricing" &&
              "Secure payments powered by Razorpay. All plans include WhatsApp API costs."}
            {step === "complete" &&
              "You can manage your subscription from the dashboard settings."}
          </p>
        </div>
      </div>

      {/* Right Panel - Dynamic Content Based on Step */}
      <div
        className={`onboarding-main onboarding-main-embedded ${isPricingStep ? "onboarding-main-embedded--pricing" : ""}`}
      >
        {/* Mobile Header */}
        <div className="mobile-header">
          <img src="/logo.png" alt="Flowauxi Logo" />
          <span>Flowauxi</span>
        </div>

        {/* Main Content */}
        <div
          className={`embedded-content ${isPricingStep ? "embedded-content--pricing" : ""}`}
        >
          {step === "whatsapp" && (
            <WhatsAppEmbeddedSignupForm
              onSuccess={handleConnectionSuccess}
              onError={handleConnectionError}
            />
          )}

          {step === "pricing" && (
            <OnboardingPricingReplica
              plans={PLANS}
              paymentLoading={paymentLoading}
              paymentError={paymentError}
              onDismissError={() => setPaymentError(null)}
              onSelectPlan={(planId) => handleSelectPlan(planId)}
            />
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
    </div>
  );
}
