/**
 * useCheckout — Unified checkout hook (Phase 4)
 * ==============================================
 * Single frontend entry for all subscription checkout paths:
 *   - onboarding embedded → /api/billing/create-subscription
 *   - upgrade flow → /api/upgrade/checkout (via useSubscribe)
 *   - payment page → /api/billing/checkout-session
 *
 * Prefer this hook in new code; useSubscribe remains for plan mutations.
 */

"use client";

import { useCallback, useRef } from "react";
import { auth } from "@/src/firebase/firebase";
import { generateCheckoutIdempotencyKey } from "@/lib/billing/idempotency";
import {
  useSubscribe,
  type SubscribeInput,
  type SubscribeResult,
  type MutationError,
  resolveConflict,
} from "./useSubscribe";

export type CheckoutSource = "onboarding" | "upgrade" | "payment_page";

export interface CheckoutInput {
  planSlug: string;
  domain: string;
  billingCycle?: "monthly" | "yearly";
  source?: CheckoutSource;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
}

export interface CheckoutResult extends SubscribeResult {
  subscriptionId?: string;
  keyId?: string;
  checkoutUrl?: string;
  pollUrl?: string;
}

export { resolveConflict, type MutationError };

export function useCheckout() {
  const { subscribe, isPending, error, subscribeState } = useSubscribe();
  const inFlightRef = useRef(false);

  const startCheckout = useCallback(
    async (input: CheckoutInput): Promise<CheckoutResult> => {
      if (inFlightRef.current) {
        throw {
          code: "IN_FLIGHT",
          message: "Checkout already in progress",
          isConflict: false,
        } as MutationError;
      }
      inFlightRef.current = true;

      try {
        const source = input.source ?? "upgrade";

        if (source === "onboarding") {
          const user = auth.currentUser;
          if (!user) {
            throw {
              code: "UNAUTHENTICATED",
              message: "You must be logged in",
              isConflict: false,
            } as MutationError;
          }

          const idemKey = await generateCheckoutIdempotencyKey(
            user.uid,
            input.planSlug,
            input.domain,
          );
          const bearer = `Bearer ${await user.getIdToken(false)}`;

          const res = await fetch("/api/billing/create-subscription", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: bearer,
              "Idempotency-Key": idemKey,
            },
            body: JSON.stringify({
              plan_name: input.planSlug,
              customer_email: input.customerEmail || user.email || "",
              customer_name: input.customerName || "",
              customer_phone: input.customerPhone || "",
            }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw {
              code: data.error_code || `HTTP_${res.status}`,
              message: data.error || data.message || "Checkout failed",
              isConflict: res.status === 409,
              retryAfterSeconds: data.retry_after_seconds,
            } as MutationError;
          }

          return {
            subscriptionId: data.subscription_id,
            keyId: data.key_id,
            checkoutId: data.checkout_token,
            pollUrl: data.poll_url,
            isConflict: false,
          };
        }

        if (source === "payment_page") {
          const user = auth.currentUser;
          if (!user) {
            throw {
              code: "UNAUTHENTICATED",
              message: "You must be logged in",
              isConflict: false,
            } as MutationError;
          }

          const idemKey = await generateCheckoutIdempotencyKey(
            user.uid,
            input.planSlug,
            input.domain,
          );
          const bearer = `Bearer ${await user.getIdToken(false)}`;

          const res = await fetch("/api/billing/create-subscription", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: bearer,
              "Idempotency-Key": idemKey,
            },
            body: JSON.stringify({
              plan_name: input.planSlug,
            }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw {
              code: data.error_code || `HTTP_${res.status}`,
              message: data.error || data.message || "Checkout failed",
              isConflict: res.status === 409,
            } as MutationError;
          }

          const checkoutToken = data.checkout_token;
          if (!checkoutToken) {
            throw {
              code: "NO_TOKEN",
              message: "No checkout token returned",
              isConflict: false,
            } as MutationError;
          }

          const pollStart = Date.now();
          let pollMs = 300;
          while (Date.now() - pollStart < 60000) {
            await new Promise((r) => setTimeout(r, pollMs));
            pollMs = Math.min(pollMs * 1.5, 2000);
            const pollRes = await fetch(
              `/api/billing/checkout-status/${checkoutToken}`,
            );
            const pollData = await pollRes.json().catch(() => ({}));
            if (pollData.status === "completed") {
              return {
                subscriptionId: pollData.razorpay_subscription_id,
                keyId: pollData.razorpay_key_id,
                checkoutId: checkoutToken,
                isConflict: false,
              };
            }
            if (pollData.status === "failed") {
              throw {
                code: "CHECKOUT_FAILED",
                message: pollData.error_message || "Checkout failed",
                isConflict: false,
              } as MutationError;
            }
          }

          throw {
            code: "TIMEOUT",
            message: "Checkout timed out",
            isConflict: false,
          } as MutationError;
        }

        const subscribeInput: SubscribeInput = {
          planSlug: input.planSlug,
          domain: input.domain,
          billingCycle: input.billingCycle,
        };
        return subscribe(subscribeInput);
      } finally {
        inFlightRef.current = false;
      }
    },
    [subscribe],
  );

  return {
    startCheckout,
    resolveConflict,
    isPending: isPending || inFlightRef.current,
    error,
    subscribeState,
  };
}
