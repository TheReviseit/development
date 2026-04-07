/**
 * Onboarding Check API - v4 FAANG-Grade Implementation
 * 
 * Architecture:
 * - Parallel queries for performance (Promise.allSettled)
 * - Explicit "error" as third state (not just false)
 * - 503 on partial data (fail-closed for reliability)
 * - No auto-heal (DB trigger is source of truth)
 * - Structured logging for drift detection
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import {
  getUserByFirebaseUID,
  getSubscriptionByUserId,
} from "@/lib/supabase/queries";
import { getWhatsAppAccountsByUserId } from "@/lib/supabase/facebook-whatsapp-queries";
import { createClient } from "@supabase/supabase-js";

/**
 * Result type for onboarding check.
 * Note: "error" is an explicit third state, not just false.
 */
interface OnboardingCheckResult {
  onboardingCompleted?: boolean;
  whatsappConnected?: boolean | "error";
  hasActiveSubscription?: boolean | "error";
  hasActiveTrial?: boolean | "error";
  isTrialExpired?: boolean;
  trialDetails?: {
    startedAt: string;
    expiresAt: string;
    planSlug: string;
  };
  error?: string;
  message?: string;
  errors?: string[];
  _meta: {
    durationMs: number;
    timestamp: string;
    partialData: boolean;
  };
}

/**
 * Check trial status for user (bypasses any caching for accuracy)
 * 
 * CRITICAL: Must check BOTH status AND expires_at.
 * A trial with status='active' but expires_at in the past is EXPPIRED.
 * The backend feature gate correctly blocks access, but the frontend
 * was only checking status, causing redirect loops.
 */
async function checkTrialStatus(userId: string): Promise<{
  hasActiveTrial: boolean;
  isExpired: boolean;
  trialDetails?: {
    startedAt: string;
    expiresAt: string;
    planSlug: string;
  };
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[onboarding/check] Missing Supabase env vars");
      return { hasActiveTrial: false, isExpired: false };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Optimized: Index-only scan, check BOTH status AND expires_at
    // Only trials with status IN ('active', 'expiring_soon') AND expires_at > NOW() are valid
    const { data, error, count } = await supabase
      .from("free_trials")
      .select("id, started_at, expires_at, plan_slug", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["active", "expiring_soon"])
      .gt("expires_at", new Date().toISOString())  // CRITICAL: expires_at must be in future
      .limit(1);

    if (error) {
      console.error("[onboarding/check] Trial check error:", error);
      throw error;
    }

    // Debug logging
    console.log("[onboarding/check] Trial check result:", {
      userId: userId.slice(0, 8),
      data: data ? `Array(${data.length})` : 'null',
      count,
      hasTrial: (count ?? 0) > 0 || (data && data.length > 0),
    });

    const hasActiveTrial = (count !== null && count > 0) || (data !== null && data.length > 0);

    console.log("[onboarding/check] Trial check intermediate:", {
      hasActiveTrial,
      dataLength: data?.length,
      count,
    });

    // If we have data, extract trial details for expired state handling
    if (data && data.length > 0) {
      return {
        hasActiveTrial,
        isExpired: false,
        trialDetails: {
          startedAt: data[0].started_at,
          expiresAt: data[0].expires_at,
          planSlug: data[0].plan_slug,
        },
      };
    }

    // Check if user has a trial but it's expired (for proper messaging)
    // This separate query helps us distinguish "no trial" from "trial expired"
    // Check for:
    // 1. status='active' or 'expiring_soon' but expires_at has passed (real-time expiry)
    // 2. status='expired' (already marked as expired)
    const { data: expiredTrialData } = await supabase
      .from("free_trials")
      .select("id, started_at, expires_at, plan_slug, status")
      .eq("user_id", userId)
      .or('status.eq.expired,status.eq.active,status.eq.expiring_soon')
      .limit(1);

    const hasExpiredTrial = !!(expiredTrialData && expiredTrialData.length > 0);

    const result = {
      hasActiveTrial,
      isExpired: hasExpiredTrial && !hasActiveTrial,  // Has trial record but expires_at passed
      trialDetails: (hasExpiredTrial && expiredTrialData) ? {
        startedAt: expiredTrialData[0].started_at,
        expiresAt: expiredTrialData[0].expires_at,
        planSlug: expiredTrialData[0].plan_slug,
      } : undefined,
    };

    console.log("[onboarding/check] Trial check final result:", {
      hasActiveTrial: result.hasActiveTrial,
      isExpired: result.isExpired,
      hasTrialDetails: !!result.trialDetails,
      expiredTrialDataLength: expiredTrialData?.length,
    });

    return result;
  } catch (error) {
    console.error("[onboarding/check] Trial check failed:", error);
    throw error;
  }
}

/**
 * Structured logging helper for observability
 */
function logStructured(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  console.log(`[onboarding/check:${level}] ${JSON.stringify(logEntry)}`);
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the session cookie with safe error handling
    const authResult = await verifySessionCookieSafe(sessionCookie, true);

    if (!authResult.success) {
      const response = NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: 401 },
      );
      if (authResult.shouldClearSession) {
        response.cookies.delete("session");
      }
      return response;
    }

    const firebaseUID = authResult.data!.uid;
    const user = await getUserByFirebaseUID(firebaseUID);

    // Return 404 when user not found (distinguish from incomplete onboarding)
    if (!user) {
      logStructured("error", "user_not_found", { firebaseUID });

      const response = NextResponse.json(
        {
          error: "USER_NOT_FOUND",
          code: "USER_NOT_FOUND",
          userExists: false,
          message: "User account not found in database",
        },
        { status: 404 },
      );
      response.cookies.delete("session");
      return response;
    }

    // =====================================================================
    // PARALLEL QUERIES: All independent checks run simultaneously
    // Target: < 100ms total (vs current 1500ms+)
    // =====================================================================
    const [whatsappResult, subscriptionResult, trialResult] =
      await Promise.allSettled([
        // Check 1: WhatsApp connection
        getWhatsAppAccountsByUserId(user.id)
          .then((accounts) => ({
            status: "success" as const,
            connected: accounts.length > 0,
            count: accounts.length,
          }))
          .catch((error) => {
            errors.push(`whatsapp_check_failed: ${error.message}`);
            return {
              status: "error" as const,
              error: error.message,
              connected: "error" as const,
            };
          }),

        // Check 2: Active subscription
        getSubscriptionByUserId(user.id)
          .then((sub) => ({
            status: "success" as const,
            hasSubscription: !!sub,
          }))
          .catch((error) => {
            errors.push(`subscription_check_failed: ${error.message}`);
            return {
              status: "error" as const,
              error: error.message,
              hasSubscription: "error" as const,
            };
          }),

        // Check 3: Active trial (with expiry detection)
        checkTrialStatus(user.id)
          .then((trialCheck) => ({
            status: "success" as const,
            hasActiveTrial: trialCheck.hasActiveTrial,
            isTrialExpired: trialCheck.isExpired,
            trialDetails: trialCheck.trialDetails,
          }))
          .catch((error) => {
            errors.push(`trial_check_failed: ${error.message}`);
            return {
              status: "error" as const,
              error: error.message,
              hasActiveTrial: "error" as const,
              isTrialExpired: false,
            };
          }),
      ]);

    // Extract results - "error" is a distinct third state
    const whatsappConnected =
      whatsappResult.status === "fulfilled"
        ? whatsappResult.value.connected
        : "error";

    const hasActiveSubscription =
      subscriptionResult.status === "fulfilled"
        ? subscriptionResult.value.hasSubscription
        : "error";

    const hasActiveTrial =
      trialResult.status === "fulfilled"
        ? trialResult.value.hasActiveTrial
        : "error";

    const isTrialExpired =
      trialResult.status === "fulfilled"
        ? trialResult.value.isTrialExpired
        : false;

    const trialDetails =
      trialResult.status === "fulfilled" && "trialDetails" in trialResult.value
        ? trialResult.value.trialDetails
        : undefined;

    // Check for any partial data (some checks failed)
    const hasPartialData =
      whatsappConnected === "error" ||
      hasActiveSubscription === "error" ||
      hasActiveTrial === "error";

    // =====================================================================
    // DECISION LOGIC: Be conservative with partial data
    // =====================================================================
    if (hasPartialData) {
      logStructured("warn", "partial_data", {
        userId: user.id.slice(0, 8),
        errors,
        whatsappStatus: whatsappResult.status,
        subscriptionStatus: subscriptionResult.status,
        trialStatus: trialResult.status,
        partialData: true,
      });

      // Return 503 Service Unavailable - don't make decision with incomplete data
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          message:
            "Unable to verify onboarding status due to partial service outage",
          errors,
          _meta: {
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            partialData: true,
          },
        } satisfies OnboardingCheckResult,
        { status: 503 }
      );
    }

    // All checks succeeded - make decision
    // v2: Use timestamp-based check for onboarding completion
    const isActuallyOnboarded = user.onboarding_completed_at != null;
    const shouldBeOnboarded =
      hasActiveSubscription === true ||
      hasActiveTrial === true ||
      whatsappConnected === true;

    // Debug logging
    console.log("[onboarding/check] Decision values:", {
      userId: user.id.slice(0, 8),
      isActuallyOnboarded,
      shouldBeOnboarded,
      hasActiveSubscription,
      hasActiveTrial,
      whatsappConnected,
      onboarding_completed_at: user.onboarding_completed_at,
    });

    // =====================================================================
    // DRIFT DETECTION: Alert if trigger didn't fire (don't auto-heal)
    // =====================================================================
    if (shouldBeOnboarded && !isActuallyOnboarded) {
      logStructured("error", "onboarding_drift_detected", {
        userId: user.id.slice(0, 8),
        reason: hasActiveTrial === true
          ? "trial_active"
          : hasActiveSubscription === true
            ? "subscription_active"
            : "whatsapp_connected",
        expectedOnboardingAt: user.onboarding_completed_at,
        alert: true, // Page on-call
      });

      // Still return success to user, but flag for investigation
      // The trigger will eventually catch up or needs fixing
    }

    const durationMs = Date.now() - startTime;

    logStructured("info", "onboarding_check_completed", {
      userId: user.id.slice(0, 8),
      onboardingCompleted: isActuallyOnboarded || shouldBeOnboarded,
      whatsappConnected,
      hasActiveSubscription,
      hasActiveTrial,
      isTrialExpired,
      hasTrialDetails: !!trialDetails,
      durationMs,
      partialData: false,
    });

    // DEBUG: Log full response
    console.log("[onboarding/check] Final response:", {
      onboardingCompleted: isActuallyOnboarded || shouldBeOnboarded,
      whatsappConnected,
      hasActiveSubscription,
      hasActiveTrial,
      isTrialExpired,
      hasTrialDetails: !!trialDetails,
    });

    return NextResponse.json({
      onboardingCompleted: isActuallyOnboarded || shouldBeOnboarded,
      whatsappConnected,
      hasActiveSubscription,
      hasActiveTrial,
      isTrialExpired,
      trialDetails,
      _meta: {
        durationMs,
        timestamp: new Date().toISOString(),
        partialData: false,
      },
    } satisfies OnboardingCheckResult);
  } catch (error: any) {
    console.error("[onboarding/check] Fatal error:", error);

    logStructured("error", "fatal_error", {
      error: error.message,
      stack: error.stack,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Unknown error",
        _meta: {
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          partialData: false,
        },
      },
      { status: 500 }
    );
  }
}
