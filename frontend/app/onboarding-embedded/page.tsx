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

// Module-level guard that survives Strict Mode double-mount in dev.
// Prevents the pre-creation effect from firing twice and causing
// duplicate idempotency keys + checkout_request conflicts.
// (Removed preCreationStarted)
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  ArrowUpRight,
  CheckCircle2,
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
  loadRazorpayInWindow,
  openRazorpayCheckout,
  verifyPayment,
  loadRazorpayScript,
  RazorpayOrder,
} from "../../lib/api/razorpay";
import { trackEvent } from "@/lib/analytics";
import { detectDomainFromWindow } from "@/lib/pricing/domain-detection";
import {
  getDomainVisibility,
  requiresWhatsAppOnboarding,
  type ProductDomain,
} from "@/lib/domain/config";
import {
  getOnboardingCheck,
  getOnboardingDestination,
  invalidateOnboardingCheckCache,
  OnboardingCheckError,
  recordOnboardingRedirect,
} from "@/lib/auth/onboarding-check-client";
import {
  clearInvalidClientSession,
  hardRedirectToLogin,
  isInvalidSessionError,
  isMissingDbUserError,
} from "@/lib/auth/client-session-recovery";
import { CONTACT_CONFIG, getMailtoLink, getTelLink } from "@/config/contact";
import "../onboarding/onboarding.css";
import "./onboarding-embedded.css";
import OnboardingPricingReplica, {
  type OnboardingPricingPlan,
} from "./OnboardingPricingReplica";
import {
  resolvePricingAction,
  resolvePricingModeFromFlag,
  type OnboardingPricingMode,
} from "./pricing-decision";

type Step = "whatsapp" | "pricing" | "complete";
type PlanName = OnboardingPricingPlan["id"];
type OnboardingPreviewMode = "complete" | "whatsapp-success";

interface OnboardingBootstrapResponse {
  success?: boolean;
  domain?: ProductDomain;
  pricing?: {
    plans?: Array<{
      id: string;
      name: string;
      priceDisplay: string;
      description: string;
      features: string[];
      price: number;
      currency: string;
    }>;
  };
  features?: {
    onboardingPricingTrialToggle?: {
      enabled?: boolean;
      updatedAt?: string;
    };
  };
  error?: string;
}

const BOOTSTRAP_CLIENT_CACHE_TTL_MS = 60_000;
const bootstrapClientCache = new Map<
  ProductDomain,
  { expiresAt: number; value: OnboardingBootstrapResponse }
>();
const bootstrapInFlight = new Map<
  ProductDomain,
  Promise<OnboardingBootstrapResponse>
>();

function isPlanName(value: string): value is PlanName {
  return value === "starter" || value === "business" || value === "pro";
}

function getOnboardingPreviewMode(): OnboardingPreviewMode | null {
  if (typeof window === "undefined") return null;

  const preview = new URL(window.location.href).searchParams
    .get("preview")
    ?.trim()
    .toLowerCase();

  if (preview === "complete" || preview === "success" || preview === "done") {
    return "complete";
  }

  if (
    preview === "connected" ||
    preview === "whatsapp-success" ||
    preview === "whatsapp_success"
  ) {
    return "whatsapp-success";
  }

  return null;
}

async function fetchOnboardingBootstrapConfig(
  domain: ProductDomain,
): Promise<{
  domain: ProductDomain;
  plans: OnboardingPricingPlan[];
  trialToggleEnabled: boolean;
}> {
  const payload = await getBootstrapPayload(domain);

  if (!payload.success || !payload.domain) {
    throw new Error(payload.error || "Onboarding configuration is unavailable.");
  }

  const plans = (payload.pricing?.plans || [])
    .filter((plan) => isPlanName(plan.id))
    .map((plan) => ({
      id: plan.id as PlanName,
      name: plan.name,
      priceDisplay: plan.priceDisplay,
      description: plan.description,
      features: plan.features,
      price: plan.price,
      currency: plan.currency,
    }));

  if (plans.length === 0) {
    throw new Error("No active pricing plans are configured for this product.");
  }

  return {
    domain: payload.domain,
    plans,
    trialToggleEnabled:
      payload.features?.onboardingPricingTrialToggle?.enabled === true,
  };
}

async function getBootstrapPayload(
  domain: ProductDomain,
): Promise<OnboardingBootstrapResponse> {
  const cached = bootstrapClientCache.get(domain);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = bootstrapInFlight.get(domain);
  if (pending) {
    return pending;
  }

  const request = fetch(
    `/api/onboarding/bootstrap?domain=${encodeURIComponent(domain)}`,
    {
      credentials: "include",
    },
  )
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as
        | OnboardingBootstrapResponse
        | null;

      if (!response.ok || !payload) {
        throw new Error(
          payload?.error ||
            `Onboarding configuration failed with ${response.status}`,
        );
      }

      bootstrapClientCache.set(domain, {
        value: payload,
        expiresAt: Date.now() + BOOTSTRAP_CLIENT_CACHE_TTL_MS,
      });

      return payload;
    })
    .finally(() => {
      bootstrapInFlight.delete(domain);
    });

  bootstrapInFlight.set(domain, request);
  return request;
}

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
  const [previewMode] = useState<OnboardingPreviewMode | false>(
    () => getOnboardingPreviewMode() ?? false,
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("whatsapp");
  const [paymentLoading, setPaymentLoading] = useState<PlanName | null>(null);
  const [billingRedirectInProgress, setBillingRedirectInProgress] =
    useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [wabaData, setWabaData] = useState<{
    wabaId: string;
    phoneNumberId: string;
  } | null>(null);

  const [currentDomain, setCurrentDomain] =
    useState<ProductDomain>("dashboard");
  const [plans, setPlans] = useState<OnboardingPricingPlan[]>([]);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingConfigError, setPricingConfigError] = useState<string | null>(
    null,
  );
  const [pricingMode, setPricingMode] = useState<OnboardingPricingMode>("paid");
  const [trialToggleEnabled, setTrialToggleEnabled] = useState(false);

  const trialStartInProgressRef = useRef(false);
  const billingActionInProgressRef = useRef(false);
  const pricingViewedRef = useRef(false);
  const cachedOrdersRef = useRef<Map<PlanName, RazorpayOrder>>(new Map());

  const router = useRouter();

  useEffect(() => {
    const activePreviewMode = getOnboardingPreviewMode() ?? previewMode;

    if (activePreviewMode) {
      setStep(activePreviewMode === "complete" ? "complete" : "whatsapp");
      setLoading(false);
    }
  }, [previewMode]);

  useEffect(() => {
    loadRazorpayScript().catch((err) => console.error("Failed to preload Razorpay SDK", err));
  }, []);

  const releaseBillingAction = useCallback(() => {
    setPaymentLoading(null);
    setBillingRedirectInProgress(false);
    trialStartInProgressRef.current = false;
    billingActionInProgressRef.current = false;
  }, []);

  const loadBootstrapConfig = useCallback(async () => {
    const activePreviewMode = getOnboardingPreviewMode() ?? previewMode;
    const domain = detectDomainFromWindow();
    setCurrentDomain(domain);

    if (activePreviewMode !== false) {
      setPricingLoading(false);
      setPricingConfigError(null);
      return;
    }

    setPricingLoading(true);
    setPricingConfigError(null);

    try {
      const pricing = await fetchOnboardingBootstrapConfig(domain);

      if (pricing.domain !== domain) {
        console.warn("[pricing] Domain mismatch while loading config", {
          detectedDomain: domain,
          pricingDomain: pricing.domain,
        });
        throw new Error("Pricing domain mismatch. Please refresh and try again.");
      }

      setPlans(pricing.plans);
      setTrialToggleEnabled(pricing.trialToggleEnabled);
      setPricingMode((currentMode) =>
        resolvePricingModeFromFlag({
          requestedMode: currentMode,
          flagEnabled: pricing.trialToggleEnabled,
        }),
      );
    } catch (error) {
      console.error("[pricing] Failed to load onboarding config", error);
      setPlans([]);
      setTrialToggleEnabled(false);
      setPricingMode("paid");
      setPricingConfigError(
        error instanceof Error
          ? error.message
          : "Pricing is not configured for this product.",
      );
    } finally {
      setPricingLoading(false);
    }
  }, [previewMode]);

  const checkOnboardingStatus = useCallback(async (): Promise<boolean> => {
    const runCheck = async (attempt = 0): Promise<boolean> => {
      console.log(
        "[onboarding-embedded] checkOnboardingStatus START - v6-domain-aware",
      );

      try {
        let onboardingData;
        try {
          onboardingData = await getOnboardingCheck({ force: attempt > 0 });
        } catch (error) {
          if (isMissingDbUserError(error)) {
            await clearInvalidClientSession("ONBOARDING_USER_NOT_FOUND");
            hardRedirectToLogin("account_not_found");
            return true;
          }

          if (isInvalidSessionError(error)) {
            await clearInvalidClientSession("ONBOARDING_INVALID_SESSION");
            hardRedirectToLogin("session_expired");
            return true;
          }

          if (error instanceof OnboardingCheckError && error.status === 503) {
            if (attempt >= 2) {
              console.error(
                "[onboarding-embedded] Onboarding check 503 after bounded retries; clearing session",
              );
              await clearInvalidClientSession("ONBOARDING_CHECK_UNAVAILABLE");
              hardRedirectToLogin("auth_error");
              return true;
            }

            console.warn(
              "[onboarding-embedded] Onboarding check 503, retrying...",
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 700 * Math.pow(2, attempt)),
            );
            return runCheck(attempt + 1);
          }

          console.error(
            "[onboarding-embedded] Onboarding check failed:",
            error instanceof OnboardingCheckError ? error.status : error,
          );
          setStep(
            requiresWhatsAppOnboarding(detectDomainFromWindow())
              ? "whatsapp"
              : "pricing",
          );
          return false;
        }

        const domain = detectDomainFromWindow();
        const domainConfig = getDomainVisibility(domain);
        const domainRequiresWhatsApp = domainConfig.requiresWhatsApp;
        const shouldShowWhatsappStep = requiresWhatsAppOnboarding(domain);

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

        const destination = getOnboardingDestination(onboardingData, domain);

        console.log("[onboarding-embedded] Decision values:", {
          hasProductAccess: onboardingData.hasProductAccess,
          hasActiveSubscription: onboardingData.hasActiveSubscription,
          hasActiveTrial: onboardingData.hasActiveTrial,
          whatsappConnected: onboardingData.whatsappConnected,
          domainRequiresWhatsApp,
          shouldShowWhatsappStep,
          whatsappSatisfied: onboardingData.whatsappSatisfied,
          canEnterDashboard: onboardingData.canEnterDashboard,
          nextPath: destination,
          reason: onboardingData.reason,
        });

        if (destination.startsWith("/home")) {
          const loop = recordOnboardingRedirect(destination);
          if (loop.suppress) {
            console.warn(
              "[onboarding-embedded] Redirect loop detected; refreshing onboarding state and holding setup screen",
            );
            invalidateOnboardingCheckCache(domain);
            const refreshed = await getOnboardingCheck({
              product: domain,
              force: true,
            });
            const refreshedDestination = getOnboardingDestination(
              refreshed,
              domain,
            );

            if (!refreshedDestination.startsWith("/home")) {
              setStep(
                refreshed.requiresWhatsApp &&
                  refreshed.whatsappConnected !== true
                  ? "whatsapp"
                  : "pricing",
              );
              return false;
            }

            setStep("whatsapp");
            return false;
          }

          console.log(
            "[onboarding-embedded] Server decision allows dashboard, redirecting",
          );
          router.replace(destination);
          return true;
        }

        console.log(
          "[onboarding-embedded] NOT redirecting - showing onboarding",
        );

        if (!onboardingData.requiresWhatsApp) {
          setStep("pricing");
        } else if (onboardingData.whatsappConnected === true) {
          setStep("pricing");
        } else {
          setStep("whatsapp");
        }

        return false;
      } catch (error) {
        console.error("[onboarding-embedded] Error:", error);
        setStep(
          requiresWhatsAppOnboarding(detectDomainFromWindow())
            ? "whatsapp"
            : "pricing",
        );
        return false;
      }
    };

    return runCheck();
  }, [router]);

  useEffect(() => {
    const activePreviewMode = getOnboardingPreviewMode() ?? previewMode;

    if (activePreviewMode !== false) {
      setStep(activePreviewMode === "complete" ? "complete" : "whatsapp");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const [, shouldRedirect] = await Promise.all([
          loadBootstrapConfig(),
          checkOnboardingStatus(),
        ]);
        if (!shouldRedirect) {
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router, checkOnboardingStatus, loadBootstrapConfig, previewMode]);

  const handleConnectionSuccess = async (data: {
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    wabaName: string;
  }) => {
    console.log("WhatsApp connected successfully:", data);
    invalidateOnboardingCheckCache(currentDomain);
    setWabaData({ wabaId: data.wabaId, phoneNumberId: data.phoneNumberId });
    setStep("pricing");
  };

  const handleConnectionError = (error: string) => {
    console.error("WhatsApp connection error:", error);
  };

  const routeToCanonicalDestination = useCallback(async () => {
    invalidateOnboardingCheckCache(currentDomain);
    const data = await getOnboardingCheck({
      product: currentDomain,
      force: true,
    });
    const destination = getOnboardingDestination(data, currentDomain);

    if (destination.startsWith("/home")) {
      const loop = recordOnboardingRedirect(destination);
      if (!loop.suppress) {
        setBillingRedirectInProgress(true);
        setStep("complete");
        router.replace(destination);
        return true;
      }
    }

    setStep(
      data.requiresWhatsApp && data.whatsappConnected !== true
        ? "whatsapp"
        : "pricing",
    );
    return false;
  }, [currentDomain, router]);

  useEffect(() => {
    if (step !== "pricing" || pricingViewedRef.current || plans.length === 0) {
      return;
    }

    pricingViewedRef.current = true;
    trackEvent({
      name: "pricing_viewed",
      params: {
        domain: currentDomain,
        source: "onboarding_embedded",
        pricing_mode: resolvePricingModeFromFlag({
          requestedMode: pricingMode,
          flagEnabled: trialToggleEnabled,
        }),
      },
    });
  }, [currentDomain, plans.length, pricingMode, step, trialToggleEnabled]);

  // ── Iframe detection — embedded onboarding may render inside Meta iframe ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window !== window.top) {
      console.warn(
        "[onboarding] Detected iframe context — popups may be blocked by cross-origin policy",
      );
      trackEvent({
        name: "onboarding_iframe_detected",
        params: { domain: currentDomain },
      });
    }
  }, [currentDomain]);

  // (Removed Phase 1 pre-creation)

  const handlePricingModeChange = (nextMode: OnboardingPricingMode) => {
    const resolvedMode = resolvePricingModeFromFlag({
      requestedMode: nextMode,
      flagEnabled: trialToggleEnabled,
    });

    setPaymentError(null);
    setPricingMode(resolvedMode);

    trackEvent({
      name: "pricing_mode_changed",
      params: {
        domain: currentDomain,
        from_mode: pricingMode,
        to_mode: resolvedMode,
        source: "onboarding_embedded",
      },
    });
  };

  const handleSelectFreeTrial = async () => {
    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    if (trialStartInProgressRef.current || billingActionInProgressRef.current) {
      console.warn(
        "[trial] Start already in progress, ignoring duplicate call",
      );
      return;
    }
    trialStartInProgressRef.current = true;
    billingActionInProgressRef.current = true;

    setPaymentLoading("starter");
    setPaymentError(null);

    try {
      const response = await fetch("/api/trials/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.uid,
          org_id: user.uid,
          email: user.email,
          plan_slug: "starter",
          domain: currentDomain,
          source: "onboarding_plan_selection",
          selected_plan_id: "starter",
        }),
      });

      const result = await response.json();

      if (result.success && (result.trial || result.is_existing)) {
        trackEvent({
          name: "trial_started",
          params: {
            domain: currentDomain,
            plan: "starter",
            pricing_mode: "trial",
            is_existing: result.is_existing === true,
          },
        });
        const routed = await routeToCanonicalDestination();
        if (!routed) {
          releaseBillingAction();
        }
        return;
      } else if (result.error === "TRIAL_EXISTS") {
        trackEvent({
          name: "trial_started",
          params: {
            domain: currentDomain,
            plan: "starter",
            pricing_mode: "trial",
            is_existing: true,
          },
        });
        const routed = await routeToCanonicalDestination();
        if (!routed) {
          releaseBillingAction();
        }
        return;
      } else {
        trackEvent({
          name: "trial_start_failed",
          params: {
            domain: currentDomain,
            plan: "starter",
            pricing_mode: "trial",
            error_code: result.error || "TRIAL_START_FAILED",
          },
        });
        setPaymentError(
          result.message || "Failed to start free trial. Please try again.",
        );
        releaseBillingAction();
      }
    } catch (err) {
      console.error("Free trial error:", err);
      trackEvent({
        name: "trial_start_failed",
        params: {
          domain: currentDomain,
          plan: "starter",
          pricing_mode: "trial",
          error_code: "NETWORK_ERROR",
        },
      });
      setPaymentError("Something went wrong. Please try again.");
      releaseBillingAction();
    }
  };

  const handleSelectPlan = async (planId: PlanName) => {
    // Guard: no concurrent payments
    if (
      paymentLoading !== null ||
      billingRedirectInProgress ||
      billingActionInProgressRef.current
    ) {
      return;
    }

    const effectiveMode = resolvePricingModeFromFlag({
      requestedMode: pricingMode,
      flagEnabled: trialToggleEnabled,
    });
    const pricingAction = resolvePricingAction(effectiveMode, planId);
    const plan = plans.find((candidate) => candidate.id === planId);

    trackEvent({
      name: "pricing_card_clicked",
      params: {
        domain: currentDomain,
        plan: planId,
        price: plan ? plan.price / 100 : undefined,
        currency: plan?.currency,
        pricing_mode: effectiveMode,
      },
    });

    if (pricingAction === "start_trial") {
      handleSelectFreeTrial();
      return;
    }

    if (!user?.email) {
      setPaymentError("User email not found. Please try logging in again.");
      return;
    }

    billingActionInProgressRef.current = true;
    clearPaymentRequestId();
    setPaymentLoading(planId);
    setPaymentError(null);

    // FAANG-LEVEL POPUP BLOCKER FIX: Open the window synchronously on click
    let paymentWindow: Window | null = null;
    try {
      paymentWindow = window.open("", "_blank");
      if (paymentWindow) {
        paymentWindow.document.write(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="utf-8">
              <title>Preparing Secure Payment...</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  background: #000;
                  color: #fff;
                }
                .spinner {
                  width: 40px;
                  height: 40px;
                  border: 3px solid rgba(255,255,255,0.2);
                  border-radius: 50%;
                  border-top-color: #22c15a;
                  animation: spin 1s ease-in-out infinite;
                  margin: 0 auto 20px;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .message {
                  text-align: center;
                }
                .message p {
                  margin: 0;
                  font-size: 16px;
                  color: #a0a0a0;
                }
              </style>
            </head>
            <body>
              <div class="message">
                <div class="spinner"></div>
                <p>Preparing your secure payment...</p>
              </div>
            </body>
          </html>
        `);
      }
    } catch (e) {
      console.warn("Could not open window synchronously", e);
    }

    try {
      const order = await createSubscriptionWithRetry(
        planId,
        user.email!,
        user.displayName || undefined,
        undefined,
        user.uid,
        currentDomain,
        0,
      );

      let finalOrder = order as any;

      if (!finalOrder.success && !finalOrder.checkout_token) {
        if (paymentWindow) paymentWindow.close();
        setPaymentError(finalOrder.error || "Failed to create subscription");
        setPaymentLoading(null);
        billingActionInProgressRef.current = false;
        trackEvent({
          name: "payment_failed",
          params: {
            domain: currentDomain,
            plan: planId,
            error_message: finalOrder.error || "Failed to create subscription",
            error_code: finalOrder.error_code || "SUBSCRIPTION_CREATE_FAILED",
            pricing_mode: effectiveMode,
          },
        });
        return;
      }

      if (finalOrder.already_active) {
        if (paymentWindow) paymentWindow.close();
        window.location.href = `/payment/status?subscription_id=${finalOrder.subscription_id}`;
        return;
      }

      if (finalOrder.checkout_token && !finalOrder.subscription_id) {
        const maxPolls = 40; 
        let completed = false;
        
        for (let i = 0; i < maxPolls; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            const token = await user.getIdToken();
            const pollRes = await fetch(`/api/billing/checkout-status/${finalOrder.checkout_token}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!pollRes.ok) continue;
            
            const pollData = await pollRes.json();
            if (pollData.status === 'completed' && pollData.subscription_id) {
              finalOrder = { ...finalOrder, ...pollData };
              completed = true;
              break;
            } else if (pollData.status === 'failed') {
              throw new Error(pollData.error_message || "Subscription setup failed.");
            }
          } catch (e) {
            console.warn("[onboarding] Polling check failed or threw", e);
            if (e instanceof Error && e.message.includes("setup failed")) {
              throw e;
            }
          }
        }
        
        if (!completed) {
          throw new Error("Checkout creation timed out. Please try again or contact support.");
        }
      }

      // Attach global handlers for the new window to call
      (window as any).handleRazorpaySuccess = async (response: any) => {
        const verification = await verifyPayment(
          {
            razorpay_subscription_id: response.razorpay_subscription_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
          user.uid,
        );

        if (verification.success) {
          invalidateOnboardingCheckCache(currentDomain);
          trackEvent({
            name: "payment_success",
            params: {
              domain: currentDomain,
              plan: planId,
              transaction_id: response.razorpay_payment_id,
              value: order.amount ? order.amount / 100 : 0,
              currency: "INR",
              pricing_mode: effectiveMode,
            },
          });
          sessionStorage.setItem(
            "pending_onboarding",
            JSON.stringify({
              whatsappConnected: true,
              wabaId: wabaData?.wabaId,
              phoneNumberId: wabaData?.phoneNumberId,
              subscriptionPlan: planId,
            }),
          );

          setBillingRedirectInProgress(true);
          router.push(
            `/payment/status?subscription_id=${response.razorpay_subscription_id}`,
          );
        } else {
          setPaymentError(
            verification.error || "Payment verification failed",
          );
          setPaymentLoading(null);
          billingActionInProgressRef.current = false;
          trackEvent({
            name: "payment_failed",
            params: {
              domain: currentDomain,
              plan: planId,
              error_message: verification.error || "Payment verification failed",
              error_code: verification.error_code || "VERIFY_FAILED",
              pricing_mode: effectiveMode,
            },
          });
        }
      };

      (window as any).handleRazorpayError = (err: any) => {
        console.error("Razorpay payment error:", JSON.stringify(err, null, 2));
        const errorMsg =
          err?.description || err?.reason || err?.message || "Payment failed. Please try again.";
        const errorCode = err?.code ? ` (${err.code})` : "";
        setPaymentError(`${errorMsg}${errorCode}`);
        
        setPaymentLoading(null);
        billingActionInProgressRef.current = false;
        trackEvent({
          name: "payment_failed",
          params: {
            domain: currentDomain,
            plan: planId,
            error_message: errorMsg,
            error_code: err?.code || "RAZORPAY_ERROR",
            pricing_mode: effectiveMode,
          },
        });
      };

      (window as any).handleRazorpayDismiss = () => {
        console.log("Payment modal dismissed by user");
        clearPaymentRequestId();
        setPaymentLoading(null);
        billingActionInProgressRef.current = false;
      };

      if (paymentWindow) {
        // Option B: Load Razorpay SDK inside that window and auto-trigger
        loadRazorpayInWindow(paymentWindow, {
          subscriptionId: finalOrder.subscription_id,
          keyId: finalOrder.key_id || finalOrder.razorpay_key_id,
          planName: finalOrder.plan_name || planId,
          customerEmail: user.email!,
          customerName: user.displayName || undefined,
        });
      } else {
        // Fallback: Extremely strict popup blocker blocked the synchronous open.
        // Try the standard inline modal anyway.
        await openRazorpayCheckout({
          subscriptionId: finalOrder.subscription_id,
          keyId: finalOrder.key_id || finalOrder.razorpay_key_id,
          planName: finalOrder.plan_name || planId,
          amount: finalOrder.amount || plan?.price || 0,
          customerEmail: user.email!,
          customerName: user.displayName || undefined,
          domain: currentDomain,
          onSuccess: (window as any).handleRazorpaySuccess,
          onError: (window as any).handleRazorpayError,
          onClose: (window as any).handleRazorpayDismiss,
        });
      }

      trackEvent({
        name: "payment_initiated",
        params: {
          domain: currentDomain,
          plan: planId,
          value: order.amount ? order.amount / 100 : plan ? plan.price / 100 : 0,
          currency: "INR",
          payment_method: "razorpay",
          pricing_mode: effectiveMode,
        },
      });

    } catch (err: any) {
      if (paymentWindow) paymentWindow.close();
      console.error("[onboarding] Subscription creation failed:", err);
      const errorMsg = err?.message || "Something went wrong. Please try again.";
      setPaymentError(errorMsg);
      setPaymentLoading(null);
      billingActionInProgressRef.current = false;
    }
  };

  const queryPreviewMode = getOnboardingPreviewMode();
  const effectivePreviewMode = queryPreviewMode ?? previewMode;
  const effectiveStep =
    effectivePreviewMode === "complete"
      ? "complete"
      : effectivePreviewMode === "whatsapp-success"
        ? "whatsapp"
        : step;

  if (loading && !effectivePreviewMode) {
    return <SpaceshipLoader text="Loading" />;
  }

  const isPricingStep = effectiveStep === "pricing";
  const effectivePricingMode = resolvePricingModeFromFlag({
    requestedMode: pricingMode,
    flagEnabled: trialToggleEnabled,
  });
  const visiblePlans =
    effectivePricingMode === "trial"
      ? plans.filter((plan) => plan.id === "starter")
      : plans;
  const isBillingBusy =
    paymentLoading !== null || pricingLoading || billingRedirectInProgress;

  return (
    <main
      className={`onboarding-container onboarding-two-step onboarding-stage-${effectiveStep}`}
    >
      <div className="onboarding-shell">
        <OnboardingSupportPanel />

        <section
          className={`onboarding-main onboarding-main-embedded ${isPricingStep ? "onboarding-main-embedded--pricing" : ""}`}
          aria-label="Onboarding setup"
        >
          <OnboardingProgress step={effectiveStep} />

          <div
            className={`embedded-content ${isPricingStep ? "embedded-content--pricing" : ""}`}
          >
            {effectiveStep === "whatsapp" && (
              <WhatsAppEmbeddedSignupForm
                onSuccess={handleConnectionSuccess}
                onError={handleConnectionError}
                previewState={
                  effectivePreviewMode === "whatsapp-success"
                    ? "success"
                    : undefined
                }
              />
            )}

            {effectiveStep === "pricing" && pricingLoading && (
              <div className="pricing-config-state" role="status">
                <h2>Loading pricing</h2>
                <p>Checking the active plans configured for this product.</p>
              </div>
            )}

            {effectiveStep === "pricing" && !pricingLoading && pricingConfigError && (
              <div className="pricing-config-state" role="alert">
                <h2>Pricing is not configured</h2>
                <p>{pricingConfigError}</p>
                <p>
                  Add active pricing rows for this product before customers can
                  choose a plan.
                </p>
              </div>
            )}

            {effectiveStep === "pricing" && !pricingLoading && !pricingConfigError && (
              <OnboardingPricingReplica
                plans={visiblePlans}
                pricingMode={effectivePricingMode}
                trialToggleEnabled={trialToggleEnabled}
                isBusy={isBillingBusy}
                isRedirecting={billingRedirectInProgress}
                paymentLoading={paymentLoading}
                paymentError={paymentError}
                onPricingModeChange={handlePricingModeChange}
                onDismissError={() => setPaymentError(null)}
                onSelectPlan={(planId) => handleSelectPlan(planId)}
              />
            )}

            {effectiveStep === "complete" && (
              <div className="success-message">
                <div className="success-message-shell">
                  <div className="success-message-icon" aria-hidden="true">
                    <CheckCircle2 size={77} strokeWidth={2.2} />
                  </div>

                  <div className="success-message-copy">
                    <h2>You&apos;re all set</h2>
                    <p>
                      WhatsApp is connected, your access is active, and your
                      dashboard is opening.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
