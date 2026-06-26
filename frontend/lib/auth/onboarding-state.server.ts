import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requiresWhatsAppOnboarding,
  type ProductDomain,
} from "@/lib/domain/config";
import type { AuthDecision } from "@/types/auth.types";

export interface TrialDetails {
  startedAt: string;
  expiresAt: string;
  planSlug: string;
}

export interface OnboardingAccessState {
  userExists: boolean;
  userId: string | null;
  onboardingCompleted: boolean;
  whatsappConnected: boolean;
  hasActiveSubscription: boolean;
  hasActiveTrial: boolean;
  isTrialExpired: boolean;
  trialDetails?: TrialDetails;
}

export interface OnboardingCheckPayload {
  onboardingCompleted: boolean;
  whatsappConnected: boolean;
  hasActiveSubscription: boolean;
  hasActiveTrial: boolean;
  isTrialExpired: boolean;
  hasProductAccess: boolean;
  requiresWhatsApp: boolean;
  whatsappSatisfied: boolean;
  canEnterDashboard: boolean;
  nextPath: string;
  reason: AuthDecision["reason"];
  trialDetails?: TrialDetails;
}

export function isFastOnboardingCheckEnabled() {
  return process.env.FAST_ONBOARDING_CHECK_ENABLED !== "false";
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeTrialDetails(value: any): TrialDetails | undefined {
  if (!value) return undefined;

  const startedAt = value.startedAt ?? value.started_at;
  const expiresAt = value.expiresAt ?? value.expires_at;
  const planSlug = value.planSlug ?? value.plan_slug;

  if (!startedAt || !expiresAt || !planSlug) return undefined;

  return {
    startedAt,
    expiresAt,
    planSlug,
  };
}

function normalizeRpcState(raw: any): OnboardingAccessState {
  return {
    userExists: raw?.userExists !== false && raw?.user_exists !== false,
    userId: raw?.userId ?? raw?.user_id ?? null,
    onboardingCompleted: toBoolean(
      raw?.onboardingCompleted ?? raw?.onboarding_completed,
    ),
    whatsappConnected: toBoolean(
      raw?.whatsappConnected ?? raw?.whatsapp_connected,
    ),
    hasActiveSubscription: toBoolean(
      raw?.hasActiveSubscription ?? raw?.has_active_subscription,
    ),
    hasActiveTrial: toBoolean(raw?.hasActiveTrial ?? raw?.has_active_trial),
    isTrialExpired: toBoolean(raw?.isTrialExpired ?? raw?.is_trial_expired),
    trialDetails: normalizeTrialDetails(raw?.trialDetails ?? raw?.trial_details),
  };
}

/**
 * Read the onboarding access state via a single DB RPC call.
 *
 * The timeout is now handled exclusively by the Supabase client's fetch-level
 * AbortController (set via createFetchWithTimeout in service-client.ts).
 * Previously this function ALSO wrapped the RPC in withTimeout(), creating a
 * double-timeout race condition that caused premature ONBOARDING_STATE_RPC_TIMEOUT
 * errors on cold starts.
 */
export async function readOnboardingAccessStateFast(params: {
  supabase: SupabaseClient;
  firebaseUid: string;
  product: ProductDomain;
}): Promise<OnboardingAccessState> {
  const { supabase, firebaseUid, product } = params;

  const { data, error } = await supabase.rpc("get_onboarding_access_state", {
    p_firebase_uid: firebaseUid,
    p_product: product,
  });

  if (error) throw error;
  if (!data) throw new Error("ONBOARDING_STATE_RPC_EMPTY");

  return normalizeRpcState(data);
}

export function buildAuthDecision(
  state: OnboardingAccessState,
  product: ProductDomain,
): AuthDecision {
  const whatsappRequired = requiresWhatsAppOnboarding(product);
  const hasProductAccess =
    state.hasActiveSubscription === true || state.hasActiveTrial === true;
  const whatsappSatisfied =
    !whatsappRequired || state.whatsappConnected === true;
  const canEnterDashboard =
    product === "dashboard"
      ? whatsappSatisfied &&
        (state.onboardingCompleted || state.whatsappConnected === true)
      : whatsappSatisfied && (hasProductAccess || state.isTrialExpired);
  const reason: AuthDecision["reason"] = canEnterDashboard
    ? "ready"
    : !whatsappSatisfied
      ? "whatsapp_required"
      : state.isTrialExpired
        ? "trial_expired"
        : "product_access_required";

  const nextPath = canEnterDashboard
    ? "/home"
    : `/onboarding-embedded?domain=${product}`;

  return {
    product,
    onboardingCompleted: canEnterDashboard,
    whatsappConnected: state.whatsappConnected,
    hasActiveSubscription: state.hasActiveSubscription,
    hasActiveTrial: state.hasActiveTrial,
    isTrialExpired: state.isTrialExpired,
    hasProductAccess,
    requiresWhatsApp: whatsappRequired,
    whatsappSatisfied,
    canEnterDashboard,
    nextPath,
    reason,
  };
}

export function buildOnboardingPayload(
  state: OnboardingAccessState,
  product: ProductDomain,
): OnboardingCheckPayload {
  const decision = buildAuthDecision(state, product);

  return {
    onboardingCompleted: decision.onboardingCompleted,
    whatsappConnected: decision.whatsappConnected,
    hasActiveSubscription: decision.hasActiveSubscription,
    hasActiveTrial: decision.hasActiveTrial,
    isTrialExpired: decision.isTrialExpired,
    hasProductAccess: decision.hasProductAccess,
    requiresWhatsApp: decision.requiresWhatsApp,
    whatsappSatisfied: decision.whatsappSatisfied,
    canEnterDashboard: decision.canEnterDashboard,
    nextPath: decision.nextPath,
    reason: decision.reason,
    trialDetails: state.trialDetails,
  };
}

export function buildFallbackAuthDecision(params: {
  userId: string;
  onboardingCompletedAt?: string | null;
  product: ProductDomain;
  membership?: any | null;
}): AuthDecision {
  const { userId, onboardingCompletedAt, product, membership } = params;
  const now = Date.now();
  const trialEndsAt = membership?.trial_ends_at
    ? new Date(membership.trial_ends_at).getTime()
    : null;
  const hasActiveTrial =
    membership?.status === "trial" &&
    (trialEndsAt === null || Number.isNaN(trialEndsAt) || trialEndsAt > now);
  const isTrialExpired =
    membership?.status === "trial" &&
    trialEndsAt !== null &&
    !Number.isNaN(trialEndsAt) &&
    trialEndsAt <= now;
  const hasActiveSubscription = membership?.status === "active";

  return buildAuthDecision(
    {
      userExists: true,
      userId,
      onboardingCompleted: Boolean(onboardingCompletedAt),
      whatsappConnected: false,
      hasActiveSubscription,
      hasActiveTrial,
      isTrialExpired,
    },
    product,
  );
}
