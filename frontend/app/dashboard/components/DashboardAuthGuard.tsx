/**
 * Dashboard Auth Guard Inner Component
 * This component is rendered INSIDE AuthProvider and can safely use useAuth()
 *
 * CRITICAL: Uses window.location.href (NOT router.push) for auth-failure redirects.
 * router.push is unreliable from within layout effects — it triggers client-side
 * navigation that can be swallowed by React re-renders. window.location.href
 * performs a hard browser navigation that is deterministic and uninterruptible.
 */
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth/AuthProvider";

interface DashboardAuthGuardProps {
  setUser: (user: any) => void;
  setLoading: (loading: boolean) => void;
  user: any;
}

export function DashboardAuthGuard({
  setUser,
  setLoading,
  user,
}: DashboardAuthGuardProps) {
  const router = useRouter();
  const { authState, user: authUser, clearSession } = useAuth();
  // Prevent duplicate redirects (React Strict Mode fires effects twice)
  const redirectInProgressRef = useRef(false);

  /**
   * Hard redirect — deterministic, uninterruptible browser navigation.
   * Used for all auth-failure cases. NOT router.push.
   */
  const hardRedirect = (url: string) => {
    if (redirectInProgressRef.current) return;
    redirectInProgressRef.current = true;
    console.info(`[DASHBOARD] Hard redirect → ${url}`);
    window.location.href = url;
  };

  /**
   * Auth guard with explicit state handling
   * Timeout protection: max 10 seconds in loading states
   */
  useEffect(() => {
    // Timeout protection
    const authTimeout = setTimeout(() => {
      if (
        authState === "INITIALIZING" ||
        authState === "VERIFYING_SESSION" ||
        authState === "SYNCING_TO_DB"
      ) {
        console.error("[DASHBOARD] Auth timeout — hard redirecting to login");
        hardRedirect("/login?error=auth_timeout");
      }
    }, 10000); // 10 second timeout

    // Handle auth states explicitly
    switch (authState) {
      case "UNAUTHENTICATED":
        console.info(
          "[DASHBOARD] User not authenticated, redirecting to login",
        );
        // Defensive: ensure any stray cookies/storage are cleared
        clearSession().catch((err) =>
          console.error(
            "[DASHBOARD] clearSession error on UNAUTHENTICATED:",
            err,
          ),
        );
        hardRedirect("/login");
        break;

      case "SESSION_ONLY":
        // CRITICAL: Firebase session exists but DB user missing
        console.error(
          "[DASHBOARD] CRITICAL: SESSION_ONLY state detected in dashboard",
        );
        clearSession().catch((err) =>
          console.error("[DASHBOARD] clearSession error on SESSION_ONLY:", err),
        );
        hardRedirect(
          "/signup?error=account_not_found&message=Your account was not fully created. Please sign up again to complete setup.",
        );
        break;

      case "AUTH_ERROR":
        console.error("[DASHBOARD] Auth error detected, redirecting to login");
        hardRedirect("/login?error=auth_error");
        break;

      case "AUTHENTICATED":
        // User is fully authenticated, check onboarding status
        const checkOnboarding = async () => {
          try {
            const response = await fetch("/api/onboarding/check");

            if (response.status === 401) {
              hardRedirect("/login");
              return;
            }

            if (response.status === 404) {
              // User not found in DB despite AUTHENTICATED state
              console.error(
                "[DASHBOARD] User not found despite AUTHENTICATED state",
              );
              await clearSession();
              hardRedirect(
                "/signup?error=account_not_found&message=Your account was not fully created. Please sign up again to complete setup.",
              );
              return;
            }

            const data = await response.json();

            if (!data.onboardingCompleted && !data.hasActiveSubscription) {
              // Onboarding redirect can use router.push (user IS authenticated)
              router.push("/onboarding");
              return;
            }

            // Self-healing: If user has a subscription but onboarding flag is false, fix it
            if (data.hasActiveSubscription && !data.onboardingCompleted) {
              fetch("/api/onboarding/complete", { method: "POST" }).catch(
                (err) =>
                  console.error("Error auto-completing onboarding:", err),
              );
            }

            setUser(authUser);
            setLoading(false);
          } catch (error) {
            console.error("[DASHBOARD] Error checking onboarding:", error);
            // Network/server error — hard redirect to login
            hardRedirect("/login?error=onboarding_check_failed");
          }
        };

        checkOnboarding();
        break;

      case "INITIALIZING":
      case "VERIFYING_SESSION":
      case "SYNCING_TO_DB":
        // Loading states - do nothing, wait for state to resolve
        break;

      default:
        console.warn(`[DASHBOARD] Unknown auth state: ${authState}`);
        hardRedirect("/login?error=unknown_state");
    }

    return () => clearTimeout(authTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, authUser]);

  // This component doesn't render anything - it just handles auth logic
  return null;
}
