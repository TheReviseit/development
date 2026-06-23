/**
 * useSubscribe — Centralized Subscription Mutation Hook (Phase D)
 * ================================================================
 * Single hook for all subscription mutations: create, upgrade, cancel,
 * change billing cycle. Wraps React Query useMutation with:
 *
 *   1. Optimistic cache updates for instant UI feedback
 *   2. 409 Conflict detection + retry guidance
 *   3. Automatic cache invalidation on success
 *   4. CustomEvent dispatch for cross-component sync
 *   5. Consistent error handling across all mutation paths
 *
 * Usage:
 *   const { subscribe, upgrade, cancel, isPending, error } = useSubscribe();
 *   subscribe({ planSlug: "pro", domain: "shop" });
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { auth } from "@/src/firebase/firebase";
import {
  generateCheckoutIdempotencyKey,
  generateSubscriptionModifyKey,
} from "@/lib/billing/idempotency";
import {
  subscriptionKeys,
  invalidateSubscriptionCache,
  STALE_TIMES,
  dispatchSubscriptionUpdated,
  dispatchPaymentSucceeded,
} from "@/lib/billing/cache-constants";

// =============================================================================
// TYPES
// =============================================================================

export interface SubscribeInput {
  planSlug: string;
  domain: string;
  billingCycle?: "monthly" | "yearly";
}

export interface UpgradeInput {
  planSlug: string;
  domain: string;
  subscriptionId: string;
}

export interface CancelInput {
  subscriptionId: string;
  domain: string;
  reason?: string;
}

export interface SubscribeResult {
  checkoutId?: string;
  orderId?: string;
  razorpayKeyId?: string;
  /** True if this was a 409 conflict — user already has pending checkout */
  isConflict?: boolean;
  /** Existing checkout ID to resume if conflict */
  existingCheckoutId?: string;
}

export interface MutationError {
  code: string;
  message: string;
  isConflict: boolean;
  retryAfterSeconds?: number;
}

// =============================================================================
// AUTH TOKEN HELPER
// =============================================================================

async function getBearerToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw { code: "UNAUTHENTICATED", message: "You must be logged in", isConflict: false } as MutationError;
  return `Bearer ${await user.getIdToken(false)}`;
}

// =============================================================================
// MUTATION FUNCTIONS
// =============================================================================

async function createSubscription(input: SubscribeInput): Promise<SubscribeResult> {
  const bearer = await getBearerToken();
  const idemKey = await generateCheckoutIdempotencyKey(
    auth.currentUser!.uid,
    input.planSlug,
    input.domain,
  );

  const res = await fetch("/api/upgrade/checkout", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearer,
      "Idempotency-Key": idemKey,
    },
    body: JSON.stringify({
      plan_slug: input.planSlug,
      target_plan_slug: input.planSlug,
      domain: input.domain,
      billing_cycle: input.billingCycle || "monthly",
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const isConflict = res.status === 409;
    throw {
      code: data.code || `HTTP_${res.status}`,
      message: data.message || data.error || "Checkout creation failed",
      isConflict,
      existingCheckoutId: isConflict ? data.existing_checkout_id : undefined,
      retryAfterSeconds: data.retry_after_seconds,
    } as MutationError;
  }

  return {
    checkoutId: data.checkout_id,
    razorpayKeyId: data.razorpay_key_id,
    isConflict: false,
  };
}

async function upgradePlan(input: UpgradeInput): Promise<SubscribeResult> {
  const bearer = await getBearerToken();
  const idemKey = await generateSubscriptionModifyKey(
    auth.currentUser!.uid,
    input.subscriptionId,
    "upgrade",
  );

  const res = await fetch("/api/billing/change-plan", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearer,
      "Idempotency-Key": idemKey,
    },
    body: JSON.stringify({
      plan_slug: input.planSlug,
      domain: input.domain,
      subscription_id: input.subscriptionId,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const isConflict = res.status === 409;
    throw {
      code: data.code || `HTTP_${res.status}`,
      message: data.message || data.error || "Plan upgrade failed",
      isConflict,
      retryAfterSeconds: data.retry_after_seconds,
    } as MutationError;
  }

  return {
    orderId: data.order_id,
    razorpayKeyId: data.razorpay_key_id,
    isConflict: false,
  };
}

async function cancelSubscription(input: CancelInput): Promise<void> {
  const bearer = await getBearerToken();
  const idemKey = await generateSubscriptionModifyKey(
    auth.currentUser!.uid,
    input.subscriptionId,
    "cancel",
  );

  const res = await fetch("/api/billing/cancel-subscription", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearer,
      "Idempotency-Key": idemKey,
    },
    body: JSON.stringify({
      subscription_id: input.subscriptionId,
      reason: input.reason || "user_requested",
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw {
      code: data.code || `HTTP_${res.status}`,
      message: data.message || data.error || "Cancellation failed",
      isConflict: res.status === 409,
    } as MutationError;
  }
}

// =============================================================================
// CONFLICT RETRY HANDLER
// =============================================================================
// After a 409, the user can call this to resolve the conflict by
// either completing the existing checkout or cancelling it.

export async function resolveConflict(
  existingCheckoutId: string,
  action: "resume" | "cancel",
): Promise<void> {
  const bearer = await getBearerToken();

  const res = await fetch(`/api/upgrade/checkout-conflict`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearer,
    },
    body: JSON.stringify({
      checkout_id: existingCheckoutId,
      action,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Failed to resolve conflict");
  }
}

// =============================================================================
// HOOK
// =============================================================================

export function useSubscribe() {
  const queryClient = useQueryClient();

  // Shared success handler — invalidates caches and dispatches events
  const onSuccess = useCallback(() => {
    invalidateSubscriptionCache(queryClient);
    dispatchSubscriptionUpdated();
  }, [queryClient]);

  // Shared error handler — detects 409 and propagates structured error
  // No cache invalidation on error (data is still potentially valid)

  const subscribeMutation = useMutation({
    mutationFn: createSubscription,
  });

  const upgradeMutation = useMutation({
    mutationFn: upgradePlan,
    onSuccess: () => {
      invalidateSubscriptionCache(queryClient);
      dispatchPaymentSucceeded();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      // Optimistic update: immediately set status to cancelling
      queryClient.setQueriesData(
        { queryKey: ["subscription", "status"] },
        (old: any) => {
          if (!old) return old;
          return { ...old, status: "cancelling", locked: false };
        },
      );
      onSuccess();
    },
  });

  return {
    /** Create a new subscription checkout */
    subscribe: subscribeMutation.mutateAsync,
    /** Upgrade existing subscription plan */
    upgrade: upgradeMutation.mutateAsync,
    /** Cancel subscription */
    cancel: cancelMutation.mutateAsync,
    /** Resolve a 409 conflict (resume or cancel existing checkout) */
    resolveConflict,

    /** True if any mutation is in progress */
    isPending:
      subscribeMutation.isPending ||
      upgradeMutation.isPending ||
      cancelMutation.isPending,

    /** Latest mutation error (structured) */
    error: (
      subscribeMutation.error ||
      upgradeMutation.error ||
      cancelMutation.error ||
      null
    ) as MutationError | null,

    /** Individual mutation states for granular UI control */
    subscribeState: subscribeMutation,
    upgradeState: upgradeMutation,
    cancelState: cancelMutation,
  };
}
