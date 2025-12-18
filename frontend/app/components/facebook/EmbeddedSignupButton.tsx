/**
 * Embedded Signup Button Component
 * Uses Meta's Configuration ID for streamlined WhatsApp Business onboarding
 */

"use client";

import { useState, useEffect } from "react";
import {
  facebookSDK,
  EmbeddedSignupMessageEvent,
} from "@/lib/facebook/facebook-sdk";
import {
  WHATSAPP_EMBEDDED_SIGNUP_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
} from "@/types/facebook-whatsapp.types";

interface EmbeddedSignupButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  className?: string;
}

export default function EmbeddedSignupButton({
  onSuccess,
  onError,
  className = "",
}: EmbeddedSignupButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionInfo, setShowPermissionInfo] = useState(false);
  const [messageEventData, setMessageEventData] =
    useState<EmbeddedSignupMessageEvent | null>(null);

  // Subscribe to Embedded Signup message events
  useEffect(() => {
    console.log("[EmbeddedSignup] Setting up message event handler...");

    const unsubscribe = facebookSDK.onEmbeddedSignupEvent((eventData) => {
      console.log("[EmbeddedSignup] Received message event:", eventData);
      setMessageEventData(eventData);

      // Log valuable info for debugging
      if (
        eventData.event === "FINISH" ||
        eventData.event === "FINISH_ONLY_WABA" ||
        eventData.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
      ) {
        console.log(
          "✅ [EmbeddedSignup] Message event captured success data:",
          {
            waba_id: eventData.data.waba_id,
            phone_number_id: eventData.data.phone_number_id,
            business_id: eventData.data.business_id,
          }
        );
      } else if (eventData.event === "CANCEL") {
        if (eventData.data.error_message) {
          console.warn(
            "⚠️ [EmbeddedSignup] User reported error:",
            eventData.data.error_message
          );
        } else if (eventData.data.current_step) {
          console.warn(
            "⚠️ [EmbeddedSignup] Flow abandoned at:",
            eventData.data.current_step
          );
        }
      }
    });

    // Cleanup on unmount
    return () => {
      console.log("[EmbeddedSignup] Cleaning up message event handler");
      unsubscribe();
    };
  }, []);

  const handleConnect = async () => {
    // Prevent double-clicks and race conditions
    if (isProcessing) {
      console.log("[EmbeddedSignup] Already processing, ignoring click");
      return;
    }

    setIsProcessing(true);
    setIsLoading(true);
    setError(null);

    try {
      console.log("[EmbeddedSignup] Starting connection flow...");

      // Launch Meta's embedded signup
      const result = await facebookSDK.launchEmbeddedSignup();
      console.log("[EmbeddedSignup] SDK result:", result.success);

      if (!result.success) {
        const errorMsg = result.error || "Connection failed";
        console.error("[EmbeddedSignup] Connection failed:", errorMsg);
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
        return;
      }

      // Log what we received from the SDK
      console.log("[EmbeddedSignup] SDK result:", {
        success: result.success,
        hasCode: !!(result as any).code,
        hasAccessToken: !!result.accessToken,
        hasUserID: !!result.userID,
        grantedPermissions: result.grantedPermissions,
        setupData: result.setupData,
      });

      // PERMISSION VALIDATION:
      // With Authorization Code Flow (v21+), permissions are UNKNOWN on frontend
      // because we receive a code, not a token. Backend will validate after code exchange.
      //
      // IMPORTANT: WhatsApp Embedded Signup only grants whatsapp_business_management
      // and whatsapp_business_messaging. It does NOT grant business_management.
      // business_management is obtained via Facebook Login for Business (Step 1).

      if (
        result.grantedPermissions !== null &&
        result.grantedPermissions !== undefined
      ) {
        // Permissions are known - validate WhatsApp permissions only
        // DO NOT check for business_management here
        const hasWhatsAppAccess = result.grantedPermissions.includes(
          "whatsapp_business_management"
        );

        if (!hasWhatsAppAccess) {
          const errorMsg =
            `Missing permission: whatsapp_business_management. ` +
            `This is required for WhatsApp Business integration. ` +
            `Please complete the Embedded Signup and grant access.`;
          console.error(
            "❌ [EmbeddedSignup] Missing whatsapp_business_management permission"
          );
          setError(errorMsg);
          onError?.(errorMsg);
          setIsLoading(false);
          setIsProcessing(false);
          return;
        }

        console.log(
          "✅ [EmbeddedSignup] WhatsApp permission verified: whatsapp_business_management"
        );

        // Log warning for messaging permission (optional but recommended)
        if (
          !result.grantedPermissions.includes("whatsapp_business_messaging")
        ) {
          console.warn(
            "⚠️ [EmbeddedSignup] Missing whatsapp_business_messaging permission",
            "\nThis requires Meta App Review approval."
          );
        }
      } else {
        // Permissions are unknown (Code Flow or HTTP limitation)
        // This is EXPECTED with Authorization Code Flow - backend will validate
        console.log(
          "ℹ️ [EmbeddedSignup] Permissions unknown on frontend (using Code Flow or HTTP).",
          "Backend will validate permissions after code exchange."
        );
      }

      console.log("[EmbeddedSignup] Preparing to send to backend...");

      const redirectUri =
        (result as any).redirectUri ||
        process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI ||
        window.location.origin + "/";
      
      console.log(
        "[EmbeddedSignup] Using redirect_uri for token exchange:",
        redirectUri
      );
      console.log(
        "[EmbeddedSignup] ⚠️ This MUST match exactly what was used in FB.login()"
      );

      const requestBody: any = {
        userID: result.userID,
        grantedPermissions: result.grantedPermissions,
        setupData: result.setupData,
        redirectUri: redirectUri, // Send the exact redirect_uri used in FB.login()
      };

      // Authorization Code Flow (preferred, v21+)
      if ((result as any).code) {
        requestBody.code = (result as any).code;
        console.log("[EmbeddedSignup] Using Authorization Code Flow");
      }

      // Implicit Flow fallback (deprecated)
      if (result.accessToken) {
        requestBody.accessToken = result.accessToken;
        requestBody.expiresIn = result.expiresIn;
        console.log("[EmbeddedSignup] Using Implicit Flow (legacy)");
      }

      console.log(
        "[EmbeddedSignup] Request body:",
        JSON.stringify(
          {
            ...requestBody,
            code: requestBody.code ? "[PRESENT]" : undefined,
            accessToken: requestBody.accessToken ? "[PRESENT]" : undefined,
          },
          null,
          2
        )
      );

      // CRITICAL: Also check for message event data
      // The message event may arrive slightly before or after the callback
      // We'll send both and let the backend use whichever has the most complete data
      const messageData =
        messageEventData || facebookSDK.getLastEmbeddedSignupData();

      if (messageData) {
        console.log(
          "📨 [EmbeddedSignup] Including message event data in request:",
          {
            event: messageData.event,
            waba_id: messageData.data.waba_id || "N/A",
            phone_number_id: messageData.data.phone_number_id || "N/A",
            business_id: messageData.data.business_id || "N/A",
          }
        );

        // Add message event data to request
        requestBody.messageEventData = {
          event: messageData.event,
          waba_id: messageData.data.waba_id,
          phone_number_id: messageData.data.phone_number_id,
          business_id: messageData.data.business_id,
          current_step: messageData.data.current_step, // For abandonment tracking
          error_message: messageData.data.error_message, // For error reporting
          error_id: messageData.data.error_id,
          session_id: messageData.data.session_id,
        };
      } else {
        console.warn("⚠️ [EmbeddedSignup] No message event data captured yet");
      }

      const response = await fetch("/api/facebook/embedded-signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      console.log("[EmbeddedSignup] Backend response:", data.success);

      if (data.success) {
        console.log("✅ [EmbeddedSignup] Embedded Signup successful!");

        // STEP 2: Perform Tech Provider customer onboarding
        // This handles: token exchange, webhook subscription, phone registration
        console.log("📝 [EmbeddedSignup] Starting customer onboarding...");

        const wabaId =
          messageData?.data.waba_id || data.data?.whatsappAccount?.waba_id;
        const phoneNumberId =
          messageData?.data.phone_number_id ||
          data.data?.phoneNumbers?.[0]?.phone_number_id;
        const authCode = (result as any).code || requestBody.code;

        if (wabaId && phoneNumberId && authCode) {
          console.log("🚀 [EmbeddedSignup] Calling onboarding API...", {
            wabaId,
            phoneNumberId,
            hasCode: !!authCode,
          });

          try {
            const onboardingResponse = await fetch(
              "/api/facebook/onboard-customer",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  code: authCode,
                  wabaId: wabaId,
                  phoneNumberId: phoneNumberId,
                  // Optional: specify custom PIN, otherwise random 6-digit PIN is generated
                  // pin: "123456",
                }),
              }
            );

            const onboardingData = await onboardingResponse.json();

            if (onboardingData.success) {
              console.log(
                "🎉 [EmbeddedSignup] Customer onboarded successfully!"
              );
              console.log(
                "📋 [EmbeddedSignup] Next steps:",
                onboardingData.data?.summary?.nextSteps
              );
            } else {
              console.warn(
                "⚠️ [EmbeddedSignup] Onboarding failed (non-critical):",
                onboardingData.error
              );
              console.log(
                "ℹ️ [EmbeddedSignup] Customer can complete onboarding manually"
              );
            }
          } catch (onboardingError: any) {
            console.warn(
              "⚠️ [EmbeddedSignup] Onboarding request failed (non-critical):",
              onboardingError.message
            );
            console.log(
              "ℹ️ [EmbeddedSignup] Customer can complete onboarding manually"
            );
          }
        } else {
          console.warn(
            "⚠️ [EmbeddedSignup] Missing data for onboarding, skipping automated setup",
            {
              hasWabaId: !!wabaId,
              hasPhoneNumberId: !!phoneNumberId,
              hasCode: !!authCode,
            }
          );
        }

        // Success - redirect to dashboard
        console.log("[EmbeddedSignup] Redirecting to dashboard...");
        onSuccess?.();
        window.location.href = "/dashboard?connection=success";
      } else {
        const errorMsg = data.error || "Failed to complete setup";
        console.error("❌ [EmbeddedSignup] Backend error:", errorMsg);
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err: any) {
      console.error("[EmbeddedSignup] Exception:", err);
      const errorMsg = err.message || "An unexpected error occurred";
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
      // Clear message event data after processing
      facebookSDK.clearEmbeddedSignupData();
      setMessageEventData(null);
    }
  };

  return (
    <div className="embedded-signup-container">
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className={`facebook-embedded-button ${className}`}
        aria-label="Connect WhatsApp Business with Facebook"
      >
        {isLoading ? (
          <>
            <div className="spinner" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="facebook-icon"
            >
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Connect WhatsApp Business</span>
          </>
        )}
      </button>

      {error && (
        <div className="error-message">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={() => setShowPermissionInfo(!showPermissionInfo)}
        className="permission-info-toggle"
      >
        {showPermissionInfo ? "Hide" : "Show"} what access we need
      </button>

      {showPermissionInfo && (
        <div className="permission-info-panel">
          <h4>Step 2: WhatsApp Access</h4>
          <p className="permission-info-description">
            This connects your WhatsApp Business Account and phone number:
          </p>

          <ul className="permission-list">
            {WHATSAPP_EMBEDDED_SIGNUP_PERMISSIONS.map((permission) => (
              <li key={permission} className="permission-item">
                <div className="permission-name">{permission}</div>
                <div className="permission-description">
                  {PERMISSION_DESCRIPTIONS[permission]}
                </div>
              </li>
            ))}
          </ul>

          <div className="permission-info-note">
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
              Meta's secure popup will guide you through selecting your Business
              Manager, WhatsApp Account, and phone number. Your credentials stay
              safe with Meta.
            </p>
          </div>
        </div>
      )}

      <style jsx>{`
        .embedded-signup-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        .facebook-embedded-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 14px 28px;
          background: #1877f2;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .facebook-embedded-button:hover:not(:disabled) {
          background: #166fe5;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(24, 119, 242, 0.3);
        }

        .facebook-embedded-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .facebook-embedded-button:disabled {
          background: #ccc;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .facebook-icon {
          width: 24px;
          height: 24px;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 6px;
          color: #c33;
          font-size: 14px;
        }

        .permission-info-toggle {
          align-self: center;
          background: none;
          border: none;
          color: #1877f2;
          font-size: 14px;
          cursor: pointer;
          text-decoration: underline;
          padding: 4px 8px;
        }

        .permission-info-toggle:hover {
          color: #166fe5;
        }

        .permission-info-panel {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 20px;
          margin-top: 8px;
        }

        .permission-info-panel h4 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
          color: #212529;
        }

        .permission-info-description {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #6c757d;
        }

        .permission-list {
          list-style: none;
          padding: 0;
          margin: 0 0 16px 0;
        }

        .permission-item {
          padding: 12px;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          margin-bottom: 8px;
        }

        .permission-name {
          font-size: 13px;
          font-weight: 600;
          color: #212529;
          margin-bottom: 4px;
          font-family: monospace;
        }

        .permission-description {
          font-size: 13px;
          color: #6c757d;
        }

        .permission-info-note {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: #e7f3ff;
          border-left: 3px solid #1877f2;
          border-radius: 4px;
        }

        .permission-info-note svg {
          flex-shrink: 0;
          color: #1877f2;
        }

        .permission-info-note p {
          margin: 0;
          font-size: 13px;
          color: #495057;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
