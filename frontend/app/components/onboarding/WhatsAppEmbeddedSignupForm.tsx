"use client";

import React, { useState, useEffect, useCallback } from "react";
import { facebookSDK } from "@/lib/facebook/facebook-sdk";

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
  const [connectionData, setConnectionData] = useState<{
    wabaName: string;
    displayPhoneNumber: string;
    accountReviewStatus: string;
    tokenExpiresIn: number;
    hasSystemUserToken: boolean;
  } | null>(null);

  const handleConnect = useCallback(async () => {
    setConnectionState("connecting");
    setErrorInfo(null);

    try {
      // Launch Embedded Signup flow
      const result = await facebookSDK.launchEmbeddedSignup();

      if (!result.success) {
        // Handle cancellation
        if (result.error?.toLowerCase().includes("cancel")) {
          setConnectionState("cancelled");
          setErrorInfo({
            message: "Connection cancelled. Click to try again.",
            action: "RESTART_FLOW",
          });
          return;
        }

        throw new Error(result.error || "Failed to connect");
      }

      // Get data from postMessage (captured by SDK)
      const embeddedData = facebookSDK.getLastEmbeddedSignupData();

      const setupData = {
        wabaId: result.setupData?.wabaId || embeddedData?.data?.waba_id,
        phoneNumberId:
          result.setupData?.phoneNumberId ||
          embeddedData?.data?.phone_number_id,
        businessId:
          result.setupData?.businessId || embeddedData?.data?.business_id,
      };

      console.log("📦 [WhatsAppEmbeddedSignup] Setup data:", setupData);

      // Send to backend - NO redirectUri (FB.login() handles it internally)
      const response = await fetch("/api/facebook/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: result.code,
          accessToken: result.accessToken, // Fallback for implicit flow
          userID: result.userID,
          setupData,
          // ✅ redirectUri removed - not needed for FB.login()
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific errors
        if (
          data.error?.includes("code has already been used") ||
          data.hint?.includes("expired")
        ) {
          setErrorInfo({
            message:
              "This connection session has expired. Please close this window and click 'Connect WhatsApp' again.",
            action: "RESTART_FLOW",
          });
          throw new Error(data.error);
        }

        if (data.error?.includes("permission")) {
          setErrorInfo({
            message: "Please grant all requested permissions.",
            action: "RESTART_FLOW",
          });
          throw new Error(data.error);
        }

        if (data.error?.includes("Business Account found")) {
          setErrorInfo({
            message:
              "No WhatsApp Business Account found. Please complete the full signup flow.",
            action: "RESTART_FLOW",
          });
          throw new Error(data.error);
        }

        throw new Error(data.error || "Failed to complete signup");
      }

      // Success!
      const wabaAccount = data.data?.whatsappAccount;
      const phoneNumbers = data.data?.phoneNumbers || [];
      const primaryPhone = phoneNumbers[0];

      setConnectionData({
        wabaName: wabaAccount?.waba_name || "WhatsApp Business",
        displayPhoneNumber: primaryPhone?.display_phone_number || "",
        accountReviewStatus: wabaAccount?.account_review_status || "pending",
        tokenExpiresIn: 60, // Default to 60 days for long-lived token
        hasSystemUserToken: false,
      });

      setConnectionState("success");

      // Clear SDK data
      facebookSDK.clearEmbeddedSignupData();

      // Notify parent
      onSuccess({
        wabaId: wabaAccount?.waba_id,
        phoneNumberId: primaryPhone?.phone_number_id,
        displayPhoneNumber: primaryPhone?.display_phone_number,
        wabaName: wabaAccount?.waba_name,
      });
    } catch (error: any) {
      console.error("❌ [WhatsAppEmbeddedSignup] Error:", error);
      setConnectionState("error");

      if (!errorInfo) {
        setErrorInfo({
          message: error.message || "Failed to connect WhatsApp",
          action: "RESTART_FLOW",
        });
      }

      onError(error.message);
    }
  }, [onSuccess, onError, errorInfo]);

  const handleRetry = () => {
    setConnectionState("idle");
    setErrorInfo(null);
    setConnectionData(null);
  };

  // Render based on state
  if (connectionState === "success" && connectionData) {
    return (
      <div className="form-section whatsapp-connected">
        <div className="connection-status success">
          <div className="status-header">
            <span className="success-icon">✅</span>
            <h3>WhatsApp Connected</h3>
          </div>

          <div className="status-details">
            <p>
              <strong>Business:</strong> {connectionData.wabaName}
            </p>
            <p>
              <strong>Phone:</strong> {connectionData.displayPhoneNumber}
            </p>
            <p>
              <strong>Status:</strong> {connectionData.accountReviewStatus}
            </p>
          </div>

          {connectionData.accountReviewStatus === "pending" && (
            <div className="alert warning">
              <span>⚠️</span>
              <div>
                <strong>Business verification pending</strong>
                <ul>
                  <li>You have 30-day trial access</li>
                  <li>
                    Verify at{" "}
                    <a
                      href="https://business.facebook.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      business.facebook.com
                    </a>{" "}
                    for full access
                  </li>
                </ul>
              </div>
            </div>
          )}

          {connectionData.tokenExpiresIn < 7 &&
            !connectionData.hasSystemUserToken && (
              <div className="alert warning">
                <span>⚠️</span>
                <div>
                  <strong>
                    Token expires in {connectionData.tokenExpiresIn} days
                  </strong>
                  <p>Create System User token for permanent access</p>
                </div>
              </div>
            )}

          {/* System User Token guidance */}
          <div className="info-box system-user-guide">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <div>
              <strong>To prevent disconnection after 60 days:</strong>
              <ol>
                <li>
                  Go to{" "}
                  <a
                    href="https://business.facebook.com/settings/system-users"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    business.facebook.com → Settings → System Users
                  </a>
                </li>
                <li>Create System User with Admin role</li>
                <li>
                  Generate permanent token with permissions:
                  <ul>
                    <li>whatsapp_business_management</li>
                    <li>whatsapp_business_messaging</li>
                  </ul>
                </li>
                <li>Update token in Settings → WhatsApp → API Token</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-section whatsapp-signup">
      <div className="form-header">
        <h2>Connect WhatsApp Business</h2>
        <p>Link your WhatsApp Business account to enable AI messaging</p>
      </div>

      <div className="signup-content">
        {connectionState === "idle" && (
          <div className="connect-prompt">
            <div className="whatsapp-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="#25D366">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.625.846 5.059 2.284 7.032l-1.5 5.484 5.625-1.474c1.895 1.261 4.162 1.997 6.591 1.997 6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
              </svg>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-large connect-whatsapp-btn"
              onClick={handleConnect}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1.5 1.5 0 003.8 21.454l3.032-.892A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
              </svg>
              Connect with WhatsApp Business
            </button>
            <p className="hint">
              You'll be redirected to Meta to authorize the connection
            </p>
          </div>
        )}

        {connectionState === "connecting" && (
          <div className="connecting-state">
            <div className="spinner"></div>
            <p>Connecting to WhatsApp...</p>
            <small>Complete the authorization in the popup window</small>
          </div>
        )}

        {(connectionState === "error" || connectionState === "cancelled") &&
          errorInfo && (
            <div className="error-state">
              <div className="error-icon">❌</div>
              <p className="error-message">{errorInfo.message}</p>
              {errorInfo.action === "RESTART_FLOW" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRetry}
                >
                  Try Again
                </button>
              )}
              {errorInfo.action === "VERIFY_BUSINESS" && (
                <a
                  href="https://business.facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  Verify Business
                </a>
              )}
              {errorInfo.action === "CONTACT_SUPPORT" && (
                <p className="hint">Please contact support for assistance.</p>
              )}
            </div>
          )}
      </div>

      <style jsx>{`
        .whatsapp-signup {
          padding: 2rem;
        }

        .form-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .form-header h2 {
          margin: 0 0 0.5rem;
          font-size: 1.5rem;
          color: var(--text-primary);
        }

        .form-header p {
          margin: 0;
          color: var(--text-secondary);
        }

        .signup-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 200px;
        }

        .connect-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .whatsapp-icon {
          padding: 1rem;
          background: rgba(37, 211, 102, 0.1);
          border-radius: 50%;
        }

        .connect-whatsapp-btn {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          background: linear-gradient(135deg, #25d366, #128c7e);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .connect-whatsapp-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
        }

        .hint {
          color: var(--text-secondary);
          font-size: 0.875rem;
          text-align: center;
        }

        .connecting-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid var(--border-color);
          border-top-color: #25d366;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 2rem;
          background: var(--error-bg);
          border-radius: 8px;
        }

        .error-icon {
          font-size: 2rem;
        }

        .error-message {
          color: var(--error-color);
          text-align: center;
          margin: 0;
        }

        .connection-status.success {
          padding: 1.5rem;
          background: var(--success-bg, rgba(37, 211, 102, 0.1));
          border-radius: 8px;
          border: 1px solid var(--success-border, rgba(37, 211, 102, 0.3));
        }

        .status-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .status-header h3 {
          margin: 0;
          color: #25d366;
        }

        .success-icon {
          font-size: 1.5rem;
        }

        .status-details {
          display: grid;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .status-details p {
          margin: 0;
          color: var(--text-primary);
        }

        .alert {
          display: flex;
          gap: 0.75rem;
          padding: 1rem;
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        .alert.warning span {
          font-size: 1.25rem;
        }

        .alert strong {
          display: block;
          margin-bottom: 0.5rem;
        }

        .alert ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .alert li {
          margin-bottom: 0.25rem;
        }

        .info-box {
          display: flex;
          gap: 0.75rem;
          padding: 1rem;
          background: var(--info-bg, rgba(59, 130, 246, 0.1));
          border-radius: 6px;
          margin-top: 1rem;
        }

        .info-box svg {
          flex-shrink: 0;
          color: var(--info-color, #3b82f6);
        }

        .info-box strong {
          display: block;
          margin-bottom: 0.5rem;
        }

        .info-box ol {
          margin: 0;
          padding-left: 1.25rem;
        }

        .info-box li {
          margin-bottom: 0.5rem;
        }

        .info-box ul {
          margin: 0.25rem 0 0;
          padding-left: 1.25rem;
          list-style: disc;
        }

        .info-box a {
          color: var(--link-color, #3b82f6);
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
