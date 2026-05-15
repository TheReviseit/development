/**
 * Trial Utilities — Client-side trial management
 *
 * Provides:
 * - Explicit trial status checks
 * - Check trial status
 * - Get trial entitlement for frontend
 *
 * Trials are intentionally not started during signup. The only production
 * trial entrypoint is explicit Starter plan selection in onboarding.
 */

import { supabase } from "@/lib/supabase/client";

/**
 * Deprecated compatibility shim.
 * Signup must remain identity-only; do not grant trial/product access here.
 */
export async function auto_start_trial_on_signup(
  _userId: string,
  _orgId: string,
  _email: string,
  _domain: string,
): Promise<TrialContext | null> {
  console.warn(
    "[trial] auto_start_trial_on_signup is disabled. Trials start only after Starter plan selection.",
  );
  return null;
}

/**
 * Get trial status for the current user.
 */
export async function get_trial_status(
  domain: string = "dashboard",
): Promise<TrialStatus | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      return null;
    }

    const accessToken = sessionData.session.access_token;

    const response = await fetch(`/api/trials/status?domain=${domain}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    if (result.success) {
      return result;
    }

    return null;
  } catch (error) {
    console.error("[trial] Get status error:", error);
    return null;
  }
}

/**
 * Get trial entitlement formatted for frontend.
 */
export async function get_trial_entitlement(
  domain: string = "dashboard",
): Promise<FrontendEntitlement | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      return null;
    }

    const accessToken = sessionData.session.access_token;

    const response = await fetch(`/api/trials/entitlement?domain=${domain}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    if (result.success) {
      return result.entitlement;
    }

    return null;
  } catch (error) {
    console.error("[trial] Get entitlement error:", error);
    return null;
  }
}

// =============================================================================
// Types
// =============================================================================

export interface TrialContext {
  trial_id: string;
  user_id: string;
  org_id: string;
  domain: string;
  plan_slug: string;
  status: "active" | "expiring_soon" | "expired" | "converted" | "cancelled";
  started_at: string;
  expires_at: string;
  days_remaining: number;
  is_active: boolean;
  is_expired: boolean;
  can_extend: boolean;
}

export interface TrialStatus {
  success: boolean;
  has_trial: boolean;
  trial: TrialContext | null;
}

export interface FrontendEntitlement {
  has_access: boolean;
  access_level: "full" | "restricted" | "none";
  status: "active" | "expiring_soon" | "expired" | "none";
  days_remaining: number | null;
  show_banner: boolean;
  banner_type: "info" | "warning" | "danger" | null;
  banner_message: string | null;
  cta_text: string;
  cta_url: string;
  plan_slug: string | null;
}
