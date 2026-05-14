"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import gsap from "gsap";
import { facebookSDK } from "@/lib/facebook/facebook-sdk";
import metaLogo from "@/src/icons/Meta_Platforms_logo.svg";

interface WhatsAppEmbeddedSignupFormProps {
  onSuccess: (data: {
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    wabaName: string;
  }) => void;
  onError: (error: string) => void;
}

type ConnectionState =
  | "idle"
  | "connecting"
  | "success"
  | "error"
  | "cancelled";

interface ErrorInfo {
  message: string;
  action?: "RESTART_FLOW" | "CONTACT_SUPPORT" | "VERIFY_BUSINESS";
}

interface TrustBadgeItem {
  label: string;
  Icon: LucideIcon;
}

const TRUST_BADGES: TrustBadgeItem[] = [
  { label: "256-bit encryption", Icon: LockKeyhole },
  { label: "Official Meta Tech Provider", Icon: BadgeCheck },
  { label: "OAuth code exchange", Icon: KeyRound },
  { label: "Encrypted token storage", Icon: ShieldCheck },
  { label: "Webhook secured", Icon: CheckCircle2 },
  { label: "Auto token refresh", Icon: RefreshCw },
  { label: "GDPR-ready controls", Icon: ShieldCheck },
  { label: "No password sharing", Icon: LockKeyhole },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function SyncMark() {
  return (
    <svg
      className="brand-sync-mark"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 7h10l-3-3M17 17H7l3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrustBadge({ label, Icon }: TrustBadgeItem) {
  return (
    <div className="security-badge-item">
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function TrustBadgeMarquee() {
  return (
    <div className="security-badges-marquee" aria-label="Security assurances">
      <div className="security-badges-track">
        <div className="security-badges-set">
          {TRUST_BADGES.map((badge) => (
            <TrustBadge key={badge.label} {...badge} />
          ))}
        </div>
        <div className="security-badges-set" aria-hidden="true">
          {TRUST_BADGES.map((badge) => (
            <TrustBadge key={`duplicate-${badge.label}`} {...badge} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppEmbeddedSignupForm({
  onSuccess,
  onError,
}: WhatsAppEmbeddedSignupFormProps) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [connectionData, setConnectionData] = useState<{
    wabaName: string;
    displayPhoneNumber: string;
    accountReviewStatus: string;
    tokenExpiresIn: number;
    hasSystemUserToken: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      facebookSDK
        .init()
        .then(() => {
          setSdkReady(true);
        })
        .catch((error) => {
          console.error("SDK init failed:", error);
          setErrorInfo({
            message: "Failed to load Meta SDK. Please refresh the page.",
            action: "CONTACT_SUPPORT",
          });
          setConnectionState("error");
        });
    }
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
      );
    }
  }, [connectionState]);

  const handleConnect = useCallback(async () => {
    if (!sdkReady) {
      setErrorInfo({
        message: "SDK initializing. Please wait a moment.",
        action: "CONTACT_SUPPORT",
      });
      return;
    }

    setConnectionState("connecting");
    setErrorInfo(null);

    try {
      const result = await facebookSDK.launchEmbeddedSignup();

      if (!result.success) {
        if (result.error?.toLowerCase().includes("cancel")) {
          setConnectionState("cancelled");
          setErrorInfo({
            message: "Connection cancelled. Try again whenever you're ready.",
            action: "RESTART_FLOW",
          });
          return;
        }
        throw new Error(result.error || "Connection failed");
      }

      const embeddedData = facebookSDK.getLastEmbeddedSignupData();

      if (!embeddedData?.data?.waba_id) {
        throw new Error("WABA data not received. Please try again.");
      }

      const setupData = {
        wabaId: embeddedData.data.waba_id,
        phoneNumberId: embeddedData.data.phone_number_id,
        businessId: embeddedData.data.business_id,
      };

      const response = await fetch("/api/facebook/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: result.code,
          setupData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to complete signup");
      }

      const { whatsappAccount, phoneNumbers } = data.data || {};
      const primaryPhone = phoneNumbers?.[0];

      const wabaId = whatsappAccount?.waba_id || setupData.wabaId;
      const phoneNumberId =
        primaryPhone?.phone_number_id || setupData.phoneNumberId;
      const displayPhoneNumber =
        primaryPhone?.display_phone_number || "Connected";
      const wabaName = whatsappAccount?.waba_name || "WhatsApp Business";

      if (!wabaId || !phoneNumberId) {
        throw new Error("Incomplete data from server");
      }

      const expiresAt = whatsappAccount?.token_expires_at
        ? new Date(whatsappAccount.token_expires_at)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const daysUntilExpiry = Math.floor(
        (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      setConnectionData({
        wabaName,
        displayPhoneNumber,
        accountReviewStatus:
          whatsappAccount?.account_review_status || "PENDING",
        tokenExpiresIn: daysUntilExpiry,
        hasSystemUserToken: whatsappAccount?.has_system_user_token || false,
      });

      setConnectionState("success");
      facebookSDK.clearEmbeddedSignupData();

      onSuccess({
        wabaId,
        phoneNumberId,
        displayPhoneNumber,
        wabaName,
      });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to connect WhatsApp");
      console.error("Connection error:", error);
      setConnectionState("error");
      setErrorInfo({
        message,
        action: "RESTART_FLOW",
      });
      onError(message);
    }
  }, [sdkReady, onSuccess, onError]);

  const handleRetry = () => {
    setConnectionState("idle");
    setErrorInfo(null);
    setConnectionData(null);
  };

  const renderIdle = () => (
    <div ref={contentRef} className="signup-content">
      <div className="signup-form-header">
        <div className="signup-form-icon">
          <Image
            src={metaLogo}
            alt="Meta"
            width={40}
            height={40}
            className="meta-mark"
          />
          <SyncMark />
          <span className="flowauxi-mark">
            <Image src="/logo.png" alt="Flowauxi" width={44} height={44} />
          </span>
        </div>
        <p className="signup-eyebrow">Meta embedded signup</p>
        <h2>Connect WhatsApp Business</h2>
        <p>
          Securely authorize Flowauxi through Meta&apos;s official flow and continue
          to plan selection in one clean setup.
        </p>
      </div>

      <div className="signup-form-actions">
        <button
          type="button"
          onClick={handleConnect}
          className="whatsapp-connect-btn"
          disabled={!sdkReady}
        >
          <span>{sdkReady ? "Launch setup" : "Preparing setup"}</span>
        </button>

        <TrustBadgeMarquee />

        <p className="privacy-notice">
          By connecting, you agree to our{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          .
        </p>
      </div>
    </div>
  );

  const renderConnecting = () => (
    <div ref={contentRef} className="connecting-state">
      <div className="connecting-spinner-wrapper" aria-hidden="true">
        <LoaderCircle className="connecting-spinner" size={58} />
      </div>
      <div className="connecting-text">
        <h3>Authorizing</h3>
        <p>Please complete the setup in the popup window.</p>
      </div>

      <div className="processing-info">
        <p className="processing-title">Processing</p>
        <ul className="processing-list">
          <li>
            <span className="processing-dot"></span>
            Verifying your account
          </li>
          <li>
            <span className="processing-dot"></span>
            Setting up WhatsApp connection
          </li>
          <li>
            <span className="processing-dot"></span>
            Configuring webhooks
          </li>
        </ul>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div ref={contentRef} className="success-state">
      <div className="success-header">
        <div className="success-icon">
          <CheckCircle2 size={24} strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="success-info">
          <h3>Successfully connected</h3>
          <p>{connectionData?.wabaName}</p>
        </div>
      </div>

      <div className="success-details-grid">
        <div className="success-detail-item">
          <span className="detail-label">Phone number</span>
          <span className="detail-value">
            {connectionData?.displayPhoneNumber}
          </span>
        </div>
        <div className="success-detail-item">
          <span className="detail-label">Review status</span>
          <span className="detail-value capitalize">
            {connectionData?.accountReviewStatus}
          </span>
        </div>
      </div>

      {connectionData &&
        connectionData.tokenExpiresIn < 7 &&
        !connectionData.hasSystemUserToken && (
          <div className="token-warning">
            <Clock size={20} strokeWidth={2} aria-hidden="true" />
            <div className="warning-content">
              <p className="warning-title">
                Token expires in {connectionData.tokenExpiresIn} days
              </p>
              <p className="warning-text">
                Create a permanent System User token in Meta Business Settings
                to prevent disconnection.
              </p>
              <a
                href="https://business.facebook.com/settings/system-users"
                target="_blank"
                rel="noopener noreferrer"
                className="warning-link"
              >
                View setup guide
              </a>
            </div>
          </div>
        )}

      {connectionData?.accountReviewStatus === "PENDING" && (
        <div className="verification-warning">
          <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
          <div className="warning-content">
            <p className="warning-title">Verification required</p>
            <p className="warning-text">
              Complete business verification at Meta to unlock full messaging
              features.
            </p>
          </div>
        </div>
      )}

      <div className="next-steps">
        <h4>Next steps</h4>
        <div className="next-steps-list">
          <div className="next-step-item">
            <div className="next-step-number">1</div>
            <span>Configure your AI assistant settings</span>
          </div>
          <div className="next-step-item">
            <div className="next-step-number">2</div>
            <span>Upload your knowledge base documents</span>
          </div>
          <div className="next-step-item">
            <div className="next-step-number">3</div>
            <span>Test with a sample conversation</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderError = () => (
    <div ref={contentRef} className="error-state">
      <div className="error-icon-wrapper">
        <XCircle size={34} strokeWidth={2.3} aria-hidden="true" />
      </div>
      <div className="error-content">
        <h3>Something went wrong</h3>
        <p>{errorInfo?.message}</p>
      </div>
      {errorInfo?.action === "RESTART_FLOW" && (
        <button
          type="button"
          onClick={handleRetry}
          className="error-retry-btn"
        >
          <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
          <span>Try connection again</span>
        </button>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="whatsapp-setup-card">
      {connectionState === "idle" && renderIdle()}
      {connectionState === "connecting" && renderConnecting()}
      {connectionState === "success" && renderSuccess()}
      {(connectionState === "error" || connectionState === "cancelled") &&
        renderError()}
    </div>
  );
}
