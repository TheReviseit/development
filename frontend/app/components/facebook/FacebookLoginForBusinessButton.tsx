/**
 * Facebook Login for Business Button Component
 * STEP 1: Gets business_management permission to access Business Managers
 * This does NOT use config_id - it's standard Facebook Login
 */

"use client";

import { useState, useEffect } from "react";
import { facebookSDK } from "@/lib/facebook/facebook-sdk";
import {
  FACEBOOK_LOGIN_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
} from "@/types/facebook-whatsapp.types";

interface FacebookLoginForBusinessButtonProps {
  onSuccess?: (businessManagers: any[]) => void;
  onError?: (error: string) => void;
  className?: string;
  disabled?: boolean;
}

export default function FacebookLoginForBusinessButton({
  onSuccess,
  onError,
  className = "",
  disabled = false,
}: FacebookLoginForBusinessButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionInfo, setShowPermissionInfo] = useState(false);

  const handleConnect = async () => {
    // Prevent double-clicks and race conditions
    if (isProcessing || disabled) {
      console.log(
        "[LoginForBusiness] Already processing or disabled, ignoring click"
      );
      return;
    }

    setIsProcessing(true);
    setIsLoading(true);
    setError(null);

    try {
      console.log(
        "[LoginForBusiness] Starting Facebook Login for Business flow..."
      );
      console.log(
        "[LoginForBusiness] NOTE: This is STEP 1 - getting business_management permission"
      );

      // Launch Facebook Login for Business (NO config_id)
      const result = await facebookSDK.loginForBusiness();
      console.log("[LoginForBusiness] SDK result:", result.success);

      if (!result.success) {
        const errorMsg = result.error || "Connection failed";
        console.error("[LoginForBusiness] Connection failed:", errorMsg);
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
        setIsProcessing(false);
        return;
      }

      console.log("[LoginForBusiness] Preparing to send to backend...");

      const redirectUri =
        process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI ||
        window.location.origin + "/onboarding";
      console.log("[LoginForBusiness] redirect_uri:", redirectUri);

      const requestBody: any = {
        userID: result.userID,
        grantedPermissions: result.grantedPermissions,
        redirectUri: redirectUri,
      };

      // Authorization Code Flow (preferred)
      if ((result as any).code) {
        requestBody.code = (result as any).code;
        console.log("[LoginForBusiness] Using Authorization Code Flow");
      }

      // Implicit Flow fallback
      if (result.accessToken) {
        requestBody.accessToken = result.accessToken;
        requestBody.expiresIn = result.expiresIn;
        console.log("[LoginForBusiness] Using Implicit Flow (legacy)");
      }

      console.log("[LoginForBusiness] Sending to backend...");

      const response = await fetch("/api/facebook/login-for-business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      console.log("[LoginForBusiness] Backend response:", data.success);

      if (data.success) {
        console.log(
          "[LoginForBusiness] Success! Business Managers:",
          data.data?.businessManagers?.length
        );
        onSuccess?.(data.data?.businessManagers || []);
      } else {
        const errorMsg = data.error || "Failed to complete business login";
        console.error("[LoginForBusiness] Backend error:", errorMsg);
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err: any) {
      console.error("[LoginForBusiness] Exception:", err);
      const errorMsg = err.message || "An unexpected error occurred";
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  return (
    <div className="login-for-business-container">
      <button
        onClick={handleConnect}
        disabled={isLoading || disabled}
        className={`facebook-login-business-button ${className}`}
        aria-label="Connect Business Manager with Facebook"
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
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            <span>Connect Business Manager</span>
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
          <h4>Step 1: Business Manager Access</h4>
          <p className="permission-info-description">
            This connects your Facebook Business Manager so we can access your
            businesses:
          </p>

          <ul className="permission-list">
            {FACEBOOK_LOGIN_PERMISSIONS.map((permission) => (
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
              After connecting your Business Manager, you'll proceed to Step 2
              to connect your WhatsApp Business Account.
            </p>
          </div>
        </div>
      )}

      <style jsx>{`
        .login-for-business-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        .facebook-login-business-button {
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

        .facebook-login-business-button:hover:not(:disabled) {
          background: #166fe5;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(24, 119, 242, 0.3);
        }

        .facebook-login-business-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .facebook-login-business-button:disabled {
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
