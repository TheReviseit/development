"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { facebookSDK } from "@/lib/facebook/facebook-sdk";
import gsap from "gsap";

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

  // Initialize Facebook SDK on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      facebookSDK
        .init()
        .then(() => {
          setSdkReady(true);
        })
        .catch((error) => {
          console.error("❌ SDK Init failed:", error);
          setErrorInfo({
            message: "Failed to load Meta SDK. Please refresh the page.",
            action: "CONTACT_SUPPORT",
          });
          setConnectionState("error");
        });
    }
  }, []);

  // GSAP Animations for state transitions
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

      // Use embedded data as fallback if server data is incomplete
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
        wabaName: wabaName,
        displayPhoneNumber: displayPhoneNumber,
        accountReviewStatus:
          whatsappAccount?.account_review_status || "PENDING",
        tokenExpiresIn: daysUntilExpiry,
        hasSystemUserToken: whatsappAccount?.has_system_user_token || false,
      });

      setConnectionState("success");
      facebookSDK.clearEmbeddedSignupData();

      onSuccess({
        wabaId: wabaId,
        phoneNumberId: phoneNumberId,
        displayPhoneNumber: displayPhoneNumber,
        wabaName: wabaName,
      });
    } catch (error: any) {
      console.error("❌ Connection error:", error);
      setConnectionState("error");
      setErrorInfo({
        message: error.message || "Failed to connect WhatsApp",
        action: "RESTART_FLOW",
      });
      onError(error.message);
    }
  }, [sdkReady, onSuccess, onError]);

  const handleRetry = () => {
    setConnectionState("idle");
    setErrorInfo(null);
    setConnectionData(null);
  };

  // State Renders
  const renderIdle = () => (
    <>
      {/* Button Container - Centered at Top (Separate Container) */}
      <div ref={contentRef} className="signup-button-container">
        <div className="signup-single-card">
          <div className="signup-form-header">
            <div className="signup-form-icon">
              <img
                src="/whatsapp-logo.svg"
                alt="WhatsApp"
                width="40"
                height="40"
              />
            </div>
            <h2>Connect WhatsApp</h2>
            <p>
              Scale your business with AI-powered messaging on the world's most
              popular platform.
            </p>
          </div>

          <div className="signup-form-actions">
            <button onClick={handleConnect} className="whatsapp-connect-btn">
              <span className="whatsapp-btn-icon">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.625.846 5.059 2.284 7.032l-1.5 5.484 5.625-1.474c1.895 1.261 4.162 1.997 6.591 1.997 6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
                </svg>
              </span>
              <span>Launch Setup</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            {/* Security badges */}
            <div className="security-badges">
              <div className="security-badge-item">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span>256-bit encryption</span>
              </div>
              <div className="security-badge-item">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Meta verified</span>
              </div>
              <div className="security-badge-item">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>GDPR compliant</span>
              </div>
            </div>

            {/* Privacy policy link */}
            <p className="privacy-notice">
              By connecting, you agree to our{" "}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>{" "}
              and{" "}
              <a
                href="/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );

  const renderConnecting = () => (
    <div ref={contentRef} className="connecting-state">
      <div className="connecting-spinner-wrapper">
        <div className="connecting-spinner"></div>
        <div className="connecting-spinner-dot"></div>
      </div>
      <div className="connecting-text">
        <h3>Authorizing...</h3>
        <p>Please complete the setup in the popup window.</p>
      </div>

      {/* What's happening behind the scenes */}
      <div className="processing-info">
        <p className="processing-title">Processing...</p>
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
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="success-info">
          <h3>Successfully Connected</h3>
          <p>{connectionData?.wabaName}</p>
        </div>
      </div>

      <div className="success-details-grid">
        <div className="success-detail-item">
          <span className="detail-label">Phone Number</span>
          <span className="detail-value">
            {connectionData?.displayPhoneNumber}
          </span>
        </div>
        <div className="success-detail-item">
          <span className="detail-label">Review Status</span>
          <span className="detail-value capitalize">
            {connectionData?.accountReviewStatus}
          </span>
        </div>
      </div>

      {/* Token expiration warning */}
      {connectionData &&
        connectionData.tokenExpiresIn < 7 &&
        !connectionData.hasSystemUserToken && (
          <div className="token-warning">
            <span className="warning-icon">⏰</span>
            <div className="warning-content">
              <p className="warning-title">
                Action Required: Token Expires in{" "}
                {connectionData.tokenExpiresIn} Days
              </p>
              <p className="warning-text">
                To prevent disconnection, create a permanent System User token
                in Meta Business Settings.
              </p>
              <a
                href="https://business.facebook.com/settings/system-users"
                target="_blank"
                rel="noopener noreferrer"
                className="warning-link"
              >
                View Setup Guide →
              </a>
            </div>
          </div>
        )}

      {connectionData?.accountReviewStatus === "PENDING" && (
        <div className="verification-warning">
          <span className="warning-icon">⚠️</span>
          <div className="warning-content">
            <p className="warning-title">Verification Required</p>
            <p className="warning-text">
              Complete business verification at Meta to unlock full messaging
              features.
            </p>
          </div>
        </div>
      )}

      {/* Next steps */}
      <div className="next-steps">
        <h4>Next Steps</h4>
        <div className="next-steps-list">
          <div className="next-step-item">
            <div className="step-number">1</div>
            <span>Configure your AI assistant settings</span>
          </div>
          <div className="next-step-item">
            <div className="step-number">2</div>
            <span>Upload your knowledge base documents</span>
          </div>
          <div className="next-step-item">
            <div className="step-number">3</div>
            <span>Test with a sample conversation</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderError = () => (
    <div ref={contentRef} className="error-state">
      <div className="error-icon-wrapper">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <div className="error-content">
        <h3>Something went wrong</h3>
        <p>{errorInfo?.message}</p>
      </div>
      {errorInfo?.action === "RESTART_FLOW" && (
        <button onClick={handleRetry} className="error-retry-btn">
          Try connection again
        </button>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="w-full max-w-lg mx-auto bg-white rounded-3xl sm:rounded-[32px] p-6 sm:p-8 md:p-10 shadow-2xl shadow-black/5 border border-gray-100 relative overflow-hidden"
    >
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-green-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

      <div className="relative z-10 transition-all duration-500">
        {connectionState === "idle" && renderIdle()}
        {connectionState === "connecting" && renderConnecting()}
        {connectionState === "success" && renderSuccess()}
        {(connectionState === "error" || connectionState === "cancelled") &&
          renderError()}
      </div>
    </div>
  );
}
