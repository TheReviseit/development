/**
 * Onboarding Check API
 *
 * Hot-path access-state endpoint used by login redirects, dashboard guards, and
 * onboarding flows. The fast path reads one DB-computed state document and keeps
 * the legacy multi-query implementation as a safe fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { detectProductFromRequest } from "@/lib/auth-helpers";
import {
  getUserByFirebaseUID,
  getSubscriptionByUserId,
} from "@/lib/supabase/queries";
import { getWhatsAppAccountsByUserId } from "@/lib/supabase/facebook-whatsapp-queries";
import { createSupabaseServiceClientOrThrow } from "@/lib/auth/provisioning.server";
import { withTimeout } from "@/lib/server/fetchWithTimeout";
import {
  buildOnboardingPayload,
  isFastOnboardingCheckEnabled,
  readOnboardingAccessStateFast,
  type TrialDetails,
} from "@/lib/auth/onboarding-state.server";
import type { ProductDomain } from "@/lib/domain/config";

interface OnboardingCheckResult {
  onboardingCompleted?: boolean;
  whatsappConnected?: boolean | "error";
  hasActiveSubscription?: boolean | "error";
  hasActiveTrial?: boolean | "error";
  isTrialExpired?: boolean;
  hasProductAccess?: boolean;
  requiresWhatsApp?: boolean;
  whatsappSatisfied?: boolean;
  canEnterDashboard?: boolean;
  nextPath?: string;
  reason?: string;
  trialDetails?: TrialDetails;
  error?: string;
  code?: string;
  message?: string;
  errors?: string[];
  userExists?: boolean;
  _meta?: {
    durationMs: number;
    timestamp: string;
    partialData: boolean;
    source?: "fast_path" | "legacy";
    fallback?: boolean;
  };
}

const DEBUG_ONBOARDING_CHECK =
  process.env.DEBUG_ONBOARDING_CHECK === "true";

function logStructured(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>,
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  console.log(`[onboarding/check:${level}] ${JSON.stringify(logEntry)}`);
}

function debugLog(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_ONBOARDING_CHECK) return;
  if (data) {
    console.log(message, data);
  } else {
    console.log(message);
  }
}

function withServerTiming(
  response: NextResponse,
  startTime: number,
  source: "fast_path" | "legacy" | "error",
) {
  const durationMs = Date.now() - startTime;
  response.headers.set(
    "Server-Timing",
    `onboarding_check;dur=${durationMs};desc="${source}"`,
  );
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

async function checkTrialStatus(
  userId: string,
  firebaseUID: string,
  product: ProductDomain,
): Promise<{
  hasActiveTrial: boolean;
  isExpired: boolean;
  trialDetails?: TrialDetails;
}> {
  const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });
  const nowIso = new Date().toISOString();
  const trialIdentityKeys = Array.from(new Set([userId, firebaseUID]));

  let activeTrialQuery = supabase
    .from("free_trials")
    .select("id, started_at, expires_at, plan_slug")
    .in("user_id", trialIdentityKeys)
    .in("status", ["active", "expiring_soon"])
    .gt("expires_at", nowIso)
    .limit(1);

  if (product !== "dashboard") {
    activeTrialQuery = activeTrialQuery.eq("domain", product);
  }

  const { data: activeTrialData, error: activeTrialError } =
    await activeTrialQuery;

  if (activeTrialError) {
    console.error("[onboarding/check] Trial check error:", activeTrialError);
    throw activeTrialError;
  }

  if (activeTrialData && activeTrialData.length > 0) {
    const trial = activeTrialData[0];
    return {
      hasActiveTrial: true,
      isExpired: false,
      trialDetails: {
        startedAt: trial.started_at,
        expiresAt: trial.expires_at,
        planSlug: trial.plan_slug,
      },
    };
  }

  let expiredTrialQuery = supabase
    .from("free_trials")
    .select("id, started_at, expires_at, plan_slug, status")
    .in("user_id", trialIdentityKeys)
    .or("status.eq.expired,status.eq.active,status.eq.expiring_soon")
    .limit(1);

  if (product !== "dashboard") {
    expiredTrialQuery = expiredTrialQuery.eq("domain", product);
  }

  const { data: expiredTrialData, error: expiredTrialError } =
    await expiredTrialQuery;

  if (expiredTrialError) {
    console.error("[onboarding/check] Expired trial check error:", expiredTrialError);
    throw expiredTrialError;
  }

  const expiredTrial = expiredTrialData?.[0];
  const hasExpiredTrial = Boolean(expiredTrial);

  return {
    hasActiveTrial: false,
    isExpired: hasExpiredTrial,
    trialDetails: expiredTrial
      ? {
          startedAt: expiredTrial.started_at,
          expiresAt: expiredTrial.expires_at,
          planSlug: expiredTrial.plan_slug,
        }
      : undefined,
  };
}

async function checkProductMembershipStatus(
  userId: string,
  product: ProductDomain,
): Promise<{
  hasActiveSubscription: boolean;
  hasActiveTrial: boolean;
  isExpired: boolean;
  trialDetails?: TrialDetails;
}> {
  if (product === "dashboard") {
    return {
      hasActiveSubscription: false,
      hasActiveTrial: false,
      isExpired: false,
    };
  }

  const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });
  const { data: membership, error } = await supabase
    .from("user_products")
    .select("id, status, activated_at, trial_ends_at")
    .eq("user_id", userId)
    .eq("product", product)
    .maybeSingle();

  if (error) {
    console.error("[onboarding/check] Membership check error:", error);
    throw error;
  }

  const status = (membership?.status as string | undefined)?.toLowerCase();

  if (!membership || !status) {
    return {
      hasActiveSubscription: false,
      hasActiveTrial: false,
      isExpired: false,
    };
  }

  if (status === "active") {
    return {
      hasActiveSubscription: true,
      hasActiveTrial: false,
      isExpired: false,
    };
  }

  if (status !== "trial") {
    return {
      hasActiveSubscription: false,
      hasActiveTrial: false,
      isExpired: false,
    };
  }

  const trialEndsAt = membership.trial_ends_at
    ? new Date(membership.trial_ends_at)
    : null;
  const trialDetails: TrialDetails | undefined = membership.trial_ends_at
    ? {
        startedAt: membership.activated_at,
        expiresAt: membership.trial_ends_at,
        planSlug: `${product}_starter`,
      }
    : undefined;

  if (!trialEndsAt || trialEndsAt > new Date()) {
    return {
      hasActiveSubscription: false,
      hasActiveTrial: true,
      isExpired: false,
      trialDetails,
    };
  }

  return {
    hasActiveSubscription: false,
    hasActiveTrial: false,
    isExpired: true,
    trialDetails,
  };
}

async function runLegacyOnboardingCheck(params: {
  firebaseUID: string;
  product: ProductDomain;
  startTime: number;
  fallback: boolean;
}) {
  const { firebaseUID, product, startTime, fallback } = params;
  const errors: string[] = [];
  const user = await getUserByFirebaseUID(firebaseUID);

  if (!user) {
    logStructured("error", "user_not_found", { firebaseUID });

    const response = NextResponse.json(
      {
        error: "USER_NOT_FOUND",
        code: "USER_NOT_FOUND",
        userExists: false,
        message: "User account not found in database",
      } satisfies OnboardingCheckResult,
      { status: 404 },
    );
    response.cookies.delete("session");
    return withServerTiming(response, startTime, "legacy");
  }

  const [whatsappResult, subscriptionResult, trialResult, membershipResult] =
    await Promise.allSettled([
      getWhatsAppAccountsByUserId(user.id)
        .then((accounts) => ({
          status: "success" as const,
          connected: accounts.length > 0,
        }))
        .catch((error) => {
          errors.push(`whatsapp_check_failed: ${error.message}`);
          return {
            status: "error" as const,
            connected: "error" as const,
          };
        }),

      getSubscriptionByUserId(user.id)
        .then((sub) => ({
          status: "success" as const,
          hasSubscription: Boolean(sub),
        }))
        .catch((error) => {
          errors.push(`subscription_check_failed: ${error.message}`);
          return {
            status: "error" as const,
            hasSubscription: "error" as const,
          };
        }),

      checkTrialStatus(user.id, firebaseUID, product)
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
            hasActiveTrial: "error" as const,
            isTrialExpired: false,
            trialDetails: undefined,
          };
        }),

      checkProductMembershipStatus(user.id, product)
        .then((membershipCheck) => ({
          status: "success" as const,
          hasActiveSubscription: membershipCheck.hasActiveSubscription,
          hasActiveTrial: membershipCheck.hasActiveTrial,
          isTrialExpired: membershipCheck.isExpired,
          trialDetails: membershipCheck.trialDetails,
        }))
        .catch((error) => {
          errors.push(`membership_check_failed: ${error.message}`);
          return {
            status: "error" as const,
            hasActiveSubscription: "error" as const,
            hasActiveTrial: "error" as const,
            isTrialExpired: false,
            trialDetails: undefined,
          };
        }),
    ]);

  const whatsappConnected =
    whatsappResult.status === "fulfilled"
      ? whatsappResult.value.connected
      : "error";
  const subscriptionActive =
    subscriptionResult.status === "fulfilled"
      ? subscriptionResult.value.hasSubscription
      : "error";
  const freeTrialActive =
    trialResult.status === "fulfilled"
      ? trialResult.value.hasActiveTrial
      : "error";
  const freeTrialExpired =
    trialResult.status === "fulfilled"
      ? trialResult.value.isTrialExpired
      : false;
  const freeTrialDetails =
    trialResult.status === "fulfilled"
      ? trialResult.value.trialDetails
      : undefined;
  const membershipActiveSubscription =
    membershipResult.status === "fulfilled"
      ? membershipResult.value.hasActiveSubscription
      : "error";
  const membershipActiveTrial =
    membershipResult.status === "fulfilled"
      ? membershipResult.value.hasActiveTrial
      : "error";
  const membershipTrialExpired =
    membershipResult.status === "fulfilled"
      ? membershipResult.value.isTrialExpired
      : false;
  const membershipTrialDetails =
    membershipResult.status === "fulfilled"
      ? membershipResult.value.trialDetails
      : undefined;

  const hasActiveSubscription =
    subscriptionActive === "error" || membershipActiveSubscription === "error"
      ? "error"
      : subscriptionActive === true || membershipActiveSubscription === true;
  const hasActiveTrial =
    freeTrialActive === "error" || membershipActiveTrial === "error"
      ? "error"
      : freeTrialActive === true || membershipActiveTrial === true;
  const isTrialExpired =
    (freeTrialExpired === true || membershipTrialExpired === true) &&
    hasActiveTrial !== true;
  const trialDetails = freeTrialDetails ?? membershipTrialDetails;

  const hasPartialData =
    whatsappConnected === "error" ||
    hasActiveSubscription === "error" ||
    hasActiveTrial === "error";

  if (hasPartialData) {
    logStructured("warn", "partial_data", {
      userId: user.id.slice(0, 8),
      errors,
      fallback,
      partialData: true,
    });

    return withServerTiming(
      NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          message:
            "Unable to verify onboarding status due to partial service outage",
          errors,
          _meta: {
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            partialData: true,
            source: "legacy",
            fallback,
          },
        } satisfies OnboardingCheckResult,
        { status: 503 },
      ),
      startTime,
      "legacy",
    );
  }

  const safeWhatsappConnected = whatsappConnected === true;
  const safeHasActiveSubscription = hasActiveSubscription === true;
  const safeHasActiveTrial = hasActiveTrial === true;
  const rawOnboardingCompleted = user.onboarding_completed_at != null;
  const payload = buildOnboardingPayload(
    {
      userExists: true,
      userId: user.id,
      onboardingCompleted: rawOnboardingCompleted,
      whatsappConnected: safeWhatsappConnected,
      hasActiveSubscription: safeHasActiveSubscription,
      hasActiveTrial: safeHasActiveTrial,
      isTrialExpired,
      trialDetails,
    },
    product,
  );
  const durationMs = Date.now() - startTime;

  debugLog("[onboarding/check] Legacy decision values:", {
    userId: user.id.slice(0, 8),
    rawOnboardingCompleted,
    product,
    hasActiveSubscription: safeHasActiveSubscription,
    hasActiveTrial: safeHasActiveTrial,
    whatsappConnected: safeWhatsappConnected,
    onboardingCompleted: payload.onboardingCompleted,
  });

  if (payload.onboardingCompleted && !rawOnboardingCompleted) {
    logStructured("error", "onboarding_drift_detected", {
      userId: user.id.slice(0, 8),
      reason:
        safeHasActiveTrial
          ? "trial_active"
          : safeHasActiveSubscription
            ? "subscription_active"
            : "whatsapp_connected",
      expectedOnboardingAt: user.onboarding_completed_at,
      alert: true,
    });
  }

  logStructured("info", "onboarding_check_completed", {
    userId: user.id.slice(0, 8),
    product,
    onboardingCompleted: payload.onboardingCompleted,
    whatsappConnected: payload.whatsappConnected,
    hasActiveSubscription: payload.hasActiveSubscription,
    hasActiveTrial: payload.hasActiveTrial,
    isTrialExpired: payload.isTrialExpired,
    hasTrialDetails: Boolean(payload.trialDetails),
    durationMs,
    source: "legacy",
    fallback,
    partialData: false,
  });

  return withServerTiming(
    NextResponse.json({
      ...payload,
      _meta: {
        durationMs,
        timestamp: new Date().toISOString(),
        partialData: false,
        source: "legacy",
        fallback,
      },
    } satisfies OnboardingCheckResult),
    startTime,
    "legacy",
  );
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return withServerTiming(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        startTime,
        "error",
      );
    }

    const authResult = await withTimeout(
      verifySessionCookieSafe(sessionCookie, false),
      3000,
      "FIREBASE_SESSION_VERIFY_TIMEOUT",
    );

    if (!authResult.success) {
      const response = NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: 401 },
      );
      if (authResult.shouldClearSession) {
        response.cookies.delete("session");
      }
      return withServerTiming(response, startTime, "error");
    }

    const firebaseUID = authResult.data!.uid;
    const product = detectProductFromRequest(request);

    if (isFastOnboardingCheckEnabled()) {
      try {
        const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 2500 });
        const state = await readOnboardingAccessStateFast({
          supabase,
          firebaseUid: firebaseUID,
          product,
        });

        if (!state.userExists) {
          logStructured("error", "user_not_found", { firebaseUID });

          const response = NextResponse.json(
            {
              error: "USER_NOT_FOUND",
              code: "USER_NOT_FOUND",
              userExists: false,
              message: "User account not found in database",
            } satisfies OnboardingCheckResult,
            { status: 404 },
          );
          response.cookies.delete("session");
          return withServerTiming(response, startTime, "fast_path");
        }

        const payload = buildOnboardingPayload(state, product);
        const durationMs = Date.now() - startTime;

        logStructured("info", "onboarding_check_completed", {
          userId: state.userId?.slice(0, 8),
          product,
          onboardingCompleted: payload.onboardingCompleted,
          whatsappConnected: payload.whatsappConnected,
          hasActiveSubscription: payload.hasActiveSubscription,
          hasActiveTrial: payload.hasActiveTrial,
          isTrialExpired: payload.isTrialExpired,
          durationMs,
          source: "fast_path",
          partialData: false,
        });

        return withServerTiming(
          NextResponse.json({
            ...payload,
            _meta: {
              durationMs,
              timestamp: new Date().toISOString(),
              partialData: false,
              source: "fast_path",
              fallback: false,
            },
          } satisfies OnboardingCheckResult),
          startTime,
          "fast_path",
        );
      } catch (error: any) {
        logStructured("warn", "fast_path_fallback", {
          product,
          error: error?.message || String(error),
          durationMs: Date.now() - startTime,
        });
      }
    }

    return await runLegacyOnboardingCheck({
      firebaseUID,
      product,
      startTime,
      fallback: isFastOnboardingCheckEnabled(),
    });
  } catch (error: any) {
    console.error("[onboarding/check] Fatal error:", error);

    logStructured("error", "fatal_error", {
      error: error.message,
      stack: error.stack,
      durationMs: Date.now() - startTime,
    });

    return withServerTiming(
      NextResponse.json(
        {
          error: "Internal server error",
          message: error.message || "Unknown error",
          _meta: {
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            partialData: false,
          },
        } satisfies OnboardingCheckResult,
        { status: 500 },
      ),
      startTime,
      "error",
    );
  }
}
