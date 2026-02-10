/**
 * Global Auth Guard for Protected Routes
 *
 * USE THIS GUARD ON ANY PROTECTED ROUTE TO PREVENT SESSION_ONLY BUG
 *
 * Usage:
 * ```tsx
 * import { ProtectedRouteGuard } from "@/app/components/auth/ProtectedRouteGuard";
 *
 * export default function MyProtectedPage() {
 *   return (
 *     <ProtectedRouteGuard>
 *       <YourPageContent />
 *    </ProtectedRouteGuard>
 *   );
 * }
 * ```
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth/AuthProvider";
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";

interface ProtectedRouteGuardProps {
  children: React.ReactNode;
  /** Optional: Require specific protection level */
  requireOnboarding?: boolean;
  /** Optional: Custom redirect path for unauthenticated users */
  redirectTo?: string;
}

export function ProtectedRouteGuard({
  children,
  requireOnboarding = false,
  redirectTo = "/login",
}: ProtectedRouteGuardProps) {
  const { authState, clearSession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Timeout protection (15 seconds)
    const authTimeout = setTimeout(() => {
      if (
        authState === "INITIALIZING" ||
        authState === "VERIFYING_SESSION" ||
        authState === "SYNCING_TO_DB"
      ) {
        console.error("[PROTECTED_ROUTE] Auth timeout");
        router.push(`${redirectTo}?error=auth_timeout`);
      }
    }, 15000);

    // Handle auth states
    switch (authState) {
      case "UNAUTHENTICATED":
        console.info("[PROTECTED_ROUTE] Redirecting unauthenticated user");
        router.push(redirectTo);
        break;

      case "SESSION_ONLY":
        // CRITICAL: Firebase session exists but DB user missing
        console.error("[PROTECTED_ROUTE] CRITICAL: SESSION_ONLY detected");
        console.warn("[PROTECTED_ROUTE] Forcing signout");
        clearSession();
        router.push(
          "/signup?error=account_not_found&message=Your account was not fully created. Please sign up again to complete setup.",
        );
        break;

      case "AUTH_ERROR":
        console.error("[PROTECTED_ROUTE] Auth error");
        router.push(`${redirectTo}?error=auth_error`);
        break;

      case "AUTHENTICATED":
        // User is authenticated, allow access
        if (requireOnboarding) {
          // If onboarding required, check it in the component
          console.info(
            "[PROTECTED_ROUTE] User authenticated, checking onboarding...",
          );
        }
        break;

      case "INITIALIZING":
      case "VERIFYING_SESSION":
      case "SYNCING_TO_DB":
        // Loading - do nothing
        break;

      default:
        console.warn(`[PROTECTED_ROUTE] Unknown auth state: ${authState}`);
    }

    return () => clearTimeout(authTimeout);
  }, [authState, router, redirectTo, requireOnboarding, clearSession]);

  // Show loading while auth is in progress
  if (
    authState === "INITIALIZING" ||
    authState === "VERIFYING_SESSION" ||
    authState === "SYNCING_TO_DB"
  ) {
    return <SpaceshipLoader text="Verifying authentication..." />;
  }

  // Show loading while redirecting from error states
  if (
    authState === "UNAUTHENTICATED" ||
    authState === "SESSION_ONLY" ||
    authState === "AUTH_ERROR"
  ) {
    return <SpaceshipLoader text="Redirecting..." />;
  }

  // Render protected content only when AUTHENTICATED
  if (authState === "AUTHENTICATED") {
    return <>{children}</>;
  }

  // Fallback: show loading
  return <SpaceshipLoader text="Loading..." />;
}
