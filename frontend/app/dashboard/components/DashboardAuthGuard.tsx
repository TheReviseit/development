/**
 * Dashboard Auth Guard Inner Component
 * This component is rendered INSIDE AuthProvider and can safely use useAuth()
 *
 * CRITICAL: Uses window.location.href (NOT router.push) for auth-failure redirects.
 * router.push is unreliable from within layout effects — it triggers client-side
 * navigation that can be swallowed by React re-renders. window.location.href
 * performs a hard browser navigation that is deterministic and uninterruptible.
 *
 * ARCHITECTURE CHANGE (v5):
 *   - Trial expiry is NO LONGER handled here
 *   - BillingLockScreen (in layout.tsx) handles all billing/trial locks
 *   - This guard ONLY handles auth state + onboarding check
 *   - Expired trials MUST NOT redirect to onboarding (critical fix)
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
  const { authState, user: authUser, clearSession, currentProduct, syncUser } = useAuth();
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

      case "PRODUCT_NOT_ENABLED": {
        // Paid products (marketing, shop, showcase) must go through the
        // onboarding/payment flow — NOT the free-trial activate page.
        const product = currentProduct || "dashboard";
        const PAID_DOMAINS = ["marketing", "shop", "showcase"];

        // ===================================================================
        // BOUNDED RETRY: If we just came from trial activation, the atomic
        // RPC (start_trial_with_access) should have written user_products
        // within ~200ms. The proxy round-trip adds ~50ms.
        //
        // SLA assumption: If user_products is not available after 1.5s,
        // something is structurally broken — not a timing issue.
        //
        // This is a CLIENT-SIDE compensating action for the (rare) case
        // where the RPC completes but auth sync reads before the write is
        // visible. If Fix 1 is working correctly, this path should NEVER
        // execute. If it executes frequently → Fix 1 has a regression.
        // ===================================================================
        const params = new URLSearchParams(window.location.search);
        const justStartedTrial = params.get("trial_started") === "true";

        if (justStartedTrial && PAID_DOMAINS.includes(product)) {
          console.warn(
            `[DASHBOARD] trial_started=true but PRODUCT_NOT_ENABLED — ` +
              `retrying auth sync once (bounded, max 1.5s wait)`,
          );

          // CRITICAL: Remove trial_started param BEFORE retry to prevent
          // infinite retry loops. If retry fails, the URL no longer has
          // the param, so the next render hits the normal redirect path.
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, "", cleanUrl);

          // Bounded retry — single attempt after 1.5s
          setTimeout(async () => {
            try {
              // syncUser is captured from useAuth() at component level
              // (hooks-safe — NOT calling useAuth() inside this callback)
              const { getIdToken } = await import("firebase/auth");
              const { auth } = await import("@/src/firebase/firebase");
              const currentUser = auth.currentUser;

              if (currentUser) {
                const idToken = await getIdToken(currentUser, true);
                await syncUser(idToken);
                // If sync succeeds, authState updates → re-triggers this
                // effect → hits AUTHENTICATED case → dashboard loads
              } else {
                console.error(
                  `[DASHBOARD] ❌ BOUNDED RETRY FAILED: no Firebase user`,
                );
                hardRedirect(`/onboarding-embedded?domain=${product}`);
              }
            } catch (retryErr) {
              // Retry failed — this is a hard error, not a timing issue.
              // Fix 1 (atomic RPC) may be broken.
              console.error(
                `[DASHBOARD] ❌ BOUNDED RETRY FAILED: trial started but ` +
                  `product access not granted after retry. Redirecting to ` +
                  `onboarding. This indicates Fix 1 (atomic RPC) may be broken.`,
                retryErr,
              );
              hardRedirect(`/onboarding-embedded?domain=${product}`);
            }
          }, 1500);
          break;
        }

        // Normal PRODUCT_NOT_ENABLED (no trial context)
        const destination = PAID_DOMAINS.includes(product)
          ? `/onboarding-embedded?domain=${product}`
          : `/activate?product=${product}`;
        console.warn(
          `[DASHBOARD] Product not enabled, redirecting to ${destination}`,
        );
        hardRedirect(destination);
        break;
      }

      case "AUTH_ERROR":
        console.error("[DASHBOARD] Auth error detected, redirecting to login");
        hardRedirect("/login?error=auth_error");
        break;

      case "AUTHENTICATED": {
        // Bounded retry with exponential backoff for 503 Service Unavailable
        const checkOnboarding = async (retries = 3, attempt = 0) => {
          try {
            const response = await fetch("/api/onboarding/check");

            // Handle 503 Service Unavailable with bounded retry
            // This happens when some checks fail (partial data scenario)
            if (response.status === 503) {
              if (retries === 0) {
                console.error(
                  "[DASHBOARD] Onboarding check exhausted retries (503), redirecting to login",
                );
                hardRedirect("/login?error=service_unavailable");
                return;
              }

              // Exponential backoff: 1s, 2s, 4s
              const backoffMs = 1000 * Math.pow(2, attempt);
              console.warn(
                `[DASHBOARD] Onboarding check 503, retrying in ${backoffMs}ms (${retries} retries left)`,
              );

              setTimeout(
                () => checkOnboarding(retries - 1, attempt + 1),
                backoffMs,
              );
              return;
            }

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

            if (!response.ok) {
              console.error(
                `[DASHBOARD] Onboarding check failed with status ${response.status}`,
              );
              hardRedirect("/login?error=onboarding_check_failed");
              return;
            }

            const data = await response.json();

            // DEBUG: Log full response
            console.log("[DASHBOARD] Onboarding check response:", {
              onboardingCompleted: data.onboardingCompleted,
              whatsappConnected: data.whatsappConnected,
              hasActiveSubscription: data.hasActiveSubscription,
              hasActiveTrial: data.hasActiveTrial,
              isTrialExpired: data.isTrialExpired,
              hasTrialDetails: !!data.trialDetails,
            });

            // Check for "error" as explicit third state (not just false)
            const hasErrors =
              data.whatsappConnected === "error" ||
              data.hasActiveSubscription === "error" ||
              data.hasActiveTrial === "error";

            if (hasErrors) {
              console.error("[DASHBOARD] Onboarding check returned errors:", {
                whatsappConnected: data.whatsappConnected,
                hasActiveSubscription: data.hasActiveSubscription,
                hasActiveTrial: data.hasActiveTrial,
              });
              // Fail closed - treat as not onboarded, but log for investigation
              hardRedirect("/login?error=service_unavailable");
              return;
            }

            // ═══════════════════════════════════════════════════════════════
            // CRITICAL FIX (v5): EXPIRED TRIAL → DO NOT REDIRECT
            // ═══════════════════════════════════════════════════════════════
            // If trial is expired, let the user through to dashboard.
            // BillingLockScreen (in layout.tsx) will catch it via
            // /api/subscription/billing-status and show the paywall.
            //
            // NEVER redirect expired trials to onboarding. This was the
            // root cause of the infinite redirect loop.
            // ═══════════════════════════════════════════════════════════════
            if (data.isTrialExpired === true) {
              console.info(
                "[DASHBOARD] ✅ Trial expired — allowing dashboard load " +
                  "(BillingLockScreen will handle paywall)",
              );
              setUser(authUser);
              setLoading(false);
              return;
            }

            // Use trial status as equivalent to subscription for dashboard access
            // v4: Explicit boolean checks now that "error" is separate
            const hasProductAccess =
              data.hasActiveSubscription === true || data.hasActiveTrial === true;

            // DEBUG: Log decision values
            console.log("[DASHBOARD] Access check values:", {
              hasProductAccess,
              hasActiveSubscription: data.hasActiveSubscription,
              hasActiveTrial: data.hasActiveTrial,
              isTrialExpired: data.isTrialExpired,
              whatsappConnected: data.whatsappConnected,
            });

            // Redirect to onboarding only if:
            // - No subscription AND no trial AND trial is NOT expired (needs to select plan)
            // OR
            // - Has trial/subscription BUT WhatsApp not connected (needs to connect WhatsApp)
            //
            // CRITICAL SAFETY NET: If onboarding IS completed and WhatsApp IS 
            // connected but there's no product access, it means the trial/sub 
            // expired. DO NOT redirect — let BillingLockScreen handle it.
            if (!hasProductAccess && data.onboardingCompleted === true && data.whatsappConnected === true) {
              console.info(
                "[DASHBOARD] ✅ Onboarding complete, WhatsApp connected, but no product access " +
                  "— trial/sub likely expired. Allowing dashboard load (BillingLockScreen will handle paywall)",
              );
              setUser(authUser);
              setLoading(false);
              return;
            }

            const needsOnboarding = !hasProductAccess || data.whatsappConnected !== true;
            
            if (needsOnboarding) {
              console.log("[DASHBOARD] User needs onboarding:", {
                hasProductAccess,
                whatsappConnected: data.whatsappConnected,
                hasActiveSubscription: data.hasActiveSubscription,
                hasActiveTrial: data.hasActiveTrial,
              });
              router.push("/onboarding-embedded?domain=shop");
              return;
            }

            // v4: No auto-heal - trigger is source of truth
            // If there's drift, the monitoring/alerting will catch it

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
      }

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

  // This component doesn't render anything — auth + onboarding logic only
  return null;
}
