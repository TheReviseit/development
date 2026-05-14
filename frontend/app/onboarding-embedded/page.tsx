/**
 * Simplified Onboarding Page - WhatsApp Connection + Pricing Flow
 *
 * Flow:
 * 1. Connect WhatsApp Business (Embedded Signup)
 * 2. Choose pricing plan and pay
 * 3. Redirect to dashboard
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  ArrowUpRight,
  Headphones,
  Instagram,
  Linkedin,
  Mail,
  Phone,
  Send,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { auth } from "@/src/firebase/firebase";
import WhatsAppEmbeddedSignupForm from "../components/onboarding/WhatsAppEmbeddedSignupForm";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import {
  clearPaymentRequestId,
  createSubscriptionWithRetry,
  openRazorpayCheckout,
  verifyPayment,
} from "../../lib/api/razorpay";
import { detectDomainFromWindow } from "@/lib/pricing/domain-detection";
import { getPricingForDomain } from "@/lib/pricing/pricing-engine";
import { getDomainVisibility } from "@/lib/domain/config";
import type { ProductDomain } from "@/lib/pricing/pricing-config";
import {
  CONTACT_CONFIG,
  getMailtoLink,
  getTelLink,
} from "@/config/contact";
import "../onboarding/onboarding.css";
import "./onboarding-embedded.css";
import OnboardingPricingReplica, {
  type OnboardingPricingPlan,
} from "./OnboardingPricingReplica";

type Step = "whatsapp" | "pricing" | "complete";
type PlanName = OnboardingPricingPlan["id"];

interface SupportContactItem {
  id: string;
  title: string;
  description: string;
  href: string;
  label: string;
  Icon: LucideIcon;
}

function SupportContactList({
  items,
  className,
  itemClassName = "",
  linkTabIndex,
}: {
  items: SupportContactItem[];
  className: string;
  itemClassName?: string;
  linkTabIndex?: number;
}) {
  return (
    <div className={className}>
      {items.map(({ id, Icon, title, description, href, label }) => (
        <section
          key={id}
          className={`support-panel-section ${itemClassName}`.trim()}
        >
          <div className="support-section-icon" aria-hidden="true">
            <Icon size={15} strokeWidth={2.4} />
          </div>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
            <a href={href} tabIndex={linkTabIndex}>
              {label}
            </a>
          </div>
        </section>
      ))}
    </div>
  );
}

function SupportSocialLinks({
  className = "support-socials",
  linkTabIndex,
}: {
  className?: string;
  linkTabIndex?: number;
}) {
  return (
    <div className={className} aria-label="Flowauxi links">
      <a
        href="https://www.flowauxi.com"
        aria-label="Flowauxi website"
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={linkTabIndex}
      >
        <ArrowUpRight size={19} strokeWidth={2.35} />
      </a>
      <a
        href="https://linkedin.com/company/flowauxi"
        aria-label="Flowauxi LinkedIn"
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={linkTabIndex}
      >
        <Linkedin size={18} strokeWidth={2.3} />
      </a>
      <a
        href="https://www.instagram.com/flowauxi/"
        aria-label="Flowauxi Instagram"
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={linkTabIndex}
      >
        <Instagram size={18} strokeWidth={2.3} />
      </a>
    </div>
  );
}

function OnboardingSupportPanel() {
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const salesEmail = CONTACT_CONFIG.salesEmail || "sales@flowauxi.com";
  const supportEmail = CONTACT_CONFIG.supportEmail || CONTACT_CONFIG.email;
  const phoneLabel = CONTACT_CONFIG.phoneFormatted;
  const businessHours =
    CONTACT_CONFIG.businessHours?.schedule || "Monday to Friday, 9 AM to 6 PM";
  const supportItems: SupportContactItem[] = [
    {
      id: "sales",
      title: "Chat to sales",
      description: "Interested in switching? Speak to our team.",
      href: getMailtoLink(salesEmail),
      label: salesEmail,
      Icon: Send,
    },
    {
      id: "email",
      title: "Email support",
      description: "We'll get back to you within 24 hours.",
      href: getMailtoLink(supportEmail),
      label: supportEmail,
      Icon: Mail,
    },
    {
      id: "phone",
      title: "Call us",
      description: businessHours,
      href: getTelLink(),
      label: phoneLabel,
      Icon: Phone,
    },
  ];

  useEffect(() => {
    if (!isSupportOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalOverflowPriority =
      document.body.style.getPropertyPriority("overflow");
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSupportOpen(false);
      }
    };

    document.body.style.setProperty("overflow", "hidden", "important");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (originalOverflow) {
        document.body.style.setProperty(
          "overflow",
          originalOverflow,
          originalOverflowPriority,
        );
      } else {
        document.body.style.removeProperty("overflow");
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSupportOpen]);

  return (
    <>
      <aside className="onboarding-support-panel" aria-label="Flowauxi support">
        <div className="support-panel-header">
          <div className="support-panel-brand">
            <Image src="/logo.png" alt="Flowauxi Logo" width={26} height={26} />
            <span>Flowauxi</span>
          </div>

          <button
            type="button"
            className="mobile-support-trigger"
            aria-label="Open support"
            aria-expanded={isSupportOpen}
            onClick={() => setIsSupportOpen(true)}
          >
            <Headphones size={18} strokeWidth={2.25} />
          </button>
        </div>

        <SupportContactList
          items={supportItems}
          className="support-panel-sections"
        />

        <div className="support-panel-footer">
          <SupportSocialLinks />
        </div>
      </aside>

      <div
        className={`mobile-support-overlay ${isSupportOpen ? "open" : ""}`}
        aria-hidden="true"
        onClick={() => setIsSupportOpen(false)}
      />

      <aside
        className={`mobile-support-drawer ${isSupportOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Flowauxi support menu"
        aria-hidden={!isSupportOpen}
      >
        <div className="mobile-support-drawer-header">
          <div className="support-panel-brand">
            <Image src="/logo.png" alt="Flowauxi Logo" width={26} height={26} />
            <span>Flowauxi</span>
          </div>
          <button
            type="button"
            className="mobile-support-close"
            aria-label="Close support"
            tabIndex={isSupportOpen ? 0 : -1}
            onClick={() => setIsSupportOpen(false)}
          >
            <X size={18} strokeWidth={2.3} />
          </button>
        </div>

        <div className="mobile-support-drawer-copy">
          <p>Support</p>
          <h2>Need help with setup?</h2>
          <span>Reach the Flowauxi team from one clean place.</span>
        </div>

        <SupportContactList
          items={supportItems}
          className="mobile-support-sections"
          itemClassName="mobile-support-section"
          linkTabIndex={isSupportOpen ? undefined : -1}
        />

        <div className="mobile-support-footer">
          <SupportSocialLinks
            className="support-socials mobile-support-socials"
            linkTabIndex={isSupportOpen ? undefined : -1}
          />
        </div>
      </aside>
    </>
  );
}

function OnboardingProgress({ step }: { step: Step }) {
  return (
    <div className="onboarding-right-progress" aria-label="Onboarding progress">
      <span className={step === "whatsapp" ? "active" : "complete"} />
      <span
        className={
          step === "pricing" ? "active" : step === "complete" ? "complete" : ""
        }
      />
      <span className={step === "complete" ? "active" : ""} />
    </div>
  );
}

export default function OnboardingPageEmbedded() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("whatsapp");
  const [paymentLoading, setPaymentLoading] = useState<PlanName | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [wabaData, setWabaData] = useState<{
    wabaId: string;
    phoneNumberId: string;
  } | null>(null);

  const [currentDomain, setCurrentDomain] =
    useState<ProductDomain>("dashboard");
  const [plans, setPlans] = useState<OnboardingPricingPlan[]>([]);
  const [showWhatsappStep, setShowWhatsappStep] = useState(true);

  const trialStartInProgressRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const domain = detectDomainFromWindow();
      setCurrentDomain(domain);

      const domainConfig = getDomainVisibility(domain as any);
      const domainRequiresWhatsApp = domainConfig.requiresWhatsApp;
      setShowWhatsappStep(domainRequiresWhatsApp || domain === "shop");

      const domainPricing = getPricingForDomain(domain);
      setPlans(
        domainPricing.plans.map((plan) => ({
          id: plan.id as PlanName,
          name: plan.name,
          priceDisplay: plan.priceDisplay,
          description: plan.description,
          popular: plan.popular,
          features: plan.features as string[],
          tagline: plan.tagline,
        })),
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const checkOnboardingStatus = useCallback(async (): Promise<boolean> => {
    const runCheck = async (): Promise<boolean> => {
    console.log(
      "[onboarding-embedded] checkOnboardingStatus START - v6-domain-aware",
    );

    try {
      const onboardingResponse = await fetch("/api/onboarding/check");

      if (onboardingResponse.status === 503) {
        console.warn("[onboarding-embedded] Onboarding check 503, retrying...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return runCheck();
      }

      if (!onboardingResponse.ok) {
        console.error(
          "[onboarding-embedded] Onboarding check failed:",
          onboardingResponse.status,
        );
        return false;
      }

      const onboardingData = await onboardingResponse.json();
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

      const hasProductAccess =
        onboardingData.hasActiveSubscription === true ||
        onboardingData.hasActiveTrial === true;

      const whatsappSatisfied =
        !domainRequiresWhatsApp || onboardingData.whatsappConnected === true;

      console.log("[onboarding-embedded] Decision values:", {
        hasProductAccess,
        hasActiveSubscription: onboardingData.hasActiveSubscription,
        hasActiveTrial: onboardingData.hasActiveTrial,
        whatsappConnected: onboardingData.whatsappConnected,
        domainRequiresWhatsApp,
        whatsappSatisfied,
      });

      if (hasProductAccess && whatsappSatisfied) {
        console.log(
          "[onboarding-embedded] Has product access and WhatsApp satisfied, redirecting",
        );
        router.push("/dashboard");
        return true;
      }

      console.log("[onboarding-embedded] NOT redirecting - showing onboarding");

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
      setStep(showWhatsappStep ? "whatsapp" : "pricing");
      return false;
    }
  };

    return runCheck();
  }, [router, showWhatsappStep]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const shouldRedirect = await checkOnboardingStatus();
        if (!shouldRedirect) {
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router, checkOnboardingStatus]);

  const handleConnectionSuccess = async (data: {
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    wabaName: string;
  }) => {
    console.log("WhatsApp connected successfully:", data);
    setWabaData({ wabaId: data.wabaId, phoneNumberId: data.phoneNumberId });
    setStep("pricing");
  };

  const handleConnectionError = (error: string) => {
    console.error("WhatsApp connection error:", error);
  };

  const handleSelectFreeTrial = async () => {
    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    if (trialStartInProgressRef.current) {
      console.warn("[trial] Start already in progress, ignoring duplicate call");
      return;
    }
    trialStartInProgressRef.current = true;

    setPaymentLoading("starter");
    setPaymentError(null);

    try {
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

      if (result.success && (result.trial || result.is_existing)) {
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

        router.push("/dashboard?trial_started=true");
      } else if (result.error === "TRIAL_EXISTS") {
        router.push("/dashboard?trial_started=true");
      } else {
        setPaymentError(
          result.message || "Failed to start free trial. Please try again.",
        );
        setPaymentLoading(null);
        trialStartInProgressRef.current = false;
      }
    } catch (err) {
      console.error("Free trial error:", err);
      setPaymentError("Something went wrong. Please try again.");
      setPaymentLoading(null);
      trialStartInProgressRef.current = false;
    }
  };

  const handleSelectPlan = async (planId: PlanName) => {
    if (planId === "starter") {
      return handleSelectFreeTrial();
    }

    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    clearPaymentRequestId();
    setPaymentLoading(planId);
    setPaymentError(null);

    try {
      const order = await createSubscriptionWithRetry(
        planId,
        user.email,
        user.displayName || undefined,
        undefined,
        user.uid,
        2,
      );

      if (!order.success) {
        const errorCode = order.error_code;
        let errorMessage = order.error || "Failed to create subscription";

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

      await openRazorpayCheckout({
        subscriptionId: order.subscription_id,
        keyId: order.key_id,
        planName: order.plan_name,
        amount: order.amount,
        customerEmail: user.email,
        customerName: user.displayName || undefined,
        onSuccess: async (response) => {
          const verification = await verifyPayment(
            {
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
            user.uid,
          );

          if (verification.success) {
            sessionStorage.setItem(
              "pending_onboarding",
              JSON.stringify({
                whatsappConnected: true,
                wabaId: wabaData?.wabaId,
                phoneNumberId: wabaData?.phoneNumberId,
                subscriptionPlan: planId,
              }),
            );

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
    <main className={`onboarding-container onboarding-two-step onboarding-stage-${step}`}>
      <div className="onboarding-shell">
        <OnboardingSupportPanel />

        <section
          className={`onboarding-main onboarding-main-embedded ${isPricingStep ? "onboarding-main-embedded--pricing" : ""}`}
          aria-label="Onboarding setup"
        >
          <OnboardingProgress step={step} />

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
                plans={plans}
                paymentLoading={paymentLoading}
                paymentError={paymentError}
                onDismissError={() => setPaymentError(null)}
                onSelectPlan={(planId) => handleSelectPlan(planId)}
              />
            )}

            {step === "complete" && (
              <div className="success-message">
                <div className="success-icon" aria-hidden="true">
                  OK
                </div>
                <h2>You&apos;re all set</h2>
                <p>
                  Your WhatsApp AI assistant is ready. Redirecting to dashboard...
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
