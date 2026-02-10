/**
 * Shop Auth Guard
 *
 * Enterprise-grade guard that:
 * 1. Consumes auth state from AuthProvider (NOT direct Firebase)
 * 2. Verifies shop capability via server-side API
 * 3. Fast fails with 2s timeout (no infinite loading)
 * 4. Redirects to login for unauthenticated users
 *
 * CRITICAL RULES:
 * - NEVER call Firebase directly (auth.onAuthStateChanged)
 * - Only ONE listener allowed: AuthProvider
 * - Guards CONSUME state, not CREATE it
 * - Match Google Workspace pattern
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth/AuthProvider";
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";

interface ShopAuthGuardProps {
  children: React.ReactNode;
}

export function ShopAuthGuard({ children }: ShopAuthGuardProps) {
  const { authState, user, firebaseUser } = useAuth(); // ✅ Consume, don't recreate
  const router = useRouter();
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [timeoutReached, setTimeoutReached] = useState(false);

  // 2-second timeout protection (prevent infinite loading)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (capabilityLoading) {
        console.error(
          "[SHOP GUARD] Capability check timeout (2s) - failing fast",
        );
        setTimeoutReached(true);
        setCapabilityError(
          "Shop access verification timed out. Please refresh.",
        );
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [capabilityLoading]);

  // Handle auth state changes
  useEffect(() => {
    // Wait for AuthProvider to finish initializing
    if (authState === "INITIALIZING" || authState === "VERIFYING_SESSION") {
      return; // Still loading
    }

    // Handle unauthenticated states
    if (authState === "UNAUTHENTICATED") {
      console.log("[SHOP GUARD] User not authenticated - redirecting to login");
      router.push("/login");
      return;
    }

    // Force logout SESSION_ONLY state (Firebase session exists but no DB user)
    if (authState === "SESSION_ONLY") {
      console.warn("[SHOP GUARD] SESSION_ONLY state detected - forcing logout");
      router.push("/login?error=session_expired");
      return;
    }

    // Handle auth errors
    if (authState === "AUTH_ERROR") {
      console.error("[SHOP GUARD] Auth error - redirecting to login");
      router.push("/login?error=auth_failed");
      return;
    }

    // Authenticated - verify shop capability
    if (authState === "AUTHENTICATED" && user && firebaseUser) {
      verifyShopCapability();
    }
  }, [authState, user, firebaseUser, router]);

  /**
   * Verify shop capability via server-side API.
   * Backend auto-grants shop capability if missing (backwards compatibility).
   */
  const verifyShopCapability = async () => {
    try {
      console.log("[SHOP GUARD] Verifying shop capability...");

      // Call domain capabilities API
      const response = await fetch("/api/domain/capabilities", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Capability check failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Capability check failed");
      }

      // Check if user has shop access
      if (!data.has_access) {
        console.error("[SHOP GUARD] User does not have shop access");
        setCapabilityError("Shop access not enabled for your account");
        setCapabilityLoading(false);
        return;
      }

      console.log("[SHOP GUARD] ✅ Shop capability verified");
      setCapabilityLoading(false);
    } catch (err: any) {
      console.error("[SHOP GUARD] Capability verification failed:", err);
      setCapabilityError(err.message || "Failed to verify shop access");
      setCapabilityLoading(false);
    }
  };

  // Show loading while auth is initializing or capability is being checked
  if (
    authState === "INITIALIZING" ||
    authState === "VERIFYING_SESSION" ||
    authState === "SYNCING_TO_DB" ||
    (capabilityLoading && !timeoutReached)
  ) {
    return <SpaceshipLoader text="Loading shop..." />;
  }

  // Show error state if capability check failed or timed out
  if (capabilityError || timeoutReached) {
    return (
      <div className="error-container">
        <div className="error-card">
          <h2>⚠️ Unable to Access Shop</h2>
          <p>{capabilityError || "Request timed out"}</p>
          <div className="error-actions">
            <button
              onClick={() => window.location.reload()}
              className="retry-btn"
            >
              Retry
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="secondary-btn"
            >
              Go to Dashboard
            </button>
          </div>
        </div>

        <style jsx>{`
          .error-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }

          .error-card {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          }

          .error-card h2 {
            margin: 0 0 16px;
            color: #1a1a1a;
            font-size: 24px;
          }

          .error-card p {
            margin: 0 0 24px;
            color: #666;
            font-size: 16px;
            line-height: 1.5;
          }

          .error-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
          }

          .retry-btn,
          .secondary-btn {
            padding: 12px 24px;
            border-radius: 8px;
            border: none;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }

          .retry-btn {
            background: #667eea;
            color: white;
          }

          .retry-btn:hover {
            background: #5568d3;
            transform: translateY(-2px);
          }

          .secondary-btn {
            background: #f0f0f0;
            color: #333;
          }

          .secondary-btn:hover {
            background: #e0e0e0;
          }
        `}</style>
      </div>
    );
  }

  // All checks passed - render children
  return <>{children}</>;
}
