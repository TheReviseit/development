/**
 * Embedded Signup Button Component
 * Uses Meta's Configuration ID for streamlined WhatsApp Business onboarding
 */

"use client";

import { useState } from "react";
import { facebookSDK } from "@/lib/facebook/facebook-sdk";
import {
  REQUIRED_FACEBOOK_PERMISSIONS,
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
  const [error, setError] = useState<string | null>(null);
  const [showPermissionInfo, setShowPermissionInfo] = useState(false);

  const handleConnect = async () => {
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

      // Separate basic and advanced permissions
      const basicPermissions = ["public_profile", "email"];
      const advancedPermissions = [
        "business_management",
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ];

      // Check basic permissions (required)
      const missingBasicPermissions = basicPermissions.filter(
        (perm) => !result.grantedPermissions?.includes(perm)
      );

      // Check advanced permissions (optional during development)
      const missingAdvancedPermissions = advancedPermissions.filter(
        (perm) => !result.grantedPermissions?.includes(perm)
      );

      // Block only if basic permissions are missing
      if (missingBasicPermissions.length > 0) {
        const errorMsg = `Missing required permissions: ${missingBasicPermissions.join(
          ", "
        )}`;
        console.error(
          "[EmbeddedSignup] Missing basic permissions:",
          missingBasicPermissions
        );
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
        return;
      }

      // Warn about missing advanced permissions but allow continuation
      if (missingAdvancedPermissions.length > 0) {
        console.warn(
          "⚠️ [EmbeddedSignup] Missing advanced permissions:",
          missingAdvancedPermissions.join(", "),
          "\nThese permissions require Meta App Review approval.\nSome features may be limited until approved."
        );
      }

      console.log("[EmbeddedSignup] Preparing to send to backend...");
      console.log("[EmbeddedSignup] Result from SDK:", {
        success: result.success,
        hasAccessToken: !!result.accessToken,
        hasUserID: !!result.userID,
        accessTokenLength: result.accessToken?.length,
        userID: result.userID,
        expiresIn: result.expiresIn,
        grantedPermissionsCount: result.grantedPermissions?.length,
        grantedPermissions: result.grantedPermissions,
        setupData: result.setupData,
      });

      // Send to backend to complete setup
      const requestBody = {
        accessToken: result.accessToken,
        userID: result.userID,
        expiresIn: result.expiresIn,
        grantedPermissions: result.grantedPermissions,
        setupData: result.setupData,
      };

      console.log(
        "[EmbeddedSignup] Request body:",
        JSON.stringify(requestBody, null, 2)
      );

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
        console.log("[EmbeddedSignup] Success! Redirecting...");
        onSuccess?.();
        // Redirect to dashboard
        window.location.href = "/dashboard?connection=success";
      } else {
        const errorMsg = data.error || "Failed to complete setup";
        console.error("[EmbeddedSignup] Backend error:", errorMsg);
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
          <h4>Required Permissions</h4>
          <p className="permission-info-description">
            We need these permissions to connect your WhatsApp Business Account:
          </p>

          <ul className="permission-list">
            {REQUIRED_FACEBOOK_PERMISSIONS.map((permission) => (
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
