/**
 * XFBML Login Button Component
 * Renders Meta's official Facebook Login Button using XFBML
 * Supports "Continue as {Name}" button with profile picture
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { facebookSDK } from "@/lib/facebook/facebook-sdk";

interface XFBMLLoginButtonProps {
  /** Callback when login is complete */
  onLogin?: () => void;
  /** Permissions to request (comma-separated) */
  scope?: string;
  /** Button size: small (20px), medium (28px), large (40px) */
  size?: "small" | "medium" | "large";
  /** Button type */
  buttonType?: "continue_with" | "login_with";
  /** Show "Continue as {Name}" with profile picture when logged in */
  useContinueAs?: boolean;
  /** Show logout button when logged in */
  autoLogoutLink?: boolean;
  /** Custom width in pixels (medium: 200-320, large: 240-400) */
  width?: number;
  /** Custom class name for container */
  className?: string;
}

export default function XFBMLLoginButton({
  onLogin,
  scope = "public_profile,email",
  size = "large",
  buttonType = "continue_with",
  useContinueAs = true,
  autoLogoutLink = false,
  width,
  className = "",
}: XFBMLLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);

  // Initialize SDK and parse XFBML
  useEffect(() => {
    let mounted = true;

    const initAndParse = async () => {
      try {
        await facebookSDK.init();

        if (!mounted) return;
        setSdkReady(true);

        // Subscribe to render complete event
        facebookSDK.subscribeToXFBMLRender(() => {
          if (mounted) {
            console.log("[XFBMLLoginButton] Button rendered");
            setIsLoading(false);
          }
        });

        // Parse the XFBML in this container
        if (containerRef.current) {
          await facebookSDK.parseXFBML(containerRef.current);
        }
      } catch (error) {
        console.error("[XFBMLLoginButton] Failed to initialize:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initAndParse();

    return () => {
      mounted = false;
    };
  }, []);

  // Handler called when login completes
  const handleLoginComplete = () => {
    console.log("[XFBMLLoginButton] Login callback triggered");
    onLogin?.();
  };

  // Make the handler available globally for the onlogin attribute
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__xfbmlLoginCallback = handleLoginComplete;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__xfbmlLoginCallback;
      }
    };
  }, [onLogin]);

  return (
    <div className={`xfbml-login-container ${className}`} ref={containerRef}>
      {/* Loading spinner shown while button is rendering */}
      {isLoading && (
        <div className="xfbml-loading-placeholder">
          <div className="spinner" />
          <span>Loading...</span>
        </div>
      )}

      {/* XFBML Login Button - rendered by Facebook SDK */}
      {sdkReady && (
        <div
          className="fb-login-button"
          data-size={size}
          data-button-type={buttonType}
          data-layout="default"
          data-auto-logout-link={autoLogoutLink.toString()}
          data-use-continue-as={useContinueAs.toString()}
          data-scope={scope}
          data-onlogin="__xfbmlLoginCallback()"
          {...(width ? { "data-width": width.toString() } : {})}
          style={{ display: isLoading ? "none" : "block" }}
        />
      )}

      <style jsx>{`
        .xfbml-login-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: ${size === "large"
            ? "40px"
            : size === "medium"
            ? "28px"
            : "20px"};
        }

        .xfbml-loading-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          background: #1877f2;
          border-radius: 5px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          min-width: 200px;
        }

        .spinner {
          width: 16px;
          height: 16px;
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

        /* Ensure FB button is visible when loaded */
        :global(.fb-login-button) {
          display: block;
        }

        :global(.fb-login-button > span) {
          display: block !important;
        }
      `}</style>
    </div>
  );
}
