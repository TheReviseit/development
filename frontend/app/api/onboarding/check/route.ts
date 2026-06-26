/**
 * Onboarding Check API
 *
 * Hot-path access-state endpoint used by login redirects, dashboard guards, and
 * onboarding flows. The fast path reads one DB-computed state document and keeps
 * the legacy multi-query implementation as a safe fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookieSafe, adminAuth } from "@/lib/firebase-admin";
import { detectProductFromRequest } from "@/lib/auth-helpers";
import {
  getUserByFirebaseUID,
  getSubscriptionByUserId,
} from "@/lib/supabase/queries";
import { getWhatsAppAccountsByUserId } from "@/lib/supabase/facebook-whatsapp-queries";
import { createSupabaseServiceClientOrThrow } from "@/lib/auth/provisioning.server";
import {
  getSupabaseServiceClient,
  warmupSupabaseConnection,
  ONBOARDING_SUPABASE_TIMEOUT_MS,
} from "@/lib/supabase/service-client";
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

/**
 * Check trial status with a SINGLE combined query.
 *
 * Previously this ran 2 serial queries (active → expired) inside what was
 * supposed to be a parallel Promise.allSettled batch, adding unnecessary
 * latency.  Now we fetch all candidate trials in one query and classify
 * active vs. expired in TypeScript.
 */
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

  // Single query: fetch all candidate trials (active, expiring_soon, expired)
  let combinedQuery = supabase
    .from("free_trials")
    .select("id, started_at, expires_at, plan_slug, status")
    .in("user_id", trialIdentityKeys)
    .or("status.eq.active,status.eq.expiring_soon,status.eq.expired")
    .order("expires_at", { ascending: false })
    .limit(5);

  if (product !== "dashboard") {
    combinedQuery = combinedQuery.eq("domain", product);
  }

  const { data: trials, error } = await combinedQuery;

  if (error) {
    console.error("[onboarding/check] Trial check error:", error);
    throw error;
  }

  if (!trials || trials.length === 0) {
    return { hasActiveTrial: false, isExpired: false };
  }

  // Classify in TypeScript: active trial = status active/expiring_soon AND not yet expired
  const activeTrial = trials.find(
    (t) =>
      (t.status === "active" || t.status === "expiring_soon") &&
      t.expires_at &&
      t.expires_at > nowIso,
  );

  if (activeTrial) {
    return {
      hasActiveTrial: true,
      isExpired: false,
      trialDetails: {
        startedAt: activeTrial.started_at,
        expiresAt: activeTrial.expires_at,
        planSlug: activeTrial.plan_slug,
      },
    };
  }

  // No active trial — check if any trial exists (i.e. expired)
  const anyTrial = trials[0];
  return {
    hasActiveTrial: false,
    isExpired: true,
    trialDetails: {
      startedAt: anyTrial.started_at,
      expiresAt: anyTrial.expires_at,
      planSlug: anyTrial.plan_slug,
    },
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

/**
 * Build the fast-path response from the RPC state.
 * Extracted to avoid duplication in the parallel race strategy.
 */
function buildFastPathResponse(
  state: import("@/lib/auth/onboarding-state.server").OnboardingAccessState,
  product: ProductDomain,
  startTime: number,
): NextResponse {
  if (!state.userExists) {
    logStructured("error", "user_not_found", { firebaseUID: "unknown" });
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
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    const authHeader = request.headers.get("authorization");

    let firebaseUID: string;

    if (sessionCookie) {
      // Fast path: verified session cookie (existing users, repeat requests)
      const [authResult] = await Promise.all([
        withTimeout(
          verifySessionCookieSafe(sessionCookie, false),
          3000,
          "FIREBASE_SESSION_VERIFY_TIMEOUT",
        ),
        warmupSupabaseConnection(ONBOARDING_SUPABASE_TIMEOUT_MS),
      ]);

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

      firebaseUID = authResult.data!.uid;
    } else if (authHeader?.startsWith("Bearer ")) {
      // Fast path for newly signed-up users: Firebase ID token (no session cookie yet)
      try {
        const idToken = authHeader.slice(7);
        const decoded = await adminAuth.verifyIdToken(idToken);
        firebaseUID = decoded.uid;
        // Fire-and-forget DB warmup (don't block response for it)
        warmupSupabaseConnection(ONBOARDING_SUPABASE_TIMEOUT_MS).catch(() => {});
      } catch (error) {
        console.error("[onboarding-check] Token verification error:", error);
        return withServerTiming(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
          startTime,
          "error",
        );
      }
    } else {
      return withServerTiming(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        startTime,
        "error",
      );
    }
    const product = detectProductFromRequest(request);

    if (isFastOnboardingCheckEnabled()) {
      // ── PARALLEL RACE: fast-path vs. legacy ─────────────────────
      // Instead of trying fast-path first and falling back to legacy
      // after a 2.5s timeout (wasting that time completely), we race
      // both paths simultaneously.  Whichever finishes first wins.
      //
      // On warm DB: fast-path wins in ~300ms, legacy is abandoned.
      // On cold DB: both start immediately — no wasted timeout gap.
      const fastPathPromise = (async (): Promise<NextResponse> => {
        const supabase = getSupabaseServiceClient({ timeoutMs: ONBOARDING_SUPABASE_TIMEOUT_MS });
        const state = await readOnboardingAccessStateFast({
          supabase,
          firebaseUid: firebaseUID,
          product,
        });
        return buildFastPathResponse(state, product, startTime);
      })();

      const legacyPromise = runLegacyOnboardingCheck({
        firebaseUID,
        product,
        startTime,
        fallback: true,
      });

      try {
        // Promise.any resolves with the FIRST successful result.
        // If fast-path succeeds first (warm DB), legacy result is discarded.
        // If fast-path fails (cold timeout), legacy result is used.
        const winner = await Promise.any([fastPathPromise, legacyPromise]);

        // Log which path won for observability
        const source = winner.headers.get("Server-Timing")?.includes("fast_path")
          ? "fast_path"
          : "legacy";
        const loserSource = source === "fast_path" ? "legacy" : "fast_path";
        debugLog(`[onboarding/check] Race won by ${source}, ${loserSource} abandoned`);

        return winner;
      } catch (aggregateError) {
        // Promise.any only rejects when ALL promises reject
        logStructured("error", "both_paths_failed", {
          product,
          error: String(aggregateError),
          durationMs: Date.now() - startTime,
        });
        // Fall through to the outer catch
        throw aggregateError;
      }
    }

    // Fast path disabled — legacy only
    return await runLegacyOnboardingCheck({
      firebaseUID,
      product,
      startTime,
      fallback: false,
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
