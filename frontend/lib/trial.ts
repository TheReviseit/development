/**
 * Trial Utilities — Client-side trial management
 *
 * Provides:
 * - Auto-start trial on signup (domain-agnostic)
 * - Check trial status
 * - Get trial entitlement for frontend
 *
 * ARCHITECTURE: plan_slug and source are derived from PRODUCT_REGISTRY
 * via getStarterPlanSlug(), ensuring every product gets its correct
 * product-scoped starter plan (e.g., "booking_starter" not "starter").
 */

import { supabase } from "@/lib/supabase/client";
import { getStarterPlanSlug } from "@/lib/auth-helpers";
import type { ProductDomain } from "@/lib/domain/config";

/**
 * Auto-start a free trial for a new user.
 *
 * Called during signup flow for any self-service product domain.
 * Uses getStarterPlanSlug() to derive the correct product-scoped plan.
 */
export async function auto_start_trial_on_signup(
  userId: string,
  orgId: string,
  email: string,
  domain: ProductDomain | string,
): Promise<TrialContext | null> {
  try {
    const isServer = typeof window === "undefined";

    const deviceFingerprint = !isServer ? await getDeviceFingerprint() : null;
    const userAgent = !isServer && typeof navigator !== "undefined" ? navigator.userAgent : null;
    const ipAddress = null;
    const planSlug = getStarterPlanSlug(domain as ProductDomain);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/trials/internal/start`
      : "/api/trials/internal/start";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Api-Key": process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "",
      },
      body: JSON.stringify({
        user_id: userId,
        org_id: orgId,
        email: email,
        plan_slug: planSlug,
        domain: domain,
        source: domain,
        ip_address: ipAddress,
        device_fingerprint: deviceFingerprint,
        user_agent: userAgent,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[trial] Start failed:", error);
      return null;
    }

    const result = await response.json();

    if (result.success && result.trial) {
      return result.trial;
    }

    return null;
  } catch (error) {
    console.error("[trial] Auto-start error:", error);
    return null;
  }
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

// =============================================================================
// Helpers
// =============================================================================

async function getDeviceFingerprint(): Promise<string | null> {
  try {
    const components: string[] = [];

    if (typeof navigator !== "undefined") {
      components.push(navigator.userAgent);
      components.push(navigator.language);
      components.push(String(navigator.hardwareConcurrency || 0));
    }

    const fingerprint = components.join("|");

    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(36);
  } catch {
    return null;
  }
}